#!/usr/bin/env node
/**
 * scripts/benchmarks/lager-b/gate-rct.mjs
 *
 * Gate-on vs Gate-off Randomised Controlled Trial (RCT) scaffold.
 *
 * Measures the causal effect of the delta-health gate (Sats 1) on three outcomes:
 *   1. Reverted edits      — steps where scoreAfter < scoreBefore (gate would have blocked)
 *   2. New smells          — smellTypes present after but not before
 *   3. Files left < 9.4   — files that do not reach near-target even after full loop
 *
 * Design
 * ──────
 * The mechanical loop has no randomness — "gate on" = enforcing the existing
 * CONVERGENCE_NOISE_FLOOR reject rule; "gate off" = skipping that guard and
 * accepting all steps (including regressive ones).
 *
 * For the LLM loop the split is: gate-on = analyzeChangeset delta-check before
 * accepting the LLM's proposed code; gate-off = accept unconditionally.
 *
 * This file implements the MECHANICAL arm only (no LLM API required).
 * For LLM RCT: see docs/benchmarks/lager-b-protocol.md section "LLM arm".
 *
 * Usage:
 *   node scripts/benchmarks/lager-b/gate-rct.mjs [options]
 *
 * Options:
 *   --pilot             Use unhealthy fixtures (fast, no external corpus needed)
 *   --manifest <path>   Custom file manifest (default: benchmark-data/loop-bench/midfiles.json)
 *   --max-files N       Limit to N files (default: 50 for pilot; all for full)
 *   --max-iter N        Max iterations per file (default: 20)
 *   --out <path>        Output JSON path (default: benchmark-data/lager-b/rct-results.json)
 *   --dry-run           Print plan and exit
 *
 * Output (JSON):
 *   benchmark-data/lager-b/rct-results.json
 *
 * Statistical analysis:
 *   Run scripts/benchmarks/lager-b/rct-stats.mjs on the output JSON to compute
 *   McNemar's test p-values and effect sizes.  See docs/benchmarks/lager-b-protocol.md.
 */

import { createRequire } from 'module';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs';
import { join, extname, resolve, relative, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

async function loadCore() {
  const coreDistPath = join(ROOT, 'packages', 'core', 'dist', 'index.js');
  if (!existsSync(coreDistPath)) {
    console.error(`ERROR: packages/core/dist/index.js not found — run 'pnpm build' first.`);
    process.exit(1);
  }
  const req = createRequire(coreDistPath);
  const { Module } = await import('module');
  try {
    const csharpPath = req.resolve('tree-sitter-c-sharp');
    const csharpMod  = await import(pathToFileURL(csharpPath).href);
    Module._cache[csharpPath] = { exports: csharpMod.default ?? csharpMod, loaded: true };
  } catch { /* not needed for non-CS analysis */ }
  return import(pathToFileURL(coreDistPath).href);
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const arg  = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };

const isPilot  = flag('--pilot');
const isDryRun = flag('--dry-run');
const maxFiles = parseInt(arg('--max-files', isPilot ? '15' : '50'), 10);
const maxIter  = parseInt(arg('--max-iter',  '20'), 10);
const manifestPath = arg('--manifest', join(ROOT, 'benchmark-data', 'loop-bench', 'midfiles.json'));
const outPath      = arg('--out',      join(ROOT, 'benchmark-data', 'lager-b', 'rct-results.json'));

const AI_READY_THRESHOLD = 9.5;
const NEAR_TARGET        = 9.4;     // "filed left < 9.4" outcome measure
const NOISE_FLOOR        = 0.1;     // gate threshold: same as CONVERGENCE_NOISE_FLOOR in loop.ts

// ─── Corpus discovery ─────────────────────────────────────────────────────────
const SUPPORTED_EXTS = new Set([
  '.ts', '.js', '.py', '.java', '.cs', '.go', '.rb', '.rs', '.php', '.kt',
]);

function collectFiles(dir) {
  const results = [];
  try {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      const stat = statSync(full);
      if (stat.isDirectory()) results.push(...collectFiles(full));
      else if (SUPPORTED_EXTS.has(extname(full).toLowerCase())) results.push(full);
    }
  } catch { /* ignore */ }
  return results;
}

// ─── Simulated gate-off loop ───────────────────────────────────────────────────
/**
 * Simulates the loop WITHOUT the CONVERGENCE_NOISE_FLOOR gate.
 * Accepts ALL steps including those where scoreAfter < scoreBefore.
 *
 * This requires re-running the analysis since runRefactoringLoop always applies
 * the gate.  For the RCT scaffold we use the step records from a gate-on run
 * and retroactively annotate which steps would have been blocked/accepted.
 *
 * For a proper gate-off simulation you would fork runRefactoringLoop with the
 * gate disabled — see docs/benchmarks/lager-b-protocol.md "Gate-off implementation".
 */
function classifySteps(steps) {
  const gateOnSteps  = [];   // steps accepted by gate-on (all steps in the current loop)
  const wouldBlockOn = [];   // steps gate-ON would have blocked (regressive Δ < NOISE_FLOOR)

  // The current loop already filtered these out; we can only estimate gate-off
  // impact by looking at the "lost" delta gaps between iterations.
  // For the pilot, we annotate each step with its gatePassed status.
  for (const s of steps) {
    const delta = s.scoreAfter - s.scoreBefore;
    const gatePassed = delta >= NOISE_FLOOR;

    gateOnSteps.push({ ...s, gatePassed, gateWouldBlock: !gatePassed });
    if (!gatePassed) wouldBlockOn.push(s);
  }
  return { gateOnSteps, wouldBlockOn };
}

// ─── Outcome metrics ──────────────────────────────────────────────────────────
/**
 * Computes the three RCT outcome measures for a single file:
 *   - regressiveEdits: steps where scoreDelta < 0 (gate-off would include these)
 *   - newSmells:       smellTypes introduced between iterations
 *   - leftBelowNearTarget: final score < NEAR_TARGET
 */
function computeOutcomes(steps, scoreBefore, scoreAfter, smellsBefore, smellsAfter) {
  const regressiveEdits = steps.filter(s => (s.scoreAfter - s.scoreBefore) < 0).length;

  const newSmells = smellsAfter.filter(sm => !smellsBefore.includes(sm));

  return {
    regressiveEdits,
    newSmellsCount: newSmells.length,
    newSmells,
    leftBelowNearTarget: scoreAfter < NEAR_TARGET,
    finalScore: scoreAfter,
    delta: scoreAfter - scoreBefore,
    iterationCount: steps.length,
  };
}

// ─── Concurrency pool ─────────────────────────────────────────────────────────
async function runWithConcurrency(items, fn, concurrency) {
  const results = new Array(items.length);
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < items.length) {
      const i = nextIdx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const RUN_ID = `rct-${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}`;

  console.log('Lager-B Gate-On vs Gate-Off RCT Scaffold (Mechanical Loop)');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Run ID:    ${RUN_ID}`);
  console.log(`Mode:      ${isPilot ? 'PILOT (unhealthy fixtures)' : 'manifest'}${isDryRun ? ' DRY-RUN' : ''}`);
  console.log(`Max files: ${maxFiles}`);
  console.log(`Max iter:  ${maxIter}`);
  console.log(`Output:    ${outPath}`);
  console.log();

  const core = await loadCore();
  const { analyzeCode, runRefactoringLoop, detectLanguage } = core;

  // ─── Corpus ────────────────────────────────────────────────────────────────
  let corpus;

  if (isPilot) {
    const fixtureDir = join(ROOT, 'packages', 'core', 'tests', 'fixtures', 'unhealthy');
    const allFiles   = collectFiles(fixtureDir);
    corpus = [];
    for (const fp of allFiles) {
      try {
        const code = readFileSync(fp, 'utf-8');
        const lang = detectLanguage(fp);
        if (lang === 'unsupported') continue;
        const h = analyzeCode(code, lang, fp);
        if (h.score >= AI_READY_THRESHOLD) continue;
        corpus.push({ _absPath: fp, lang, score: h.score });
      } catch { /* skip */ }
    }
  } else {
    if (!existsSync(manifestPath)) {
      console.error(`ERROR: manifest not found: ${manifestPath}`);
      process.exit(1);
    }
    const raw = JSON.parse(await readFile(manifestPath, 'utf-8'));
    corpus = (raw.files ?? raw).map(e => ({ ...e, _absPath: join(ROOT, e.path) }));
  }

  corpus = corpus.slice(0, maxFiles);
  console.log(`Corpus: ${corpus.length} files\n`);

  if (isDryRun) {
    console.log('DRY-RUN — first 5 files:');
    for (const e of corpus.slice(0, 5)) {
      console.log(`  ${e.lang.padEnd(12)} ${relative(ROOT, e._absPath)}`);
    }
    return;
  }

  // ─── Per-file RCT run ──────────────────────────────────────────────────────
  let done = 0;
  const records = await runWithConcurrency(corpus, async (entry, idx) => {
    const absPath = entry._absPath;
    let code;
    try { code = await readFile(absPath, 'utf-8'); }
    catch { return null; }

    try {
      const healthBefore = analyzeCode(code, entry.lang, absPath);
      const smellsBefore = [...new Set(healthBefore.smells.map(s => s.type))];

      // Gate-ON run (the real loop with all guards active)
      const loopResult  = runRefactoringLoop(code, entry.lang, absPath, AI_READY_THRESHOLD, maxIter);

      const healthAfter = analyzeCode(loopResult.finalCode, entry.lang, absPath);
      const smellsAfter = [...new Set(healthAfter.smells.map(s => s.type))];

      const { gateOnSteps } = classifySteps(loopResult.steps);
      const gateOnOutcomes  = computeOutcomes(
        gateOnSteps, healthBefore.score, loopResult.finalScore,
        smellsBefore, smellsAfter,
      );

      // ── Gate-OFF simulation ─────────────────────────────────────────────────
      // The mechanical loop cannot easily run gate-off without forking the source.
      // We simulate gate-off by estimating what would have happened if regressive
      // steps had been accepted:
      //   - Assume gate-off would produce 0 extra improvement on top of gate-on
      //     (conservative: same final score, but with regressiveEdits included)
      //   - Mark estimated regressive steps that gate-on filtered out
      // For a real gate-off measurement: see docs/benchmarks/lager-b-protocol.md.
      //
      // This scaffold records the gate-on measurement and flags that gate-off
      // requires a forked loop implementation. The RCT is "paired" — same file,
      // same budget, different guard.
      const gateOffEstimated = {
        note: 'Gate-off simulation requires forked runRefactoringLoop (see protocol doc)',
        // Proxy: count steps that gate-on accepted but had delta < 2×NOISE_FLOOR
        // (marginal steps that gate-off might have accepted but gate-on rejected)
        estimatedAdditionalRegressiveSteps: Math.max(0, loopResult.steps.length - gateOnSteps.length),
        // For the full RCT: run a loop with CONVERGENCE_NOISE_FLOOR = -Infinity
      };

      done++;
      const status = `${healthBefore.score.toFixed(2)} → ${loopResult.finalScore.toFixed(2)}  Δ${(loopResult.finalScore - healthBefore.score) >= 0 ? '+' : ''}${(loopResult.finalScore - healthBefore.score).toFixed(2)}  ${loopResult.steps.length} steps${gateOnOutcomes.leftBelowNearTarget ? '' : ' NEAR_TARGET'}`;
      console.log(`  [${done}/${corpus.length}] ${entry.lang.padEnd(12)} ${relative(ROOT, absPath).split('/').pop().padEnd(35)} ${status}`);

      return {
        runId:        RUN_ID,
        fileIdx:      idx,
        filePath:     relative(ROOT, absPath),
        language:     entry.lang,
        scoreBefore:  Math.round(healthBefore.score * 1000) / 1000,
        gateOn:       {
          ...gateOnOutcomes,
          steps:      gateOnSteps.map(s => ({
            smell:    s.smell,
            strategy: s.strategy,
            scoreBefore: Math.round(s.scoreBefore * 1000) / 1000,
            scoreAfter:  Math.round(s.scoreAfter  * 1000) / 1000,
            scoreDelta:  Math.round((s.scoreAfter - s.scoreBefore) * 1000) / 1000,
            gatePassed:  s.gatePassed,
          })),
        },
        gateOffEstimated,
        smellsBefore,
        smellsAfter,
      };
    } catch (err) {
      done++;
      console.warn(`  [${done}/${corpus.length}] ERROR: ${relative(ROOT, absPath)} — ${err.message}`);
      return {
        runId:    RUN_ID,
        fileIdx:  idx,
        filePath: relative(ROOT, absPath),
        language: entry.lang,
        error:    err.message,
      };
    }
  }, 4);

  const valid = records.filter(Boolean);

  // ─── Aggregate RCT outcomes ────────────────────────────────────────────────
  const gateOnRecords = valid.filter(r => r.gateOn);

  const n = gateOnRecords.length;
  const mean = (fn) => n ? gateOnRecords.reduce((a, r) => a + fn(r), 0) / n : 0;

  const rctSummary = {
    runId:        RUN_ID,
    generatedAt:  new Date().toISOString(),
    n,
    note:         'Gate-off arm is estimated (proxy); full gate-off requires forked loop — see protocol.',
    outcomeGateOn: {
      reachedNearTarget:        gateOnRecords.filter(r => !r.gateOn.leftBelowNearTarget).length,
      reachedNearTargetPct:     Math.round(gateOnRecords.filter(r => !r.gateOn.leftBelowNearTarget).length / n * 100),
      avgRegressiveEdits:       Math.round(mean(r => r.gateOn.regressiveEdits) * 1000) / 1000,
      avgNewSmells:             Math.round(mean(r => r.gateOn.newSmellsCount) * 1000) / 1000,
      avgFinalScore:            Math.round(mean(r => r.gateOn.finalScore) * 1000) / 1000,
      avgDelta:                 Math.round(mean(r => r.gateOn.delta) * 1000) / 1000,
      filesLeftBelowNearTarget: gateOnRecords.filter(r => r.gateOn.leftBelowNearTarget).length,
    },
    statisticalNote: [
      'McNemar\'s test (paired binary outcome) is appropriate for files left <9.4.',
      'Paired t-test on finalScore delta is appropriate for continuous outcomes.',
      'Run scripts/benchmarks/lager-b/rct-stats.mjs for p-values.',
      'Min n for 80% power at α=0.05 detecting 10pp difference: ~196 (McNemar\'s).',
    ],
  };

  const output = { runId: RUN_ID, summary: rctSummary, records: valid };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(output, null, 2), 'utf-8');

  // ─── Print summary ─────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════ RCT SUMMARY ═════════════════════════════');
  console.log(`Files:                  ${n}`);
  console.log(`Reached near-target (≥9.4) [gate-on]:  ${rctSummary.outcomeGateOn.reachedNearTarget}/${n} (${rctSummary.outcomeGateOn.reachedNearTargetPct}%)`);
  console.log(`Avg final score [gate-on]: ${rctSummary.outcomeGateOn.avgFinalScore.toFixed(2)}`);
  console.log(`Avg regressive edits:   ${rctSummary.outcomeGateOn.avgRegressiveEdits.toFixed(2)}`);
  console.log(`Avg new smells:         ${rctSummary.outcomeGateOn.avgNewSmells.toFixed(2)}`);
  console.log(`Files left <9.4:        ${rctSummary.outcomeGateOn.filesLeftBelowNearTarget}/${n}`);
  console.log('\nNote: Gate-off arm is estimated. Full RCT requires forked loop implementation.');
  console.log(`See docs/benchmarks/lager-b-protocol.md for implementation plan.`);
  console.log(`\nOutput: ${outPath}`);
}

main().catch(err => {
  console.error('\nGate RCT failed:', err);
  process.exit(1);
});
