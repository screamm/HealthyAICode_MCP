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
const { analyzeCode, analyzeForAutoRefactor, applyAutoRefactor, runRefactoringLoop, generateMissingJsDoc } = core;

const TARGET_THRESHOLD = 9.5;
const TARGETS = [
  { name: 'architecture-debt', path: join(REPO_ROOT, 'packages/core/src/analyzers/architecture-debt.ts') },
  { name: 'auto-refactor-applier', path: join(REPO_ROOT, 'packages/core/src/refactor/auto-refactor-applier.ts') },
];

const OUT = join(REPO_ROOT, 'before-after');
await mkdir(OUT, { recursive: true });

const SMELL_ORDER = ['DeepNesting', 'ComplexMethod', 'BrainMethod', 'BumpyRoad', 'LargeMethod',
  'ComplexConditional', 'CognitiveComplexity', 'LongParameterList', 'PrimitiveObsession'];

for (const target of TARGETS) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  TARGET: ${target.name}`);
  console.log(`  THRESHOLD: ${TARGET_THRESHOLD}`);
  console.log(`${'='.repeat(70)}`);

  let code = await readFile(target.path, 'utf-8');
  let health = analyzeCode(code, 'typescript', target.path);
  const originalScore = health.score;
  let totalSteps = 0;

  while (health.score < TARGET_THRESHOLD && totalSteps < 30) {
    const smellTypes = [...new Set(health.smells.map(s => s.type))];
    const orderedTypes = SMELL_ORDER.filter(t => smellTypes.includes(t));

    let madeProgress = false;

    // Phase 1: Try specific smell targets in priority order
    for (const smellType of orderedTypes) {
      const plan = analyzeForAutoRefactor(code, 'typescript', target.path, smellType);
      if (!plan) continue;

      const applied = applyAutoRefactor(code, plan);
      if (applied.transformedCode === code) continue;

      const after = analyzeCode(applied.transformedCode, 'typescript', target.path);
      totalSteps++;

      console.log(`\n  Step ${totalSteps}: ${plan.refactoringStrategy} (${smellType} → ${plan.targetFunction})`);
      console.log(`    Score: ${health.score.toFixed(1)} → ${after.score.toFixed(1)}`);
      for (const c of applied.changes) {
        console.log(`    • ${c}`);
      }

      code = applied.transformedCode;
      health = after;
      madeProgress = true;
      break; // One transformation per iteration
    }

    if (madeProgress) continue;

    // Phase 2: Try JSDoc generation
    const jsDocResult = generateMissingJsDoc(code, health);
    if (jsDocResult.code !== code) {
      const after = analyzeCode(jsDocResult.code, 'typescript', target.path);
      totalSteps++;
      console.log(`\n  Step ${totalSteps}: jsdoc_generation (LowDocCoverage)`);
      console.log(`    Score: ${health.score.toFixed(1)} → ${after.score.toFixed(1)}`);
      for (const c of jsDocResult.changes) {
        console.log(`    • ${c}`);
      }
      code = jsDocResult.code;
      health = after;
      madeProgress = true;
      continue;
    }

    // Phase 3: Try default (worst smell)
    const plan = analyzeForAutoRefactor(code, 'typescript', target.path);
    if (plan) {
      const applied = applyAutoRefactor(code, plan);
      if (applied.transformedCode !== code) {
        const after = analyzeCode(applied.transformedCode, 'typescript', target.path);
        totalSteps++;
        console.log(`\n  Step ${totalSteps}: ${plan.refactoringStrategy} (${plan.smell.type} → ${plan.targetFunction})`);
        console.log(`    Score: ${health.score.toFixed(1)} → ${after.score.toFixed(1)}`);
        for (const c of applied.changes) {
          console.log(`    • ${c}`);
        }
        code = applied.transformedCode;
        health = after;
        madeProgress = true;
        continue;
      }
    }

    if (!madeProgress) {
      console.log(`\n  ⚠️  No more improvements possible. Stopping.`);
      break;
    }
  }

  console.log(`\n  ── RESULT ──`);
  console.log(`  ${originalScore.toFixed(1)} → ${health.score.toFixed(1)} / 10.0`);
  console.log(`  ${health.score >= TARGET_THRESHOLD ? '✅ TARGET REACHED' : `❌ Need ${(TARGET_THRESHOLD - health.score).toFixed(1)} more points`}`);
  console.log(`  Steps: ${totalSteps}`);
  console.log(`  Remaining smells: ${health.smells.length}`);

  // Show specific remaining problems
  const typeCounts = new Map();
  for (const s of health.smells) {
    typeCounts.set(s.type, (typeCounts.get(s.type) || 0) + 1);
  }
  for (const [t, c] of typeCounts) {
    const fns = health.smells.filter(s => s.type === t).map(s => s.functionName).filter(Boolean);
    const details = fns.length > 0 ? ` (${fns.join(', ')})` : '';
    console.log(`    ${t}: ${c}x${details}`);
  }

  const bfPath = join(OUT, `${target.name}.AGGRESSIVE.BEFORE.ts`);
  const afPath = join(OUT, `${target.name}.AGGRESSIVE.AFTER.ts`);
  const originalCode = await readFile(target.path, 'utf-8');
  await writeFile(bfPath, originalCode, 'utf-8');
  await writeFile(afPath, code, 'utf-8');
  console.log(`\n  💾 ${bfPath}`);
  console.log(`  💾 ${afPath}`);
}
