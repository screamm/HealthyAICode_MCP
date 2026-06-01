// Behavior-equivalence feasibility spike — top-level scorer.
//
// Runs both differential-execution sandboxes (TS + Python), joins their
// verdicts against the labelled corpus (corpus/index.json), and reports:
//   * detection rate = fraction of NON-equivalent pairs correctly flagged DIVERGENCE
//   * false-positive rate = fraction of EQUIVALENT pairs wrongly flagged DIVERGENCE
//
// Honest go/no-go: detection >= 80% => GO (build the tool). Otherwise NO-GO
// => recommend static-equivalence-only (advisory).
//
// Usage: node scripts/spikes/behavior-equiv/run.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const index = JSON.parse(readFileSync(join(HERE, 'corpus', 'index.json'), 'utf8'));

function runTs() {
  const out = execFileSync('node', [join(HERE, 'sandbox', 'diff_run_ts.mjs')], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function runPy() {
  const py = process.env.PYTHON || 'python';
  const out = execFileSync(py, [join(HERE, 'sandbox', 'diff_run_py.py')], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out);
}

const tsVerdicts = runTs();
const pyVerdicts = runPy();
const verdicts = { ...tsVerdicts, ...pyVerdicts };

let tp = 0, fn = 0, tn = 0, fp = 0, unverified = 0;
const rows = [];
for (const pair of index.pairs) {
  const v = verdicts[pair.id];
  if (!v) { rows.push({ id: pair.id, label: pair.equivalent, verdict: 'MISSING' }); continue; }
  const flagged = v.verdict === 'DIVERGENCE';
  let outcome;
  if (v.verdict === 'UNVERIFIED') { unverified++; outcome = 'UNVERIFIED'; }
  else if (!pair.equivalent && flagged) { tp++; outcome = 'TP (break caught)'; }
  else if (!pair.equivalent && !flagged) { fn++; outcome = 'FN (break MISSED)'; }
  else if (pair.equivalent && flagged) { fp++; outcome = 'FP (false alarm)'; }
  else { tn++; outcome = 'TN (clean pass)'; }
  rows.push({ id: pair.id, lang: pair.lang, bug: pair.bugClass, verdict: v.verdict, checked: v.checked, outcome });
}

const totalBreaks = tp + fn;
const totalClean = tn + fp;
const detectionRate = totalBreaks ? tp / totalBreaks : 0;
const fpRate = totalClean ? fp / totalClean : 0;

console.log('=== Behavior-equivalence spike — per-pair ===');
for (const r of rows) {
  console.log(
    `${(r.id || '').padEnd(22)} ${(r.lang || '').padEnd(3)} ${(r.bug || '').padEnd(18)} ` +
    `verdict=${(r.verdict || '').padEnd(11)} checked=${String(r.checked ?? '-').padStart(5)} ${r.outcome}`
  );
}

console.log('\n=== Summary ===');
console.log(`non-equivalent pairs (breaks): ${totalBreaks}  | caught (TP): ${tp}  missed (FN): ${fn}`);
console.log(`equivalent pairs (clean):      ${totalClean}  | clean (TN): ${tn}  false-alarm (FP): ${fp}`);
console.log(`unverified:                    ${unverified}`);
console.log(`DETECTION RATE: ${(detectionRate * 100).toFixed(1)}%  (target >= 80%)`);
console.log(`FALSE-POSITIVE RATE: ${(fpRate * 100).toFixed(1)}%`);

const verdict = detectionRate >= 0.8 && fpRate <= 0.1 ? 'GO' : 'NO-GO';
console.log(`\nVERDICT: ${verdict}`);
if (verdict === 'NO-GO') {
  console.log('Recommendation: ship static-equivalence only (advisory); do NOT overclaim dynamic behavior-equivalence.');
}

// machine-readable footer
console.log('\nJSON:' + JSON.stringify({
  detectionRate, fpRate, tp, fn, tn, fp, unverified, verdict,
}));
