#!/usr/bin/env node
/**
 * scan-midfiles.mjs
 * Scans field-repos/ and unhealthy fixtures for files scoring 5.0–8.0
 * with addressable smells (ComplexMethod, DeepNesting, BrainMethod, BumpyRoad,
 * LongParameterList, CognitiveComplexity).
 *
 * Writes benchmark-data/loop-bench/midfiles.json
 */

import { createRequire } from 'module';
import { readdir, stat, readFile, writeFile, mkdir } from 'fs/promises';
import { join, extname, relative } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { analyzeFile } = require('../../../packages/core/dist/index.js');

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIELD_REPOS = join(ROOT, 'field-repos');
const FIXTURES_UNHEALTHY = join(ROOT, 'packages/core/tests/fixtures/unhealthy');
const OUTPUT = join(ROOT, 'benchmark-data/loop-bench/midfiles.json');

// Smells the auto-refactor applier CAN actually address (structural smells)
const ADDRESSABLE_SMELLS = new Set([
  'ComplexMethod',
  'DeepNesting',
  'BrainMethod',
  'BumpyRoad',
  'LongParameterList',
  'CognitiveComplexity',
  'LargeClass',
  'GodClass',
]);

// Language extensions → language identifier mapping
const EXT_TO_LANG = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rb': 'ruby',
  '.rs': 'rust',
  '.php': 'php',
  '.cs': 'csharp',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.ex': 'elixir',
  '.swift': 'swift',
};

// Lang priorities for diversity (we want wide coverage, not too many TypeScript)
const LANG_CAPS = {
  typescript: 12,
  javascript: 8,
  python: 8,
  java: 8,
  go: 8,
  ruby: 6,
  rust: 6,
  php: 6,
  csharp: 6,
  kotlin: 4,
  scala: 3,
  elixir: 3,
};

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor', '__pycache__',
  '.next', 'coverage', 'target', 'out', 'gen', '.gradle',
  'test', 'tests', '__tests__', 'spec', 'specs', 'fixtures',
  'testdata', 'testFixtures', 'examples', 'docs', 'documentation',
]);

const SCORE_MIN = 5.0;
const SCORE_MAX = 8.0;
const TARGET_COUNT = 55; // aim for ~55 files

/** Recursively collect source files up to a depth limit */
async function collectFiles(dir, exts, maxDepth = 8, depth = 0) {
  if (depth > maxDepth) return [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      const sub = await collectFiles(join(dir, e.name), exts, maxDepth, depth + 1);
      results.push(...sub);
    } else if (e.isFile() && exts.has(extname(e.name).toLowerCase())) {
      results.push(join(dir, e.name));
    }
  }
  return results;
}

/** Analyze a file, return null if error or out of range */
async function scoreMidFile(filePath) {
  try {
    const s = await stat(filePath);
    // Skip tiny files (<200 bytes) and very large (>80 KB) — too trivial or too slow
    if (s.size < 200 || s.size > 80_000) return null;
    const result = await analyzeFile(filePath);
    if (result.score < SCORE_MIN || result.score > SCORE_MAX) return null;
    // Must have at least one addressable smell
    const addressable = result.smells.filter(sm => ADDRESSABLE_SMELLS.has(sm.type));
    if (addressable.length === 0) return null;
    const dominantSmells = [...new Set(addressable.map(sm => sm.type))];
    const ext = extname(filePath).toLowerCase();
    const lang = EXT_TO_LANG[ext] || 'unknown';
    return { filePath, lang, score: result.score, dominantSmells, allSmells: [...new Set(result.smells.map(s => s.type))] };
  } catch {
    return null;
  }
}

async function main() {
  const exts = new Set(Object.keys(EXT_TO_LANG));

  // 1. Collect all candidate source files from field-repos
  console.log('Collecting files from field-repos...');
  const fieldFiles = await collectFiles(FIELD_REPOS, exts, 6);
  console.log(`  Found ${fieldFiles.length} candidate files`);

  // 2. Collect from unhealthy fixtures (shallower, known smelly)
  console.log('Collecting from unhealthy fixtures...');
  const fixtureFiles = await collectFiles(FIXTURES_UNHEALTHY, exts, 2);
  console.log(`  Found ${fixtureFiles.length} fixture files`);

  const allFiles = [...fieldFiles, ...fixtureFiles];
  console.log(`Total candidates: ${allFiles.length}`);

  // 3. Shuffle for variety before scanning
  // Deterministic shuffle for reproducibility (Fisher-Yates with fixed seed via index rotation)
  const shuffled = allFiles.slice().sort((a, b) => {
    // Use filename hash as sort key for reproducibility
    let ha = 0, hb = 0;
    for (let i = 0; i < a.length; i++) ha = (ha * 31 + a.charCodeAt(i)) | 0;
    for (let i = 0; i < b.length; i++) hb = (hb * 31 + b.charCodeAt(i)) | 0;
    return ha - hb;
  });

  // 4. Score in batches with concurrency limit
  const CONCURRENCY = 12;
  const langCounts = {};
  const selected = [];
  let scanned = 0;

  console.log(`\nScanning for files scoring ${SCORE_MIN}–${SCORE_MAX}...`);

  for (let i = 0; i < shuffled.length && selected.length < TARGET_COUNT; i += CONCURRENCY) {
    const batch = shuffled.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(f => scoreMidFile(f)));
    for (const r of results) {
      if (!r) continue;
      scanned++;
      const cap = LANG_CAPS[r.lang] ?? 3;
      const count = langCounts[r.lang] ?? 0;
      if (count >= cap) continue;
      // Convert absolute path to repo-relative
      const relPath = relative(ROOT, r.filePath).replace(/\\/g, '/');
      selected.push({
        path: relPath,
        lang: r.lang,
        score: Math.round(r.score * 100) / 100,
        dominantSmells: r.dominantSmells,
        allSmells: r.allSmells,
      });
      langCounts[r.lang] = count + 1;
      if (selected.length % 10 === 0) {
        console.log(`  Selected ${selected.length} so far (${scanned} hits, scanned ${i + CONCURRENCY})...`);
      }
    }
  }

  // Sort by score ascending for readability
  selected.sort((a, b) => a.score - b.score);

  // 5. Write output
  await mkdir(join(ROOT, 'benchmark-data/loop-bench'), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalSelected: selected.length,
    files: selected
  }, null, 2));

  // 6. Print summary
  console.log(`\n=== Selected ${selected.length} mid-complexity files ===`);

  const byLang = {};
  const bySmell = {};
  for (const f of selected) {
    byLang[f.lang] = (byLang[f.lang] ?? 0) + 1;
    for (const sm of f.dominantSmells) {
      bySmell[sm] = (bySmell[sm] ?? 0) + 1;
    }
  }

  console.log('\nLanguage breakdown:');
  for (const [lang, cnt] of Object.entries(byLang).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${lang}: ${cnt}`);
  }
  console.log('\nSmell breakdown (addressable):');
  for (const [smell, cnt] of Object.entries(bySmell).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${smell}: ${cnt}`);
  }
  console.log(`\nScore range: ${selected[0]?.score} – ${selected[selected.length - 1]?.score}`);
  console.log(`Output: ${OUTPUT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
