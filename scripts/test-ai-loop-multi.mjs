#!/usr/bin/env node
/**
 * Multi-iteration AI-assisted refactoring loop test.
 *
 * Usage: node scripts/test-ai-loop-multi.mjs <filePath> <language> [maxIterations]
 *
 * For each iteration:
 *   1. Get auto-refactor plan from core
 *   2. Call `claude --print --model opus` with instructions + code
 *   3. Parse the refactored code from the response
 *   4. Measure new health score
 *   5. Stop if score >= 9.5 (loopComplete) or no more smells
 *
 * Does NOT write to the original file — works entirely in memory.
 * Reports score progression and final state.
 */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Module, createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DIST_INDEX = join(REPO_ROOT, 'packages/core/dist/index.js');

const require = createRequire(DIST_INDEX);
const csharpPath = require.resolve('tree-sitter-c-sharp');
const csharpMod = await import(pathToFileURL(csharpPath).href);
Module._cache[csharpPath] = { exports: csharpMod.default, loaded: true };
const core = await import(pathToFileURL(DIST_INDEX).href);
const { analyzeCode, analyzeForAutoRefactor } = core;

const MODEL = 'opus';
const AI_READY = 9.5;

// ─── CLI args ──────────────────────────────────────────────────────────────────
const [,, filePath, language, maxIterStr] = process.argv;
if (!filePath || !language) {
  console.error('Usage: node test-ai-loop-multi.mjs <filePath> <language> [maxIterations]');
  process.exit(1);
}
const maxIterations = parseInt(maxIterStr ?? '5', 10);

// ─── Load file ────────────────────────────────────────────────────────────────
const originalCode = await readFile(filePath, 'utf-8');
const originalHealth = analyzeCode(originalCode, language, filePath);

console.log('\n' + '═'.repeat(70));
console.log(`  AI REFACTORING LOOP TEST`);
console.log(`  File:     ${filePath}`);
console.log(`  Language: ${language}`);
console.log(`  Start:    ${originalHealth.score.toFixed(1)} / 10.0  (${originalHealth.smells.length} smells)`);
console.log('═'.repeat(70));

// ─── Loop ─────────────────────────────────────────────────────────────────────
let currentCode = originalCode;
let currentScore = originalHealth.score;
const steps = [];

// Stall detection: track consecutive zero-delta iterations per smell type
const exhaustedSmells = new Set();
let lastSmellType = null;
let staleCount = 0;

for (let i = 0; i < maxIterations; i++) {
  const health = analyzeCode(currentCode, language, filePath);
  currentScore = health.score;

  if (currentScore >= AI_READY) {
    console.log(`\n  ✅ Score ${currentScore.toFixed(1)} >= ${AI_READY} — loopComplete: true`);
    break;
  }

  // Pick next smell, skipping exhausted ones
  let forcedSmell = undefined;
  if (exhaustedSmells.size > 0) {
    const nextSmell = health.smells.find(s => !exhaustedSmells.has(s.type));
    if (nextSmell) forcedSmell = nextSmell.type;
  }

  const plan = analyzeForAutoRefactor(currentCode, language, filePath, forcedSmell);
  if (!plan) {
    console.log(`\n  ✅ No more actionable smells — loopComplete by exhaustion`);
    break;
  }

  // If the plan still returns an exhausted smell (no alternatives), break
  if (exhaustedSmells.has(plan.smell.type) && !forcedSmell) {
    console.log(`\n  ⏹  All remaining smells exhausted — cannot improve further`);
    break;
  }

  console.log(`\n  ── Iteration ${i + 1} ──`);
  console.log(`  Score:    ${currentScore.toFixed(1)}`);
  console.log(`  Target:   ${plan.smell.type} (${plan.smell.severity}) in ${plan.targetFunction}`);
  console.log(`  Strategy: ${plan.refactoringStrategy}${forcedSmell ? ' [forced — prev exhausted]' : ''}`);
  console.log(`  Calling claude --print --model ${MODEL} ...`);

  // Build prompt for Claude — file-level framing for documentation/constant smells
  const isFileLevelSmell = plan.refactoringStrategy === 'add_docstrings' || plan.refactoringStrategy === 'extract_constants';

  const prompt = isFileLevelSmell
    ? `You are a code refactoring expert. Fix a FILE-LEVEL smell in the ENTIRE file.

## File: ${filePath}
## Language: ${language}
## Smell: ${plan.smell.type} (${plan.smell.severity}) — this affects the WHOLE FILE, not just one function
## Strategy: ${plan.refactoringStrategy}

## Refactoring instructions:
${plan.refactoringInstructions.map((instr, idx) => `${idx + 1}. ${instr}`).join('\n')}

## Example skeleton:
${plan.exampleSkeleton}

## FULL FILE to refactor:
\`\`\`${language}
${currentCode}
\`\`\`

## Critical instructions:
- Apply the fix to the ENTIRE FILE — every function, every class, every constant
- For add_docstrings: add documentation to EVERY undocumented public function/method/class in the file
- For extract_constants: replace EVERY magic number/string literal throughout the file with named constants
- Return ONLY the complete refactored file content with no explanation, markdown, or code fences`
    : `You are a code refactoring expert. Apply the following refactoring instructions EXACTLY.

## File: ${filePath}
## Language: ${language}
## Target function: ${plan.targetFunction} (lines ${plan.startLine}–${plan.endLine})
## Smell to fix: ${plan.smell.type} (${plan.smell.severity})
## Strategy: ${plan.refactoringStrategy}

## Refactoring instructions:
${plan.refactoringInstructions.map((instr, idx) => `${idx + 1}. ${instr}`).join('\n')}

## Example skeleton:
${plan.exampleSkeleton}

## Current code of the function to refactor:
\`\`\`${language}
${plan.currentCode}
\`\`\`

## Full file (for context):
\`\`\`${language}
${currentCode}
\`\`\`

## Instructions:
Apply the refactoring to the FULL FILE and return ONLY the complete refactored file content.
Do NOT include any explanation, markdown, or code fences in your response.
Return ONLY the raw source code of the entire file, nothing else.`;

  const result = spawnSync(
    'claude',
    ['--print', '--model', MODEL, '--output-format', 'text'],
    {
      input: prompt,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 120_000,
    }
  );

  if (result.status !== 0 || result.error) {
    const msg = result.stderr?.trim() || result.error?.message || 'claude CLI failed';
    console.error(`  ❌ Claude CLI error: ${msg}`);
    break;
  }

  const refactoredCode = result.stdout.trim();

  // Strip accidental markdown fences if Claude included them
  const stripped = refactoredCode
    .replace(/^```[a-z]*\n?/i, '')
    .replace(/\n?```$/i, '')
    .trim();

  if (!stripped || stripped.length < 20) {
    console.log(`  ⚠️  Empty or too-short response — skipping iteration`);
    break;
  }

  // Measure new score
  const newHealth = analyzeCode(stripped, language, filePath);
  const delta = newHealth.score - currentScore;

  console.log(`  Score:    ${currentScore.toFixed(1)} → ${newHealth.score.toFixed(1)} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`);

  steps.push({
    iteration: i + 1,
    smell: plan.smell.type,
    strategy: plan.refactoringStrategy,
    scoreBefore: currentScore,
    scoreAfter: newHealth.score,
    delta,
  });

  if (newHealth.score <= currentScore - 0.5) {
    console.log(`  ⚠️  Score went significantly DOWN — reverting to previous code`);
    // Don't update currentCode — count as stale
    staleCount = (plan.smell.type === lastSmellType) ? staleCount + 1 : 1;
    lastSmellType = plan.smell.type;
  } else {
    currentCode = stripped;
    currentScore = newHealth.score;

    // Stall detection: track consecutive zero-delta iterations for the same smell
    if (plan.smell.type === lastSmellType && delta <= 0) {
      staleCount++;
      if (staleCount >= 2) {
        console.log(`  ⏩  Stall detected on ${plan.smell.type} (${staleCount} tries, 0 delta) — marking exhausted`);
        exhaustedSmells.add(plan.smell.type);
        staleCount = 0;
      }
    } else {
      if (plan.smell.type !== lastSmellType) staleCount = delta <= 0 ? 1 : 0;
      lastSmellType = plan.smell.type;
    }
  }
}

// ─── Final report ─────────────────────────────────────────────────────────────
const finalHealth = analyzeCode(currentCode, language, filePath);
const totalDelta = finalHealth.score - originalHealth.score;
const loopComplete = finalHealth.score >= AI_READY;

console.log('\n' + '─'.repeat(70));
console.log('  FINAL RESULT');
console.log('─'.repeat(70));
console.log(`  Start score:  ${originalHealth.score.toFixed(1)}`);
console.log(`  Final score:  ${finalHealth.score.toFixed(1)}  (${totalDelta >= 0 ? '+' : ''}${totalDelta.toFixed(1)})`);
console.log(`  Iterations:   ${steps.length}`);
console.log(`  loopComplete: ${loopComplete}`);
console.log(`  Remaining smells (${finalHealth.smells.length}):`);
for (const s of finalHealth.smells) {
  const fn = s.functionName ? ` in ${s.functionName}` : '';
  console.log(`    • ${s.type}${fn} (${s.severity})`);
}

if (loopComplete) {
  console.log('\n  ✅ TARGET REACHED: score >= 9.5');
} else {
  const gap = AI_READY - finalHealth.score;
  console.log(`\n  ⚠️  DID NOT REACH TARGET — ${gap.toFixed(1)} pts short of 9.5`);
}
console.log('═'.repeat(70));
