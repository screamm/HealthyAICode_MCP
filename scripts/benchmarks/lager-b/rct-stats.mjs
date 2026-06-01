#!/usr/bin/env node
/**
 * scripts/benchmarks/lager-b/rct-stats.mjs
 *
 * Statistical analysis for the Gate-on vs Gate-off RCT.
 *
 * Reads benchmark-data/lager-b/rct-results.json and computes:
 *   - McNemar's test p-value for the "files left <9.4" binary outcome
 *   - Paired t-test for the continuous "finalScore delta" outcome
 *   - Cohen's d effect size
 *   - 95% confidence intervals
 *   - Power analysis: n required for 80% power
 *
 * Usage:
 *   node scripts/benchmarks/lager-b/rct-stats.mjs [--in path] [--out path]
 *
 * All statistics are pure JavaScript — no external deps required.
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';

const ROOT    = fileURLToPath(new URL('../../../', import.meta.url));
const argv    = process.argv.slice(2);
const arg     = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const inPath  = arg('--in',  join(ROOT, 'benchmark-data', 'lager-b', 'rct-results.json'));
const outPath = arg('--out', join(ROOT, 'benchmark-data', 'lager-b', 'rct-stats.json'));

// ─── Statistics helpers ───────────────────────────────────────────────────────

/** Two-tailed normal CDF approximation (Abramowitz & Stegun 26.2.17). */
function normalCdf(z) {
  const absZ = Math.abs(z);
  const t    = 1 / (1 + 0.2316419 * absZ);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p    = 1 - 0.3989422804014327 * Math.exp(-0.5 * absZ * absZ) * poly;
  return z >= 0 ? p : 1 - p;
}

/** Two-tailed p-value from z-score. */
function pFromZ(z) { return 2 * (1 - normalCdf(Math.abs(z))); }

/**
 * McNemar's test for paired binary outcomes.
 * b = gate-on success + gate-off fail; c = gate-on fail + gate-off success.
 * Returns chi-square and p-value.
 * With continuity correction: χ² = (|b-c|-1)² / (b+c).
 */
function mcnemar(b, c) {
  if (b + c === 0) return { chi2: 0, p: 1, note: 'no discordant pairs' };
  const chi2 = Math.pow(Math.abs(b - c) - 1, 2) / (b + c);
  // chi-square(df=1) p-value approximation via normal distribution (√chi2 ≈ z)
  const p = pFromZ(Math.sqrt(chi2));
  return { chi2: Math.round(chi2 * 1000) / 1000, p: Math.round(p * 10000) / 10000 };
}

/**
 * Paired t-test (two-tailed).
 * diffs = array of (gate-on value - gate-off value) per pair.
 */
function pairedTTest(diffs) {
  const n    = diffs.length;
  if (n < 2) return { t: 0, p: 1, n, note: 'insufficient data' };
  const mean = diffs.reduce((a, x) => a + x, 0) / n;
  const variance = diffs.reduce((a, x) => a + Math.pow(x - mean, 2), 0) / (n - 1);
  const se   = Math.sqrt(variance / n);
  if (se === 0) return { t: 0, p: 1, n, note: 'zero variance' };
  const t    = mean / se;
  // Approximate t→z for df>30 (exact df=n-1 requires incomplete beta function)
  const p    = pFromZ(t);
  return {
    n,
    mean: Math.round(mean * 1000) / 1000,
    se:   Math.round(se   * 1000) / 1000,
    t:    Math.round(t    * 1000) / 1000,
    p:    Math.round(p    * 10000) / 10000,
    note: n < 30 ? 'p-value is approximate (normal approximation; df=' + (n - 1) + ')' : undefined,
  };
}

/** Cohen's d for paired design: mean(diff) / sd(diff). */
function cohensD(diffs) {
  const n   = diffs.length;
  if (n < 2) return { d: 0, interpretation: 'insufficient data' };
  const mean = diffs.reduce((a, x) => a + x, 0) / n;
  const sd   = Math.sqrt(diffs.reduce((a, x) => a + Math.pow(x - mean, 2), 0) / (n - 1));
  if (sd === 0) return { d: 0, interpretation: 'zero variance' };
  const d = mean / sd;
  const interpretation = Math.abs(d) < 0.2 ? 'negligible' : Math.abs(d) < 0.5 ? 'small' : Math.abs(d) < 0.8 ? 'medium' : 'large';
  return { d: Math.round(d * 1000) / 1000, interpretation };
}

/** Required n for two-tailed McNemar's test at given power and alpha. */
function mcnemarPowerN(p1, p2, alpha = 0.05, power = 0.80) {
  // p1 = proportion concordant gate-on-success; p2 = gate-off-success
  // Simplified: n ≈ (z_α/2 + z_β)² / (p1 - p2)²  (Wilson approximation)
  const zAlpha = 1.96;  // α=0.05 two-tailed
  const zBeta  = 0.842; // 80% power
  const diff   = Math.abs(p1 - p2);
  if (diff === 0) return Infinity;
  return Math.ceil(Math.pow(zAlpha + zBeta, 2) / Math.pow(diff, 2));
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Lager-B RCT Statistical Analysis');
  console.log('═════════════════════════════════');

  let data;
  try {
    data = JSON.parse(await readFile(inPath, 'utf-8'));
  } catch {
    console.error(`ERROR: cannot read ${inPath}`);
    console.error('Run gate-rct.mjs --pilot first.');
    process.exit(1);
  }

  const records = (data.records ?? []).filter(r => r.gateOn && !r.error);
  const n = records.length;
  console.log(`Records with gate-on data: ${n}\n`);

  if (n < 2) {
    console.log('Insufficient data for statistical tests (need n≥2).');
    console.log('Run gate-rct.mjs --pilot to generate data.');
    return;
  }

  // ─── Outcome 1: Files left below near-target (binary) ─────────────────────
  // Gate-on: does the file reach ≥9.4?
  // Gate-off: estimated (we don't have a real gate-off run yet)
  // For now, report gate-on statistics and flag that gate-off is needed.
  const gateOnLeftBelow = records.filter(r => r.gateOn.leftBelowNearTarget).length;
  const gateOnReached   = n - gateOnLeftBelow;

  // ─── Outcome 2: Final score (continuous) ──────────────────────────────────
  const gateOnScores = records.map(r => r.gateOn.finalScore);
  const avgGateOn    = gateOnScores.reduce((a, x) => a + x, 0) / n;

  // ─── Outcome 3: Regressive edits (count) ──────────────────────────────────
  const avgRegressiveEdits = records.reduce((a, r) => a + r.gateOn.regressiveEdits, 0) / n;

  // ─── Power analysis: what n is needed for a 10pp improvement? ─────────────
  const gateOnReachedPct = gateOnReached / n;
  // Hypothesize gate-off reaches 10pp fewer files (conservative)
  const hypotheticalGateOffPct = Math.max(0, gateOnReachedPct - 0.10);
  const requiredN = mcnemarPowerN(gateOnReachedPct, hypotheticalGateOffPct);

  // ─── t-test on final score deltas (gate-on vs hypothetical gate-off) ──────
  // Since we don't have gate-off data, we can't run the paired test yet.
  // We report what we have and flag the requirement.
  const scoreDiffs = records.map(r => r.gateOn.delta);   // placeholder: gate-on delta from baseline
  const tResult = pairedTTest(scoreDiffs);
  const dResult = cohensD(scoreDiffs);

  const stats = {
    generatedAt:  new Date().toISOString(),
    runId:        data.runId ?? 'unknown',
    n,
    outcomes: {
      filesLeftBelowNearTarget: {
        description: 'Files where finalScore < 9.4 after full loop (binary)',
        gateOn: {
          leftBelow: gateOnLeftBelow,
          reached:   gateOnReached,
          reachedPct: Math.round(gateOnReachedPct * 100),
        },
        gateOff: {
          note: 'Gate-off arm not yet implemented. See docs/benchmarks/lager-b-protocol.md.',
          requiredNForFullRCT: requiredN,
          powerAssumption: '80% power, α=0.05, detecting 10pp difference (McNemar\'s test)',
        },
      },
      finalScore: {
        description: 'Final health score after loop (continuous)',
        gateOn: {
          mean: Math.round(avgGateOn * 1000) / 1000,
          scores: gateOnScores.map(s => Math.round(s * 100) / 100),
        },
        pairedTTest: {
          note: 'Placeholder: uses gate-on score delta from baseline (gate-off data needed for real paired test)',
          ...tResult,
        },
        cohensD: dResult,
      },
      regressiveEdits: {
        description: 'Steps where scoreAfter < scoreBefore (gate-on blocks these)',
        gateOn: {
          avgPerFile: Math.round(avgRegressiveEdits * 1000) / 1000,
          note: 'Current gate-on loop already blocks regressive steps — value should be near 0',
        },
      },
    },
    powerAnalysis: {
      targetOutcome: 'files reaching ≥9.4 (near-target)',
      alpha:         0.05,
      power:         0.80,
      hypothesizedDiff: '10 percentage-point improvement with gate-on vs gate-off',
      requiredN:     requiredN,
      currentN:      n,
      shortfall:     Math.max(0, requiredN - n),
      note:          requiredN <= n
        ? 'POWERED: current n is sufficient for the hypothesized effect.'
        : `UNDERPOWERED: need ${requiredN - n} more files for 80% power at 10pp effect.`,
    },
    limitations: [
      'Gate-off arm is not yet implemented — requires forking runRefactoringLoop.',
      'All statistics use gate-on data only; paired comparison is not yet possible.',
      'p-values use normal approximation (exact t-distribution requires more code).',
      'Effect size estimate assumes 10pp true effect — may be optimistic or pessimistic.',
    ],
    nextSteps: [
      'Implement gate-off loop in scripts/benchmarks/lager-b/gate-off-loop.mjs.',
      'Run gate-rct.mjs with both arms on n≥' + requiredN + ' files.',
      'Re-run rct-stats.mjs on the paired data.',
    ],
  };

  await writeFile(outPath, JSON.stringify(stats, null, 2), 'utf-8');

  console.log('Outcome 1 — Files left below near-target (≥9.4):');
  console.log(`  Gate-on:  ${gateOnLeftBelow} left below / ${gateOnReached} reached (${stats.outcomes.filesLeftBelowNearTarget.gateOn.reachedPct}%)`);
  console.log(`  Gate-off: not yet measured (requires forked loop)`);
  console.log();
  console.log('Outcome 2 — Final score:');
  console.log(`  Gate-on mean: ${avgGateOn.toFixed(3)}`);
  console.log(`  Cohen\'s d (gate-on delta from baseline): ${dResult.d} (${dResult.interpretation})`);
  console.log();
  console.log('Power analysis:');
  console.log(`  Required n for 80% power (10pp effect, McNemar\'s): ${requiredN}`);
  console.log(`  Current n: ${n}`);
  console.log(`  ${stats.powerAnalysis.note}`);
  console.log();
  console.log(`Stats written to: ${outPath}`);
}

main().catch(err => {
  console.error('\nStats analysis failed:', err);
  process.exit(1);
});
