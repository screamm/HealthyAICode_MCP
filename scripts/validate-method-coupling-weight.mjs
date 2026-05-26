#!/usr/bin/env node
/**
 * validate-method-coupling-weight.mjs
 *
 * Empirical validation of the MethodTemporalCoupling weight (currently 0.3) used in
 * the Healthy AI Code MCP health-scoring formula:
 *
 *   score = 10 - Σ(weight × √count)
 *
 * This script:
 *   1. Clones a set of well-known OSS Java repositories that have rich bug-fix histories.
 *   2. For each repo, identifies files touched in bug-fix commits (SZZ heuristic).
 *   3. Runs analyzeFileWithHistory on every Java file to detect MethodTemporalCoupling.
 *   4. Computes Pearson/Spearman correlation and AUROC between coupling detection and
 *      bug-fix label at the file level.
 *   5. Simulates alternative weights (0.1 – 0.8) and reports which weight maximises
 *      AUROC separation between buggy and clean files.
 *   6. Outputs a summary to stdout and a JSON report to
 *      .calibration-cache/method-coupling-validation.json.
 *
 * Usage
 * -----
 *   node scripts/validate-method-coupling-weight.mjs [--max-files N] [--skip-clone]
 *
 *   --max-files N   Limit to N Java files per repo (default: 200). Lower = faster run.
 *   --skip-clone    Skip git-clone if repos are already present in .calibration-cache/repos/
 *
 * Prerequisites
 * -------------
 *   - Node.js 18+
 *   - git on PATH
 *   - pnpm build  (packages/core/dist/index.js must exist)
 *
 * Runtime estimate (default settings, SSD): ~15-25 min per repo because
 * analyzeFileWithHistory walks git history for each file individually.
 * Use --max-files 50 for a quick smoke-test (~3 min total).
 *
 * Academic references used to select repos and validate the metric
 * ----------------------------------------------------------------
 * [1] D'Ambros, Lanza, Robbes — "On the Relationship Between Change Coupling and
 *     Software Defects", WCRE 2009. Key finding: Spearman ρ up to 0.67 for NOCC.
 * [2] Kirbas et al. — "The Relationship Between Evolutionary Coupling and Defects in
 *     Large Industrial Software", JSS 2017. Key finding: each EC unit → +8% defect risk.
 * [3] Wiese et al. — "Strong Change Coupling and Defects in Apache Aries", OSS 2015.
 *     Key finding: strong couplings predicted 45.7% of post-release defects.
 * [4] Co-Change Graph Entropy paper (arXiv 2504.18511, 2025). Key finding:
 *     Pearson r up to 0.54 on eight Apache projects.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, dirname, relative, extname } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DIST_INDEX = join(REPO_ROOT, 'packages/core/dist/index.js');
const CACHE_DIR = join(REPO_ROOT, '.calibration-cache');
const REPOS_DIR = join(CACHE_DIR, 'repos');
const OUTPUT_FILE = join(CACHE_DIR, 'method-coupling-validation.json');

// ---------------------------------------------------------------------------
// Parse CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const skipClone = args.includes('--skip-clone');
const maxFilesIdx = args.indexOf('--max-files');
const MAX_FILES_PER_REPO = maxFilesIdx !== -1 ? parseInt(args[maxFilesIdx + 1], 10) : 200;

// ---------------------------------------------------------------------------
// Load the built core package
// ---------------------------------------------------------------------------
if (!existsSync(DIST_INDEX)) {
  console.error('ERROR: packages/core/dist/index.js not found. Run: pnpm build');
  process.exit(2);
}

const require = createRequire(DIST_INDEX);

// Eagerly register tree-sitter-java so analyzeFileWithHistory can parse Java
try {
  const { pathToFileURL } = await import('node:url');
  const javaPath = require.resolve('tree-sitter-java');
  const { default: javaGrammar } = await import(pathToFileURL(javaPath).href);
  const { Module } = await import('node:module');
  Module._cache[javaPath] = { exports: javaGrammar, loaded: true };
} catch {
  // tree-sitter-java may self-register; continue
}

const { analyzeFileWithHistory } = require(DIST_INDEX);

// ---------------------------------------------------------------------------
// Target repositories — all are Apache/well-known Java OSS with rich history.
// These are the same projects used in Defects4J and the co-change studies
// (D'Ambros 2009, co-change entropy arXiv 2504.18511) so results are directly
// comparable to published benchmarks.
// ---------------------------------------------------------------------------
const TARGET_REPOS = [
  {
    name: 'commons-lang',
    url: 'https://github.com/apache/commons-lang.git',
    srcDir: 'src/main/java',
    notes: 'Used in Defects4J (Lang project), rich bug-fix history',
  },
  {
    name: 'commons-math',
    url: 'https://github.com/apache/commons-math.git',
    srcDir: 'src/main/java',
    notes: 'Used in Defects4J (Math project), ~106 documented bugs',
  },
  {
    name: 'commons-collections',
    url: 'https://github.com/apache/commons-collections.git',
    srcDir: 'src/main/java',
    notes: 'Used in Defects4J (Collections), smaller but focused',
  },
];

// ---------------------------------------------------------------------------
// SZZ heuristic: identify files modified in bug-fix commits.
// Uses spawnSync (not exec/execSync) to avoid shell injection.
// The same keyword heuristic is used in dataset-runner.ts buildRecordsFromDirectory.
// ---------------------------------------------------------------------------
function getBuggyFileSet(repoPath) {
  const buggyFiles = new Set();
  try {
    const result = spawnSync('git', [
      'log',
      '--name-only',
      '--pretty=format:',
      '--diff-filter=M',
      '--no-merges',
      '--grep=fix',
      '--grep=bug',
      '--regexp-ignore-case',
    ], {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });

    if (result.status === 0 && result.stdout) {
      for (const line of result.stdout.split('\n')) {
        const t = line.trim();
        if (t && t.endsWith('.java')) {
          buggyFiles.add(t);
        }
      }
    }
  } catch {
    // Git unavailable or no history — return empty set
  }
  return buggyFiles;
}

// ---------------------------------------------------------------------------
// Walk a directory for .java files up to maxCount
// ---------------------------------------------------------------------------
function collectJavaFiles(dir, maxCount) {
  const results = [];
  function walk(current) {
    if (results.length >= maxCount) return;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxCount) break;
      const full = join(current, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(full);
      } else if (entry.isFile() && extname(entry.name) === '.java') {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

// ---------------------------------------------------------------------------
// Clone a repo with shallow depth to keep download manageable while keeping
// enough history for the MIN_COMMITS_FOR_SIGNAL=10 guard to pass on most files.
// Uses spawnSync (not exec/execSync) to avoid shell injection.
// ---------------------------------------------------------------------------
function cloneRepo(url, targetDir) {
  if (existsSync(targetDir)) {
    console.log(`  Repo already present: ${targetDir}`);
    return;
  }
  console.log(`  Cloning ${url}  →  ${targetDir}`);
  console.log('  (Fetching ~500 commits for statistical signal — may take 1-3 min)');
  const result = spawnSync('git', [
    'clone',
    '--depth', '500',  // enough commits for coupling analysis
    '--no-single-branch',
    '--quiet',
    url,
    targetDir,
  ], { encoding: 'utf-8', timeout: 300_000 });

  if (result.status !== 0) {
    const msg = result.stderr || result.error?.message || 'unknown error';
    console.error(`  Clone failed: ${msg}`);
    throw new Error(`Failed to clone ${url}`);
  }
}

// ---------------------------------------------------------------------------
// Statistical helpers (no external deps — mirrors correlation.ts approach)
// ---------------------------------------------------------------------------
function mean(arr) {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function pearson(x, y) {
  const n = x.length;
  if (n === 0 || n !== y.length) return 0;
  const mx = mean(x), my = mean(y);
  let num = 0, xv = 0, yv = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy; xv += dx * dx; yv += dy * dy;
  }
  const d = Math.sqrt(xv * yv);
  return d === 0 ? 0 : num / d;
}

function rankArray(arr) {
  const indexed = arr.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array(arr.length);
  let pos = 0;
  while (pos < indexed.length) {
    let end = pos;
    while (end < indexed.length && indexed[end].v === indexed[pos].v) end++;
    const mr = (pos + end - 1) / 2 + 1;
    for (let k = pos; k < end; k++) ranks[indexed[k].i] = mr;
    pos = end;
  }
  return ranks;
}

function spearmanCorr(x, y) {
  return pearson(rankArray(x), rankArray(y));
}

/**
 * AUROC computed via Wilcoxon-Mann-Whitney statistic.
 * Convention: lower score = worse health = more bugs.
 * AUROC = P(score_buggy < score_clean).
 */
function auroc(scores, bugLabels) {
  const buggy = scores.filter((_, i) => bugLabels[i]);
  const clean = scores.filter((_, i) => !bugLabels[i]);
  if (buggy.length === 0 || clean.length === 0) return 0.5;
  let concordant = 0, tied = 0;
  const total = buggy.length * clean.length;
  for (const b of buggy) {
    for (const c of clean) {
      if (b < c) concordant++;
      else if (b === c) tied++;
    }
  }
  return (concordant + 0.5 * tied) / total;
}

// ---------------------------------------------------------------------------
// Score simulation: recompute health score with a different MTC weight.
// We back-calculate the base score (score without MTC contribution) using
// the current weight=0.3, then apply the candidate weight.
// ---------------------------------------------------------------------------
function simulateScore(baseScoreWithoutMtc, mtcCount, candidateWeight) {
  const deduction = candidateWeight * Math.sqrt(mtcCount);
  return Math.max(1.0, baseScoreWithoutMtc - deduction);
}

// ---------------------------------------------------------------------------
// Per-repo validation
// ---------------------------------------------------------------------------
async function validateRepo(repoConfig) {
  const repoPath = join(REPOS_DIR, repoConfig.name);

  if (!skipClone) {
    try {
      cloneRepo(repoConfig.url, repoPath);
    } catch (err) {
      console.error(`  Skipping ${repoConfig.name}: ${err.message}`);
      return null;
    }
  } else if (!existsSync(repoPath)) {
    console.error(`  Repo not found and --skip-clone set: ${repoPath}`);
    return null;
  }

  console.log(`\n  Identifying buggy files via SZZ heuristic...`);
  const buggyFileSet = getBuggyFileSet(repoPath);
  console.log(`  Found ${buggyFileSet.size} files touched in bug-fix commits`);

  const srcDir = join(repoPath, repoConfig.srcDir);
  if (!existsSync(srcDir)) {
    console.error(`  srcDir not found: ${srcDir} — skipping`);
    return null;
  }

  const javaFiles = collectJavaFiles(srcDir, MAX_FILES_PER_REPO);
  console.log(`  Analyzing ${javaFiles.length} Java files (max ${MAX_FILES_PER_REPO}) for MethodTemporalCoupling...`);

  const records = [];
  let analyzed = 0, errors = 0;

  for (const filePath of javaFiles) {
    const relPath = relative(repoPath, filePath).replace(/\\/g, '/');
    const hasBug = buggyFileSet.has(relPath);

    try {
      const result = await analyzeFileWithHistory(filePath, repoPath);

      // Extract MethodTemporalCoupling count from smells
      const mtcCount = result.smells.filter(s => s.type === 'MethodTemporalCoupling').length;

      // Back-calculate base score without MTC contribution (using current weight=0.3)
      const baseScoreWithoutMtc = mtcCount > 0
        ? Math.min(10, result.score + 0.3 * Math.sqrt(mtcCount))
        : result.score;

      records.push({
        filePath: relPath,
        hasBug,
        healthScore: result.score,
        mtcCount,
        baseScoreWithoutMtc,
      });
      analyzed++;
    } catch {
      errors++;
    }

    const total = analyzed + errors;
    if (total % 25 === 0 && total > 0) {
      process.stdout.write(`\r  Progress: ${total}/${javaFiles.length} files...`);
    }
  }
  process.stdout.write('\n');
  console.log(`  Done: ${analyzed} analyzed, ${errors} errors`);

  if (records.length < 10) {
    console.error(`  Insufficient data (${records.length} records) — skipping stats`);
    return null;
  }

  const buggyCount = records.filter(r => r.hasBug).length;
  const cleanCount = records.filter(r => !r.hasBug).length;
  if (buggyCount === 0 || cleanCount === 0) {
    console.error('  Cannot compute AUROC: missing buggy or clean files');
    return null;
  }
  console.log(`  Buggy files: ${buggyCount}, Clean files: ${cleanCount}`);

  const scores = records.map(r => r.healthScore);
  const bugLabels = records.map(r => r.hasBug);
  const cleanLabels = records.map(r => r.hasBug ? 0 : 1);

  // --- Primary health-score correlation metrics ---
  const pearsonR = pearson(scores, cleanLabels);
  const spearmanRho = spearmanCorr(scores, cleanLabels);
  const aurocValue = auroc(scores, bugLabels);

  // --- MTC as standalone predictor ---
  const mtcPresent = records.filter(r => r.mtcCount > 0);
  const mtcAbsent = records.filter(r => r.mtcCount === 0);
  const mtcCounts = records.map(r => r.mtcCount);
  const bugLabelInts = bugLabels.map(b => b ? 1 : 0);
  const bugRateWithMtc = mtcPresent.length > 0
    ? mtcPresent.filter(r => r.hasBug).length / mtcPresent.length
    : 0;
  const bugRateWithoutMtc = mtcAbsent.length > 0
    ? mtcAbsent.filter(r => r.hasBug).length / mtcAbsent.length
    : 0;
  const mtcVsBugPearson = pearson(mtcCounts, bugLabelInts);
  const mtcVsBugSpearman = spearmanCorr(mtcCounts, bugLabelInts);
  // For AUROC: higher MTC count → more likely buggy → use -count as "health score"
  const mtcStandaloneAuroc = auroc(mtcCounts.map(c => -c), bugLabels);

  // --- Weight sweep ---
  const CANDIDATE_WEIGHTS = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.8];
  const weightSweep = CANDIDATE_WEIGHTS.map(w => {
    const simScores = records.map(r => simulateScore(r.baseScoreWithoutMtc, r.mtcCount, w));
    return {
      weight: w,
      auroc: parseFloat(auroc(simScores, bugLabels).toFixed(4)),
      pearsonR: parseFloat(pearson(simScores, cleanLabels).toFixed(4)),
      spearmanRho: parseFloat(spearmanCorr(simScores, cleanLabels).toFixed(4)),
    };
  });

  const bestWeightEntry = weightSweep.reduce((best, cur) => cur.auroc > best.auroc ? cur : best);
  const currentWeightEntry = weightSweep.find(w => w.weight === 0.3);

  return {
    repo: repoConfig.name,
    totalFiles: records.length,
    buggyFiles: buggyCount,
    cleanFiles: cleanCount,
    mtcFilesDetected: mtcPresent.length,
    mtcDetectionRate: parseFloat((mtcPresent.length / records.length).toFixed(3)),
    bugRateWithMtc: parseFloat(bugRateWithMtc.toFixed(3)),
    bugRateWithoutMtc: parseFloat(bugRateWithoutMtc.toFixed(3)),
    bugRateRatio: bugRateWithoutMtc > 0
      ? parseFloat((bugRateWithMtc / bugRateWithoutMtc).toFixed(2))
      : null,
    overallMetrics: {
      pearsonR: parseFloat(pearsonR.toFixed(4)),
      spearmanRho: parseFloat(spearmanRho.toFixed(4)),
      auroc: parseFloat(aurocValue.toFixed(4)),
    },
    mtcStandaloneMetrics: {
      pearsonVsBug: parseFloat(mtcVsBugPearson.toFixed(4)),
      spearmanVsBug: parseFloat(mtcVsBugSpearman.toFixed(4)),
      aurocAsMtcPredictor: parseFloat(mtcStandaloneAuroc.toFixed(4)),
    },
    weightSweep,
    bestWeight: bestWeightEntry.weight,
    currentWeightAuroc: currentWeightEntry?.auroc ?? null,
    bestWeightAuroc: bestWeightEntry.auroc,
    weightIsNearOptimal: Math.abs(bestWeightEntry.weight - 0.3) <= 0.1,
  };
}

// ---------------------------------------------------------------------------
// Recommendation derivation
// ---------------------------------------------------------------------------
function deriveRecommendation(avgBestWeight, allNearOptimal, avgMtcAuroc) {
  const mtcIsUsefulPredictor = avgMtcAuroc > 0.55;

  if (!mtcIsUsefulPredictor) {
    return [
      'MethodTemporalCoupling shows weak standalone predictive power (avg AUROC ≤ 0.55).',
      'The conservative weight=0.3 is appropriate — it keeps the metric advisory/low-impact.',
      'Consider increasing MIN_CO_CHANGE_COUNT to reduce false positives further.',
    ].join(' ');
  }

  if (allNearOptimal) {
    return [
      `weight=0.3 is empirically near-optimal across all tested repos`,
      `(avg best weight=${avgBestWeight.toFixed(2)}, within ±0.10 tolerance).`,
      'No change to scoring/weights.ts is recommended.',
    ].join(' ');
  }

  if (avgBestWeight > 0.4) {
    return [
      `Avg optimal weight (${avgBestWeight.toFixed(2)}) is higher than current 0.3.`,
      `Consider increasing to ${(Math.round(avgBestWeight * 10) / 10).toFixed(1)}`,
      'but verify false-positive rate is acceptable before shipping.',
    ].join(' ');
  }

  if (avgBestWeight < 0.2) {
    return [
      `Avg optimal weight (${avgBestWeight.toFixed(2)}) is lower than current 0.3.`,
      `Consider reducing to ${(Math.round(avgBestWeight * 10) / 10).toFixed(1)}`,
      'to soften the penalty for advisory temporal coupling findings.',
    ].join(' ');
  }

  return (
    `weight=0.3 is within the optimal range ` +
    `[${(avgBestWeight - 0.1).toFixed(1)}–${(avgBestWeight + 0.1).toFixed(1)}]. No change required.`
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main() {
  console.log('=================================================================');
  console.log('  MethodTemporalCoupling Weight Validation');
  console.log('  Current weight: 0.3 | Formula: score = 10 - Σ(w × √count)');
  console.log('=================================================================');
  console.log(`  Max files per repo : ${MAX_FILES_PER_REPO}`);
  console.log(`  Skip clone         : ${skipClone}`);
  console.log(`  Output             : ${OUTPUT_FILE}`);
  console.log('');

  mkdirSync(REPOS_DIR, { recursive: true });

  const repoResults = [];

  for (let i = 0; i < TARGET_REPOS.length; i++) {
    const repoConfig = TARGET_REPOS[i];
    console.log(`\n[${i + 1}/${TARGET_REPOS.length}] Processing: ${repoConfig.name}`);
    console.log(`  Notes: ${repoConfig.notes}`);

    const result = await validateRepo(repoConfig);
    if (result) {
      repoResults.push(result);
      console.log('\n  === Per-repo summary ===');
      console.log(`  Files analyzed : ${result.totalFiles} total, ${result.buggyFiles} buggy, ${result.cleanFiles} clean`);
      console.log(`  MTC detected   : ${result.mtcFilesDetected} files (${(result.mtcDetectionRate * 100).toFixed(1)}%)`);
      console.log(`  Bug rate WITH MTC    : ${(result.bugRateWithMtc * 100).toFixed(1)}%`);
      console.log(`  Bug rate WITHOUT MTC : ${(result.bugRateWithoutMtc * 100).toFixed(1)}%`);
      if (result.bugRateRatio !== null) {
        console.log(`  Bug rate ratio (with/without MTC): ${result.bugRateRatio}x`);
      }
      console.log(`  Overall AUROC        : ${result.overallMetrics.auroc}`);
      console.log(`  MTC standalone AUROC : ${result.mtcStandaloneMetrics.aurocAsMtcPredictor}`);
      console.log(`  Current weight (0.3) AUROC : ${result.currentWeightAuroc}`);
      console.log(`  Best weight            : ${result.bestWeight} (AUROC: ${result.bestWeightAuroc})`);
      console.log(`  weight=0.3 near-optimal: ${result.weightIsNearOptimal}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Aggregate summary
  // ---------------------------------------------------------------------------
  const aggregate = {
    timestamp: new Date().toISOString(),
    scriptVersion: '1.0.0',
    currentWeight: 0.3,
    maxFilesPerRepo: MAX_FILES_PER_REPO,
    repos: repoResults,
    summary: null,
  };

  if (repoResults.length > 0) {
    const avgAuroc = mean(repoResults.map(r => r.overallMetrics.auroc));
    const avgMtcAuroc = mean(repoResults.map(r => r.mtcStandaloneMetrics.aurocAsMtcPredictor));
    const ratios = repoResults.filter(r => r.bugRateRatio !== null).map(r => r.bugRateRatio);
    const avgBugRateRatio = ratios.length > 0 ? mean(ratios) : null;
    const bestWeights = repoResults.map(r => r.bestWeight);
    const avgBestWeight = mean(bestWeights);
    const allNearOptimal = repoResults.every(r => r.weightIsNearOptimal);

    aggregate.summary = {
      reposAnalyzed: repoResults.length,
      avgOverallAuroc: parseFloat(avgAuroc.toFixed(4)),
      avgMtcStandaloneAuroc: parseFloat(avgMtcAuroc.toFixed(4)),
      avgBugRateRatioWithVsWithoutMtc: avgBugRateRatio !== null ? parseFloat(avgBugRateRatio.toFixed(2)) : null,
      bestWeightsPerRepo: bestWeights,
      avgBestWeight: parseFloat(avgBestWeight.toFixed(2)),
      currentWeight: 0.3,
      currentWeightNearOptimalAcrossAllRepos: allNearOptimal,
      recommendation: deriveRecommendation(avgBestWeight, allNearOptimal, avgMtcAuroc),
    };

    console.log('\n=================================================================');
    console.log('  AGGREGATE RESULTS');
    console.log('=================================================================');
    console.log(`  Repos analyzed              : ${repoResults.length}`);
    console.log(`  Avg overall AUROC           : ${aggregate.summary.avgOverallAuroc}`);
    console.log(`  Avg MTC standalone AUROC    : ${aggregate.summary.avgMtcStandaloneAuroc}`);
    if (aggregate.summary.avgBugRateRatioWithVsWithoutMtc !== null) {
      console.log(`  Avg bug-rate ratio (w/wo MTC): ${aggregate.summary.avgBugRateRatioWithVsWithoutMtc}x`);
    }
    console.log(`  Best weight per repo        : ${bestWeights.join(', ')}`);
    console.log(`  Avg best weight             : ${aggregate.summary.avgBestWeight}`);
    console.log(`  weight=0.3 near-optimal (all): ${allNearOptimal}`);
    console.log('\n  RECOMMENDATION:');
    console.log(`  ${aggregate.summary.recommendation}`);
  } else {
    console.log('\n  No repos produced valid results.');
  }

  writeFileSync(OUTPUT_FILE, JSON.stringify(aggregate, null, 2));
  console.log(`\n  Full results written to: ${OUTPUT_FILE}`);
  console.log('=================================================================');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
