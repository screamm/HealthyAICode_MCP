#!/usr/bin/env node
/**
 * scripts/validation/run-ece-validation.mjs
 *
 * CLI: Run ECE validation on a holdout corpus and print a table report.
 *
 * Usage:
 *   node scripts/validation/run-ece-validation.mjs \
 *     --corpus <holdout-corpus.json> \
 *     [--bins <n>]          (default: 10)
 *
 * Exit codes:
 *   0 — success
 *   1 — corpus file missing or other error
 */

import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';

// --- Parse arguments ---------------------------------------------------------

let corpusPath, numBins;
try {
  const { values } = parseArgs({
    options: {
      corpus: { type: 'string' },
      bins:   { type: 'string' },
    },
    strict: true,
    args: process.argv.slice(2),
  });
  corpusPath = values.corpus;
  numBins = values.bins ? parseInt(values.bins, 10) : 10;
} catch (err) {
  console.error(`Argument error: ${err.message}`);
  console.error('Usage: node run-ece-validation.mjs --corpus <file> [--bins <n>]');
  process.exit(1);
}

if (!corpusPath) {
  console.error('Error: --corpus is required.');
  process.exit(1);
}

// --- Read corpus file --------------------------------------------------------

let dataset;
try {
  const raw = await readFile(corpusPath, 'utf-8');
  dataset = JSON.parse(raw);
} catch (err) {
  console.error(`Failed to read corpus file "${corpusPath}": ${err.message}`);
  process.exit(1);
}

if (!dataset.records || !Array.isArray(dataset.records)) {
  console.error('Invalid corpus file: missing "records" array.');
  process.exit(1);
}

// --- Import core library functions -------------------------------------------

let runValidation, computeECE;
try {
  const validationMod = await import('../../packages/core/dist/validation/dataset-runner.js');
  const eceMod = await import('../../packages/core/dist/validation/ece.js');
  runValidation = validationMod.runValidation;
  computeECE = eceMod.computeECE;
} catch {
  try {
    const validationMod = await import('../../packages/core/src/validation/dataset-runner.ts');
    const eceMod = await import('../../packages/core/src/validation/ece.ts');
    runValidation = validationMod.runValidation;
    computeECE = eceMod.computeECE;
  } catch (e) {
    console.error(`Failed to load core library: ${e.message}`);
    process.exit(1);
  }
}

// --- Convert HoldoutRecord[] to BugRecord[] ----------------------------------
// Convention from sprint doc §"Tekniska beslut" §3:
//   maintainabilityRating < 3 → hasBug: true

const bugRecords = dataset.records.map((r) => ({
  filePath: r.filePath,
  language: r.language,
  code: r.code,
  hasBug: r.maintainabilityRating !== -1 && r.maintainabilityRating < 3,
  bugCount: r.maintainabilityRating !== -1 && r.maintainabilityRating < 3 ? 1 : 0,
}));

// --- Run validation and compute ECE -----------------------------------------

const report = runValidation(bugRecords);

if (report.fileResults.length < 10) {
  console.warn(`Warning: Only ${report.fileResults.length} files — ECE may not be meaningful (recommend ≥ 10).`);
}

const eceResult = computeECE(report.fileResults, numBins);

// --- Print table report ------------------------------------------------------

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const fmt2 = (n) => n.toFixed(2);

console.log(`\nECE Validation Report — corpus: ${corpusPath}`);
console.log(`Total files: ${report.totalFiles}  Buggy: ${report.buggyFiles}  Clean: ${report.cleanFiles}`);
console.log(`AUROC: ${report.auroc.toFixed(3)}   Pearson r: ${report.pearsonR.toFixed(3)}`);
console.log(`Overall ECE: ${eceResult.ece.toFixed(4)}`);
if (eceResult.ece > 0.10) {
  console.warn(`\n⚠  Hög ECE — trösklar behöver omprövas (ECE=${eceResult.ece.toFixed(2)} > 0.10)`);
}
console.log(`\n${'Band'.padEnd(12)} ${'Filer'.padStart(6)} ${'Faktisk ren-andel'.padStart(18)} ${'Predikterad ren-andel'.padStart(22)} ${'Kalibreringsfel'.padStart(16)}`);
console.log('-'.repeat(76));
for (const bin of eceResult.bins) {
  const label = `${bin.bandLow.toFixed(1)}-${bin.bandHigh.toFixed(1)}`;
  console.log(
    `${pad(label, 12)} ${padL(bin.count, 6)} ${padL(fmt2(bin.actualCleanFraction), 18)} ${padL(fmt2(bin.predictedCleanFraction), 22)} ${padL(fmt2(bin.calibrationError), 16)}`,
  );
}
console.log('-'.repeat(76));

process.exit(0);
