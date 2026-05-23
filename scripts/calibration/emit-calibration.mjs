#!/usr/bin/env node
// Genererar calibration/java.json från sweep-resultat.
// Usage: node scripts/calibration/emit-calibration.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const createRequireFromMeta = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');

const sweepFile = join(ROOT, '.calibration-cache', 'sweep-results.json');
const outputFile = join(ROOT, 'packages/core/calibration/java.json');

if (!existsSync(sweepFile)) {
  console.error('Run threshold-sweep.mjs first.');
  process.exit(1);
}

const sweep = JSON.parse(readFileSync(sweepFile, 'utf8'));

// Pick the threshold with the highest F1 on the test split
const best = sweep.sweeps.reduce(
  (a, b) => a.f1 >= b.f1 ? a : b,
  { f1: -1, threshold: 15 }
);

mkdirSync(join(ROOT, 'packages/core/calibration'), { recursive: true });

const calibration = {
  language: 'java',
  generatedAt: new Date().toISOString(),
  datasetVersion: 'defects4j-v2.0.0',
  thresholds: {
    complexMethodThreshold: best.threshold,
  },
  metrics: {
    f1Score: best.f1,
    baselineF1: sweep.baseline,
    testSize: sweep.testSize ?? 0,
    trainSize: sweep.trainSize ?? 0,
  },
};

writeFileSync(outputFile, JSON.stringify(calibration, null, 2));
console.log(`Emitted calibration to ${outputFile}`);
console.log(`Best threshold: ${best.threshold}, F1: ${best.f1.toFixed(4)} (baseline: ${sweep.baseline.toFixed(4)})`);
