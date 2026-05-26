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
const { analyzeCode, analyzeForAutoRefactor, applyAutoRefactor } = core;

const OUT = join(REPO_ROOT, 'before-after');
await mkdir(OUT, { recursive: true });

async function demo(label, filePath, targetSmell) {
  const short = filePath.split(/[\/\\]/).slice(-2).join('/').replace(/\.ts$/, '');
  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  ${label}`);
  console.log(`  ${filePath}`);
  console.log(`  Försöker med targetSmell = ${targetSmell ?? 'auto (worst)'}`);
  console.log(`${'═'.repeat(65)}`);

  const code = await readFile(filePath, 'utf-8');
  const language = 'typescript';

  // Första analys — vilka DOKUMENTERADE smells finns?
  const all = analyzeCode(code, language, filePath);
  console.log(`\n  Original score: ${all.score.toFixed(1)} / 10.0 — ${all.smells.length} smells`);
  for (const s of all.smells) {
    const fn = s.functionName ? ` in ${s.functionName}` : '';
    console.log(`    ${s.type}${fn} (${s.severity})`);
  }

  // Testa varje möjlig smell för att hitta vilken som ger FULL transformation
  const smellTypes = [...new Set(all.smells.map(s => s.type))];
  let bestResult = null;
  let bestDelta = -999;

  const tryTargets = targetSmell ? [targetSmell] : [...smellTypes, undefined];
  for (const t of tryTargets) {
    const plan = analyzeForAutoRefactor(code, language, filePath, t);
    if (!plan) continue;

    const applied = applyAutoRefactor(code, plan);
    if (applied.transformedCode === code) continue;

    const after = analyzeCode(applied.transformedCode, language, filePath);
    const fullStrategies = ['early_return', 'simplify_conditional'];
    const isFull = fullStrategies.includes(plan.refactoringStrategy);

    // Count actual diff lines
    const oLines = code.split('\n');
    const nLines = applied.transformedCode.split('\n');
    let realChanges = 0;
    const maxL = Math.max(oLines.length, nLines.length);
    for (let i = 0; i < maxL; i++) {
      const o = i < oLines.length ? oLines[i] : null;
      const n = i < nLines.length ? nLines[i] : null;
      if (o !== n) realChanges++;
    }

    const delta = after.score - plan.currentHealthScore;
    if (isFull && delta > bestDelta) {
      bestDelta = delta;
      bestResult = { plan, applied, after, isFull, realChanges };
    }
  }

  if (!bestResult) {
    console.log(`\n  ✗ Kunde inte hitta någon meningsfull transformation.`);
    return;
  }

  const { plan, applied, after, isFull, realChanges } = bestResult;
  const delta = after.score - plan.currentHealthScore;

  console.log(`\n  Bästa transformation:`);
  console.log(`  Target:    ${plan.targetFunction} (lines ${plan.startLine}–${plan.endLine})`);
  console.log(`  Smell:     ${plan.smell.type} (${plan.smell.severity})`);
  console.log(`  Strategy:  ${plan.refactoringStrategy} ${isFull ? '✅ FULL' : '⚠️ PARTIAL'}`);
  console.log(`  Changes:   ${applied.changes.length} beskrivningar, ${realChanges} diffrader`);

  console.log(`\n  ── Resultat ──`);
  console.log(`  Score:     ${plan.currentHealthScore.toFixed(1)} → ${after.score.toFixed(1)} / 10.0`);
  console.log(`  Delta:     ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`);
  console.log(`  Verdict:   ${delta > 0 ? '✅ FÖRBÄTTRING — vår MCP fungerar!' : delta < 0 ? '⚠️ Tillfällig sänkning (markörer)' : '△ Oförändrat'}`);

  console.log(`\n  ── Förändringar ──`);
  for (const c of applied.changes) {
    console.log(`    • ${c}`);
  }

  // Visa diff (visa bara relevanta delar)
  const oLines = code.split('\n');
  const nLines = applied.transformedCode.split('\n');
  console.log(`\n  ── Diff (första 30 ändrade rader) ──`);
  let shown = 0;
  for (let i = 0; i < Math.max(oLines.length, nLines.length) && shown < 30; i++) {
    const o = i < oLines.length ? oLines[i] : null;
    const n = i < nLines.length ? nLines[i] : null;
    if (o !== n) {
      if (o !== null) { console.log(`  - ${o}`); shown++; }
      if (n !== null) { console.log(`  + ${n}`); shown++; }
    }
  }

  // Spara filer
  const safeName = short.replace(/[\/\\]/g, '_');
  const bfPath = join(OUT, `${safeName}.BEFORE.ts`);
  const afPath = join(OUT, `${safeName}.AFTER.ts`);
  await writeFile(bfPath, code, 'utf-8');
  await writeFile(afPath, applied.transformedCode, 'utf-8');
  console.log(`\n  💾 Sparat: ${bfPath}`);
  console.log(`  💾 Sparat: ${afPath}`);
}

// FILE 1: goals-store — forcera early_return på updateGoalStatus
await demo(
  '📁 Debt Goals Store — DeepNesting i updateGoalStatus',
  join(REPO_ROOT, 'packages/core/src/debt-goals/goals-store.ts'),
  'DeepNesting'
);

// FILE 2: auto-refactor-applier — forcera simplify_conditional på applySimplifyConditional
await demo(
  '📁 Auto-Refactor Applier — ComplexConditional + meta-demo (MCP analyserar sig själv)',
  join(REPO_ROOT, 'packages/core/src/refactor/auto-refactor-applier.ts'),
  undefined // auto = väljer själv
);
