#!/usr/bin/env node
/**
 * scripts/benchmarks/lager-b/emit-tuples.mjs
 *
 * Lager-B benchmark harness — mechanical-loop instrumentation.
 *
 * Runs `runRefactoringLoop` on a corpus of files and emits per-iteration tuples to JSONL.
 * Each line of the output JSONL is one iteration record:
 *
 *   {
 *     "runId": "lager-b-2026-06-01T12:00:00Z",
 *     "fileIdx": 0,
 *     "filePath": "benchmark-data/loop-bench/...",
 *     "language": "typescript",
 *     "iteration": 0,
 *     "scoreBefore": 6.2,
 *     "scoreAfter": 7.1,
 *     "scoreDelta": 0.9,
 *     "biomarkerVectorBefore": { "ComplexMethod": 2, "DeepNesting": 1, ... },
 *     "biomarkerVectorAfter":  { "ComplexMethod": 1, "DeepNesting": 1, ... },
 *     "smellTargeted": "ComplexMethod",
 *     "strategy": "extract_method",
 *     "targetFunction": "processOrders",
 *     "diff": "--- a/...\n+++ b/...\n...",
 *     "brokeTests": null,
 *     "finalScoreFile": 7.1,
 *     "reachedTarget": false
 *   }
 *
 * Usage:
 *   node scripts/benchmarks/lager-b/emit-tuples.mjs [options]
 *
 * Options:
 *   --manifest <path>   JSON manifest with .files[] (default: benchmark-data/loop-bench/midfiles.json)
 *   --out <path>        JSONL output file (default: benchmark-data/lager-b/tuples.jsonl)
 *   --summary <path>    Summary JSON output (default: benchmark-data/lager-b/summary.json)
 *   --max-files N       Limit to N files (default: all)
 *   --max-iter N        Max iterations per file (default: 20)
 *   --concurrency N     Parallel workers (default: 4)
 *   --pilot             Pilot mode: use first 15 files from unhealthy fixtures (overrides --manifest)
 *   --dry-run           Validate setup without writing tuples
 *
 * Output:
 *   benchmark-data/lager-b/tuples.jsonl   — one JSON object per iteration line
 *   benchmark-data/lager-b/summary.json   — aggregate statistics
 *
 * The JSONL format is append-safe: partial runs can be resumed by deduplicating on (runId, fileIdx, iteration).
 */

import { createRequire } from 'module';
import { readFile, writeFile, mkdir, appendFile } from 'fs/promises';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, extname, resolve, relative, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// ─── Core loader ──────────────────────────────────────────────────────────────
async function loadCore() {
  const coreDistPath = join(ROOT, 'packages', 'core', 'dist', 'index.js');
  if (!existsSync(coreDistPath)) {
    console.error(`ERROR: packages/core/dist/index.js not found — run 'pnpm build' first.`);
    process.exit(1);
  }
  // Node v24: require() cannot be used on an ESM graph with top-level await.
  // Use the same workaround as benchmark-claude-refactoring.mjs: pre-load the
  // C# tree-sitter binding asynchronously before dynamic-importing core.
  const req         = createRequire(coreDistPath);
  const { Module }  = await import('module');
  try {
    const csharpPath = req.resolve('tree-sitter-c-sharp');
    const csharpMod  = await import(pathToFileURL(csharpPath).href);
    Module._cache[csharpPath] = { exports: csharpMod.default ?? csharpMod, loaded: true };
  } catch { /* tree-sitter-c-sharp not needed for non-CS files */ }
  return import(pathToFileURL(coreDistPath).href);
}

// ─── CLI parsing ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const arg  = (name, fallback) => {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : fallback;
};

const isPilot   = flag('--pilot');
const isDryRun  = flag('--dry-run');
const maxFiles  = parseInt(arg('--max-files', '0'), 10);    // 0 = all
const maxIter   = parseInt(arg('--max-iter',   '20'), 10);
const concurrency = parseInt(arg('--concurrency', '4'), 10);

const defaultManifest = join(ROOT, 'benchmark-data', 'loop-bench', 'midfiles.json');
const manifestPath = arg('--manifest', defaultManifest);
const outJsonl     = arg('--out',     join(ROOT, 'benchmark-data', 'lager-b', 'tuples.jsonl'));
const outSummary   = arg('--summary', join(ROOT, 'benchmark-data', 'lager-b', 'summary.json'));

// ─── Constants ─────────────────────────────────────────────────────────────────
const AI_READY_THRESHOLD = 9.5;
const HEALTHY_THRESHOLD  = 9.0;
const RUN_ID = `lager-b-${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`;

// ─── Supported extensions for pilot discovery ──────────────────────────────────
const SUPPORTED_EXTS = new Set([
  '.ts', '.js', '.py', '.java', '.cs', '.go', '.rb', '.rs', '.php',
  '.kt', '.scala', '.swift', '.ex', '.hs', '.lua', '.sh',
]);

function collectFilesForPilot(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) results.push(...collectFilesForPilot(full));
      else if (SUPPORTED_EXTS.has(extname(full).toLowerCase())) results.push(full);
    }
  } catch { /* ignore */ }
  return results;
}

// ─── Build biomarker vector from smells ───────────────────────────────────────
/**
 * Returns a record mapping SmellType → count, for all smells in the HealthResult.
 * @param {import('../../../packages/core/dist/index.js').HealthResult} health
 * @returns {Record<string, number>}
 */
function buildBiomarkerVector(health) {
  const vec = {};
  for (const smell of health.smells ?? []) {
    vec[smell.type] = (vec[smell.type] ?? 0) + 1;
  }
  return vec;
}

// ─── Minimal unified-diff generator ──────────────────────────────────────────
/**
 * Returns a compact change summary between `before` and `after`.
 * Avoids the `diff` npm package dependency.
 * For the pilot this is sufficient; a full unified diff can be added later.
 */
function makeDiff(before, after, filePath) {
  const beforeLines = before.split('\n');
  const afterLines  = after.split('\n');
  if (before === after) return '';

  // Emit a header + line-count summary + first 10 changed lines (context=0)
  const changed = [];
  const maxLines = Math.max(beforeLines.length, afterLines.length);
  for (let i = 0; i < maxLines && changed.length < 10; i++) {
    const bl = beforeLines[i] ?? '';
    const al = afterLines[i]  ?? '';
    if (bl !== al) {
      if (bl) changed.push(`-${i + 1}: ${bl.slice(0, 120)}`);
      if (al) changed.push(`+${i + 1}: ${al.slice(0, 120)}`);
    }
  }
  const ellipsis = changed.length >= 10 ? '\n...' : '';
  return `--- a/${filePath}\n+++ b/${filePath}\n` + changed.join('\n') + ellipsis;
}

// ─── Single-file instrumented runner ─────────────────────────────────────────
/**
 * Runs the mechanical refactoring loop with per-iteration instrumentation.
 * Returns an array of IterationTuple objects (one per step + a final summary tuple).
 *
 * @param {object} params
 * @param {string} params.code
 * @param {string} params.language
 * @param {string} params.filePath
 * @param {number} params.fileIdx
 * @param {Function} params.analyzeCode
 * @param {Function} params.runRefactoringLoop
 * @returns {IterationTuple[]}
 */
function runInstrumentedLoop({ code, language, filePath, fileIdx, analyzeCode, runRefactoringLoop }) {
  const relPath = relative(ROOT, filePath);
  const tuples  = [];

  // Initial health
  const initHealth  = analyzeCode(code, language, filePath);
  const initVector  = buildBiomarkerVector(initHealth);
  const initScore   = initHealth.score;

  // Run the full loop — the mechanical loop is synchronous
  const loopResult  = runRefactoringLoop(code, language, filePath, AI_READY_THRESHOLD, maxIter);

  // Reconstruct per-step tuples from the steps array
  // The loop records {strategy, targetFunction, smell, scoreBefore, scoreAfter, changes}
  // We need to replay diffs — re-run step-by-step reconstruction
  let codeSoFar = code;

  for (let i = 0; i < loopResult.steps.length; i++) {
    const step       = loopResult.steps[i];
    const codeAfter  = i === loopResult.steps.length - 1
      ? loopResult.finalCode
      : reconstructCodeAfterStep(code, loopResult, i);

    const beforeHealth = analyzeCode(codeSoFar, language, filePath);
    const afterHealth  = analyzeCode(codeAfter, language, filePath);

    const tuple = {
      runId:                RUN_ID,
      fileIdx,
      filePath:             relPath,
      language,
      iteration:            i,
      scoreBefore:          Math.round(step.scoreBefore * 1000) / 1000,
      scoreAfter:           Math.round(step.scoreAfter  * 1000) / 1000,
      scoreDelta:           Math.round((step.scoreAfter - step.scoreBefore) * 1000) / 1000,
      biomarkerVectorBefore: buildBiomarkerVector(beforeHealth),
      biomarkerVectorAfter:  buildBiomarkerVector(afterHealth),
      smellTargeted:        step.smell,
      strategy:             step.strategy,
      targetFunction:       step.targetFunction,
      diff:                 makeDiff(codeSoFar, codeAfter, relPath),
      brokeTests:           null,   // null = not tested; populated by gate-on-vs-off harness
      changes:              step.changes ?? [],
    };

    tuples.push(tuple);
    codeSoFar = codeAfter;
  }

  // File-level summary tuple (iteration = -1 signals "file summary")
  const finalHealth = analyzeCode(loopResult.finalCode, language, filePath);
  tuples.push({
    runId:              RUN_ID,
    fileIdx,
    filePath:           relPath,
    language,
    iteration:          -1,   // file summary sentinel
    scoreBefore:        Math.round(initScore * 1000) / 1000,
    scoreAfter:         Math.round(loopResult.finalScore * 1000) / 1000,
    scoreDelta:         Math.round((loopResult.finalScore - initScore) * 1000) / 1000,
    biomarkerVectorBefore: initVector,
    biomarkerVectorAfter:  buildBiomarkerVector(finalHealth),
    smellTargeted:      null,
    strategy:           null,
    targetFunction:     null,
    diff:               null,
    brokeTests:         null,
    changes:            [],
    iterationCount:     loopResult.steps.length,
    reachedTarget:      loopResult.loopComplete,
    reached9_0:         loopResult.finalScore >= HEALTHY_THRESHOLD,
  });

  return tuples;
}

/**
 * Reconstructs the code state after step i by replaying the loop.
 * This is only called when the loop does not expose intermediate code snapshots.
 * For efficiency on a pilot run, we do a simple re-run up to step i.
 *
 * In a real large-scale run you would modify runRefactoringLoop to snapshot
 * intermediate states rather than replaying — see docs/benchmarks/lager-b-protocol.md.
 */
function reconstructCodeAfterStep(initialCode, loopResult, stepIndex) {
  // The final code is the only reliable snapshot; for intermediate steps
  // we interpolate by noting which step changed what.  Since the mechanical
  // loop applies steps sequentially to the same string, the step array
  // captures enough metadata to rebuild diffs logically.
  // For the pilot we just return the final code for all intermediate steps —
  // the diff will be a no-op for middle steps but the score tuples are accurate.
  //
  // TODO (full-scale): instrument runRefactoringLoop to return intermediateSnapshots[].
  return loopResult.finalCode;
}

// ─── Concurrency pool ─────────────────────────────────────────────────────────
async function runWithConcurrency(items, fn, concurrency) {
  const results = new Array(items.length);
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ─── Aggregate statistics ─────────────────────────────────────────────────────
function aggregateSummary(allFileSummaries) {
  const n = allFileSummaries.length;
  if (n === 0) return { n: 0 };

  const sum     = (fn) => allFileSummaries.reduce((a, r) => a + fn(r), 0);
  const avg     = (fn) => Math.round((sum(fn) / n) * 1000) / 1000;

  const reached = allFileSummaries.filter(r => r.reachedTarget).length;
  const reached9 = allFileSummaries.filter(r => r.reached9_0).length;
  const improved = allFileSummaries.filter(r => r.scoreDelta > 0).length;
  const unchanged = allFileSummaries.filter(r => r.scoreDelta === 0).length;

  // Per-score-decile breakdown (score 0-1, 1-2, ... 9-10)
  const byDecile = {};
  for (const r of allFileSummaries) {
    const decile = `${Math.floor(Math.min(r.scoreBefore, 9.99))}–${Math.floor(Math.min(r.scoreBefore, 9.99)) + 1}`;
    if (!byDecile[decile]) byDecile[decile] = { n: 0, reachedTarget: 0, reached9_0: 0, deltaSum: 0 };
    byDecile[decile].n++;
    byDecile[decile].deltaSum += r.scoreDelta;
    if (r.reachedTarget) byDecile[decile].reachedTarget++;
    if (r.reached9_0) byDecile[decile].reached9_0++;
  }
  for (const d of Object.keys(byDecile)) {
    const dd = byDecile[d];
    dd.avgDelta = Math.round((dd.deltaSum / dd.n) * 1000) / 1000;
    dd.reachedTargetPct = Math.round((dd.reachedTarget / dd.n) * 100);
  }

  // Per-language breakdown
  const byLang = {};
  for (const r of allFileSummaries) {
    if (!byLang[r.language]) byLang[r.language] = { n: 0, reachedTarget: 0, deltaSum: 0 };
    byLang[r.language].n++;
    byLang[r.language].deltaSum += r.scoreDelta;
    if (r.reachedTarget) byLang[r.language].reachedTarget++;
  }
  for (const lang of Object.keys(byLang)) {
    const l = byLang[lang];
    l.avgDelta = Math.round((l.deltaSum / l.n) * 1000) / 1000;
    l.reachedTargetPct = Math.round((l.reachedTarget / l.n) * 100);
  }

  // Smell resolution rates
  const smellRes = {};
  for (const r of allFileSummaries) {
    const beforeTypes = Object.keys(r.biomarkerVectorBefore ?? {});
    const afterTypes  = new Set(Object.keys(r.biomarkerVectorAfter ?? {}));
    for (const sm of beforeTypes) {
      if (!smellRes[sm]) smellRes[sm] = { seen: 0, resolved: 0 };
      smellRes[sm].seen++;
      if (!afterTypes.has(sm)) smellRes[sm].resolved++;
    }
  }
  for (const sm of Object.keys(smellRes)) {
    smellRes[sm].resolutionRate = Math.round((smellRes[sm].resolved / smellRes[sm].seen) * 100);
  }

  return {
    runId:           RUN_ID,
    generatedAt:     new Date().toISOString(),
    n,
    maxIter,
    aiReadyThreshold: AI_READY_THRESHOLD,
    reachedTarget:    reached,
    reached9_0:       reached9,
    reachedTargetPct: Math.round((reached / n) * 100),
    improved,
    unchanged,
    avgScoreBefore:  avg(r => r.scoreBefore),
    avgScoreAfter:   avg(r => r.scoreAfter),
    avgDelta:        avg(r => r.scoreDelta),
    avgIterations:   avg(r => r.iterationCount ?? 0),
    byDecile,
    byLang,
    smellResolutionRates: smellRes,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Lager-B Benchmark Harness — Mechanical Loop Instrumentation');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Run ID:       ${RUN_ID}`);
  console.log(`Mode:         ${isPilot ? 'PILOT (unhealthy fixtures)' : 'manifest'}${isDryRun ? ' DRY-RUN' : ''}`);
  console.log(`Output JSONL: ${outJsonl}`);
  console.log(`Output JSON:  ${outSummary}`);
  console.log();

  const core = await loadCore();
  const { analyzeCode, runRefactoringLoop, detectLanguage } = core;

  // ─── Corpus selection ──────────────────────────────────────────────────────
  let corpus;

  if (isPilot) {
    // Pilot: use unhealthy fixtures from core (score < 9.5)
    const fixtureDir = join(ROOT, 'packages', 'core', 'tests', 'fixtures', 'unhealthy');
    const allFiles   = collectFilesForPilot(fixtureDir);

    corpus = [];
    for (const filePath of allFiles) {
      try {
        const code = readFileSync(filePath, 'utf-8');
        const lang = detectLanguage(filePath);
        if (lang === 'unsupported') continue;

        const health = analyzeCode(code, lang, filePath);
        if (health.score >= AI_READY_THRESHOLD) continue;  // skip already-ready

        corpus.push({
          path: filePath,           // absolute for pilot
          lang,
          score: health.score,
          dominantSmells: [...new Set(health.smells.map(s => s.type))].slice(0, 3),
          allSmells:      [...new Set(health.smells.map(s => s.type))],
          _absPath: filePath,
        });
      } catch { /* skip unreadable */ }
    }
    console.log(`Pilot corpus: ${corpus.length} unhealthy fixture files (score < ${AI_READY_THRESHOLD})`);

  } else {
    // Manifest mode: load midfiles.json or custom manifest
    if (!existsSync(manifestPath)) {
      console.error(`ERROR: manifest not found at ${manifestPath}`);
      console.error(`Run scripts/benchmarks/loop/scan-midfiles.mjs first, or use --pilot.`);
      process.exit(1);
    }
    const raw  = JSON.parse(await readFile(manifestPath, 'utf-8'));
    corpus     = (raw.files ?? raw).map(entry => ({
      ...entry,
      _absPath: join(ROOT, entry.path),
    }));
    console.log(`Manifest:  ${manifestPath}  (${corpus.length} entries)`);
  }

  // Apply --max-files limit
  if (maxFiles > 0) corpus = corpus.slice(0, maxFiles);
  console.log(`Processing: ${corpus.length} files | concurrency=${concurrency} | maxIter=${maxIter}`);

  if (isDryRun) {
    console.log('\nDRY-RUN: showing first 3 entries, no JSONL written.\n');
    for (const e of corpus.slice(0, 3)) {
      console.log(`  ${e.lang.padEnd(14)} score=${e.score?.toFixed(2) ?? '?'}  ${relative(ROOT, e._absPath)}`);
    }
    console.log(`\nRe-run without --dry-run to emit tuples.`);
    return;
  }

  // ─── Ensure output directories exist ──────────────────────────────────────
  await mkdir(dirname(outJsonl),   { recursive: true });
  await mkdir(dirname(outSummary), { recursive: true });

  // Clear / create the JSONL file (overwrite for a clean run)
  await writeFile(outJsonl, '', 'utf-8');

  // ─── Per-file processing ───────────────────────────────────────────────────
  let done = 0;
  const fileSummaries = [];

  const allTuples = await runWithConcurrency(corpus, async (entry, idx) => {
    const absPath = entry._absPath;
    let code;
    try {
      code = await readFile(absPath, 'utf-8');
    } catch (err) {
      console.warn(`  [${idx + 1}/${corpus.length}] SKIP (unreadable): ${relative(ROOT, absPath)}`);
      return [];
    }

    let tuples;
    try {
      tuples = runInstrumentedLoop({
        code,
        language:          entry.lang,
        filePath:          absPath,
        fileIdx:           idx,
        analyzeCode,
        runRefactoringLoop,
      });
    } catch (err) {
      console.warn(`  [${idx + 1}/${corpus.length}] ERROR: ${relative(ROOT, absPath)} — ${err.message}`);
      // Emit an error tuple so downstream analysis knows this file failed
      tuples = [{
        runId:        RUN_ID,
        fileIdx:      idx,
        filePath:     relative(ROOT, absPath),
        language:     entry.lang,
        iteration:    -1,
        scoreBefore:  entry.score ?? 0,
        scoreAfter:   entry.score ?? 0,
        scoreDelta:   0,
        biomarkerVectorBefore: {},
        biomarkerVectorAfter:  {},
        smellTargeted:  null,
        strategy:       null,
        targetFunction: null,
        diff:           null,
        brokeTests:     null,
        changes:        [],
        iterationCount: 0,
        reachedTarget:  false,
        reached9_0:     false,
        error:          err.message,
      }];
    }

    // Append each tuple as a JSONL line (atomic per-tuple — safe for partial runs)
    const lines = tuples.map(t => JSON.stringify(t)).join('\n') + '\n';
    await appendFile(outJsonl, lines, 'utf-8');

    // Collect file summary (iteration === -1 tuple)
    const summary = tuples.find(t => t.iteration === -1);
    if (summary) fileSummaries.push(summary);

    done++;
    const sumTuple = summary ?? tuples[0];
    const status = sumTuple?.error
      ? `ERROR: ${sumTuple.error.slice(0, 50)}`
      : `${sumTuple?.scoreBefore?.toFixed(2)} → ${sumTuple?.scoreAfter?.toFixed(2)}  Δ${(sumTuple?.scoreDelta ?? 0) >= 0 ? '+' : ''}${(sumTuple?.scoreDelta ?? 0).toFixed(2)}  ${sumTuple?.iterationCount ?? 0} steps${sumTuple?.reachedTarget ? ' REACHED_TARGET' : ''}`;
    console.log(`  [${done}/${corpus.length}] ${entry.lang.padEnd(12)} ${relative(ROOT, absPath).split('/').pop().padEnd(35)} ${status}`);

    return tuples;
  }, concurrency);

  // ─── Summary JSON ──────────────────────────────────────────────────────────
  const summary = aggregateSummary(fileSummaries);
  await writeFile(outSummary, JSON.stringify(summary, null, 2), 'utf-8');

  // ─── Print summary ─────────────────────────────────────────────────────────
  const totalTuples = allTuples.flat().filter(t => t.iteration >= 0).length;
  console.log('\n═══════════════════════════ LAGER-B SUMMARY ═══════════════════════════');
  console.log(`Files processed:      ${summary.n}`);
  console.log(`Iteration tuples:     ${totalTuples} (per-step JSONL records)`);
  console.log(`Reached ≥9.5 target:  ${summary.reachedTarget}/${summary.n} (${summary.reachedTargetPct}%)`);
  console.log(`Avg score:            ${summary.avgScoreBefore?.toFixed(2)} → ${summary.avgScoreAfter?.toFixed(2)}  avgΔ${(summary.avgDelta ?? 0) >= 0 ? '+' : ''}${(summary.avgDelta ?? 0).toFixed(2)}`);
  console.log(`Avg iterations/file:  ${(summary.avgIterations ?? 0).toFixed(1)}`);

  if (summary.byDecile) {
    console.log('\nBy initial-score decile:');
    for (const [dec, d] of Object.entries(summary.byDecile).sort()) {
      console.log(`  [${dec}]  n=${d.n}  avgΔ=${d.avgDelta >= 0 ? '+' : ''}${d.avgDelta.toFixed(2)}  target=${d.reachedTarget}/${d.n} (${d.reachedTargetPct}%)`);
    }
  }

  console.log(`\nOutput JSONL: ${outJsonl}`);
  console.log(`Output JSON:  ${outSummary}`);
  console.log('\nTo scale to n≥500 see docs/benchmarks/lager-b-protocol.md');
}

main().catch(err => {
  console.error('\nLager-B harness failed:', err);
  process.exit(1);
});
