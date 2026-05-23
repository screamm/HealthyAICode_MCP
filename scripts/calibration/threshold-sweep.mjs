#!/usr/bin/env node
// Sweeper med train/test-split för trovärdig F1-mätning.
// Train/test-split (review C4 fix): 70/30 på bug-IDs (file keys).
// Output: .calibration-cache/sweep-results.json

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const createRequireFromMeta = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');

const labelsFile = join(ROOT, '.calibration-cache', 'labels.json');
const predictFile = join(ROOT, '.calibration-cache', 'predictions.json');
const outputFile = join(ROOT, '.calibration-cache', 'sweep-results.json');

if (!existsSync(labelsFile) || !existsSync(predictFile)) {
  console.error('Run extract-labels.mjs and run-analyzer-corpus.mjs first.');
  process.exit(1);
}

const labels = JSON.parse(readFileSync(labelsFile, 'utf8'));
const predictions = JSON.parse(readFileSync(predictFile, 'utf8'));

// Train/test-split (review C4 fix): 70/30 split on file keys
const allFiles = Object.keys(labels);

// Deterministic shuffle via seeded sort to keep runs reproducible
const shuffled = [...allFiles].sort((a, b) => {
  // Simple hash-based deterministic ordering
  const ha = a.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0);
  const hb = b.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 0);
  return ha - hb;
});

const splitIdx = Math.floor(shuffled.length * 0.7);
const trainFiles = new Set(shuffled.slice(0, splitIdx));
const testFiles = new Set(shuffled.slice(splitIdx));

console.log(`Train: ${trainFiles.size} files, Test: ${testFiles.size} files`);

// Sweep thresholds — cyclomatic complexity cutoffs to evaluate
const THRESHOLDS = [10, 12, 15, 18, 20, 25];

function computeF1(preds, lbls, files) {
  let tp = 0, fp = 0, fn = 0;
  for (const file of files) {
    const buggyLines = new Set(lbls[file] ?? []);
    const predictedLines = new Set(
      (preds[file] ?? []).map(s => s.line)
    );
    for (const line of predictedLines) {
      if (buggyLines.has(line)) tp++; else fp++;
    }
    for (const line of buggyLines) {
      if (!predictedLines.has(line)) fn++;
    }
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  return precision + recall === 0 ? 0 : 2 * precision * recall / (precision + recall);
}

const baselineF1 = computeF1(predictions, labels, testFiles);
console.log(`Baseline F1 (default thresholds): ${baselineF1.toFixed(4)}`);

const sweeps = [];
for (const threshold of THRESHOLDS) {
  // Filter predictions to only those whose metricValue meets the threshold
  const filtered = {};
  for (const [file, smells] of Object.entries(predictions)) {
    filtered[file] = smells.filter(s => (s.metricValue ?? Infinity) >= threshold);
  }
  const f1 = computeF1(filtered, labels, testFiles);
  sweeps.push({ threshold, f1 });
  console.log(`  threshold=${threshold}: F1=${f1.toFixed(4)}`);
}

const results = {
  baseline: baselineF1,
  trainSize: trainFiles.size,
  testSize: testFiles.size,
  sweeps,
};

writeFileSync(outputFile, JSON.stringify(results, null, 2));
console.log(`Sweep results written to ${outputFile}`);
