#!/usr/bin/env node
/**
 * scripts/validation/holdout/inspect-oss-files.mjs
 *
 * Diagnostic tool — analyze health scores of real open-source files to
 * understand score distribution and bug-fix-commit proxy coverage.
 *
 * This is an EXPLORATION tool, not part of the normal pipeline.  Run it
 * manually to spot-check labeling decisions before running
 * fetch-real-oss-files.mjs.
 *
 * NETWORK REQUIREMENT: The OSS repos must already be cloned by
 * fetch-real-oss-files.mjs (or by hand).  This script itself does not
 * clone anything.
 *
 * Usage:
 *   node scripts/validation/holdout/inspect-oss-files.mjs \
 *     [--oss-dir <path>]   (default: ../../holdout-oss relative to repo root)
 *
 * Uses execFile (not exec) to avoid shell-injection risks.
 */

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------
let ossDir;
try {
  const { values } = parseArgs({
    options: {
      'oss-dir': { type: 'string' },
    },
    strict: true,
    args: process.argv.slice(2),
  });
  ossDir = values['oss-dir'] ? resolve(values['oss-dir']) : resolve(REPO_ROOT, '..', 'holdout-oss');
} catch (err) {
  console.error(`Argument error: ${err.message}`);
  console.error('Usage: node inspect-oss-files.mjs [--oss-dir <path>]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load core library
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
// Repos to scan (resolved from ossDir)
// ---------------------------------------------------------------------------
const REPOS = [
  { dir: join(ossDir, 'requests'), subDir: join('src', 'requests'), ext: '.py' },
  { dir: join(ossDir, 'gotools'),  subDir: join('go', 'analysis'),  ext: '.go' },
  { dir: join(ossDir, 'execa'),    subDir: 'lib',                   ext: '.js' },
];

// ---------------------------------------------------------------------------
// Bug-fix path extraction via git log
// ---------------------------------------------------------------------------
function getBugFixRelPaths(repoDir) {
  try {
    const raw = execFileSync(
      'git',
      ['-C', repoDir, 'log', '--name-only', '--pretty=format:%s', '--diff-filter=M', '--grep=fix', '--regexp-ignore-case'],
      { encoding: 'utf-8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const paths = new Set();
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (t && !t.includes(' ') && (t.includes('/') || t.includes('.'))) {
        paths.add(t.replace(/\//g, '\\'));
      }
    }
    return paths;
  } catch {
    return new Set();
  }
}

function listFiles(dir, ext, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'testdata') {
      listFiles(full, ext, out);
    } else if (e.isFile() && extname(e.name).toLowerCase() === ext && !e.name.includes('_test') && !e.name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const results = [];

for (const repo of REPOS) {
  const bugFixPaths = getBugFixRelPaths(repo.dir);
  const allFiles = listFiles(join(repo.dir, repo.subDir), repo.ext);

  for (const absPath of allFiles) {
    let code;
    try { code = readFileSync(absPath, 'utf-8'); }
    catch { continue; }

    if (code.length < 100 || code.length > 60_000) continue;

    const lang = detectLanguage(absPath);
    if (lang === 'unsupported') continue;

    let result;
    try { result = analyzeCode(code, lang, absPath); }
    catch { continue; }

    const relPath = absPath.slice(repo.dir.length + 1);
    const isBugFix =
      bugFixPaths.has(relPath) ||
      [...bugFixPaths].some(p => basename(p) === basename(absPath));

    results.push({
      absPath, relPath, lang,
      score: result.score,
      smellCount: result.smells.length,
      smellTypes: result.smells.map(s => s.type),
      isBugFix,
      repo: basename(repo.dir),
      loc: code.split('\n').length,
    });
  }
}

// ---------------------------------------------------------------------------
// Print sorted table
// ---------------------------------------------------------------------------
results.sort((a, b) => a.score - b.score);

console.log('\nFile analysis (sorted by health score):');
console.log('========================================');
for (const r of results) {
  const label = r.isBugFix ? '[BUG-FIX]' : '[stable] ';
  console.log(`${label} score=${r.score.toFixed(2)} lang=${r.lang} smells=${r.smellCount} loc=${r.loc} ${r.repo}/${r.relPath}`);
}

const bugCount   = results.filter(r => r.isBugFix).length;
const cleanCount = results.filter(r => !r.isBugFix).length;
console.log(`\nTotal: ${results.length}  Bug-fix: ${bugCount}  Stable: ${cleanCount}`);

const bands = [[1, 5, '<5'], [5, 7, '5-7'], [7, 9, '7-9'], [9, 9.5, '9-9.5'], [9.5, 11, '>=9.5']];
console.log('\nScore distribution:');
for (const [lo, hi, label] of bands) {
  const count = results.filter(r => r.score >= lo && r.score < hi).length;
  console.log(`  ${label}: ${count}`);
}
