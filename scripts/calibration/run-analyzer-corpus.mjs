#!/usr/bin/env node
// Kör Java-analyzern på alla Defects4J-checkouts och sparar smell-predictions.
// Output: .calibration-cache/predictions.json

import { createRequire } from 'module';
import { writeFileSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');

const checkoutDir = join(ROOT, '.calibration-cache', 'checkouts');
const outputFile = join(ROOT, '.calibration-cache', 'predictions.json');
const distIndex = join(ROOT, 'packages/core/dist/index.js');

if (!existsSync(distIndex)) {
  console.error('Build first: pnpm -F @healthy-ai-code/core build');
  process.exit(2);
}

const { analyzeFile } = require('../../packages/core/dist/index.js');

if (!existsSync(checkoutDir)) {
  console.error('No checkouts found. Run fetch-defects4j.mjs first.');
  process.exit(1);
}

const predictions = {};
let processed = 0;

function walkJavaFiles(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        results.push(...walkJavaFiles(fullPath));
      } else if (entry.name.endsWith('.java')) {
        results.push(fullPath);
      }
    }
  } catch {
    // Ignore permission errors or missing dirs
  }
  return results;
}

for (const project of readdirSync(checkoutDir)) {
  const projectDir = join(checkoutDir, project);
  const javaFiles = walkJavaFiles(projectDir);

  for (const file of javaFiles) {
    try {
      const result = analyzeFile(file);
      const relPath = `${project}/${relative(projectDir, file)}`;

      predictions[relPath] = result.smells.map(s => ({
        type: s.type,
        line: s.line,
        severity: s.severity,
        metricValue: s.metricValue, // Sprint 18 C3 fix — requires metricValue on Smell
      }));
      processed++;

      if (processed % 100 === 0) {
        console.log(`Processed ${processed} files...`);
      }
    } catch {
      // Skip parse errors
    }
  }
}

writeFileSync(outputFile, JSON.stringify(predictions, null, 2));
console.log(`Total: ${processed} files analyzed`);
