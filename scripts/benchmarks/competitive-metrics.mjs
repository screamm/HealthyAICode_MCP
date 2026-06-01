/**
 * Track #1b — predictive-power metrics from the harness's competitive-raw.json,
 * SUPPLEMENTED with real PMD violation counts and SonarQube per-file measures that
 * I produced in this session (the harness skipped SonarQube and its PMD run failed).
 *
 * Datasets:
 *   - MLCQ (358 rows; human smell labels; positive = severity != none)
 *   - Defects4J (96 rows; real bug labels; positive = buggy variant)
 *
 * Per analyzer we compute, over the files where that analyzer produced a value:
 *   n, nPos, nNeg, AUROC (+ bootstrap 95% CI), Mann-Whitney U p-value,
 *   and best-F1 threshold (IN-SAMPLE, optimistic) with precision/recall.
 *
 * Risk orientation: every signal is oriented so HIGHER = more risk. core.computeAUROC
 * expects lower-score = positive, so we feed it -risk.
 *
 * Honesty: every number traces to a real analyzer invocation on the real file.
 *   - healthy_ai_code / lizard: consumed from harness competitive-raw.json (real runs)
 *   - PMD: parsed from benchmark-data/_pmd-violations.csv (real PMD 7.10.0 run, this session)
 *   - SonarQube: from benchmark-data/_sonar-measures.json (real SonarQube 26.5 scan, this session)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const core = await import(pathToFileURL(join(REPO, 'packages', 'core', 'dist', 'index.js')).href);

const raw = JSON.parse(readFileSync(join(REPO, 'benchmark-data', 'competitive-raw.json'), 'utf8'));
const sonar = JSON.parse(readFileSync(join(REPO, 'benchmark-data', '_sonar-measures.json'), 'utf8'));

// ---- PMD: parse violation counts; files absent from CSV have 0 violations ----
const pmdCount = new Map();
const pmdCsv = readFileSync(join(REPO, 'benchmark-data', '_pmd-violations.csv'), 'utf8');
for (const line of pmdCsv.split(/\r?\n/)) {
  const m = line.match(/^"\d+","[^"]*","([^"]*)"/);
  if (!m) continue;
  const base = m[1].split(/[\\/]/).pop();
  if (!base || base === 'File') continue;
  pmdCount.set(base, (pmdCount.get(base) ?? 0) + 1);
}
// Which MLCQ files were actually given to PMD (all 341 on disk). Files PMD saw but
// found clean must score 0, not null. PMD ran over the whole java_files dir so every
// file on disk was analyzed; absence from the CSV == 0 violations.
function pmdFor(base) {
  return pmdCount.has(base) ? pmdCount.get(base) : 0;
}

function bestF1(risks, labels) {
  const uniq = [...new Set(risks)].sort((a, b) => a - b);
  const cands = [uniq[0] - 1];
  for (let i = 0; i < uniq.length; i++) {
    cands.push(uniq[i]);
    if (i + 1 < uniq.length) cands.push((uniq[i] + uniq[i + 1]) / 2);
  }
  cands.push(uniq[uniq.length - 1] + 1);
  let best = { f1: -1 };
  for (const t of cands) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (let i = 0; i < risks.length; i++) {
      const pred = risks[i] >= t;
      if (pred && labels[i]) tp++;
      else if (pred && !labels[i]) fp++;
      else if (!pred && labels[i]) fn++;
      else tn++;
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    if (f1 > best.f1) best = { f1, threshold: t, precision, recall, tp, fp, fn, tn };
  }
  return best;
}

function metricsFor(name, signalDesc, pairs) {
  // pairs: array of { risk, label } with risk oriented higher = worse
  const risks = pairs.map((p) => p.risk);
  const labels = pairs.map((p) => p.label);
  const nPos = labels.filter(Boolean).length;
  const nNeg = labels.length - nPos;
  if (risks.length === 0 || nPos === 0 || nNeg === 0) {
    return { analyzer: name, signal: signalDesc, n: risks.length, nPos, nNeg, note: 'insufficient data' };
  }
  const healthLike = risks.map((v) => -v);
  const auroc = core.computeAUROC(healthLike, labels);
  const ci = core.bootstrapAUROC(healthLike, labels, 2000, 0.95);
  const mw = core.mannWhitneyU(healthLike, labels);
  const f1 = bestF1(risks, labels);
  return {
    analyzer: name,
    signal: signalDesc,
    n: risks.length,
    nPos,
    nNeg,
    auroc: Number(auroc.toFixed(4)),
    auroc95CI: [Number(ci.lower.toFixed(4)), Number(ci.upper.toFixed(4))],
    mannWhitneyP: Number(mw.pValue.toExponential(3)),
    bestF1: {
      f1: Number(f1.f1.toFixed(4)),
      precision: Number(f1.precision.toFixed(4)),
      recall: Number(f1.recall.toFixed(4)),
      confusion: { tp: f1.tp, fp: f1.fp, fn: f1.fn, tn: f1.tn },
    },
  };
}

// ===================== MLCQ =====================
function collectMlcq(getRisk) {
  const pairs = [];
  for (const r of raw.mlcq) {
    const base = r.localFile.split('/').pop();
    const risk = getRisk(r, base);
    if (risk === null || risk === undefined || Number.isNaN(risk)) continue;
    pairs.push({ risk, label: r.hasSmell });
  }
  return pairs;
}

const mlcqResults = [
  // ours: harness riskSignal already higher=worse ((10-score)/9). Use raw score for clarity: risk = -score.
  metricsFor('Healthy-AI-Code (ours)', 'risk = -HealthResult.score (lower health = worse)',
    collectMlcq((r) => (r.results.healthy_ai_code && r.results.healthy_ai_code.score != null ? -r.results.healthy_ai_code.score : null))),
  metricsFor('lizard (max CC)', 'max cyclomatic complexity per file (higher = worse)',
    collectMlcq((r) => (r.results.lizard && r.results.lizard.maxCCN != null ? r.results.lizard.maxCCN : null))),
  metricsFor('PMD 7.10 (quickstart)', 'java/quickstart.xml violation count per file (higher = worse)',
    collectMlcq((r, base) => pmdFor(base))),
  metricsFor('SonarQube 26.5 (code_smells)', 'code_smells count per file (higher = worse)',
    collectMlcq((r, base) => (sonar[base] ? sonar[base].code_smells : null))),
  metricsFor('SonarQube 26.5 (sqale_index)', 'sqale_index tech-debt minutes per file (higher = worse)',
    collectMlcq((r, base) => (sonar[base] ? sonar[base].sqale_index : null))),
  metricsFor('SonarQube 26.5 (cognitive_complexity)', 'cognitive_complexity per file (higher = worse)',
    collectMlcq((r, base) => (sonar[base] ? sonar[base].cognitive_complexity : null))),
];

// ===================== Defects4J =====================
function collectD4j(getRisk) {
  const pairs = [];
  for (const r of raw.defects4j) {
    const risk = getRisk(r);
    if (risk === null || risk === undefined || Number.isNaN(risk)) continue;
    pairs.push({ risk, label: r.hasBug });
  }
  return pairs;
}

const d4jResults = [
  metricsFor('Healthy-AI-Code (ours)', 'risk = -HealthResult.score (lower health = worse)',
    collectD4j((r) => (r.results.healthy_ai_code && r.results.healthy_ai_code.score != null ? -r.results.healthy_ai_code.score : null))),
  metricsFor('lizard (max CC)', 'max cyclomatic complexity per file (higher = worse)',
    collectD4j((r) => (r.results.lizard && r.results.lizard.maxCCN != null ? r.results.lizard.maxCCN : null))),
];

const out = {
  _meta: {
    generated: new Date().toISOString().slice(0, 10),
    datasets: {
      mlcq: raw._meta.groundTruth.mlcq,
      defects4j: raw._meta.groundTruth.defects4j,
    },
    aurocConvention: 'AUROC = P(risk_positive > risk_negative); 0.5 = chance, 1.0 = perfect discrimination',
    f1Caveat: 'best-F1 threshold selected IN-SAMPLE on this dataset (optimistic upper bound, NOT held-out)',
    provenance: {
      healthy_ai_code: 'consumed from harness competitive-raw.json (real analyzeFile runs)',
      lizard: 'consumed from harness competitive-raw.json (real lizard 1.22.2 runs)',
      pmd: 'benchmark-data/_pmd-violations.csv — real PMD 7.10.0 run over all MLCQ files this session; files absent from CSV = 0 violations',
      sonarqube: 'benchmark-data/_sonar-measures.json — real SonarQube 26.5 Community scan this session; 339/341 files (2 generated Thrift files OOM the Java AST analyzer)',
    },
  },
  mlcq: mlcqResults,
  defects4j: d4jResults,
};
writeFileSync(join(REPO, 'benchmark-data', 'competitive-metrics.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
