#!/usr/bin/env node
/**
 * scripts/validation/build-holdout-corpus.mjs
 *
 * CLI: Collect source files from a directory, run code-health analysis, and
 * write a holdout corpus JSON file for validation use.
 *
 * Usage:
 *   node scripts/validation/build-holdout-corpus.mjs \
 *     --source <dir> \
 *     --labels <labels.json> \
 *     --out <corpus.json> \
 *     [--min-score <number>]   (default: 8.0)
 *
 * Use --min-score 0 to include the full score range (required for ECE/ROC
 * validation against the complete defective/clean spectrum).
 *
 * Exit codes:
 *   0 — success
 *   1 — missing arguments or errors during processing
 */

import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';

// --- Parse arguments ---------------------------------------------------------

let source, labels, out, minScore;
try {
  const { values } = parseArgs({
    options: {
      source:      { type: 'string' },
      labels:      { type: 'string' },
      out:         { type: 'string' },
      'min-score': { type: 'string' },
    },
    strict: true,
    args: process.argv.slice(2),
  });
  source   = values.source;
  labels   = values.labels;
  out      = values.out;
  minScore = values['min-score'] !== undefined ? parseFloat(values['min-score']) : 8.0;
} catch (err) {
  console.error(`Argument error: ${err.message}`);
  console.error('Usage: node build-holdout-corpus.mjs --source <dir> --labels <file> --out <file> [--min-score <number>]');
  process.exit(1);
}

if (!source || !labels || !out) {
  console.error('Error: --source, --labels, and --out are all required.');
  process.exit(1);
}

if (isNaN(minScore) || minScore < 0 || minScore > 10) {
  console.error('Error: --min-score must be a number between 0 and 10.');
  process.exit(1);
}

// --- Import the core library -------------------------------------------------
// The compiled JS output is in dist/; fall back to ts-node / tsx if available.
let buildHoldoutDataset;
try {
  const mod = await import('../../packages/core/dist/validation/holdout/holdout-builder.js');
  buildHoldoutDataset = mod.buildHoldoutDataset;
} catch {
  try {
    // If not built yet, try loading via tsx
    const mod = await import('../../packages/core/src/validation/holdout/holdout-builder.ts');
    buildHoldoutDataset = mod.buildHoldoutDataset;
  } catch (e) {
    console.error(`Failed to load holdout-builder: ${e.message}`);
    console.error('Run "pnpm build" first, or use tsx to run this script.');
    process.exit(1);
  }
}

// --- Build corpus ------------------------------------------------------------

console.log(`Building holdout corpus from: ${source}`);
console.log(`Label file: ${labels}`);
console.log(`Min score filter: ${minScore}`);

let dataset;
try {
  dataset = await buildHoldoutDataset(source, labels, { minScore });
} catch (err) {
  console.error(`Error building holdout dataset: ${err.message}`);
  process.exit(1);
}

// --- Write output ------------------------------------------------------------

try {
  await writeFile(out, JSON.stringify(dataset, null, 2), 'utf-8');
} catch (err) {
  console.error(`Failed to write output file: ${err.message}`);
  process.exit(1);
}

// --- Print summary -----------------------------------------------------------

const bands = ['8.0-8.4', '8.5-8.9', '9.0-9.4', '9.5-9.9', '10.0'];
const unlabelled = dataset.records.filter((r) => r.maintainabilityRating === -1).length;

console.log(`\nHoldout corpus summary:`);
console.log(`  Total files: ${dataset.totalFiles}`);
console.log(`  Unlabelled files: ${unlabelled}`);
console.log(`\nScore distribution:`);
for (const band of bands) {
  const count = dataset.scoreHistogram[band] ?? 0;
  const bar = '█'.repeat(count);
  if (count === 0) {
    console.log(`  ${band}: 0 (empty band — consider adding more files in this range)`);
  } else {
    console.log(`  ${band}: ${count} ${bar}`);
  }
}

const languages = {};
for (const record of dataset.records) {
  languages[record.language] = (languages[record.language] ?? 0) + 1;
}
console.log(`\nLanguage breakdown:`);
for (const [lang, count] of Object.entries(languages)) {
  console.log(`  ${lang}: ${count}`);
}

console.log(`\nCorpus written to: ${out}`);
process.exit(0);
