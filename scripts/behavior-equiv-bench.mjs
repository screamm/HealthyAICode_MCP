#!/usr/bin/env node
/**
 * Behavior-equivalence corpus benchmark.
 *
 * Runs the dynamic differential-execution engines (Python + TS/JS) across the
 * FULL labelled corpus at packages/core/tests/fixtures/behavior-equiv/ and
 * computes:
 *   - DETECTION RATE  = correctly flagged divergent pairs / known-divergent pairs
 *   - FALSE-POSITIVE  = wrongly flagged equivalent pairs / known-equivalent pairs
 *
 * Each fixture file defines BOTH `before` and `after` functions (uniform naming
 * convention used across the whole corpus). The engines compare them:
 *   - JS  : checkJsEquivalence(fullSrc, fullSrc, {beforeFnName:'before', afterFnName:'after'})
 *   - PY  : verifyPythonEquivalence(beforeSrc, afterSrc, 'before') where afterSrc is the
 *           same module with `after` renamed to `before` (and the original `before`
 *           renamed out of the way), so a single target name resolves to each side.
 *
 * Honesty: real engine runs only. No fabricated numbers. A `divergent` expected
 * pair that the engine reports `unverified` counts as a MISS (not a detection).
 *
 * Output: docs/benchmarks/behavior-equivalence-results.md
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(__dirname, '..');
const CORPUS_DIR = join(projectRoot, 'packages', 'core', 'tests', 'fixtures', 'behavior-equiv');
const DIST = join(projectRoot, 'packages', 'core', 'dist', 'refactor', 'behavior-equiv');
const OUT = join(projectRoot, 'docs', 'benchmarks', 'behavior-equivalence-results.md');

async function loadEngines() {
  const js = await import(pathToFileURL(join(DIST, 'js-equiv.js')).href);
  const py = await import(pathToFileURL(join(DIST, 'python-equiv.js')).href);
  return { checkJsEquivalence: js.checkJsEquivalence, verifyPythonEquivalence: py.verifyPythonEquivalence };
}

/**
 * Build the after-source for Python so a single target name `before` resolves to
 * the `after` function body. Rename the original `def before(` out of the way,
 * then rename `def after(` -> `def before(`. Module-level statements are kept.
 */
function pythonAfterSource(fullSrc) {
  return fullSrc
    .replace(/^def before\(/m, 'def __orig_before__(')
    .replace(/^def after\(/m, 'def before(');
}

function classify(verdict) {
  // unified -> {divergent|equivalent|unverified}; engines use their own tags.
  if (verdict === 'divergence' || verdict === 'divergent') return 'divergent';
  if (verdict === 'equivalent' || verdict === 'pass') return 'equivalent';
  return 'unverified';
}

async function main() {
  const t0 = Date.now();
  const { checkJsEquivalence, verifyPythonEquivalence } = await loadEngines();
  const manifest = JSON.parse(readFileSync(join(CORPUS_DIR, 'manifest.json'), 'utf8'));

  const rows = [];
  for (const pair of manifest.pairs) {
    const fullSrc = readFileSync(join(CORPUS_DIR, pair.file), 'utf8');
    const isPy = pair.language === 'python';
    let observed; // 'divergent' | 'equivalent' | 'unverified'
    let detail = '';
    let inputs = 0;

    try {
      if (isPy) {
        const beforeSrc = fullSrc;
        const afterSrc = pythonAfterSource(fullSrc);
        const res = await verifyPythonEquivalence(beforeSrc, afterSrc, 'before', { inputs: 2000 });
        observed = classify(res.verdict);
        detail = res.detail || '';
        inputs = res.checked || 0;
      } else {
        const res = checkJsEquivalence(fullSrc, fullSrc, {
          beforeFnName: 'before',
          afterFnName: 'after',
          runs: 2000,
        });
        observed = classify(res.verdict);
        detail = res.detail || '';
        inputs = res.checked || 0;
      }
    } catch (e) {
      observed = 'unverified';
      detail = `engine error: ${e.message}`;
    }

    const expected = pair.expected; // 'divergent' | 'equivalent'
    let outcome;
    if (expected === 'divergent') {
      outcome = observed === 'divergent' ? 'TP' : 'FN'; // FN = miss (incl. unverified)
    } else {
      outcome = observed === 'equivalent' ? 'TN' : observed === 'divergent' ? 'FP' : 'UNV';
      // UNV on an equivalent pair is neither a false positive nor a confirmed true negative.
    }

    rows.push({
      id: pair.id,
      language: pair.language,
      bugClass: pair.bugClass,
      expected,
      observed,
      outcome,
      inputs,
      detail: detail.slice(0, 200),
    });
    console.log(`${outcome.padEnd(3)} ${pair.id.padEnd(34)} exp=${expected.padEnd(10)} obs=${observed.padEnd(11)} n=${inputs}`);
  }

  // ── Metrics ────────────────────────────────────────────────────────────────
  const divergentPairs = rows.filter((r) => r.expected === 'divergent');
  const equivalentPairs = rows.filter((r) => r.expected === 'equivalent');
  const tp = rows.filter((r) => r.outcome === 'TP').length;
  const fn = rows.filter((r) => r.outcome === 'FN').length;
  const tn = rows.filter((r) => r.outcome === 'TN').length;
  const fp = rows.filter((r) => r.outcome === 'FP').length;
  const unvEquiv = rows.filter((r) => r.outcome === 'UNV').length;

  const detectionRate = divergentPairs.length ? tp / divergentPairs.length : 0;
  // FP rate measured over equivalent pairs that were actually verified (TN+FP);
  // also report the strict denominator (all equivalent pairs).
  const fpDenomVerified = tn + fp;
  const fpRateVerified = fpDenomVerified ? fp / fpDenomVerified : 0;
  const fpRateAllEquiv = equivalentPairs.length ? fp / equivalentPairs.length : 0;

  // Per-language breakdown
  const perLang = {};
  for (const r of rows) {
    perLang[r.language] ??= { tp: 0, fn: 0, tn: 0, fp: 0, unv: 0 };
    if (r.outcome === 'TP') perLang[r.language].tp++;
    else if (r.outcome === 'FN') perLang[r.language].fn++;
    else if (r.outcome === 'TN') perLang[r.language].tn++;
    else if (r.outcome === 'FP') perLang[r.language].fp++;
    else perLang[r.language].unv++;
  }

  const pct = (x) => `${(x * 100).toFixed(1)}%`;

  // ── Markdown report ──────────────────────────────────────────────────────
  const lines = [];
  lines.push('# Behavior-Equivalence Gate — Corpus Measurement');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()} (real engine run, no fabricated numbers)`);
  lines.push(`Duration: ${Date.now() - t0} ms`);
  lines.push(`Corpus: \`packages/core/tests/fixtures/behavior-equiv/\` (${rows.length} pairs)`);
  lines.push(`Engines: Python (\`verifyPythonEquivalence\`, 2000 inputs/pair) + TS/JS (\`checkJsEquivalence\`, 2000 inputs/pair)`);
  lines.push('');
  lines.push('## Headline metrics');
  lines.push('');
  lines.push('| Metric | Value | Numerator / Denominator |');
  lines.push('|---|---|---|');
  lines.push(`| **Detection rate** (recall on divergent) | **${pct(detectionRate)}** | ${tp} / ${divergentPairs.length} |`);
  lines.push(`| **False-positive rate** (over verified equivalents) | **${pct(fpRateVerified)}** | ${fp} / ${fpDenomVerified} |`);
  lines.push(`| False-positive rate (over all equivalents) | ${pct(fpRateAllEquiv)} | ${fp} / ${equivalentPairs.length} |`);
  lines.push(`| Unverified equivalents (advisory, not FP) | ${unvEquiv} | of ${equivalentPairs.length} |`);
  lines.push('');
  lines.push('Confusion matrix (divergent = positive class):');
  lines.push('');
  lines.push('| | observed divergent | observed equivalent | observed unverified |');
  lines.push('|---|---|---|---|');
  lines.push(`| **expected divergent** | ${tp} (TP) | ${rows.filter((r) => r.expected === 'divergent' && r.observed === 'equivalent').length} (FN) | ${rows.filter((r) => r.expected === 'divergent' && r.observed === 'unverified').length} (FN/unv) |`);
  lines.push(`| **expected equivalent** | ${fp} (FP) | ${tn} (TN) | ${unvEquiv} (advisory) |`);
  lines.push('');
  lines.push('## Per-language breakdown');
  lines.push('');
  lines.push('| Language | TP | FN | TN | FP | Unverified |');
  lines.push('|---|---|---|---|---|---|');
  for (const [lang, c] of Object.entries(perLang)) {
    lines.push(`| ${lang} | ${c.tp} | ${c.fn} | ${c.tn} | ${c.fp} | ${c.unv} |`);
  }
  lines.push('');
  lines.push('## Per-pair results');
  lines.push('');
  lines.push('| Outcome | ID | Lang | Bug class | Expected | Observed | Inputs | Detail |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    lines.push(`| ${r.outcome} | ${r.id} | ${r.language} | ${r.bugClass} | ${r.expected} | ${r.observed} | ${r.inputs} | ${r.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`);
  }
  lines.push('');
  lines.push('## Honesty notes');
  lines.push('');
  lines.push('- Outcome legend: TP = divergent pair correctly flagged; FN = divergent pair missed (includes `unverified`); TN = equivalent pair correctly passed; FP = equivalent pair wrongly flagged; UNV = equivalent pair the engine could not dynamically evaluate (advisory, counted neither as TN nor FP).');
  lines.push('- A `divergent` pair reported `unverified` is counted as a MISS (conservative).');
  lines.push('- Dynamic verification covers **Python and TS/JS only**. For the other ~44 supported languages the gate returns an honest `unverified` advisory; it does NOT claim "all 46 languages proven safe".');
  lines.push('- "equivalent" means "no divergence found within the 2000-input budget" — differential evidence, not a formal proof.');

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

  console.log('\n=== SUMMARY ===');
  console.log(`Detection rate: ${pct(detectionRate)} (${tp}/${divergentPairs.length})`);
  console.log(`FP rate (verified equivalents): ${pct(fpRateVerified)} (${fp}/${fpDenomVerified})`);
  console.log(`Unverified equivalents: ${unvEquiv}/${equivalentPairs.length}`);
  console.log(`Report: ${OUT}`);

  // machine-readable line for the orchestrator
  console.log(`\nRESULT_JSON ${JSON.stringify({ detectionRate, fpRateVerified, fpRateAllEquiv, tp, fn, tn, fp, unvEquiv, total: rows.length })}`);
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
