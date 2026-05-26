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

const filePath = join(REPO_ROOT, 'packages/core/src/analyzers/architecture-debt.ts');
const code = await readFile(filePath, 'utf-8');

// Simulate the loop steps manually + debugging
let current = code;
let health = analyzeCode(current, 'typescript', filePath);
console.log(`Initial score: ${health.score}\n`);

// Step 1: Apply early_return on DeepNesting
let plan = analyzeForAutoRefactor(current, 'typescript', filePath, 'DeepNesting');
if (plan) {
  const applied = applyAutoRefactor(current, plan);
  current = applied.transformedCode;
  health = analyzeCode(current, 'typescript', filePath);
  console.log(`Step 1 (early_return): ${health.score.toFixed(1)} — ${applied.changes.length} changes`);
}

// Step 2: Apply extract_chunks on BumpyRoad
plan = analyzeForAutoRefactor(current, 'typescript', filePath, 'BumpyRoad');
if (plan) {
  const applied = applyAutoRefactor(current, plan);
  current = applied.transformedCode;
  health = analyzeCode(current, 'typescript', filePath);
  console.log(`Step 2 (extract_chunks): ${health.score.toFixed(1)} — ${applied.changes.length} changes`);
}

// Debug: what smells remain?
console.log(`\nRemaining smells:`);
for (const s of health.smells) {
  const fn = s.functionName ? ` in ${s.functionName}` : '';
  console.log(`  ${s.type}${fn} (${s.severity})`);
}

// Try PrimitiveObsession
console.log(`\nTrying PrimitiveObsession...`);
plan = analyzeForAutoRefactor(current, 'typescript', filePath, 'PrimitiveObsession');
if (plan) {
  console.log(`  Plan: ${plan.targetFunction} → ${plan.refactoringStrategy}`);
  const applied = applyAutoRefactor(current, plan);
  console.log(`  Applied changes: ${applied.changes.length}`);
  console.log(`  Code changed: ${applied.transformedCode !== current}`);
  if (applied.transformedCode !== current) {
    current = applied.transformedCode;
    health = analyzeCode(current, 'typescript', filePath);
    console.log(`  New score: ${health.score}`);
  }
} else {
  console.log(`  NULL — no plan returned`);
}

// Debug: what's in the functions list?
const fnNames = health.functions.map(f => f.name);
console.log(`\nFunctions in file:`);
for (const name of fnNames.slice(0, 20)) {
  console.log(`  ${name}`);
}

// Check smells
const poSmells = health.smells.filter(s => s.type === 'PrimitiveObsession');
if (poSmells.length > 0) {
  console.log(`\nPrimitiveObsession smells:`);
  for (const s of poSmells) {
    console.log(`  ${s.functionName || '(file)'} at line ${s.line}`);
  }
} else {
  console.log(`\nNo PrimitiveObsession smells found`);
}

// Also check LongParameterList
const lpSmells = health.smells.filter(s => s.type === 'LongParameterList');
if (lpSmells.length > 0) {
  console.log(`\nLongParameterList smells:`);
  for (const s of lpSmells) {
    console.log(`  ${s.functionName || '(file)'} at line ${s.line}`);
  }
}
