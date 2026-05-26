#!/usr/bin/env node
/**
 * Refactoring loop fix-rate benchmark.
 *
 * Measures: what % of unhealthy files reach AI-ready (score >= 9.5) after running the
 * automated refactoring loop (runRefactoringLoop) with no human intervention.
 *
 * The loop is purely in-memory — no disk writes, no Claude API calls.
 * All transformations are mechanical AST-guided text rewrites.
 *
 * Usage:
 *   node scripts/benchmark-refactoring-loop.mjs
 *
 * Output:
 *   docs/benchmarks/refactoring-loop-benchmark.json
 */

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join, extname, relative, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Module, createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const DIST_INDEX = join(projectRoot, 'packages', 'core', 'dist', 'index.js');

// ─── Load core (handle tree-sitter ESM/CJS boundary) ─────────────────────────

async function loadCore() {
  const req = createRequire(DIST_INDEX);
  // tree-sitter-c-sharp uses ESM internally; inject it into the CJS require cache
  const csharpPath = req.resolve('tree-sitter-c-sharp');
  const csharpMod = await import(pathToFileURL(csharpPath).href);
  Module._cache[csharpPath] = { exports: csharpMod.default, loaded: true };
  return import(pathToFileURL(DIST_INDEX).href);
}

// ─── File discovery ────────────────────────────────────────────────────────────

/** Supported extensions for the benchmark (Tier A + Tier B languages). */
const SUPPORTED_EXTS = new Set([
  '.ts', '.js', '.py', '.java', '.cs', '.go', '.rb', '.rs', '.php',
  '.kt', '.dart', '.c', '.cpp', '.scala', '.swift',
  '.sh', '.lua', '.ex', '.hs', '.groovy',
]);

function collectFiles(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        results.push(...collectFiles(full));
      } else if (SUPPORTED_EXTS.has(extname(full).toLowerCase())) {
        results.push(full);
      }
    }
  } catch {
    // ignore unreadable entries
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const core = await loadCore();
  const { analyzeCode, runRefactoringLoop, detectLanguage } = core;

  const fixtureBase = join(projectRoot, 'packages', 'core', 'tests', 'fixtures');
  const unhealthyDir = join(fixtureBase, 'unhealthy');
  const healthyDir   = join(fixtureBase, 'healthy');

  const allFiles = [
    ...collectFiles(unhealthyDir),
    ...collectFiles(healthyDir),
  ];

  if (allFiles.length === 0) {
    console.error('No fixture files found — aborting.');
    process.exit(1);
  }

  console.log('\nRefactoring Loop Fix-Rate Benchmark');
  console.log('════════════════════════════════════');
  console.log(`Corpus: ${allFiles.length} files from test fixture corpus\n`);

  const AI_READY_THRESHOLD = 9.5;
  const HEALTHY_THRESHOLD  = 9.0;
  const MAX_ITERATIONS     = 20;

  const fileResults = [];

  for (const filePath of allFiles) {
    const relPath = relative(projectRoot, filePath);
    let code;
    try {
      code = readFileSync(filePath, 'utf-8');
    } catch {
      console.warn(`  SKIP (unreadable): ${relPath}`);
      continue;
    }

    let language;
    try {
      language = detectLanguage(filePath);
      if (language === 'unsupported') {
        console.warn(`  SKIP (unsupported language): ${relPath}`);
        continue;
      }
    } catch {
      console.warn(`  SKIP (language detection failed): ${relPath}`);
      continue;
    }

    // Initial score
    let initialHealth;
    try {
      initialHealth = analyzeCode(code, language, filePath);
    } catch (err) {
      console.warn(`  SKIP (analysis error): ${relPath} — ${err.message}`);
      continue;
    }

    const initialScore = initialHealth.score;

    // Run the loop on files that start below AI_READY_THRESHOLD
    let loopResult = null;
    if (initialScore < AI_READY_THRESHOLD) {
      try {
        loopResult = runRefactoringLoop(code, language, filePath, AI_READY_THRESHOLD, MAX_ITERATIONS);
      } catch (err) {
        console.warn(`  WARN (loop error): ${relPath} — ${err.message}`);
      }
    }

    const finalScore   = loopResult ? loopResult.finalScore   : initialScore;
    const loopComplete = loopResult ? loopResult.loopComplete : (initialScore >= AI_READY_THRESHOLD);
    const iterations   = loopResult ? loopResult.steps.length : 0;
    const scoreDelta   = parseFloat((finalScore - initialScore).toFixed(2));

    const status = initialScore >= AI_READY_THRESHOLD
      ? 'ALREADY_HEALTHY'
      : loopComplete
        ? 'FIXED'
        : 'NOT_FIXED';

    const label = `[${status}]`.padEnd(17);
    const path  = relPath.padEnd(62);
    const scores = `${initialScore.toFixed(1)} → ${finalScore.toFixed(1)}`;
    const iters = iterations > 0 ? ` (${iterations} steps)` : '';
    console.log(`  ${label} ${path} ${scores}${iters}`);

    fileResults.push({
      filePath: relPath,
      language,
      initialScore,
      finalScore,
      scoreDelta,
      iterations,
      loopComplete,
      status,
    });
  }

  // ─── Aggregate metrics ──────────────────────────────────────────────────────

  const filesTestedTotal        = fileResults.length;
  const filesAlreadyAiReady     = fileResults.filter(r => r.status === 'ALREADY_HEALTHY');
  const filesStartingBelow9     = fileResults.filter(r => r.initialScore < HEALTHY_THRESHOLD);
  const filesStartingBelowAIR   = fileResults.filter(r => r.initialScore < AI_READY_THRESHOLD);
  const fixedFromBelow9         = fileResults.filter(r => r.initialScore < HEALTHY_THRESHOLD && r.loopComplete);

  // Primary fix rate: of genuinely unhealthy files (< 9.0), how many reached AI-ready (>= 9.5)?
  const fixRate = filesStartingBelow9.length > 0
    ? (fixedFromBelow9.length / filesStartingBelow9.length * 100)
    : 0;

  // Average score improvement for files that had the loop run on them (below AI_READY_THRESHOLD)
  const loopedFiles = fileResults.filter(r => r.initialScore < AI_READY_THRESHOLD && r.iterations > 0);
  const avgImprovement = loopedFiles.length > 0
    ? loopedFiles.reduce((sum, r) => sum + r.scoreDelta, 0) / loopedFiles.length
    : 0;

  // Median iterations for files that were fixed
  const iterationsOfFixed = fileResults
    .filter(r => r.status === 'FIXED')
    .map(r => r.iterations)
    .sort((a, b) => a - b);
  const medianIterations = iterationsOfFixed.length > 0
    ? iterationsOfFixed[Math.floor(iterationsOfFixed.length / 2)]
    : 0;

  // Per-language breakdown
  const byLanguage = {};
  for (const r of fileResults) {
    if (!byLanguage[r.language]) byLanguage[r.language] = { total: 0, below9: 0, fixed: 0, avgImprovement: 0 };
    byLanguage[r.language].total++;
    if (r.initialScore < HEALTHY_THRESHOLD) byLanguage[r.language].below9++;
    if (r.status === 'FIXED') byLanguage[r.language].fixed++;
  }
  // Compute per-language avgImprovement
  for (const lang of Object.keys(byLanguage)) {
    const langFiles = fileResults.filter(r => r.language === lang && r.initialScore < AI_READY_THRESHOLD && r.iterations > 0);
    byLanguage[lang].avgImprovement = langFiles.length > 0
      ? parseFloat((langFiles.reduce((s, r) => s + r.scoreDelta, 0) / langFiles.length).toFixed(2))
      : 0;
  }

  // Initial score distribution
  const scoreDistribution = { 'below5': 0, '5to7': 0, '7to9': 0, '9to9.5': 0, 'aiReady': 0 };
  for (const r of fileResults) {
    const s = r.initialScore;
    if (s < 5)       scoreDistribution['below5']++;
    else if (s < 7)  scoreDistribution['5to7']++;
    else if (s < 9)  scoreDistribution['7to9']++;
    else if (s < 9.5) scoreDistribution['9to9.5']++;
    else              scoreDistribution['aiReady']++;
  }

  // ─── Print summary ──────────────────────────────────────────────────────────

  console.log('\n════════════════════════════════════');
  console.log('BENCHMARK RESULTS');
  console.log('════════════════════════════════════');
  console.log(`Files tested:                       ${filesTestedTotal}`);
  console.log(`Already AI-ready at start (>=9.5):  ${filesAlreadyAiReady.length}`);
  console.log(`Files starting below 9.0 (unhealthy): ${filesStartingBelow9.length}`);
  console.log(`Files starting below 9.5:           ${filesStartingBelowAIR.length}`);
  console.log(`Fixed to AI-ready (>=9.5):          ${fixedFromBelow9.length}`);
  console.log(`FIX RATE (from <9.0 to >=9.5):      ${fixRate.toFixed(1)}%`);
  console.log(`Avg score improvement (looped):     +${avgImprovement.toFixed(2)} points`);
  console.log(`Median iterations to fix:           ${medianIterations}`);

  console.log('\nInitial score distribution:');
  console.log(`  < 5.0 (floor/critical):  ${scoreDistribution['below5']}`);
  console.log(`  5.0–7.0 (problematic):   ${scoreDistribution['5to7']}`);
  console.log(`  7.0–9.0 (moderate):      ${scoreDistribution['7to9']}`);
  console.log(`  9.0–9.5 (healthy):       ${scoreDistribution['9to9.5']}`);
  console.log(`  >=9.5 (AI-ready):        ${scoreDistribution['aiReady']}`);

  // ─── Write JSON output ──────────────────────────────────────────────────────

  const benchmarkDir = join(projectRoot, 'docs', 'benchmarks');
  mkdirSync(benchmarkDir, { recursive: true });

  const output = {
    meta: {
      date: '2026-05-25',
      toolVersion: '0.1.0',
      method: 'runRefactoringLoop() in-memory, max 20 iterations per file',
      aiReadyThreshold: AI_READY_THRESHOLD,
      healthyThreshold: HEALTHY_THRESHOLD,
      corpus: 'packages/core/tests/fixtures/unhealthy + packages/core/tests/fixtures/healthy',
      note: 'No Claude API calls. All transformations are mechanical AST-guided text rewrites.',
    },
    summary: {
      filesTestedTotal,
      filesAlreadyAiReady: filesAlreadyAiReady.length,
      filesStartingBelow9: filesStartingBelow9.length,
      filesStartingBelowAIReady: filesStartingBelowAIR.length,
      filesFixed: fixedFromBelow9.length,
      fixRate: parseFloat(fixRate.toFixed(1)),
      avgScoreImprovement: parseFloat(avgImprovement.toFixed(2)),
      medianIterationsToFix: medianIterations,
      scoreDistribution,
    },
    byLanguage,
    files: fileResults,
  };

  const jsonPath = join(benchmarkDir, 'refactoring-loop-benchmark.json');
  writeFileSync(jsonPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\nJSON results written to: docs/benchmarks/refactoring-loop-benchmark.json`);

  return output.summary;
}

main().catch(err => {
  console.error('\nBenchmark failed:', err);
  process.exit(1);
});
