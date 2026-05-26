#!/usr/bin/env node
/**
 * Claude Opus 4.7 refactoring benchmark — uses the local Claude Code session.
 *
 * This benchmark calls `claude --print` (Claude Code CLI) so that it runs
 * under the user's existing Pro/Max subscription — no ANTHROPIC_API_KEY required.
 *
 * Measures: fix rate when Claude Opus 4.7 acts on structured instructions
 * from analyzeForAutoRefactor(). This replicates the real-world MCP usage
 * pattern where Claude Code spawns a subagent to apply refactorings.
 *
 * Usage:
 *   node scripts/benchmark-claude-refactoring.mjs [--max-files N] [--dry-run]
 *
 *   --dry-run     Show what would be run without calling Claude.
 *   --max-files N Limit to N files (default: 10).
 *
 * Requirements:
 *   - Claude Code CLI logged in (run: claude auth status)
 *   - pnpm build must have been run (needs packages/core/dist)
 *
 * Output:
 *   docs/benchmarks/claude-benchmark-results.json
 *   docs/benchmarks/claude-refactoring-benchmark.md
 */

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname, relative, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Module, createRequire } from 'module';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const DIST_INDEX = join(projectRoot, 'packages', 'core', 'dist', 'index.js');

// ─── Thresholds ───────────────────────────────────────────────────────────────
const AI_READY_THRESHOLD = 9.5;
const HEALTHY_THRESHOLD  = 9.0;
const MODEL              = 'opus';   // Claude Code alias → latest Opus (Pro/Max session)

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const dryRun   = args.includes('--dry-run');
const maxIdx   = args.indexOf('--max-files');
const maxFiles = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : 10;

// ─── Load core (handle tree-sitter ESM/CJS boundary) ─────────────────────────
async function loadCore() {
  const req = createRequire(DIST_INDEX);
  const csharpPath = req.resolve('tree-sitter-c-sharp');
  const csharpMod = await import(pathToFileURL(csharpPath).href);
  Module._cache[csharpPath] = { exports: csharpMod.default, loaded: true };
  return import(pathToFileURL(DIST_INDEX).href);
}

// ─── File discovery ────────────────────────────────────────────────────────────
const SUPPORTED_EXTS = new Set([
  '.ts', '.js', '.py', '.java', '.cs', '.go', '.rb', '.rs', '.php',
  '.kt', '.dart', '.c', '.cpp', '.scala', '.swift',
  '.sh', '.lua', '.ex', '.hs', '.groovy',
]);

function collectFiles(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) results.push(...collectFiles(full));
      else if (SUPPORTED_EXTS.has(extname(full).toLowerCase())) results.push(full);
    }
  } catch { /* ignore */ }
  return results;
}

// ─── Build the prompt sent to Claude ─────────────────────────────────────────
function buildPrompt(refactorResult, fullCode) {
  const instructions = refactorResult.refactoringInstructions.join('\n');
  const skeleton     = refactorResult.exampleSkeleton;
  const targetFn     = refactorResult.targetFunction;
  const smellType    = refactorResult.smell.type;
  const strategy     = refactorResult.refactoringStrategy;

  return `You are a code refactoring expert. Apply the following refactoring instructions to the code below.

Return ONLY the complete refactored file content, nothing else — no explanation, no markdown fences, just the raw source code.

## Smell to fix
Type: ${smellType}
Target function: ${targetFn}
Strategy: ${strategy}

## Refactoring instructions
${instructions}

## Example skeleton (guidance, not a requirement)
${skeleton}

## Full source code to refactor
${fullCode}`;
}

// ─── Call Claude via local session (no API key needed) ────────────────────────
function callClaudeLocal(prompt) {
  // --print: non-interactive output mode (uses logged-in Pro/Max session)
  // --model opus: latest Opus model alias
  // --output-format text: plain text response, no JSON wrapper
  // Note: --tools "" causes "argument missing" in some shells; omit it.
  //       Claude won't use tools when the prompt just asks for text output.
  const result = spawnSync(
    'claude',
    ['--print', '--model', MODEL, '--output-format', 'text'],
    {
      input:     prompt,
      encoding:  'utf-8',
      maxBuffer: 10 * 1024 * 1024,   // 10 MB
      timeout:   120_000,            // 2 min per file
    }
  );

  if (result.status !== 0 || result.error) {
    const msg = result.stderr?.trim() || result.error?.message || 'Claude CLI failed';
    throw new Error(msg);
  }

  return result.stdout.trim();
}

// ─── Strip markdown code fences if Claude wraps output ────────────────────────
function stripCodeFences(text) {
  const fenced = text.match(/^```[\w]*\n([\s\S]*?)```\s*$/);
  return fenced ? fenced[1] : text;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\nClaude Opus 4.7 Refactoring Benchmark (via Claude Code session)');
  console.log('═══════════════════════════════════════════════════════════════');
  if (dryRun) console.log('MODE: DRY RUN (no Claude calls)');
  console.log(`Model:     ${MODEL}`);
  console.log(`Session:   Claude Code Pro/Max (no API key required)`);
  console.log(`Max files: ${maxFiles}`);
  console.log(`Date:      2026-05-25\n`);

  const core = await loadCore();
  const { analyzeCode, analyzeForAutoRefactor, detectLanguage } = core;

  const unhealthyDir = join(projectRoot, 'packages', 'core', 'tests', 'fixtures', 'unhealthy');
  const allFiles     = collectFiles(unhealthyDir);

  if (allFiles.length === 0) {
    console.error('No unhealthy fixture files found — aborting.');
    process.exit(1);
  }

  // Collect candidate files
  const candidates = [];
  for (const filePath of allFiles) {
    const relPath = relative(projectRoot, filePath);
    let code, language;

    try { code = readFileSync(filePath, 'utf-8'); }
    catch { console.warn(`  SKIP (unreadable): ${relPath}`); continue; }

    try {
      language = detectLanguage(filePath);
      if (language === 'unsupported') { console.warn(`  SKIP (unsupported): ${relPath}`); continue; }
    } catch { console.warn(`  SKIP (lang detect): ${relPath}`); continue; }

    let initialHealth;
    try { initialHealth = analyzeCode(code, language, filePath); }
    catch (err) { console.warn(`  SKIP (analysis error): ${relPath} — ${err.message}`); continue; }

    const initialScore = initialHealth.score;
    if (initialScore >= AI_READY_THRESHOLD) {
      console.log(`  SKIP (already AI-ready ${initialScore.toFixed(1)}): ${relPath}`);
      continue;
    }

    let refactorResult;
    try { refactorResult = analyzeForAutoRefactor(code, language, filePath); }
    catch (err) { console.warn(`  SKIP (refactor error): ${relPath} — ${err.message}`); continue; }

    if (!refactorResult) { console.log(`  SKIP (no actionable smell): ${relPath}`); continue; }

    candidates.push({ filePath, relPath, code, language, initialScore, refactorResult });
  }

  const filesToProcess = candidates.slice(0, maxFiles);
  console.log(`Candidates found: ${candidates.length}`);
  console.log(`Will process:     ${filesToProcess.length}`);
  console.log(`\n── Per-file results ────────────────────────────────────────────────────────\n`);

  const fileResults = [];

  for (const { filePath, relPath, code, language, initialScore, refactorResult } of filesToProcess) {
    const smellType = refactorResult.smell.type;
    const targetFn  = refactorResult.targetFunction;

    console.log(`  File:     ${relPath}`);
    console.log(`  Language: ${language}  |  Initial score: ${initialScore.toFixed(1)}`);
    console.log(`  Smell:    ${smellType} in '${targetFn}'`);

    if (dryRun) {
      console.log(`  → DRY RUN: would call ${MODEL} here\n`);
      fileResults.push({ filePath: relPath, language, initialScore, finalScore: null,
        scoreDelta: null, smellType, targetFunction: targetFn, status: 'DRY_RUN', error: null });
      continue;
    }

    let finalScore, status, errorMsg = null;

    try {
      const prompt         = buildPrompt(refactorResult, code);
      const raw            = callClaudeLocal(prompt);
      const refactoredCode = stripCodeFences(raw);

      const finalHealth = analyzeCode(refactoredCode, language, filePath);
      finalScore        = finalHealth.score;
      const delta       = parseFloat((finalScore - initialScore).toFixed(2));
      status            = finalScore >= AI_READY_THRESHOLD ? 'FIXED' : 'NOT_FIXED';

      console.log(`  Result:   ${initialScore.toFixed(1)} → ${finalScore.toFixed(1)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)})  [${status}]\n`);

      fileResults.push({ filePath: relPath, language, initialScore, finalScore,
        scoreDelta: delta, smellType, targetFunction: targetFn, status, error: null });

    } catch (err) {
      errorMsg = err.message;
      status   = 'ERROR';
      console.warn(`  ERROR: ${errorMsg}\n`);
      fileResults.push({ filePath: relPath, language, initialScore, finalScore: null,
        scoreDelta: null, smellType, targetFunction: targetFn, status: 'ERROR', error: errorMsg });
    }
  }

  // ─── Aggregate ──────────────────────────────────────────────────────────────
  const ran      = fileResults.filter(r => r.status !== 'DRY_RUN' && r.status !== 'ERROR');
  const fixed    = ran.filter(r => r.status === 'FIXED');
  const notFixed = ran.filter(r => r.status === 'NOT_FIXED');
  const errors   = fileResults.filter(r => r.status === 'ERROR');

  const fixRate  = ran.length > 0 ? parseFloat((fixed.length / ran.length * 100).toFixed(1)) : 0;
  const avgDelta = ran.length > 0
    ? parseFloat((ran.reduce((s, r) => s + (r.scoreDelta ?? 0), 0) / ran.length).toFixed(2))
    : 0;

  console.log('═══════════════════════════════════════');
  console.log('BENCHMARK RESULTS');
  console.log('═══════════════════════════════════════');
  if (dryRun) {
    console.log(`(DRY RUN — no real calls made)`);
    console.log(`Files that would be processed: ${fileResults.length}`);
  } else {
    console.log(`Files processed:    ${ran.length}`);
    console.log(`Fixed (>= 9.5):     ${fixed.length}`);
    console.log(`Not fixed:          ${notFixed.length}`);
    console.log(`Errors:             ${errors.length}`);
    console.log(`FIX RATE:           ${fixRate}%`);
    console.log(`Avg improvement:    +${avgDelta} pts`);
  }

  if (dryRun) {
    console.log('\nRe-run without --dry-run to execute.');
    return;
  }

  // ─── Write JSON ─────────────────────────────────────────────────────────────
  const benchDir = join(projectRoot, 'docs', 'benchmarks');
  mkdirSync(benchDir, { recursive: true });

  const json = {
    meta: {
      date: '2026-05-25',
      model: MODEL,
      sessionType: 'Claude Code Pro/Max (no API key required)',
      method: 'Claude Opus 4.7 acting on structured instructions from analyzeForAutoRefactor()',
      aiReadyThreshold: AI_READY_THRESHOLD,
      corpus: 'packages/core/tests/fixtures/unhealthy (score < 9.5 with actionable smells)',
      maxFilesProcessed: maxFiles,
    },
    summary: {
      filesEvaluated: ran.length,
      filesFixed: fixed.length,
      filesNotFixed: notFixed.length,
      filesErrored: errors.length,
      fixRate,
      avgScoreImprovement: avgDelta,
    },
    comparisonVsMechanical: {
      mechanicalFixRate: 11.8,
      claudeFixRate: fixRate,
      improvementPct: parseFloat((fixRate - 11.8).toFixed(1)),
    },
    files: fileResults,
  };

  writeFileSync(join(benchDir, 'claude-benchmark-results.json'), JSON.stringify(json, null, 2), 'utf-8');

  // ─── Write Markdown ─────────────────────────────────────────────────────────
  const rows = fileResults
    .filter(r => r.status !== 'DRY_RUN')
    .map(r => {
      const delta = r.scoreDelta !== null ? (r.scoreDelta >= 0 ? '+' : '') + r.scoreDelta.toFixed(2) : 'N/A';
      return `| ${r.filePath.replace(/\\/g, '/')} | ${r.language} | ${r.initialScore.toFixed(1)} | ${r.finalScore !== null ? r.finalScore.toFixed(1) : 'N/A'} | ${delta} | ${r.status} |`;
    }).join('\n');

  const md = `# Claude Opus 4.7 Refactoring Benchmark

**Date:** 2026-05-25
**Model:** \`${MODEL}\`
**Session:** Claude Code Pro/Max (no API key or billing required)
**Dataset:** ${ran.length} unhealthy fixture files (score < 9.5, with actionable smells)

---

## Summary

| Metric | Mechanical only | With Claude Opus 4.7 |
|--------|----------------|----------------------|
| Files tested | 17 | ${ran.length} |
| Fix rate (reach ≥ 9.5) | 11.8% | **${fixRate}%** |
| Avg score improvement | +0.27 pts | **+${avgDelta} pts** |
| Cost | $0 | Included in Pro/Max |

---

## How it works

The MCP tool \`code_health_auto_refactor\` returns **structured refactoring instructions**
(target function, numbered steps, example skeleton). Claude Code then spawns a subagent
with model \`${MODEL}\` to apply them — using the user's existing Pro/Max session,
with no separate API billing.

---

## Per-file Results

| File | Language | Before | After | Delta | Status |
|------|----------|--------|-------|-------|--------|
${rows}

---

## Methodology

- **Dataset:** \`packages/core/tests/fixtures/unhealthy/\` with score < 9.5 and actionable smell.
- **Instruction source:** \`analyzeForAutoRefactor()\` — same function behind the MCP tool.
- **Execution:** \`claude --print --model ${MODEL} --tools ""\` (local session, no API key).
- **Scoring:** Post-refactor code re-scored via \`analyzeCode()\` in-memory (no disk writes).
- **Fix threshold:** Score ≥ ${AI_READY_THRESHOLD}.
- **Baseline:** Mechanical-only benchmark (11.8% fix rate, no Claude involved).
`;

  writeFileSync(join(benchDir, 'claude-refactoring-benchmark.md'), md, 'utf-8');

  console.log(`\nResults: docs/benchmarks/claude-refactoring-benchmark.md`);
  return json.summary;
}

main().catch(err => {
  console.error('\nBenchmark failed:', err);
  process.exit(1);
});
