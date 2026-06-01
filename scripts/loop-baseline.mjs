/**
 * loop-baseline.mjs
 *
 * 1. Scans field-repos for source files with health score in [5, 8] (mid-complexity).
 * 2. Selects up to 30 files across languages (max 5 per repo).
 * 3. Runs runRefactoringLoop on each selected file.
 * 4. Writes benchmark-data/loop-bench/midfiles.json  (the provisional file list)
 *    and   benchmark-data/loop-bench/baseline-results.json  (convergence stats).
 */

import fs from 'fs';
import path from 'path';
import { analyzeCode } from '../packages/core/dist/index.js';
import { runRefactoringLoop } from '../packages/core/dist/refactor/refactoring-loop.js';
import { detectLanguage } from '../packages/core/dist/language-detect.js';

const ROOT = path.resolve('.');
const FIELD_REPOS_DIR = path.join(ROOT, 'field-repos');
const MANIFEST_PATH = path.join(FIELD_REPOS_DIR, 'manifest.json');
const LOOP_BENCH_DIR = path.join(ROOT, 'benchmark-data', 'loop-bench');
const MIDFILES_PATH = path.join(LOOP_BENCH_DIR, 'midfiles.json');
const RESULTS_PATH = path.join(LOOP_BENCH_DIR, 'baseline-results.json');

const SCORE_LOW = 5.0;
const SCORE_HIGH = 8.0;
const MAX_PER_REPO = 5;
const MAX_TOTAL = 30;

// Extensions to consider (Tier A languages only for reliable loop results)
const VALID_EXTS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.jsx',
  '.py',
  '.java',
  '.go',
  '.rb',
  '.rs',
  '.php',
  '.cs',
  '.kt',
]);

function walkDir(dir, exts, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'vendor' || e.name === 'target') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkDir(full, exts, results);
    } else if (e.isFile() && exts.has(path.extname(e.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

function scanRepo(repoEntry) {
  const repoPath = path.join(ROOT, repoEntry.path);
  if (!fs.existsSync(repoPath)) {
    console.warn(`  Repo dir not found: ${repoPath}`);
    return [];
  }

  console.log(`  Scanning ${repoEntry.name} (${repoEntry.lang})...`);
  const allFiles = walkDir(repoPath, VALID_EXTS);

  const midFiles = [];
  for (const fp of allFiles) {
    if (midFiles.length >= MAX_PER_REPO * 3) break; // over-sample then trim

    let code;
    try {
      code = fs.readFileSync(fp, 'utf8');
    } catch {
      continue;
    }
    // Skip very small or very large files
    const lines = code.split('\n').length;
    if (lines < 30 || lines > 600) continue;

    const lang = detectLanguage(fp, code);
    if (!lang || lang === 'unsupported') continue;

    let health;
    try {
      health = analyzeCode(code, lang, fp);
    } catch {
      continue;
    }

    if (health.score >= SCORE_LOW && health.score <= SCORE_HIGH) {
      midFiles.push({
        filePath: fp,
        repoName: repoEntry.name,
        language: lang,
        initialScore: health.score,
        lines,
      });
      if (midFiles.length >= MAX_PER_REPO) break;
    }
  }

  return midFiles;
}

// ── Main ───────────────────────────────────────────────────────────────────

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

fs.mkdirSync(LOOP_BENCH_DIR, { recursive: true });

console.log('=== Phase 1: Scanning field-repos for mid-complexity files (score 5–8) ===');
const midFiles = [];
for (const repo of manifest.repos) {
  if (midFiles.length >= MAX_TOTAL) break;
  const found = scanRepo(repo);
  for (const f of found) {
    if (midFiles.length >= MAX_TOTAL) break;
    midFiles.push(f);
  }
}

console.log(`\nFound ${midFiles.length} mid-complexity files.`);
fs.writeFileSync(MIDFILES_PATH, JSON.stringify(midFiles, null, 2));
console.log(`Written: ${MIDFILES_PATH}`);

// ── Phase 2: Run loop on each mid-file ──────────────────────────────────

console.log('\n=== Phase 2: Running runRefactoringLoop on each file ===');

const loopResults = [];

for (let i = 0; i < midFiles.length; i++) {
  const f = midFiles[i];
  console.log(`  [${i + 1}/${midFiles.length}] ${path.basename(f.filePath)}  (${f.language}, score ${f.initialScore.toFixed(2)})`);

  let code;
  try {
    code = fs.readFileSync(f.filePath, 'utf8');
  } catch {
    console.warn(`    Could not read file, skipping.`);
    continue;
  }

  let result;
  try {
    result = runRefactoringLoop(code, f.language, f.filePath, 9.5, 20);
  } catch (err) {
    console.warn(`    Loop error: ${err.message}`);
    continue;
  }

  loopResults.push({
    filePath: f.filePath,
    repoName: f.repoName,
    language: f.language,
    lines: f.lines,
    originalScore: result.originalScore,
    finalScore: result.finalScore,
    iterations: result.steps.length,
    loopComplete: result.loopComplete,
    scoreDelta: result.finalScore - result.originalScore,
  });

  console.log(`    originalScore=${result.originalScore.toFixed(2)} finalScore=${result.finalScore.toFixed(2)} iterations=${result.steps.length} complete=${result.loopComplete}`);
}

// ── Phase 3: Compute convergence stats ──────────────────────────────────

const reached = loopResults.filter(r => r.loopComplete).length;
const total = loopResults.length;
const iterationCounts = loopResults.map(r => r.iterations);
const deltas = loopResults.map(r => r.scoreDelta);

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(arr) {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

const stats = {
  generatedAt: new Date().toISOString(),
  description: 'BEFORE-baseline: loop effectiveness on mid-complexity field-repo files (score 5–8) with pre-recalibration detectors',
  totalFiles: total,
  reachedTarget: reached,
  reachedTargetRate: total > 0 ? reached / total : 0,
  medianIterations: median(iterationCounts),
  meanIterations: mean(iterationCounts),
  meanScoreDelta: mean(deltas),
  medianScoreDelta: median(deltas),
  perLanguage: {},
  files: loopResults,
};

// Per-language breakdown
const byLang = {};
for (const r of loopResults) {
  if (!byLang[r.language]) byLang[r.language] = [];
  byLang[r.language].push(r);
}
for (const [lang, rs] of Object.entries(byLang)) {
  stats.perLanguage[lang] = {
    count: rs.length,
    reached: rs.filter(r => r.loopComplete).length,
    meanDelta: mean(rs.map(r => r.scoreDelta)),
    medianIterations: median(rs.map(r => r.iterations)),
  };
}

fs.writeFileSync(RESULTS_PATH, JSON.stringify(stats, null, 2));
console.log(`\nWritten: ${RESULTS_PATH}`);

console.log('\n=== BASELINE CONVERGENCE SUMMARY ===');
console.log(`Files run      : ${total}`);
console.log(`Reached >=9.5  : ${reached} / ${total}  (${(stats.reachedTargetRate * 100).toFixed(1)}%)`);
console.log(`Median iters   : ${stats.medianIterations}`);
console.log(`Mean iters     : ${stats.meanIterations.toFixed(2)}`);
console.log(`Mean delta     : +${stats.meanScoreDelta.toFixed(3)}`);
console.log(`Median delta   : +${stats.medianScoreDelta.toFixed(3)}`);
console.log('\nPer-language:');
for (const [lang, s] of Object.entries(stats.perLanguage)) {
  console.log(`  ${lang.padEnd(14)} n=${s.count}  reached=${s.reached}  meanDelta=+${s.meanDelta.toFixed(3)}  medianIters=${s.medianIterations}`);
}
