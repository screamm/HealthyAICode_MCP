#!/usr/bin/env node
/**
 * scripts/validation/holdout/fetch-real-oss-files.mjs
 *
 * Build a real labeled holdout corpus from open-source repos.
 * This script REQUIRES network access to clone/pull the OSS repositories.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NETWORK REQUIREMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * This script clones or updates three OSS repositories into --oss-dir:
 *   - psf/requests      (Python)    https://github.com/psf/requests
 *   - golang/tools      (Go)        https://github.com/golang/tools
 *   - sindresorhus/execa (JS)       https://github.com/sindresorhus/execa
 *
 * After the first run, subsequent runs reuse the cached clones (no re-download
 * unless the directories are deleted).  The cloned repos are NOT committed to
 * this repository — they are expected to live in --oss-dir (default: a sibling
 * directory outside the repo root).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LABELING STRATEGY (git-bug-fix-commit proxy)
 * ─────────────────────────────────────────────────────────────────────────────
 * Files appearing in git "fix" commits with score < 7.0  → defective (rating 1-2)
 * Files appearing in git "fix" commits with score >= 7.0 → borderline (rating 3)
 *   (high-score files in fix commits are likely doc-only changes, not real bugs)
 * Files NOT in fix commits with score < 5.0  → defective (complex code, rating 2)
 * Files NOT in fix commits with score 5.0-7.9 → borderline (rating 3)
 * Files NOT in fix commits with score >= 8.0  → clean (rating 4-5)
 *
 * KNOWN LIMITATION: the git-bug-fix-commit proxy has an estimated ~20-30%
 * false-positive rate (commits containing "fix" in the message that are
 * not actual bug fixes, e.g. doc fixes, typo fixes).  No real LLM break-rate
 * has been measured — llmBreakRate values are synthetic proxies.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Usage:
 *   node scripts/validation/holdout/fetch-real-oss-files.mjs \
 *     [--oss-dir <path>]        (default: ../../holdout-oss relative to repo root)
 *     [--fixture-dir <path>]    (default: packages/core/tests/fixtures/holdout)
 *     [--labels-out <path>]     (default: <fixture-dir>/corpus-labels.json)
 *     [--skip-clone]            (skip git clone/pull, use existing dirs)
 *
 * After this script completes, run generate-corpus-json.mjs to rebuild corpus.json.
 *
 * Exit codes:
 *   0 — success
 *   1 — missing git binary, argument errors, or fatal I/O errors
 */

import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, extname, dirname, resolve } from 'node:path';
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
let ossDir, fixtureDir, labelsOut, skipClone;
try {
  const { values } = parseArgs({
    options: {
      'oss-dir':     { type: 'string' },
      'fixture-dir': { type: 'string' },
      'labels-out':  { type: 'string' },
      'skip-clone':  { type: 'boolean' },
    },
    strict: true,
    args: process.argv.slice(2),
  });

  const defaultFixtureDir = join(REPO_ROOT, 'packages/core/tests/fixtures/holdout');
  // Default oss-dir: a sibling of the repo root so large clones stay outside the repo
  const defaultOssDir = resolve(REPO_ROOT, '..', 'holdout-oss');

  ossDir     = values['oss-dir']     ? resolve(values['oss-dir'])     : defaultOssDir;
  fixtureDir = values['fixture-dir'] ? resolve(values['fixture-dir']) : defaultFixtureDir;
  labelsOut  = values['labels-out']  ? resolve(values['labels-out'])  : join(fixtureDir, 'corpus-labels.json');
  skipClone  = values['skip-clone']  ?? false;
} catch (err) {
  console.error(`Argument error: ${err.message}`);
  console.error('Usage: node fetch-real-oss-files.mjs [--oss-dir <dir>] [--fixture-dir <dir>] [--labels-out <file>] [--skip-clone]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Load core library (requires pnpm build)
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
// Config — OSS repos to fetch
// ---------------------------------------------------------------------------
const REPOS = [
  {
    name:      'requests',
    repoUrl:   'https://github.com/psf/requests',
    cloneDir:  join(ossDir, 'requests'),
    subDir:    join('src', 'requests'),
    ext:       '.py',
    commitHash: null,
  },
  {
    name:      'gotools',
    repoUrl:   'https://github.com/golang/tools',
    cloneDir:  join(ossDir, 'gotools'),
    subDir:    join('go', 'analysis'),
    ext:       '.go',
    commitHash: null,
  },
  {
    name:      'execa',
    repoUrl:   'https://github.com/sindresorhus/execa',
    cloneDir:  join(ossDir, 'execa'),
    subDir:    'lib',
    ext:       '.js',
    commitHash: null,
  },
];

// Files to exclude — documentation stubs that score trivially high
const EXCLUDE_PATTERNS = [
  /\/doc\.go$/,
  /\\doc\.go$/,
  /__version__\.py$/,
  /packages\.py$/,
  /py\.typed$/,
];

function shouldExclude(path) {
  return EXCLUDE_PATTERNS.some(re => re.test(path));
}

// ---------------------------------------------------------------------------
// Git helpers (execFile — no shell injection)
// ---------------------------------------------------------------------------

function ensureGitAvailable() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) {
    console.error('git binary not found. Please install git before running this script.');
    process.exit(1);
  }
}

function cloneOrPull(repoUrl, cloneDir) {
  if (existsSync(join(cloneDir, '.git'))) {
    console.log(`  Pulling ${cloneDir} ...`);
    try {
      execFileSync('git', ['-C', cloneDir, 'pull', '--ff-only'],
        { encoding: 'utf-8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      console.warn(`  Warning: git pull failed (${err.message}), continuing with existing checkout.`);
    }
  } else {
    console.log(`  Cloning ${repoUrl} → ${cloneDir} ...`);
    mkdirSync(cloneDir, { recursive: true });
    try {
      execFileSync('git', ['clone', '--depth=500', repoUrl, cloneDir],
        { encoding: 'utf-8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      console.error(`  FATAL: git clone failed: ${err.message}`);
      process.exit(1);
    }
  }
}

function getCommitHash(repoDir) {
  try {
    return execFileSync('git', ['-C', repoDir, 'rev-parse', '--short', 'HEAD'],
      { encoding: 'utf-8', timeout: 5_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return 'unknown'; }
}

function getBugFixRelPaths(repoDir) {
  try {
    const raw = execFileSync(
      'git',
      ['-C', repoDir, 'log', '--name-only', '--pretty=format:%s', '--diff-filter=M', '--grep=fix', '-i'],
      { encoding: 'utf-8', timeout: 30_000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const paths = new Set();
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (t && !t.includes(' ') && t.length > 2) {
        paths.add(t.replace(/\//g, '\\'));
        paths.add(t.replace(/\\/g, '/'));
      }
    }
    return paths;
  } catch { return new Set(); }
}

function countBugFixTouches(repoDir, relPath) {
  try {
    const normalized = relPath.replace(/\\/g, '/');
    const raw = execFileSync(
      'git',
      ['-C', repoDir, 'log', '--oneline', '--diff-filter=M', '--grep=fix', '-i', '--', normalized],
      { encoding: 'utf-8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return raw.split('\n').filter(l => l.trim()).length;
  } catch { return 0; }
}

// ---------------------------------------------------------------------------
// File listing (no shell)
// ---------------------------------------------------------------------------
function listFiles(dir, ext, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'testdata') {
      listFiles(full, ext, out);
    } else if (
      e.isFile() &&
      extname(e.name).toLowerCase() === ext &&
      !e.name.includes('_test') &&
      !e.name.includes('.test.') &&
      !shouldExclude(full)
    ) {
      out.push(full);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Assign maintainability rating from score + bug-fix status
// ---------------------------------------------------------------------------
function assignLabel(score, isBugFix, bugTouchCount) {
  if (isBugFix && score < 5.0) {
    return { rating: bugTouchCount >= 3 ? 1 : 2, llmBreakRate: 0.8 };
  }
  if (isBugFix && score < 7.0) {
    return { rating: 2, llmBreakRate: 0.6 };
  }
  if (!isBugFix && score < 5.0) {
    return { rating: 2, llmBreakRate: 0.5 };
  }
  if (score < 7.0) {
    return { rating: 3, llmBreakRate: 0.2 };
  }
  if (score < 8.0) {
    return { rating: 3, llmBreakRate: 0.15 };
  }
  if (score < 9.0) {
    return { rating: 4, llmBreakRate: 0.05 };
  }
  if (score < 9.5) {
    return { rating: 4, llmBreakRate: 0.02 };
  }
  return { rating: 5, llmBreakRate: 0.0 };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

ensureGitAvailable();

// Ensure fixture dirs exist
const fixturesDirs = {
  healthy:    join(fixtureDir, 'healthy'),
  borderline: join(fixtureDir, 'borderline'),
  unhealthy:  join(fixtureDir, 'unhealthy'),
  real:       join(fixtureDir, 'real'),
};
for (const d of Object.values(fixturesDirs)) {
  mkdirSync(d, { recursive: true });
}
mkdirSync(ossDir, { recursive: true });

// Clone / pull repos (unless --skip-clone)
if (!skipClone) {
  console.log('\nFetching OSS repositories (requires network):');
  for (const repo of REPOS) {
    console.log(`\n[${repo.name}] ${repo.repoUrl}`);
    cloneOrPull(repo.repoUrl, repo.cloneDir);
  }
} else {
  console.log('\n--skip-clone: Using existing repo directories.');
}

console.log('\nAnalyzing files and assigning labels...');

const newLabels = [];

for (const repo of REPOS) {
  if (!existsSync(repo.cloneDir)) {
    console.warn(`  Warning: ${repo.cloneDir} does not exist — skipping ${repo.name}`);
    continue;
  }

  repo.commitHash = getCommitHash(repo.cloneDir);
  console.log(`\n[${repo.name}] @ ${repo.commitHash}`);

  const bugFixPaths = getBugFixRelPaths(repo.cloneDir);
  const searchDir = join(repo.cloneDir, repo.subDir);
  const allFiles  = listFiles(searchDir, repo.ext);
  console.log(`  Files found: ${allFiles.length}`);

  let processed = 0;
  for (const absPath of allFiles) {
    let code;
    try { code = readFileSync(absPath, 'utf-8'); }
    catch { continue; }

    const loc = code.split('\n').length;
    if (loc < 30 || code.length > 60_000) continue;

    const lang = detectLanguage(absPath);
    if (lang === 'unsupported') continue;
    if (!['python', 'go', 'javascript', 'typescript'].includes(lang)) continue;

    let result;
    try { result = analyzeCode(code, lang, absPath); }
    catch { continue; }

    const relPath = absPath.slice(repo.cloneDir.length + 1);
    const relPathFwd = relPath.replace(/\\/g, '/');
    const isBugFix = bugFixPaths.has(relPath) || bugFixPaths.has(relPathFwd)
      || [...bugFixPaths].some(p => basename(p) === basename(absPath));
    const bugTouchCount = isBugFix ? countBugFixTouches(repo.cloneDir, relPathFwd) : 0;

    const { rating, llmBreakRate } = assignLabel(result.score, isBugFix, bugTouchCount);

    // Build a unique fixture filename
    const flatName = `${repo.name}_${relPath.replace(/[\\\/]/g, '_')}`;

    // Determine destination dir
    let destDir;
    if (rating <= 2)       destDir = fixturesDirs.unhealthy;
    else if (rating === 3) destDir = fixturesDirs.borderline;
    else                   destDir = fixturesDirs.real;

    const destPath = join(destDir, flatName);
    try { copyFileSync(absPath, destPath); }
    catch { continue; }

    const provenance = `${repo.repoUrl} @ ${repo.commitHash}, file: ${relPathFwd}`
      + (isBugFix ? `, touched in ${bugTouchCount} bug-fix commit(s)` : ', stable (no bug-fix touches)');

    newLabels.push({
      filePath: flatName,
      maintainabilityRating: rating,
      llmBreakRate,
      raterNotes: `score=${result.score.toFixed(2)}, smells=${result.smells.length}, loc=${loc}, bugFix=${isBugFix}. Provenance: ${provenance}`,
    });
    processed++;
  }
  console.log(`  Processed: ${processed} files → ${newLabels.filter(l => l.raterNotes?.includes(repo.name)).length} labels`);
}

// ---------------------------------------------------------------------------
// Load existing hand-crafted labels (preserve them)
// ---------------------------------------------------------------------------
let existingLabels = [];
try {
  existingLabels = JSON.parse(readFileSync(labelsOut, 'utf-8'));
  // Keep only original hand-crafted entries (no 'Provenance:' in raterNotes)
  existingLabels = existingLabels.filter(l =>
    !l.raterNotes || !l.raterNotes.includes('Provenance:')
  );
  console.log(`\nPreserved ${existingLabels.length} existing hand-crafted labels from ${labelsOut}`);
} catch {
  console.log('\nNo existing labels file — starting fresh.');
}

// ---------------------------------------------------------------------------
// Merge and write
// ---------------------------------------------------------------------------
const allLabels = [...existingLabels, ...newLabels];

writeFileSync(labelsOut, JSON.stringify(allLabels, null, 2), 'utf-8');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const byRating = [1, 2, 3, 4, 5].map(r => ({
  rating: r,
  count: allLabels.filter(l => l.maintainabilityRating === r).length,
}));

console.log('\n=== Corpus Labels Written ===');
console.log(`Output: ${labelsOut}`);
console.log(`Total entries: ${allLabels.length}`);
console.log(`  Existing hand-crafted: ${existingLabels.length}`);
console.log(`  New real OSS files:    ${newLabels.length}`);
console.log('\nRating breakdown:');
for (const { rating, count } of byRating) {
  const hasBug = rating < 3 ? ' [hasBug=true]' : '';
  console.log(`  Rating ${rating}: ${count} files${hasBug}`);
}
const defective = allLabels.filter(l => l.maintainabilityRating < 3).length;
const clean     = allLabels.filter(l => l.maintainabilityRating >= 3).length;
console.log(`\nFor validation: defective=${defective}, clean=${clean}`);
console.log('\nNext step: node scripts/validation/holdout/generate-corpus-json.mjs');
