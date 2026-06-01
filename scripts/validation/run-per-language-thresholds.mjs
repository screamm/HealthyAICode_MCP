#!/usr/bin/env node
/**
 * scripts/validation/run-per-language-thresholds.mjs
 *
 * CLI: Compute per-language ROC-optimal thresholds from a holdout corpus and
 * write the results to a JSON file.
 *
 * Usage:
 *   node scripts/validation/run-per-language-thresholds.mjs \
 *     --corpus <holdout-corpus.json> \
 *     --out    <per-language-roc.json>
 *
 * Exit codes:
 *   0 — success
 *   1 — corpus file missing or other error
 */

import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';

// --- Parse arguments ---------------------------------------------------------

let corpusPath, outPath;
try {
  const { values } = parseArgs({
    options: {
      corpus: { type: 'string' },
      out:    { type: 'string' },
    },
    strict: true,
    args: process.argv.slice(2),
  });
  corpusPath = values.corpus;
  outPath    = values.out;
} catch (err) {
  console.error(`Argument error: ${err.message}`);
  console.error('Usage: node run-per-language-thresholds.mjs --corpus <file> --out <file>');
  process.exit(1);
}

if (!corpusPath || !outPath) {
  console.error('Error: --corpus and --out are both required.');
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

let runValidation, computePerLanguageRocThresholds;
try {
  const validationMod = await import('../../packages/core/dist/validation/dataset-runner.js');
  const rocMod = await import('../../packages/core/dist/validation/per-language-roc.js');
  runValidation = validationMod.runValidation;
  computePerLanguageRocThresholds = rocMod.computePerLanguageRocThresholds;
} catch {
  try {
    const validationMod = await import('../../packages/core/src/validation/dataset-runner.ts');
    const rocMod = await import('../../packages/core/src/validation/per-language-roc.ts');
    runValidation = validationMod.runValidation;
    computePerLanguageRocThresholds = rocMod.computePerLanguageRocThresholds;
  } catch (e) {
    console.error(`Failed to load core library: ${e.message}`);
    process.exit(1);
  }
}

// --- Convert HoldoutRecord[] to BugRecord[] ----------------------------------

const bugRecords = dataset.records.map((r) => ({
  filePath: r.filePath,
  language: r.language,
  code: r.code,
  hasBug: r.maintainabilityRating !== -1 && r.maintainabilityRating < 3,
  bugCount: r.maintainabilityRating !== -1 && r.maintainabilityRating < 3 ? 1 : 0,
}));

// --- Run validation and compute per-language ROC thresholds ------------------

const report = runValidation(bugRecords);
const rocResults = computePerLanguageRocThresholds(bugRecords, report.fileResults);

// --- Write JSON output -------------------------------------------------------

try {
  await writeFile(outPath, JSON.stringify(rocResults, null, 2), 'utf-8');
} catch (err) {
  console.error(`Failed to write output file: ${err.message}`);
  process.exit(1);
}

// --- Print table to stdout ---------------------------------------------------

const pad  = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log(`\nPer-language ROC Thresholds — corpus: ${corpusPath}`);
console.log(`Total records: ${bugRecords.length}  Languages with sufficient data: ${rocResults.length}`);
console.log(`\n${'Språk'.padEnd(14)} ${'ROC-optimal tröskel'.padStart(20)} ${'Youden J'.padStart(10)} ${'Alves P90'.padStart(10)} ${'Delta'.padStart(8)}`);
console.log('-'.repeat(64));

if (rocResults.length === 0) {
  console.log('  (No languages had sufficient data — min 5 buggy + 5 clean files required)');
} else {
  for (const r of rocResults) {
    console.log(
      `${pad(r.language, 14)} ${padL(r.rocOptimalThreshold.toFixed(3), 20)} ${padL(r.youdenJ.toFixed(3), 10)} ${padL(r.alvesPercentile90.toFixed(3), 10)} ${padL(r.thresholdDelta.toFixed(3), 8)}`,
    );
    if (r.buggyCount < 10) {
      console.warn(`  Warning: ${r.language} has only ${r.buggyCount} buggy files — confidence interval is wide.`);
    }
  }
}

console.log('-'.repeat(64));
console.log(`\nResults written to: ${outPath}`);
process.exit(0);
