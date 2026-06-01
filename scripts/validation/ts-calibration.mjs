#!/usr/bin/env node
/**
 * TypeScript/JavaScript Multi-language Calibration
 *
 * PROVENANCE (read before interpreting numbers):
 *   This is a "git-bug-fix proxy" dataset, NOT a human-annotated smell dataset.
 *   Ground truth = files modified in commits whose messages match a fix-commit
 *   regex (SZZ-style heuristic). This is a well-established but imperfect proxy:
 *   SZZ identifies files that were changed to fix a known bug as "buggy" and files
 *   that were never touched by a fix-commit (in the sampled window) as "clean".
 *   The health score measures structural quality (complexity, nesting, coupling)
 *   not logical correctness — so we expect low-to-moderate AUROC, which is honest.
 *   We are NOT claiming "we detect bugs"; we claim "lower health score correlates
 *   with files that required bug-fix edits".
 *
 *   Key limitations:
 *   1. SZZ conflation: fix-commits often touch non-buggy utility files; this adds
 *      noise to positive labels.
 *   2. Survivorship bias: heavily-refactored files may have low health scores but
 *      clean commit history (excluded from the positive set despite being risky).
 *   3. Shallow clone (depth=200-500): we may miss earlier fix commits that predate
 *      the clone depth.
 *   4. Small corpus: 3 repos, 200-500 commits each — not a large-scale study.
 *   5. Health score measures maintainability, not defect probability; Defects4J-
 *      style AUROC 0.5 for bugs is expected and not a failure.
 *
 * Repos used (all MIT-licensed or equivalent, publicly available on GitHub):
 *   - execa (sindresorhus/execa): JavaScript process execution library ~50K stars
 *     URL: https://github.com/sindresorhus/execa
 *   - ts-node (TypeStrong/ts-node): TypeScript REPL / Node.js runner ~13K stars
 *     URL: https://github.com/TypeStrong/ts-node
 *   - zod (colinhacks/zod): TypeScript-first schema validation ~35K stars
 *     URL: https://github.com/colinhacks/zod
 *
 * Method:
 *   1. Walk last N commits (up to --maxCommits) per repo via git log.
 *   2. Identify "fix-commits" by regex on commit subject (same FIX_COMMIT_PATTERN
 *      as szz-label-generator.mjs — no novelty, same heuristic).
 *   3. For each fix-commit, extract the set of modified TS/JS files from the
 *      PARENT commit (the pre-fix/buggy state) using git show.
 *   4. Read those files at the parent commit and analyze with analyzeCode().
 *      These are the "positive" (buggy-file) samples.
 *   5. Collect non-fix-commit TS/JS files that never appeared in any fix-commit
 *      in the sampled window as "negative" (clean-file) samples.
 *   6. Compute AUROC (lower health → positive), bootstrapped 95% CI, precision/
 *      recall at the AI_READY_THRESHOLD cutoff (9.5), and Mann-Whitney p-value.
 *
 * Usage:
 *   node scripts/validation/ts-calibration.mjs [--repos /path1,/path2] [--maxCommits 400] [--json]
 *
 * Options:
 *   --repos       Comma-separated list of repo paths (default: /tmp/ts-calibration-repos/*)
 *   --maxCommits  Max commits to inspect per repo (default: 400)
 *   --json        Output machine-readable JSON instead of a table
 *   --save        Write results JSON to benchmark-data/ts-calibration/results.json
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Slim CJS loader — bypasses core/dist/index.js which eagerly require()s
// tree-sitter-c-sharp (an ESM module with top-level await, incompatible with
// synchronous CJS require() on Node ≥ 24). We load only the modules needed
// for TypeScript/JavaScript analysis and the validation statistics, avoiding
// any C#/Swift/Kotlin tree-sitter bindings.
// ---------------------------------------------------------------------------
const req = createRequire(import.meta.url);
const DIST = join(REPO_ROOT, 'packages', 'core', 'dist');

const _tsAnalyzer    = req(join(DIST, 'analyzers', 'typescript.js'));
const _smellDetector = req(join(DIST, 'smells', 'detector.js'));
const _scoring       = req(join(DIST, 'scoring', 'scorer.js'));
const _brainMethod   = req(join(DIST, 'temporal', 'brain-method.js'));
const _correlation   = req(join(DIST, 'validation', 'correlation.js'));

const { computeAUROC, bootstrapAUROC, mannWhitneyU } = _correlation;

/**
 * Slim analyzeCode for TypeScript/JavaScript — mirrors packages/core/src/index.ts:analyzeCode()
 * but only calls the TS/JS path, keeping us free of C# TLA ESM issues on Node 24.
 *
 * Pipeline: analyzeTypeScript → detectSmells → detectBrainMethods → calculateScore
 * This is identical to the full analyzeCode() pipeline for language='typescript'|'javascript'.
 *
 * @param {string} code
 * @param {'typescript'|'javascript'} language
 * @param {string} filePath
 * @returns {{ score: number, smells: Array<{type: string}> }}
 */
function analyzeCode(code, language, filePath) {
  try {
    const result = _tsAnalyzer.analyzeTypeScript(code, filePath);
    if (!result) return { score: 10, smells: [] };
    const detSmells   = _smellDetector.detectSmells(result.functions, result.metrics, language);
    const brainSmells = _brainMethod.detectBrainMethods(result.functions, result.metrics.cyclomaticComplexity);
    const allSmells   = [...result.smells, ...detSmells, ...brainSmells];
    const score       = _scoring.calculateScore(allSmells, language);
    return { score, smells: allSmells };
  } catch {
    return { score: 10, smells: [] };
  }
}

// ---------- Constants ----------

const FIX_COMMIT_PATTERN = /\b(fix|bug|issue|error|defect|closes?\s*#\d+|resolves?\s*#\d+)\b/i;
const VERSION_BUMP_PATTERN = /^(bump|chore(?:\(release\))?|release|version|v\d+\.\d+|publish)/i;
const SUPPORTED_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx']);
// Exclude test / generated / declaration files — they are noisy labels
const EXCLUDE_PATH_PATTERNS = [
  /node_modules/,
  /\/dist\//,
  /\/build\//,
  /\.d\.ts$/,
  /\.test\.(ts|js)$/,
  /\.spec\.(ts|js)$/,
  /\/tests?\//,
  /\/test-d\//,
  /\/__tests__\//,
  /\/fixtures?\//,
  /\/mocks?\//,
];
// Minimum file size to avoid trivially small files skewing results
const MIN_FILE_BYTES = 200;
// Maximum file size to cap runtime (our own LargeFile smell fires at 500 LOC anyway)
const MAX_FILE_BYTES = 80_000;

// AI_READY_THRESHOLD for binary classification at the cutoff
const SCORE_THRESHOLD = 9.5;

// ---------- Argument parsing ----------

const args = process.argv.slice(2);
const FLAG_REPOS   = args.find(a => a.startsWith('--repos='))?.slice('--repos='.length);
const FLAG_MAX     = parseInt(args.find(a => a.startsWith('--maxCommits='))?.slice('--maxCommits='.length) ?? '400', 10);
const FLAG_JSON    = args.includes('--json');
const FLAG_SAVE    = args.includes('--save');
const FLAG_VERBOSE = args.includes('--verbose');

// Determine repos to analyze
const DEFAULT_REPO_BASE = '/tmp/ts-calibration-repos';
let repoPaths = [];
if (FLAG_REPOS) {
  repoPaths = FLAG_REPOS.split(',').map(p => resolve(p));
} else {
  // Auto-discover subdirs of the default base
  try {
    // Use pure Node fs — no child_process, no shell at all
    const entries = readdirSync(DEFAULT_REPO_BASE, { withFileTypes: true });
    repoPaths = entries
      .filter(e => e.isDirectory())
      .map(e => join(DEFAULT_REPO_BASE, e.name))
      .filter(p => existsSync(join(p, '.git')));
  } catch {
    repoPaths = [];
  }
}

if (repoPaths.length === 0) {
  console.error([
    'No repos found. Clone repos first or pass --repos=/path1,/path2.',
    'Example setup:',
    '  mkdir -p /tmp/ts-calibration-repos',
    '  cd /tmp/ts-calibration-repos',
    '  git clone --depth=400 https://github.com/sindresorhus/execa',
    '  git clone --depth=400 https://github.com/TypeStrong/ts-node',
    '  git clone --depth=400 https://github.com/colinhacks/zod',
    '  node scripts/validation/ts-calibration.mjs',
  ].join('\n'));
  process.exit(1);
}

// ---------- Core helpers ----------

function isExcluded(filePath) {
  return EXCLUDE_PATH_PATTERNS.some(rx => rx.test(filePath));
}

function isSupported(filePath) {
  return SUPPORTED_EXTENSIONS.has(extname(filePath).toLowerCase());
}

/**
 * Run a git command in a repo using execFileSync (no shell — safe against injection).
 * @param {string} repoPath  - Absolute path to git repo root
 * @param {string[]} gitArgs - Arguments passed directly to git (no shell expansion)
 * @returns {string|null}    - stdout string, or null on error
 */
function git(repoPath, gitArgs) {
  try {
    return execFileSync('git', ['-C', repoPath, ...gitArgs], {
      encoding: 'utf-8',
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/**
 * Read file content at a specific commit ref via git show.
 * Uses execFileSync so ref and filePath are passed as discrete arguments — no shell injection.
 * @param {string} repoPath
 * @param {string} ref       - Git ref (e.g. "abc123^")
 * @param {string} filePath  - Repo-relative file path
 * @returns {string|null}
 */
function gitShowFile(repoPath, ref, filePath) {
  try {
    return execFileSync('git', ['-C', repoPath, 'show', `${ref}:${filePath}`], {
      encoding: 'utf-8',
      maxBuffer: MAX_FILE_BYTES * 2,
    });
  } catch {
    return null;
  }
}

/** Detect language string for our analyzer from file extension. */
function detectLang(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  return 'javascript';
}

// ---------- Per-repo extraction ----------

/**
 * @typedef {Object} Sample
 * @property {string} repo
 * @property {string} filePath
 * @property {string} language
 * @property {number} score
 * @property {boolean} buggy   true if file was modified in a fix-commit
 * @property {string} sha      commit SHA the file was read from
 */

/**
 * Extract samples from a single repo using SZZ-proxy labeling.
 *
 * @param {string} repoPath
 * @param {number} maxCommits
 * @returns {{ samples: Sample[], stats: object }}
 */
function extractSamples(repoPath, maxCommits) {
  const repoName = repoPath.split('/').pop() ?? repoPath;

  // Step 1: Get commit list (SHA|subject|parents) using argument array — no shell
  const logOutput = git(repoPath, [
    'log', '--no-merges', '--format=%H|%s|%P', `-${maxCommits}`,
  ]);
  if (!logOutput) {
    console.warn(`[${repoName}] Could not read git log — skipping.`);
    return { samples: [], stats: { repo: repoName, error: 'git log failed' } };
  }

  const commits = [];
  for (const line of logOutput.split('\n').filter(Boolean)) {
    const firstPipe = line.indexOf('|');
    const secondPipe = line.indexOf('|', firstPipe + 1);
    if (firstPipe < 0 || secondPipe < 0) continue;
    const sha = line.slice(0, firstPipe).trim();
    const subject = line.slice(firstPipe + 1, secondPipe).trim();
    if (!sha) continue;
    if (VERSION_BUMP_PATTERN.test(subject)) continue;
    const isFixCommit = FIX_COMMIT_PATTERN.test(subject);
    commits.push({ sha, subject, isFixCommit });
  }

  const fixCommits = commits.filter(c => c.isFixCommit);
  const nonFixCommits = commits.filter(c => !c.isFixCommit);

  if (FLAG_VERBOSE) {
    console.log(`[${repoName}] ${commits.length} commits, ${fixCommits.length} fix, ${nonFixCommits.length} non-fix`);
  }

  // Step 2: For each fix-commit, extract modified TS/JS files at the PARENT state
  // We use `git show --name-status <sha> -- '*.ts' '*.js' ...` to get file list
  const positiveFileMap = new Map(); // filePath@parentSha -> Sample (dedup)

  for (const { sha } of fixCommits) {
    const parentSha = `${sha}^`;

    // Get list of modified files in this commit — sha is a 40-char hex string from git log, safe
    const nameStatus = git(repoPath, ['show', '--name-status', '--format=', sha]);
    if (!nameStatus) continue;

    for (const line of nameStatus.split('\n').filter(Boolean)) {
      // Format: M\tpath  or  A\tpath  or  R100\told\tnew
      const parts = line.split('\t');
      if (parts.length < 2) continue;
      const status = parts[0];
      // Only Modified files (M) — Added/Deleted files are less meaningful for blame
      if (!status.startsWith('M')) continue;
      const filePath = parts[1];

      if (!isSupported(filePath) || isExcluded(filePath)) continue;

      const key = `${filePath}@${parentSha}`;
      if (positiveFileMap.has(key)) continue;

      // Read file content at parent commit (the buggy pre-fix version)
      const content = gitShowFile(repoPath, parentSha, filePath);
      if (!content) continue;
      if (content.length < MIN_FILE_BYTES || content.length > MAX_FILE_BYTES) continue;

      const lang = detectLang(filePath);
      let result;
      try {
        result = analyzeCode(content, lang, filePath);
      } catch {
        continue;
      }

      positiveFileMap.set(key, {
        repo: repoName,
        filePath,
        language: lang,
        score: result.score,
        buggy: true,
        sha: parentSha,
      });
    }
  }

  // Step 3: Collect clean (non-buggy) files from non-fix commits
  // We sample non-fix commit files up to 2× the positive count to keep balance manageable
  const posCount = positiveFileMap.size;
  const targetNeg = Math.min(posCount * 3, 300); // up to 3× positives, cap at 300
  const negativeFileMap = new Map();

  // Build set of all files ever labeled positive to exclude them from negatives
  const allPositiveFiles = new Set([...positiveFileMap.keys()].map(k => k.split('@')[0]));

  for (const { sha } of nonFixCommits) {
    if (negativeFileMap.size >= targetNeg) break;

    const nameStatus = git(repoPath, ['show', '--name-status', '--format=', sha]);
    if (!nameStatus) continue;

    for (const line of nameStatus.split('\n').filter(Boolean)) {
      if (negativeFileMap.size >= targetNeg) break;
      const parts = line.split('\t');
      if (parts.length < 2) continue;
      const filePath = parts[1];
      if (!isSupported(filePath) || isExcluded(filePath)) continue;
      if (allPositiveFiles.has(filePath)) continue; // exclude files that appear in fix-commits

      const key = `${filePath}@${sha}`;
      if (negativeFileMap.has(key)) continue;

      const content = gitShowFile(repoPath, sha, filePath);
      if (!content) continue;
      if (content.length < MIN_FILE_BYTES || content.length > MAX_FILE_BYTES) continue;

      const lang = detectLang(filePath);
      let result;
      try {
        result = analyzeCode(content, lang, filePath);
      } catch {
        continue;
      }

      negativeFileMap.set(key, {
        repo: repoName,
        filePath,
        language: lang,
        score: result.score,
        buggy: false,
        sha,
      });
    }
  }

  const samples = [...positiveFileMap.values(), ...negativeFileMap.values()];
  const stats = {
    repo: repoName,
    totalCommits: commits.length,
    fixCommits: fixCommits.length,
    positiveSamples: positiveFileMap.size,
    negativeSamples: negativeFileMap.size,
    totalSamples: samples.length,
  };

  return { samples, stats };
}

// ---------- Main execution ----------

const allSamples = [];
const allRepoStats = [];

for (const repoPath of repoPaths) {
  if (!existsSync(join(repoPath, '.git'))) {
    console.warn(`[SKIP] Not a git repo: ${repoPath}`);
    continue;
  }
  const repoName = repoPath.split('/').pop() ?? repoPath;
  process.stderr.write(`Analyzing ${repoName}...`);
  const { samples, stats } = extractSamples(repoPath, FLAG_MAX);
  process.stderr.write(` ${stats.positiveSamples ?? 0} pos / ${stats.negativeSamples ?? 0} neg\n`);
  allSamples.push(...samples);
  allRepoStats.push(stats);
}

const n = allSamples.length;
if (n === 0) {
  console.error('No samples extracted. Check repo paths and git log output.');
  process.exit(1);
}

const scores = allSamples.map(s => s.score);
const labels = allSamples.map(s => s.buggy);
const nPos = labels.filter(Boolean).length;
const nNeg = n - nPos;

// AUROC: lower health score → more likely to be a buggy file
// computeAUROC(scores, labels) uses the convention that lower score = positive class
// So we pass scores as-is (lower score is the buggy file indicator).
const auroc = computeAUROC(scores, labels);
const ci = bootstrapAUROC(scores, labels, 2000, 0.95);
const mw = mannWhitneyU(scores, labels);

// Precision/recall at score threshold (below threshold = predicted positive/buggy)
let tp = 0, fp = 0, fn = 0, tn = 0;
for (let i = 0; i < n; i++) {
  const predicted = scores[i] < SCORE_THRESHOLD; // predict "buggy" if score < 9.5
  const actual = labels[i];
  if (predicted && actual) tp++;
  else if (predicted && !actual) fp++;
  else if (!predicted && actual) fn++;
  else tn++;
}
const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;

// Score distribution per group
const buggyScores = allSamples.filter(s => s.buggy).map(s => s.score);
const cleanScores = allSamples.filter(s => !s.buggy).map(s => s.score);
const mean = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const stddev = (arr) => {
  const m = mean(arr);
  return arr.length > 1 ? Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)) : 0;
};

// Language breakdown
const langCounts = {};
for (const s of allSamples) {
  const k = `${s.language}/${s.buggy ? 'buggy' : 'clean'}`;
  langCounts[k] = (langCounts[k] ?? 0) + 1;
}

// ---------- Output ----------

const result = {
  generated: new Date().toISOString(),
  repos: repoPaths,
  maxCommitsPerRepo: FLAG_MAX,
  n,
  nPos,
  nNeg,
  auroc: parseFloat(auroc.toFixed(4)),
  ci95: {
    lower: parseFloat(ci.lower.toFixed(4)),
    upper: parseFloat(ci.upper.toFixed(4)),
    width: parseFloat(ci.ciWidth.toFixed(4)),
  },
  mannWhitneyP: parseFloat(mw.pValue.toFixed(4)),
  scoreThreshold: SCORE_THRESHOLD,
  tp, fp, fn, tn,
  precision: parseFloat(precision.toFixed(4)),
  recall: parseFloat(recall.toFixed(4)),
  f1: parseFloat(f1.toFixed(4)),
  buggyMean: parseFloat(mean(buggyScores).toFixed(3)),
  buggyStd: parseFloat(stddev(buggyScores).toFixed(3)),
  cleanMean: parseFloat(mean(cleanScores).toFixed(3)),
  cleanStd: parseFloat(stddev(cleanScores).toFixed(3)),
  repoStats: allRepoStats,
  langCounts,
};

if (FLAG_JSON) {
  console.log(JSON.stringify(result, null, 2));
} else {
  // Human-readable table
  console.log('\n=== TypeScript/JavaScript Calibration Results ===\n');
  console.log('Repos analyzed:');
  for (const s of allRepoStats) {
    console.log(`  ${s.repo}: ${s.totalCommits} commits, ${s.fixCommits} fix-commits → ${s.positiveSamples} pos samples, ${s.negativeSamples} neg samples`);
  }
  console.log('');
  console.log(`Total samples : n=${n}  (${nPos} buggy / ${nNeg} clean)`);
  console.log(`Threshold     : score < ${SCORE_THRESHOLD} → predicted buggy`);
  console.log('');
  console.log('┌─────────────────────────────┬──────────────┐');
  console.log('│ Metric                      │ Value        │');
  console.log('├─────────────────────────────┼──────────────┤');
  console.log(`│ AUROC                       │ ${auroc.toFixed(4).padStart(12)} │`);
  console.log(`│ 95% CI (bootstrap, n=2000)  │ [${ci.lower.toFixed(3)}, ${ci.upper.toFixed(3)}] │`);
  console.log(`│ Mann-Whitney p              │ ${mw.pValue.toFixed(4).padStart(12)} │`);
  console.log(`│ Precision @ ≥9.5 threshold  │ ${precision.toFixed(4).padStart(12)} │`);
  console.log(`│ Recall @ ≥9.5 threshold     │ ${recall.toFixed(4).padStart(12)} │`);
  console.log(`│ F1 @ ≥9.5 threshold         │ ${f1.toFixed(4).padStart(12)} │`);
  console.log(`│ Buggy mean score            │ ${mean(buggyScores).toFixed(3).padStart(12)} │`);
  console.log(`│ Clean mean score            │ ${mean(cleanScores).toFixed(3).padStart(12)} │`);
  console.log('├─────────────────────────────┼──────────────┤');
  console.log(`│ TP / FP / FN / TN           │ ${tp}/${fp}/${fn}/${tn}`.padEnd(43) + '│');
  console.log('└─────────────────────────────┴──────────────┘');
  console.log('');
  console.log('Language breakdown:');
  for (const [k, v] of Object.entries(langCounts)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log('');
  console.log('PROVENANCE NOTE: SZZ-proxy dataset. Not human-annotated smells. See script header for caveats.');
  console.log('Reproduce: node scripts/validation/ts-calibration.mjs');
}

if (FLAG_SAVE) {
  const outDir = join(REPO_ROOT, 'benchmark-data', 'ts-calibration');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'results.json');
  writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
  console.log(`\nResults saved to ${outPath}`);
}
