#!/usr/bin/env node
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Module, createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DIST_INDEX = join(REPO_ROOT, 'packages/core/dist/index.js');

const require = createRequire(DIST_INDEX);
const csharpPath = require.resolve('tree-sitter-c-sharp');
const csharpMod = await import(pathToFileURL(csharpPath).href);
Module._cache[csharpPath] = { exports: csharpMod.default, loaded: true };
const core = await import(pathToFileURL(DIST_INDEX).href);
const { analyzeCode, analyzeForAutoRefactor, applyAutoRefactor } = core;

const TARGETS = [
  {
    name: 'goals-store',
    path: join(REPO_ROOT, 'packages/core/src/debt-goals/goals-store.ts'),
    label: 'Debt Goals Store (updateGoalStatus — DeepNesting)',
  },
  {
    name: 'auto-refactor-applier',
    path: join(REPO_ROOT, 'packages/core/src/refactor/auto-refactor-applier.ts'),
    label: 'Auto-Refactor Applier (applySimplifyConditional — ComplexConditional + Meta-demo)',
  },
];

const OUT = join(REPO_ROOT, 'before-after');
await mkdir(OUT, { recursive: true });

function fmt(n) { return n.toFixed(1).padStart(5); }

for (const target of TARGETS) {
  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  ${target.label}`);
  console.log(`  ${target.path}`);
  console.log(`${'═'.repeat(65)}`);

  const code = await readFile(target.path, 'utf-8');
  const language = 'typescript';

  // Step 1: Original analysis
  const original = analyzeCode(code, language, target.path);
  console.log(`\n  ── Step 1: Original Analysis ──`);
  console.log(`  Score:   ${fmt(original.score)} / 10.0`);
  console.log(`  Smells:  ${original.smells.length} found`);
  for (const s of original.smells) {
    const fn = s.functionName ? ` in ${s.functionName}` : '';
    console.log(`           • ${s.type}${fn} (${s.severity})`);
  }

  // Step 2: Auto-refactor analysis
  const refactorPlan = analyzeForAutoRefactor(code, language, target.path);
  if (!refactorPlan) {
    console.log(`  \n  → No refactorable smells found. Skipping.\n`);
    continue;
  }

  console.log(`\n  ── Step 2: Auto-Refactor Analysis ──`);
  console.log(`  Target:    ${refactorPlan.targetFunction} (lines ${refactorPlan.startLine}–${refactorPlan.endLine})`);
  console.log(`  Smell:     ${refactorPlan.smell.type} (${refactorPlan.smell.severity})`);
  console.log(`  Strategy:  ${refactorPlan.refactoringStrategy}`);
  console.log(`  Predicted: ${fmt(refactorPlan.currentHealthScore)} → ${fmt(refactorPlan.predictedHealthScore)} (${refactorPlan.predictedScoreDelta})`);

  // Step 3: Apply
  const applied = applyAutoRefactor(code, refactorPlan);
  console.log(`\n  ── Step 3: Applied Transformation ──`);
  console.log(`  Changes:`);
  for (const c of applied.changes) {
    console.log(`    • ${c}`);
  }

  // Step 4: Re-analysis
  const after = analyzeCode(applied.transformedCode, language, target.path);
  const delta = after.score - original.score;

  console.log(`\n  ── Step 4: Re-Analysis ──`);
  console.log(`  Score:     ${fmt(after.score)} / 10.0`);
  console.log(`  Smells:    ${after.smells.length} remaining`);

  const diffLines = [];
  const origLines = code.split('\n');
  const newLines = applied.transformedCode.split('\n');
  const maxLen = Math.max(origLines.length, newLines.length);
  let diffCount = 0;
  for (let i = 0; i < maxLen; i++) {
    const o = i < origLines.length ? origLines[i] : null;
    const n = i < newLines.length ? newLines[i] : null;
    if (o === null) { diffLines.push(`+ ${n}`); diffCount++; }
    else if (n === null) { diffLines.push(`- ${o}`); diffCount++; }
    else if (o !== n) { diffLines.push(`- ${o}`); diffLines.push(`+ ${n}`); diffCount += 2; }
  }

  console.log(`  Diff lines: ${diffCount}`);
  console.log(`\n  Result:`);
  console.log(`    ${fmt(original.score)}  original score`);
  console.log(`    ${fmt(after.score)}    after refactor`);
  console.log(`    ${delta >= 0 ? '   +' : '   '}${fmt(Math.abs(delta))}  delta`);
  console.log(`    ${delta > 0 ? '✓ Score improved' : '△ Score held (structural markers — next AI pass will complete)'}`);
  console.log(`\n  Top 20 diff lines:`);
  for (const line of diffLines.slice(0, 20)) {
    console.log(`    ${line}`);
  }

  // Save before/after
  const bfPath = join(OUT, `${target.name}.BEFORE.ts`);
  const afPath = join(OUT, `${target.name}.AFTER.ts`);
  await writeFile(bfPath, code, 'utf-8');
  await writeFile(afPath, applied.transformedCode, 'utf-8');
  console.log(`\n  → Saved: ${bfPath}`);
  console.log(`  → Saved: ${afPath}`);
}
