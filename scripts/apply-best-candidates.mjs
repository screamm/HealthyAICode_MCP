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

// Välj bästa kandidater från find-dn-candidates resultat
const candidates = [
  {
    label: 'Architecture Debt — DeepNesting',
    path: join(REPO_ROOT, 'packages/core/src/analyzers/architecture-debt.ts'),
    smell: 'DeepNesting',
  },
  {
    label: 'File Coupling — ComplexConditional',
    path: join(REPO_ROOT, 'packages/core/src/temporal/file-coupling.ts'),
    smell: 'ComplexConditional',
  },
];

for (const cand of candidates) {
  const code = await readFile(cand.path, 'utf-8');
  const lang = 'typescript';

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  ${cand.label}`);
  console.log(`  ${cand.path}`);
  console.log(`  Target smell: ${cand.smell}`);
  console.log(`${'═'.repeat(65)}`);

  // Baseline
  const orig = analyzeCode(code, lang, cand.path);
  console.log(`\n  Original score: ${orig.score.toFixed(1)} / 10.0 — ${orig.smells.length} smells`);
  for (const s of orig.smells) {
    const fn = s.functionName ? ` in ${s.functionName}` : '';
    console.log(`    ${s.type}${fn} (${s.severity})`);
  }

  // Plan
  const plan = analyzeForAutoRefactor(code, lang, cand.path, cand.smell);
  if (!plan) {
    console.log(`\n  ✗ Inget ${cand.smell}-relaterat refactorbart mönster hittades.`);
    continue;
  }

  console.log(`\n  Målfunktion: ${plan.targetFunction} (lines ${plan.startLine}–${plan.endLine})`);
  console.log(`  Smell: ${plan.smell.type} (${plan.smell.severity})`);
  console.log(`  Strategi: ${plan.refactoringStrategy}`);
  console.log(`  Förväntad: ${plan.currentHealthScore.toFixed(1)} → ${plan.predictedHealthScore.toFixed(1)}`);

  // Apply
  const applied = applyAutoRefactor(code, plan);

  // After
  const after = analyzeCode(applied.transformedCode, lang, cand.path);

  const oLines = code.split('\n');
  const nLines = applied.transformedCode.split('\n');
  let diffs = 0;
  for (let i = 0; i < Math.max(oLines.length, nLines.length); i++) {
    if ((i < oLines.length ? oLines[i] : null) !== (i < nLines.length ? nLines[i] : null)) diffs++;
  }

  const fullStrat = ['early_return', 'simplify_conditional'].includes(plan.refactoringStrategy);
  const delta = after.score - plan.currentHealthScore;

  console.log(`\n  ── Resultat ──`);
  console.log(`  Ändringar: ${applied.changes.length} beskrivningar, ${diffs} diffrader`);
  console.log(`  Score:     ${plan.currentHealthScore.toFixed(1)} → ${after.score.toFixed(1)} / 10.0 (${delta >= 0 ? '+' : ''}${delta.toFixed(1)})`);
  console.log(`  Typ:       ${fullStrat ? '✅ FULL transformation' : '⚠️ PARTIELL (TODO-markörer)'}`);

  for (const c of applied.changes) {
    console.log(`    • ${c}`);
  }

  // Diff
  console.log(`\n  ── Diff (första 24 raderna) ──`);
  let shown = 0;
  for (let i = 0; i < Math.max(oLines.length, nLines.length) && shown < 24; i++) {
    const o = i < oLines.length ? oLines[i] : null;
    const n = i < nLines.length ? nLines[i] : null;
    if (o !== n) {
      if (o !== null) { console.log(`  - ${o}`); shown++; }
      if (n !== null) { console.log(`  + ${n}`); shown++; }
    }
  }

  // Save
  const safeName = cand.path.split(/[\/\\]/g).slice(-2).join('_').replace(/\.ts$/, '');
  const bfPath = join(OUT, `${safeName}.BEFORE.ts`);
  const afPath = join(OUT, `${safeName}.AFTER.ts`);
  await writeFile(bfPath, code, 'utf-8');
  await writeFile(afPath, applied.transformedCode, 'utf-8');
  console.log(`\n  💾 ${bfPath}`);
  console.log(`  💾 ${afPath}`);
}
