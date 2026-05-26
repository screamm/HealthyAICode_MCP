#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
const { runRefactoringLoop, analyzeCode } = core;

const OUT = join(REPO_ROOT, 'before-after');
await mkdir(OUT, { recursive: true });

const targets = [
  { name: 'auto-refactor-applier', path: join(REPO_ROOT, 'packages/core/src/refactor/auto-refactor-applier.ts') },
  { name: 'analyzers_architecture-debt', path: join(REPO_ROOT, 'packages/core/src/analyzers/architecture-debt.ts') },
];

for (const target of targets) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  🔄 REFACTORING LOOP`);
  console.log(`  ${target.name}`);
  console.log(`  ${target.path}`);
  console.log(`${'═'.repeat(70)}`);

  const originalCode = await readFile(target.path, 'utf-8');

  const result = runRefactoringLoop(originalCode, 'typescript', target.path);

  console.log(`\n  Score: ${result.originalScore.toFixed(1)} → ${result.finalScore.toFixed(1)} / 10.0`);
  console.log(`  Loop complete: ${result.loopComplete}`);
  console.log(`  Steps: ${result.steps.length}`);

  for (let i = 0; i < result.steps.length; i++) {
    const s = result.steps[i];
    console.log(`\n  ── Step ${i + 1}: ${s.strategy} ──`);
    console.log(`    Target:    ${s.targetFunction || s.smell}`);
    console.log(`    Score:     ${s.scoreBefore.toFixed(1)} → ${s.scoreAfter.toFixed(1)}`);
    for (const c of s.changes) {
      console.log(`    • ${c}`);
    }
  }

  // Final smells
  const finalHealth = analyzeCode(result.finalCode, 'typescript', target.path);
  console.log(`\n  ── Final State ──`);
  console.log(`  Score:   ${finalHealth.score.toFixed(1)} / 10.0`);
  console.log(`  Smells:  ${finalHealth.smells.length} remaining`);
  for (const s of finalHealth.smells) {
    const fn = s.functionName ? ` in ${s.functionName}` : '';
    console.log(`           • ${s.type}${fn} (${s.severity})`);
  }

  // Save
  const bfPath = join(OUT, `${target.name}.LOOP.BEFORE.ts`);
  const afPath = join(OUT, `${target.name}.LOOP.AFTER.ts`);
  await writeFile(bfPath, originalCode, 'utf-8');
  await writeFile(afPath, result.finalCode, 'utf-8');

  const delta = finalHealth.score - result.originalScore;
  console.log(`\n  💾 ${bfPath}`);
  console.log(`  💾 ${afPath}`);
  console.log(`  ${delta >= 0 ? '✅' : '⚠️'} Net delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`);
}
