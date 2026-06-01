/**
 * STEP #1 — DeLong significance test: OURS (recalibrated detectors) vs each competitor.
 *
 * (1) Regenerate OUR per-file MLCQ risk signal with the now-recalibrated GodClass /
 *     FeatureEnvy detectors, over benchmark-data/mlcq/java_files/. Same per-file risk
 *     definition that produced the 0.688 in competitive-benchmark.md:
 *        risk = -HealthResult.score   (lower health => higher risk)
 *     using analyzeFile() (== analyzeCode for non-git Java; verified identical score).
 *
 * (2) Load competitor signals from benchmark-data/competitive-raw.json
 *     (lizard maxCCN) + benchmark-data/_sonar-measures.json (code_smells, sqale_index,
 *     cognitive_complexity) + benchmark-data/_pmd-violations.csv (PMD quickstart count).
 *     Human binary smell label = (severityLabel !== 'none').
 *
 * (3) Run delongTest (packages/core/src/validation/delong.ts) for OURS vs EACH competitor
 *     on the MATCHED samples (the intersection of files where BOTH tools produced a
 *     value — DeLong is paired, so both arrays must be on the identical sample set).
 *
 * Risk orientation for DeLong: higher score = more likely positive. We pass risk
 * (higher = worse = more likely a smell) directly, NOT health. For ours that means
 * we pass (-HealthResult.score).
 *
 * Honesty: OUR signal is recomputed live this session with the compiled recalibrated
 * detectors. Competitor signals are the real runs already on disk (lizard from the
 * harness; PMD/Sonar from real runs this session). No fabricated numbers.
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..', '..');
const core = await import(pathToFileURL(join(REPO, 'packages', 'core', 'dist', 'index.js')).href);

const raw = JSON.parse(readFileSync(join(REPO, 'benchmark-data', 'competitive-raw.json'), 'utf8'));
const sonar = JSON.parse(readFileSync(join(REPO, 'benchmark-data', '_sonar-measures.json'), 'utf8'));

// ---- PMD: parse real violation counts (files PMD saw but found clean => 0) ----
const pmdCount = new Map();
const pmdCsv = readFileSync(join(REPO, 'benchmark-data', '_pmd-violations.csv'), 'utf8');
for (const line of pmdCsv.split(/\r?\n/)) {
  const m = line.match(/^"\d+","[^"]*","([^"]*)"/);
  if (!m) continue;
  const base = m[1].split(/[\\/]/).pop();
  if (!base || base === 'File') continue;
  pmdCount.set(base, (pmdCount.get(base) ?? 0) + 1);
}

// ---- holdout-split for the in-sample optimism caveat ----
const split = JSON.parse(readFileSync(join(REPO, 'benchmark-data', 'mlcq', 'holdout-split.json'), 'utf8'));
const trainIds = new Set(split.train.map(String));

const MLCQ_DIR = join(REPO, 'benchmark-data', 'mlcq');
const OURS_MAX_FILE_SIZE = 500_000; // same skip rule the harness used

// ---------------------------------------------------------------------------
// (1) Regenerate OUR per-file score with recalibrated detectors (per unique file)
// ---------------------------------------------------------------------------
const ourScoreByFile = new Map(); // basename -> score (number) | null
const uniqueFiles = new Map();    // basename -> localFile
for (const r of raw.mlcq) {
  const base = basename(r.localFile);
  if (!uniqueFiles.has(base)) uniqueFiles.set(base, r.localFile);
}

let recomputed = 0, skipped = 0, gcCount = 0, feCount = 0;
for (const [base, localFile] of uniqueFiles) {
  const fp = join(MLCQ_DIR, localFile);
  let size = 0;
  try { size = statSync(fp).size; } catch { ourScoreByFile.set(base, null); continue; }
  if (size > OURS_MAX_FILE_SIZE) { ourScoreByFile.set(base, null); skipped++; continue; }
  try {
    const res = await core.analyzeFile(fp);
    ourScoreByFile.set(base, res.score);
    for (const s of res.smells) { if (s.type === 'GodClass') gcCount++; if (s.type === 'FeatureEnvy') feCount++; }
    recomputed++;
  } catch {
    ourScoreByFile.set(base, null);
  }
}
process.stderr.write(`[ours] recomputed ${recomputed} files (${skipped} >500KB skipped); GodClass=${gcCount} FeatureEnvy=${feCount} fired\n`);

// ---------------------------------------------------------------------------
// (2) Per-manifest-row signals (higher = worse/risk) + label
// ---------------------------------------------------------------------------
function oursRisk(base) {
  const s = ourScoreByFile.get(base);
  return s == null ? null : -s; // lower health = higher risk
}
function lizardRisk(r) {
  const lz = r.results.lizard;
  return lz && lz.maxCCN != null ? lz.maxCCN : null;
}
function pmdRisk(base) {
  // PMD ran over the whole java_files dir; absence == 0 violations (file was seen, clean).
  return pmdCount.has(base) ? pmdCount.get(base) : 0;
}
function sonarRisk(base, field) {
  return sonar[base] ? sonar[base][field] : null;
}

const rows = raw.mlcq.map((r) => {
  const base = basename(r.localFile);
  return {
    base,
    sampleId: String(r.sampleId),
    label: r.hasSmell ? 1 : 0,
    ours: oursRisk(base),
    lizard: lizardRisk(r),
    pmd: pmdRisk(base),
    sonar_code_smells: sonarRisk(base, 'code_smells'),
    sonar_sqale_index: sonarRisk(base, 'sqale_index'),
    sonar_cognitive_complexity: sonarRisk(base, 'cognitive_complexity'),
  };
});

// ---------------------------------------------------------------------------
// (3) DeLong: ours vs each competitor on the MATCHED (paired) sample set
// ---------------------------------------------------------------------------
const COMPETITORS = [
  { key: 'lizard', label: 'lizard (max CCN)' },
  { key: 'pmd', label: 'PMD 7.10 (quickstart violations)' },
  { key: 'sonar_code_smells', label: 'SonarQube (code_smells)' },
  { key: 'sonar_sqale_index', label: 'SonarQube (sqale_index)' },
  { key: 'sonar_cognitive_complexity', label: 'SonarQube (cognitive_complexity)' },
];

function isNum(x) { return x != null && !Number.isNaN(x); }

const comparisons = [];
for (const comp of COMPETITORS) {
  // Paired sample: rows where BOTH ours and this competitor have a numeric value.
  const paired = rows.filter((r) => isNum(r.ours) && isNum(r[comp.key]));
  const labels = paired.map((r) => r.label);
  const nPos = labels.filter((l) => l === 1).length;
  const nNeg = labels.length - nPos;
  if (paired.length === 0 || nPos === 0 || nNeg === 0) {
    comparisons.push({ competitor: comp.label, n: paired.length, note: 'insufficient paired data' });
    continue;
  }
  const scoresOurs = paired.map((r) => r.ours);     // higher = more risk
  const scoresComp = paired.map((r) => r[comp.key]); // higher = more risk
  const res = core.delongTest(scoresOurs, scoresComp, labels);
  comparisons.push({
    competitor: comp.label,
    n: paired.length,
    nPos,
    nNeg,
    aucOurs: Number(res.aucA.toFixed(4)),
    aucComp: Number(res.aucB.toFixed(4)),
    aucDiff: Number(res.aucDiff.toFixed(4)),
    z: Number(res.z.toFixed(4)),
    p: res.pValue,
    ci95: [Number(res.ci95[0].toFixed(4)), Number(res.ci95[1].toFixed(4))],
    significant05: res.pValue < 0.05,
  });
}

// In-sample optimism: fraction of paired-with-lizard rows whose sampleId was in the
// recalibration TRAIN split (GodClass/FeatureEnvy thresholds were tuned on those).
const lizardPaired = rows.filter((r) => isNum(r.ours) && isNum(r.lizard));
const inTrain = lizardPaired.filter((r) => trainIds.has(r.sampleId)).length;

const out = {
  _meta: {
    generated: new Date().toISOString(),
    description: 'DeLong paired AUROC significance test, OURS (recalibrated GodClass/FeatureEnvy detectors) vs each competitor on MLCQ human smell labels.',
    ourSignal: 'risk = -HealthResult.score from analyzeFile() with recalibrated detectors (recomputed live this session)',
    label: 'positive = MLCQ severityLabel in {minor,major,critical}; negative = none',
    pairing: 'DeLong is paired; each comparison uses only files where BOTH tools produced a numeric signal',
    provenance: {
      ours: 'recomputed this session over benchmark-data/mlcq/java_files/ with compiled recalibrated detectors',
      lizard: 'benchmark-data/competitive-raw.json (real lizard 1.22.2 runs, harness)',
      pmd: 'benchmark-data/_pmd-violations.csv (real PMD 7.10.0 run)',
      sonarqube: 'benchmark-data/_sonar-measures.json (real SonarQube 26.5 Community scan; 339/341 files)',
    },
    recompute: { recomputed, skippedTooLarge: skipped, godClassFired: gcCount, featureEnvyFired: feCount },
    inSampleOptimism: {
      note: 'GodClass/FeatureEnvy thresholds were tuned on the MLCQ recalibration TRAIN split; the DeLong test runs on the FULL MLCQ set, so part of OUR signal is in-sample for those two detectors.',
      lizardPairedN: lizardPaired.length,
      inTrainSplit: inTrain,
      fractionInTrain: Number((inTrain / lizardPaired.length).toFixed(3)),
    },
  },
  comparisons,
};

writeFileSync(join(REPO, 'benchmark-data', 'delong-significance.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
