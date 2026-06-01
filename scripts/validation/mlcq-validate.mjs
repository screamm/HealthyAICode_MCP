/**
 * MLCQ external calibration — run OUR smell detectors against HUMAN severity labels.
 *
 * Dataset: MLCQ (Madeyski & Lewowski, EASE 2020; Zenodo DOI 10.5281/zenodo.3666840).
 * Human reviewers rated real Java code elements for four smell types with a severity
 * label (none / minor / major / critical). We treat severity != "none" as a positive
 * ("is this a smell?") and run our detectors on the SAME Java source files.
 *
 * This is EXTERNAL validation: the ground truth is human judgement, not our own score
 * and not a git-bug-fix proxy. Scope is Java-only (the only language MLCQ covers).
 *
 * For each labeled sample we:
 *   1. analyzeCode() the downloaded Java file (whole-file analysis),
 *   2. keep only the smell types that map to the MLCQ smell type,
 *   3. count a DETECTION if any such smell falls inside the labeled [startLine,endLine]
 *      range (range-overlap; multiple labeled elements can live in one file),
 *   4. build a graded intensity score (sum of severity weights of matching smells in
 *      range) for AUROC.
 *
 * Outputs precision / recall / F1 and AUROC per smell type plus a confusion matrix.
 * Read-only consumer of @healthy-ai-code/core — does not touch core scoring.
 *
 * Usage: node scripts/validation/mlcq-validate.mjs [--json]
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const MLCQ_DIR = join(REPO_ROOT, 'benchmark-data', 'mlcq');
const MANIFEST = join(MLCQ_DIR, 'mlcq-manifest.json');

const core = require(join(REPO_ROOT, 'packages', 'core', 'dist', 'index.js'));
const { analyzeCode, computeAUROC } = core;

/**
 * Map each MLCQ smell type to the set of our detector SmellType identifiers that
 * represent the same concept. Documented mapping (per task brief):
 *   blob          -> GodClass                       (a "blob" / god class)
 *   long method   -> ComplexMethod, BrainMethod, LargeMethod, CognitiveComplexity
 *   feature envy  -> FeatureEnvy
 *   data class    -> DataClumps, PrimitiveObsession  (missing-abstraction primitives)
 */
const SMELL_MAP = {
  blob: ['GodClass'],
  'long method': ['ComplexMethod', 'BrainMethod', 'LargeMethod', 'CognitiveComplexity'],
  'feature envy': ['FeatureEnvy'],
  'data class': ['DataClumps', 'PrimitiveObsession'],
};

const SEVERITY_WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };

/** True when a smell at `smellLine` falls inside the labeled element range.
 *  GodClass/DataClumps are class-level: the detector reports the class/decl line, which
 *  for MLCQ aligns with startLine. We allow a small slack before startLine because some
 *  detectors report the line of an annotation/javadoc just above the declaration. */
function inRange(smellLine, startLine, endLine) {
  if (typeof smellLine !== 'number') return false;
  const SLACK = 3;
  return smellLine >= startLine - SLACK && smellLine <= endLine + SLACK;
}

function fmt(n, d = 4) {
  return Number.isFinite(n) ? n.toFixed(d) : 'NaN';
}

function main() {
  if (!existsSync(MANIFEST)) {
    console.error(`Manifest not found: ${MANIFEST}`);
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf-8'));

  // Cache analyzeCode per file so we analyze each of the 341 files once.
  const analysisCache = new Map();
  function analyze(localFile) {
    if (analysisCache.has(localFile)) return analysisCache.get(localFile);
    const abs = join(MLCQ_DIR, localFile);
    let result;
    try {
      const code = readFileSync(abs, 'utf-8');
      result = analyzeCode(code, 'java', localFile);
    } catch (err) {
      result = { smells: [], _error: String(err) };
    }
    analysisCache.set(localFile, result);
    return result;
  }

  const perSmell = {};
  for (const smellType of Object.keys(SMELL_MAP)) {
    perSmell[smellType] = { samples: [] };
  }

  let analyzed = 0;
  let missing = 0;
  for (const entry of manifest) {
    const { smellType, severityLabel, localFile, startLine, endLine } = entry;
    if (!SMELL_MAP[smellType]) continue;
    if (!existsSync(join(MLCQ_DIR, localFile))) {
      missing++;
      continue;
    }
    const result = analyze(localFile);
    const ourTypes = new Set(SMELL_MAP[smellType]);
    const matching = result.smells.filter(
      (s) => ourTypes.has(s.type) && inRange(s.line, startLine, endLine ?? Number.MAX_SAFE_INTEGER),
    );
    const detected = matching.length > 0;
    const intensity = matching.reduce((acc, s) => acc + (SEVERITY_WEIGHT[s.severity] ?? 1), 0);
    const isPositive = severityLabel !== 'none';
    perSmell[smellType].samples.push({ isPositive, detected, intensity, severityLabel });
    analyzed++;
  }

  // Compute metrics per smell type.
  const report = { dataset: 'MLCQ', language: 'java', totalSamples: analyzed, missingFiles: missing, perSmell: {} };
  let aggTP = 0, aggFP = 0, aggFN = 0, aggTN = 0;
  for (const [smellType, { samples }] of Object.entries(perSmell)) {
    let tp = 0, fp = 0, fn = 0, tn = 0;
    for (const s of samples) {
      if (s.isPositive && s.detected) tp++;
      else if (!s.isPositive && s.detected) fp++;
      else if (s.isPositive && !s.detected) fn++;
      else tn++;
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    // core's computeAUROC follows the Defects4J convention where a LOWER score predicts
    // the positive class (lower health => buggy). Our smell intensity is the opposite —
    // a HIGHER intensity means "more likely a smell". Negate the intensity so the score
    // orientation matches computeAUROC's contract; the returned value is then a proper
    // "higher intensity ranks positive samples above negatives" AUROC.
    const auroc = computeAUROC(
      samples.map((s) => -s.intensity),
      samples.map((s) => s.isPositive),
    );
    report.perSmell[smellType] = {
      n: samples.length,
      positives: tp + fn,
      negatives: tn + fp,
      confusion: { tp, fp, fn, tn },
      precision,
      recall,
      f1,
      auroc,
    };
    aggTP += tp; aggFP += fp; aggFN += fn; aggTN += tn;
  }
  const microP = aggTP + aggFP === 0 ? 0 : aggTP / (aggTP + aggFP);
  const microR = aggTP + aggFN === 0 ? 0 : aggTP / (aggTP + aggFN);
  const microF1 = microP + microR === 0 ? 0 : (2 * microP * microR) / (microP + microR);
  report.micro = { confusion: { tp: aggTP, fp: aggFP, fn: aggFN, tn: aggTN }, precision: microP, recall: microR, f1: microF1 };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Human-readable output.
  console.log(`MLCQ external validation — ${report.totalSamples} samples analyzed (${report.missingFiles} missing files skipped)`);
  console.log('Ground truth: human severity labels (severity != "none" => positive). Language: Java only.\n');
  const hdr = ['smell type', 'n', 'pos', 'neg', 'TP', 'FP', 'FN', 'TN', 'precision', 'recall', 'F1', 'AUROC'];
  console.log(hdr.join('\t'));
  for (const [st, m] of Object.entries(report.perSmell)) {
    console.log([
      st, m.n, m.positives, m.negatives,
      m.confusion.tp, m.confusion.fp, m.confusion.fn, m.confusion.tn,
      fmt(m.precision), fmt(m.recall), fmt(m.f1), fmt(m.auroc),
    ].join('\t'));
  }
  console.log('\nMicro-averaged (all four smell types pooled):');
  console.log(`  precision=${fmt(report.micro.precision)} recall=${fmt(report.micro.recall)} F1=${fmt(report.micro.f1)}`);
  console.log(`  confusion: TP=${aggTP} FP=${aggFP} FN=${aggFN} TN=${aggTN}`);
}

main();
