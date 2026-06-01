#!/usr/bin/env node
/**
 * scripts/benchmarks/loop/run.mjs
 *
 * Loop-effectiveness benchmark harness.
 *
 * Usage:
 *   node scripts/benchmarks/loop/run.mjs [--smoke] [--file path] [--out path]
 *
 *   --smoke        Run only the first 3 files (smoke test)
 *   --file <path>  Override midfiles.json with a custom manifest (JSON with .files[])
 *   --out <path>   Override output path (default: benchmark-data/loop-bench/results.json)
 *   --concurrency  Number of parallel workers (default: 4)
 *   --max-iter     Max refactoring iterations per file (default: 20)
 *
 * For each file runs runRefactoringLoop in-memory (no disk writes),
 * records per-file metrics, and writes a summary JSON.
 */

import { createRequire } from 'module';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { analyzeCode, runRefactoringLoop } = require('../../../packages/core/dist/index.js');

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// ─── CLI arg parsing ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const smoke = args.includes('--smoke');
const fileArgIdx = args.indexOf('--file');
const outArgIdx = args.indexOf('--out');
const concurrencyArgIdx = args.indexOf('--concurrency');
const maxIterArgIdx = args.indexOf('--max-iter');

const midfilesPath = fileArgIdx >= 0
  ? resolve(args[fileArgIdx + 1])
  : join(ROOT, 'benchmark-data/loop-bench/midfiles.json');

const outputPath = outArgIdx >= 0
  ? resolve(args[outArgIdx + 1])
  : join(ROOT, 'benchmark-data/loop-bench/results.json');

const CONCURRENCY = concurrencyArgIdx >= 0 ? parseInt(args[concurrencyArgIdx + 1], 10) : 4;
const MAX_ITER = maxIterArgIdx >= 0 ? parseInt(args[maxIterArgIdx + 1], 10) : 20;
const AI_READY_THRESHOLD = 9.5;
const HEALTHY_THRESHOLD = 9.0;

// ─── Types ────────────────────────────────────────────────────────────────────
/**
 * @typedef {{
 *   path: string,
 *   lang: string,
 *   score: number,
 *   dominantSmells: string[],
 *   allSmells: string[]
 * }} MidFile
 *
 * @typedef {{
 *   path: string,
 *   lang: string,
 *   scoreBefore: number,
 *   scoreAfter: number,
 *   delta: number,
 *   iterations: number,
 *   reachedTarget: boolean,
 *   reached9_0: boolean,
 *   commentInvariantOk: boolean,
 *   smellsBefore: string[],
 *   smellsAfter: string[],
 *   smellsResolved: string[],
 *   steps: Array<{strategy: string, smell: string, targetFunction: string, scoreBefore: number, scoreAfter: number}>,
 *   durationMs: number,
 *   error: string | null
 * }} BenchRecord
 */

// ─── Comment-count check ──────────────────────────────────────────────────────
const COMMENT_PATTERNS = [
  /^\s*\/\//,   // JS/TS/Go/Java/C# single-line
  /^\s*#/,      // Python/Ruby/PHP
  /^\s*\/\*/,   // Block comment open
  /^\s*\*/,     // Block comment continuation
  /^\s*--/,     // SQL/Lua
  /^\s*;/,      // Clojure/Lisp/ASM
];

function countCommentLines(code) {
  return code.split('\n').filter(line => COMMENT_PATTERNS.some(re => re.test(line))).length;
}

function commentInvariantOk(before, after) {
  const bc = countCommentLines(before);
  if (bc === 0) return true;
  const ac = countCommentLines(after);
  return ac >= bc * 0.9; // same 90% floor as refactoring-loop.ts
}

// ─── Core runner for a single file ────────────────────────────────────────────
/**
 * @param {MidFile} entry
 * @returns {Promise<BenchRecord>}
 */
async function runOneFile(entry) {
  const absPath = join(ROOT, entry.path);
  const start = Date.now();

  try {
    const code = await readFile(absPath, 'utf-8');

    // Analyze before
    const healthBefore = analyzeCode(code, entry.lang, absPath);
    const smellsBefore = [...new Set(healthBefore.smells.map(s => s.type))];

    // Run the loop (in-memory, no disk writes)
    const loopResult = runRefactoringLoop(
      code,
      entry.lang,
      absPath,
      AI_READY_THRESHOLD,
      MAX_ITER,
    );

    // Analyze after (in case loopResult.finalScore is stale — it isn't, but double-check)
    const healthAfter = analyzeCode(loopResult.finalCode, entry.lang, absPath);
    const smellsAfter = [...new Set(healthAfter.smells.map(s => s.type))];
    const smellsResolved = smellsBefore.filter(sm => !smellsAfter.includes(sm));

    return {
      path: entry.path,
      lang: entry.lang,
      scoreBefore: Math.round(healthBefore.score * 1000) / 1000,
      scoreAfter: Math.round(healthAfter.score * 1000) / 1000,
      delta: Math.round((healthAfter.score - healthBefore.score) * 1000) / 1000,
      iterations: loopResult.steps.length,
      reachedTarget: healthAfter.score >= AI_READY_THRESHOLD,
      reached9_0: healthAfter.score >= HEALTHY_THRESHOLD,
      commentInvariantOk: commentInvariantOk(code, loopResult.finalCode),
      smellsBefore,
      smellsAfter,
      smellsResolved,
      steps: loopResult.steps.map(s => ({
        strategy: s.strategy,
        smell: s.smell,
        targetFunction: s.targetFunction,
        scoreBefore: Math.round(s.scoreBefore * 1000) / 1000,
        scoreAfter: Math.round(s.scoreAfter * 1000) / 1000,
      })),
      durationMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    return {
      path: entry.path,
      lang: entry.lang,
      scoreBefore: entry.score,
      scoreAfter: entry.score,
      delta: 0,
      iterations: 0,
      reachedTarget: false,
      reached9_0: false,
      commentInvariantOk: true,
      smellsBefore: entry.allSmells ?? [],
      smellsAfter: entry.allSmells ?? [],
      smellsResolved: [],
      steps: [],
      durationMs: Date.now() - start,
      error: String(err?.message ?? err),
    };
  }
}

// ─── Parallel pool ─────────────────────────────────────────────────────────────
/**
 * Run tasks with a fixed concurrency pool.
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} fn
 * @param {number} concurrency
 * @returns {Promise<R[]>}
 */
async function runWithConcurrency(items, fn, concurrency) {
  const results = new Array(items.length);
  let nextIdx = 0;

  async function worker() {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ─── Summary computation ───────────────────────────────────────────────────────
function computeSummary(records) {
  const ok = records.filter(r => !r.error);
  const errored = records.filter(r => r.error);

  const n = ok.length;
  if (n === 0) return { n: 0, errored: errored.length };

  const sum = (fn) => ok.reduce((acc, r) => acc + fn(r), 0);
  const avg = (fn) => Math.round((sum(fn) / n) * 1000) / 1000;

  const reachedTarget = ok.filter(r => r.reachedTarget).length;
  const reached9_0 = ok.filter(r => r.reached9_0).length;
  const commentViolations = ok.filter(r => !r.commentInvariantOk).length;
  const improved = ok.filter(r => r.delta > 0).length;
  const unchanged = ok.filter(r => r.delta === 0).length;
  const degraded = ok.filter(r => r.delta < 0).length;

  // Per-language breakdown
  const byLang = {};
  for (const r of ok) {
    if (!byLang[r.lang]) byLang[r.lang] = { n: 0, deltaSum: 0, reachedTarget: 0, reached9_0: 0 };
    byLang[r.lang].n++;
    byLang[r.lang].deltaSum += r.delta;
    if (r.reachedTarget) byLang[r.lang].reachedTarget++;
    if (r.reached9_0) byLang[r.lang].reached9_0++;
  }
  for (const lang of Object.keys(byLang)) {
    const l = byLang[lang];
    l.avgDelta = Math.round((l.deltaSum / l.n) * 1000) / 1000;
  }

  // Smell resolution rates
  const smellResolutionCounts = {};
  for (const r of ok) {
    for (const sm of r.smellsBefore) {
      if (!smellResolutionCounts[sm]) smellResolutionCounts[sm] = { seen: 0, resolved: 0 };
      smellResolutionCounts[sm].seen++;
      if (!r.smellsAfter.includes(sm)) smellResolutionCounts[sm].resolved++;
    }
  }
  const smellResolutionRates = {};
  for (const [sm, c] of Object.entries(smellResolutionCounts)) {
    smellResolutionRates[sm] = {
      seen: c.seen,
      resolved: c.resolved,
      rate: Math.round((c.resolved / c.seen) * 100),
    };
  }

  return {
    n,
    errored: errored.length,
    improved,
    unchanged,
    degraded,
    reachedTarget,
    reached9_0,
    commentViolations,
    avgScoreBefore: avg(r => r.scoreBefore),
    avgScoreAfter: avg(r => r.scoreAfter),
    avgDelta: avg(r => r.delta),
    avgIterations: avg(r => r.iterations),
    avgDurationMs: Math.round(sum(r => r.durationMs) / n),
    reachedTargetPct: Math.round((reachedTarget / n) * 100),
    reached9_0Pct: Math.round((reached9_0 / n) * 100),
    commentInvariantOkPct: Math.round(((n - commentViolations) / n) * 100),
    byLang,
    smellResolutionRates,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Load midfiles manifest
  const manifest = JSON.parse(await readFile(midfilesPath, 'utf-8'));
  let files = manifest.files ?? manifest;

  if (smoke) {
    files = files.slice(0, 3);
    console.log('--- SMOKE TEST: running 3 files ---');
  }

  const total = files.length;
  console.log(`Loop benchmark: ${total} files | concurrency=${CONCURRENCY} | maxIter=${MAX_ITER}`);
  console.log(`Manifest: ${midfilesPath}`);
  console.log(`Output:   ${outputPath}\n`);

  let done = 0;
  const allResults = await runWithConcurrency(files, async (entry, idx) => {
    const rec = await runOneFile(entry);
    done++;
    const status = rec.error
      ? `ERROR: ${rec.error.slice(0, 60)}`
      : `${rec.scoreBefore.toFixed(2)} → ${rec.scoreAfter.toFixed(2)}  Δ${rec.delta >= 0 ? '+' : ''}${rec.delta.toFixed(2)}  ${rec.iterations} steps${rec.reachedTarget ? ' ✓TARGET' : rec.reached9_0 ? ' ✓9.0' : ''}`;
    console.log(`[${done}/${total}] ${entry.lang.padEnd(12)} ${entry.path.split('/').slice(-1)[0].padEnd(35)}  ${status}`);
    return rec;
  }, CONCURRENCY);

  const summary = computeSummary(allResults);

  const output = {
    generatedAt: new Date().toISOString(),
    config: { maxIter: MAX_ITER, aiReadyThreshold: AI_READY_THRESHOLD, concurrency: CONCURRENCY },
    summary,
    records: allResults,
  };

  await mkdir(join(ROOT, 'benchmark-data/loop-bench'), { recursive: true });
  await writeFile(outputPath, JSON.stringify(output, null, 2));

  // Print summary table
  console.log('\n═══════════════════════════════ SUMMARY ════════════════════════════════');
  console.log(`Files analyzed: ${summary.n}  (errors: ${summary.errored})`);
  console.log(`Score:  ${summary.avgScoreBefore.toFixed(2)} → ${summary.avgScoreAfter.toFixed(2)}  avg Δ${summary.avgDelta >= 0 ? '+' : ''}${summary.avgDelta.toFixed(2)}`);
  console.log(`Reached ≥9.5 (target):  ${summary.reachedTarget}/${summary.n} (${summary.reachedTargetPct}%)`);
  console.log(`Reached ≥9.0 (healthy): ${summary.reached9_0}/${summary.n} (${summary.reached9_0Pct}%)`);
  console.log(`Improved: ${summary.improved}  Unchanged: ${summary.unchanged}  Degraded: ${summary.degraded}`);
  console.log(`Comment invariant ok: ${summary.n - summary.commentViolations}/${summary.n} (${summary.commentInvariantOkPct}%)`);
  console.log(`Avg iterations: ${summary.avgIterations.toFixed(1)}  Avg duration: ${(summary.avgDurationMs / 1000).toFixed(1)}s`);

  if (Object.keys(summary.byLang ?? {}).length > 0) {
    console.log('\nPer-language avg Δ:');
    for (const [lang, l] of Object.entries(summary.byLang).sort((a, b) => b[1].avgDelta - a[1].avgDelta)) {
      console.log(`  ${lang.padEnd(14)} n=${l.n}  avgΔ=${l.avgDelta >= 0 ? '+' : ''}${l.avgDelta.toFixed(2)}  target=${l.reachedTarget}/${l.n}`);
    }
  }

  if (smoke) {
    console.log('\nSmoke test complete. Run without --smoke for full benchmark.');
  }
  console.log(`\nResults written to: ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
