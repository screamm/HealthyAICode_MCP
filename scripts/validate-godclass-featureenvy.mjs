/**
 * Validate the recalibrated GodClass + FeatureEnvy detectors against MLCQ human labels,
 * using the ACTUAL compiled detectors (not a metric projection).
 *
 * For each MLCQ sample we parse its Java file, run detectGodClass / detectFeatureEnvy over
 * the whole tree, then attribute a detection to the sample if any reported smell line falls
 * inside the sample's [startLine, endLine] span (the smell is reported at the class/method
 * start line). This mirrors how the smell would surface in a real file analysis.
 *
 * Reports precision / recall / F1 on the TRAIN and HOLDOUT splits separately.
 * Run from project root:  node scripts/validate-godclass-featureenvy.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const Parser = require(resolve(root, 'packages/core/node_modules/tree-sitter'));
const Java = require(resolve(root, 'packages/core/node_modules/tree-sitter-java'));
const { detectGodClass, detectFeatureEnvy } = require(resolve(root, 'packages/core/dist/smells/god-class.js'));
const fe = require(resolve(root, 'packages/core/dist/smells/feature-envy.js'));
const { javaProfile } = require(resolve(root, 'packages/core/dist/smells/language-profile.js'));
const detectGod = require(resolve(root, 'packages/core/dist/smells/god-class.js')).detectGodClass;
const detectEnvy = fe.detectFeatureEnvy;

const parser = new Parser();
parser.setLanguage(Java);

const manifest = JSON.parse(readFileSync(join(root, 'benchmark-data/mlcq/mlcq-manifest.json'), 'utf8'));
const split = JSON.parse(readFileSync(join(root, 'benchmark-data/mlcq/holdout-split.json'), 'utf8'));
const train = new Set(split.train), holdout = new Set(split.holdout);
const javaDir = join(root, 'benchmark-data/mlcq/java_files');
const EMPTY = new Set();

function detectionInRange(smells, type, startLine, endLine) {
  // smell.line is 1-based, attributed to class/method start. Accept if it lies within the
  // sample span (inclusive), with a small tolerance for the start line.
  return smells.some(s => s.type === type && s.line >= startLine && s.line <= endLine);
}

// A continuous ranking score per sample, derived from the metric-distributions metrics so
// AUROC reflects the chosen detector's separating signal (signal-count for GodClass;
// foreign-minus-own call margin for FeatureEnvy).
const dist = JSON.parse(readFileSync(join(root, 'benchmark-data/mlcq/metric-distributions.json'), 'utf8'));
const distById = new Map(dist.map(d => [d.sampleId + ':' + d.smellType, d.metrics]));

const rows = [];
for (const sample of manifest) {
  if (sample.smellType !== 'blob' && sample.smellType !== 'feature envy') continue;
  const isPositive = sample.severityLabel !== 'none';
  let code;
  try { code = readFileSync(join(javaDir, sample.localFile.replace('java_files/', '')), 'utf8'); }
  catch { continue; }
  let tree;
  try { tree = parser.parse(code); } catch { continue; }
  const type = sample.smellType === 'blob' ? 'GodClass' : 'FeatureEnvy';
  const smells = type === 'GodClass'
    ? detectGod(tree.rootNode, EMPTY, javaProfile)
    : detectEnvy(tree.rootNode, EMPTY, javaProfile);
  const predicted = detectionInRange(smells, type, sample.startLine, sample.endLine);
  const m = distById.get(sample.sampleId + ':' + type);
  let score = 0;
  if (m) {
    score = type === 'GodClass'
      ? (m.wmc >= 47 ? 1 : 0) + (m.lcom4 > 3 ? 1 : 0) + (m.numMethods >= 8 ? 1 : 0)
      : (m.foreignMethodCallCount - m.ownMethodCalls);
  }
  rows.push({ sampleId: sample.sampleId, type, isPositive, predicted, score });
}

function auroc(subset) {
  const pos = subset.filter(r => r.isPositive).map(r => r.score);
  const neg = subset.filter(r => !r.isPositive).map(r => r.score);
  if (!pos.length || !neg.length) return null;
  let c = 0;
  for (const p of pos) for (const n of neg) { if (p > n) c++; else if (p === n) c += 0.5; }
  return c / (pos.length * neg.length);
}

function metrics(subset) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of subset) {
    if (r.predicted && r.isPositive) tp++;
    else if (r.predicted && !r.isPositive) fp++;
    else if (!r.predicted && r.isPositive) fn++;
    else tn++;
  }
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const rec = tp + fn ? tp / (tp + fn) : 0;
  const f1 = prec + rec ? 2 * prec * rec / (prec + rec) : 0;
  return { tp, fp, fn, tn, prec, rec, f1, n: subset.length };
}

function report(type) {
  const all = rows.filter(r => r.type === type);
  const tr = all.filter(r => train.has(r.sampleId));
  const ho = all.filter(r => holdout.has(r.sampleId));
  const fmt = m => `P=${m.prec.toFixed(3)} R=${m.rec.toFixed(3)} F1=${m.f1.toFixed(3)} (tp=${m.tp} fp=${m.fp} fn=${m.fn} tn=${m.tn}, n=${m.n})`;
  console.log(`\n=== ${type} (REAL detector vs MLCQ human labels) ===`);
  console.log('  TRAIN  :', fmt(metrics(tr)), 'AUROC=' + (auroc(tr)?.toFixed(3) ?? 'n/a'));
  console.log('  HOLDOUT:', fmt(metrics(ho)), 'AUROC=' + (auroc(ho)?.toFixed(3) ?? 'n/a'));
  console.log('  ALL    :', fmt(metrics(all)), 'AUROC=' + (auroc(all)?.toFixed(3) ?? 'n/a'));
}

report('GodClass');
report('FeatureEnvy');

// Micro across both smells (overall MLCQ)
function micro(subset) { return metrics(subset); }
const allHold = rows.filter(r => holdout.has(r.sampleId));
const allTrain = rows.filter(r => train.has(r.sampleId));
console.log('\n=== OVERALL MLCQ micro (GodClass + FeatureEnvy) ===');
const f = m => `P=${m.prec.toFixed(3)} R=${m.rec.toFixed(3)} F1=${m.f1.toFixed(3)} (tp=${m.tp} fp=${m.fp} fn=${m.fn} tn=${m.tn}, n=${m.n})`;
console.log('  TRAIN  :', f(micro(allTrain)));
console.log('  HOLDOUT:', f(micro(allHold)));
