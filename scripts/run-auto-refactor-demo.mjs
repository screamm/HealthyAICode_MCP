#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Module, createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DIST_INDEX = join(REPO_ROOT, 'packages/core/dist/index.js');

async function loadCore() {
  const req = createRequire(DIST_INDEX);
  const csharpPath = req.resolve('tree-sitter-c-sharp');
  const csharpMod = await import(pathToFileURL(csharpPath).href);
  Module._cache[csharpPath] = { exports: csharpMod.default, loaded: true };
  const core = await import(pathToFileURL(DIST_INDEX).href);
  return core;
}

const TARGET_FILE = join(REPO_ROOT, 'packages/core/tests/fixtures/unhealthy/complex.ts');

function fmtScore(n) {
  return n.toFixed(1).padStart(5);
}

async function main() {
  const core = await loadCore();
  const { analyzeCode, analyzeForAutoRefactor, applyAutoRefactor } = core;

  const code = await readFile(TARGET_FILE, 'utf-8');
  const language = 'typescript';
  const filePath = TARGET_FILE;

  const original = analyzeCode(code, language, filePath);
  console.log('═══ Auto-Refactor Demo ═══');
  console.log(`File:   ${filePath}`);
  console.log(`\n── Step 1: Original Analysis ──`);
  console.log(`Score:   ${fmtScore(original.score)} / 10.0`);
  console.log(`Smells:  ${original.smells.length} found`);
  for (const s of original.smells) {
    const fn = s.functionName ? ` in ${s.functionName}` : '';
    console.log(`         • ${s.type}${fn} (severity: ${s.severity}) — ${s.description}`);
  }

  const refactorPlan = analyzeForAutoRefactor(code, language, filePath);
  if (!refactorPlan) {
    console.log('\n── Step 2: Auto-Refactor Analysis ──');
    console.log('No refactorable smells found — file is already healthy.');
    return;
  }

  console.log(`\n── Step 2: Auto-Refactor Analysis ──`);
  console.log(`Target:    ${refactorPlan.targetFunction} (lines ${refactorPlan.startLine}–${refactorPlan.endLine})`);
  console.log(`Smell:     ${refactorPlan.smell.type} (${refactorPlan.smell.severity})`);
  console.log(`Strategy:  ${refactorPlan.refactoringStrategy}`);
  console.log(`Predicted: ${fmtScore(refactorPlan.currentHealthScore)} → ${fmtScore(refactorPlan.predictedHealthScore)} (${refactorPlan.predictedScoreDelta})`);
  console.log(`\nInstructions:`);
  for (const instr of refactorPlan.refactoringInstructions) {
    console.log(`  • ${instr}`);
  }

  const applied = applyAutoRefactor(code, refactorPlan);
  console.log(`\n── Step 3: Applied Transformation ──`);
  console.log(`Strategy:  ${applied.strategy}`);
  console.log(`Changes:`);
  for (const c of applied.changes) {
    console.log(`  • ${c}`);
  }

  const after = analyzeCode(applied.transformedCode, language, filePath);
  const delta = after.score - original.score;

  console.log(`\n── Step 4: Re-Analysis ──`);
  console.log(`Score:     ${fmtScore(after.score)} / 10.0`);
  console.log(`Smells:    ${after.smells.length} remaining`);
  if (after.smells.length > 0) {
    for (const s of after.smells) {
      const fn = s.functionName ? ` in ${s.functionName}` : '';
      console.log(`         • ${s.type}${fn} (severity: ${s.severity})`);
    }
  }

  console.log(`\n── Result ──`);
  console.log(`  ${fmtScore(original.score)}  original score`);
  console.log(`  ${fmtScore(after.score)}    after refactor`);
  console.log(`  ${delta >= 0 ? ' +' : ' '}${fmtScore(Math.abs(delta))}  delta`);
  console.log(`  ${delta > 0 ? '✓ Score improved' : '△ Score held or minor change (expected for structural-only strategies)'}`);
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
