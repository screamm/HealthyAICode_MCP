#!/usr/bin/env node
/**
 * scripts/validation/holdout/generate-corpus-json.mjs
 *
 * Regenerates corpus.json directly from the in-repo fixture directories
 * and corpus-labels.json.  Unlike holdout-builder.ts this script does NOT
 * filter by score >= 8.0, because ECE/ROC validation needs the full score
 * range (scores from 1.0–10.0 are required to compute AUROC and ECE
 * meaningfully across the defective/clean boundary).
 *
 * Output schema matches HoldoutDataset (holdout-types.ts).
 *
 * Usage:
 *   node scripts/validation/holdout/generate-corpus-json.mjs \
 *     [--fixture-dir <path>]   (default: packages/core/tests/fixtures/holdout)
 *     [--labels <path>]        (default: <fixture-dir>/corpus-labels.json)
 *     [--out <path>]           (default: <fixture-dir>/corpus.json)
 *     [--min-score <number>]   (default: 0 — include all scores)
 *
 * Prerequisites:
 *   pnpm build  (so packages/core/dist/ exists)
 *
 * Network requirement:
 *   NONE — this script only reads files already present in the repo fixture
 *   directories.  To add new real OSS files to the corpus, run
 *   fetch-real-oss-files.mjs first (requires network).
 */

import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, extname, basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// Repo root and defaults
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------
let fixtureDir, labelsPath, outPath, minScore;
try {
  const { values } = parseArgs({
    options: {
      'fixture-dir': { type: 'string' },
      'labels':      { type: 'string' },
      'out':         { type: 'string' },
      'min-score':   { type: 'string' },
    },
    strict: true,
    args: process.argv.slice(2),
  });

  const defaultFixtureDir = join(REPO_ROOT, 'packages/core/tests/fixtures/holdout');
  fixtureDir = values['fixture-dir'] ? resolve(values['fixture-dir']) : defaultFixtureDir;
  labelsPath = values['labels'] ? resolve(values['labels']) : join(fixtureDir, 'corpus-labels.json');
  outPath    = values['out']    ? resolve(values['out'])    : join(fixtureDir, 'corpus.json');
  minScore   = values['min-score'] !== undefined ? parseFloat(values['min-score']) : 0;
} catch (err) {
  console.error(`Argument error: ${err.message}`);
  console.error('Usage: node generate-corpus-json.mjs [--fixture-dir <dir>] [--labels <file>] [--out <file>] [--min-score <number>]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load core library (requires pnpm build to have been run)
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);

let analyzeCode, detectLanguage;
try {
  ({ analyzeCode } = require(join(REPO_ROOT, 'packages/core/dist/index.js')));
  ({ detectLanguage } = require(join(REPO_ROOT, 'packages/core/dist/language-detect.js')));
} catch (err) {
  console.error(`Failed to load core library: ${err.message}`);
  console.error('Run "pnpm build" first.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Valid extensions and fixture subdirectories to scan
// ---------------------------------------------------------------------------
const VALID_EXTS = new Set(['.py', '.go', '.ts', '.js']);
const SUBDIRS    = ['healthy', 'borderline', 'unhealthy', 'real'];

// ---------------------------------------------------------------------------
// Load labels
// ---------------------------------------------------------------------------
let labels;
try {
  labels = JSON.parse(readFileSync(labelsPath, 'utf-8'));
} catch (err) {
  console.error(`Failed to read labels file "${labelsPath}": ${err.message}`);
  process.exit(1);
}

const labelMap = new Map(labels.map(l => [l.filePath, l]));

// Also index by basename for fallback matching
const labelByBase = new Map();
for (const l of labels) {
  const b = basename(l.filePath);
  if (!labelByBase.has(b)) labelByBase.set(b, l);
}

function getLabel(filePath) {
  const name = basename(filePath);
  return labelMap.get(name) || labelMap.get(filePath) || labelByBase.get(name);
}

// ---------------------------------------------------------------------------
// Collect files
// ---------------------------------------------------------------------------
function listFiles(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    if (e.isFile() && VALID_EXTS.has(extname(e.name).toLowerCase())) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

const records = [];
const histogram = { '8.0-8.4': 0, '8.5-8.9': 0, '9.0-9.4': 0, '9.5-9.9': 0, '10.0': 0 };

function scoreBand(s) {
  if (s >= 10.0) return '10.0';
  if (s >= 9.5)  return '9.5-9.9';
  if (s >= 9.0)  return '9.0-9.4';
  if (s >= 8.5)  return '8.5-8.9';
  return '8.0-8.4';
}

console.log(`Scanning fixture directory: ${fixtureDir}`);
console.log(`Labels file:                ${labelsPath}`);
console.log(`Output:                     ${outPath}`);
console.log(`Min score filter:           ${minScore}`);
console.log('');

for (const sub of SUBDIRS) {
  const dir = join(fixtureDir, sub);
  const files = listFiles(dir);
  console.log(`  ${sub}/: ${files.length} files found`);
  for (const absPath of files) {
    let code;
    try { code = readFileSync(absPath, 'utf-8'); }
    catch { continue; }

    const lang = detectLanguage(absPath);
    if (lang === 'unsupported') continue;

    let result;
    try { result = analyzeCode(code, lang, absPath); }
    catch { continue; }

    // Apply min-score filter (default: 0 = no filter)
    if (result.score < minScore) continue;

    const label = getLabel(absPath);

    records.push({
      filePath: absPath,
      language: lang,
      code,
      healthScore: result.score,
      maintainabilityRating: label?.maintainabilityRating ?? -1,
      llmBreakRate: label?.llmBreakRate ?? 0,
      smellTypes: result.smells.map(s => s.type),
      raterNotes: label?.raterNotes,
    });

    // Histogram only for score >= 8.0
    if (result.score >= 8.0) {
      const band = scoreBand(result.score);
      histogram[band] = (histogram[band] ?? 0) + 1;
    }
  }
}

const dataset = {
  createdAt: new Date().toISOString(),
  totalFiles: records.length,
  records,
  scoreHistogram: histogram,
};

writeFileSync(outPath, JSON.stringify(dataset, null, 2), 'utf-8');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const labelled  = records.filter(r => r.maintainabilityRating !== -1);
const defective = records.filter(r => r.maintainabilityRating !== -1 && r.maintainabilityRating < 3);
const clean     = records.filter(r => r.maintainabilityRating !== -1 && r.maintainabilityRating >= 3);

console.log(`\nCorpus JSON written to: ${outPath}`);
console.log(`Total records:   ${records.length}`);
console.log(`Labelled:        ${labelled.length}`);
console.log(`  defective:     ${defective.length}  (maintainabilityRating < 3)`);
console.log(`  clean:         ${clean.length}      (maintainabilityRating >= 3)`);
console.log(`\nScore histogram (>= 8.0 files):`);
for (const [band, count] of Object.entries(histogram)) {
  console.log(`  ${band}: ${count}`);
}
console.log('\nLanguage breakdown:');
const langCounts = {};
for (const r of records) {
  langCounts[r.language] = (langCounts[r.language] ?? 0) + 1;
}
for (const [lang, count] of Object.entries(langCounts)) {
  console.log(`  ${lang}: ${count}`);
}
