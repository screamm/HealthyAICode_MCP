/**
 * Extract raw GodClass and FeatureEnvy metrics from MLCQ Java files.
 * Produces benchmark-data/mlcq/metric-distributions.json
 *
 * Runs from project root: node scripts/extract-mlcq-metrics.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Load tree-sitter from core package node_modules
const Parser = require(resolve(projectRoot, 'packages/core/node_modules/tree-sitter'));
const Java = require(resolve(projectRoot, 'packages/core/node_modules/tree-sitter-java'));

const parser = new Parser();
parser.setLanguage(Java);

// ---------------------------------------------------------------------------
// Reproduce exactly the gate conditions from the source detectors
// ---------------------------------------------------------------------------
const ATFD_THRESHOLD = 5;
const WMC_THRESHOLD = 20;
const ENVY_RATIO = 0.6;
const MIN_FOREIGN_CALLS = 3;

// Java profile constants (from language-profile.ts)
const CLASS_TYPES = new Set(['class_declaration', 'interface_declaration', 'enum_declaration']);
const METHOD_TYPES = new Set(['method_declaration', 'constructor_declaration']);
const CONTROL_FLOW = new Set([
  'if_statement', 'for_statement', 'enhanced_for_statement',
  'while_statement', 'do_statement', 'switch_expression',
  'ternary_expression',
]);
const MEMBER_ACCESS = 'field_access';
const MEMBER_OBJECT_FIELD = 'object';
const SELF_KEYWORD = 'this';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNodes(node, typeSet, results = []) {
  if (typeSet.has(node.type)) results.push(node);
  for (const c of node.children) findNodes(c, typeSet, results);
  return results;
}

function countDecisions(node) {
  let c = CONTROL_FLOW.has(node.type) ? 1 : 0;
  for (const ch of node.children) c += countDecisions(ch);
  return c;
}

function collectFieldNamesFromClass(cls) {
  const names = [];
  // CORRECT: use cls.childForFieldName('body') — same fix as extractGodClassMetrics
  const body = cls.childForFieldName?.('body');
  if (!body) return names;
  for (const member of body.namedChildren) {
    if (member.type === 'field_declaration') {
      const decl = member.namedChildren.find(c => c.type === 'variable_declarator');
      const name = decl?.childForFieldName?.('name')?.text;
      if (name) names.push(name);
    }
  }
  return names;
}

function usesField(methodNode, fieldName) {
  return methodNode.text.includes(`${SELF_KEYWORD}.${fieldName}`);
}

function computeLCOM4(methods, cls) {
  if (methods.length === 0) return 0;
  const fieldNames = collectFieldNamesFromClass(cls);
  const adjacency = new Map();
  for (let i = 0; i < methods.length; i++) adjacency.set(i, new Set());

  for (const field of fieldNames) {
    const using = methods.map((m, i) => usesField(m, field) ? i : -1).filter(i => i >= 0);
    for (let i = 0; i < using.length; i++) {
      const a = using[i];
      for (const b of using.slice(i + 1)) {
        adjacency.get(a).add(b);
        adjacency.get(b).add(a);
      }
    }
  }

  // Count connected components
  const visited = new Set();
  let count = 0;
  for (let i = 0; i < methods.length; i++) {
    if (!visited.has(i)) {
      count++;
      // BFS
      const queue = [i];
      visited.add(i);
      while (queue.length > 0) {
        const cur = queue.shift();
        for (const nb of adjacency.get(cur)) {
          if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
        }
      }
    }
  }
  return count;
}

/**
 * Find all imported type names in a Java file's code.
 * We use simple regex since our detector uses this for ATFD matching.
 * The real code passes emptyNames (new Set()), so ATFD is always 0 for Java files.
 * We reproduce that behaviour exactly, but also compute a "field_access object" count
 * to show what ATFD *would* be if we had real import names.
 */
function findAllMemberAccessObjects(node, acc = new Set()) {
  if (node.type === MEMBER_ACCESS) {
    const obj = node.childForFieldName?.(MEMBER_ACCESS_OBJECT_FIELD);
    if (obj) acc.add(obj.text);
  }
  for (const c of node.children) findAllMemberAccessObjects(c, acc);
  return acc;
}

const MEMBER_ACCESS_OBJECT_FIELD = MEMBER_OBJECT_FIELD;

// Extract all member-access object names that aren't 'this'
function collectAllForeignCandidates(node, acc = new Set()) {
  if (node.type === MEMBER_ACCESS) {
    const obj = node.childForFieldName?.(MEMBER_OBJECT_FIELD);
    if (obj && obj.text !== SELF_KEYWORD) acc.add(obj.text);
  }
  for (const c of node.children) collectAllForeignCandidates(c, acc);
  return acc;
}

// Count field_access occurrences per object
function countForeignAccesses(node, importedNames, acc = new Map()) {
  if (node.type === MEMBER_ACCESS) {
    const obj = node.childForFieldName?.(MEMBER_OBJECT_FIELD);
    if (obj && importedNames.has(obj.text)) {
      acc.set(obj.text, (acc.get(obj.text) ?? 0) + 1);
    }
  }
  for (const c of node.children) countForeignAccesses(c, importedNames, acc);
  return acc;
}

// ---------------------------------------------------------------------------
// Extract GodClass metrics for one class node
// ---------------------------------------------------------------------------
function extractGodClassMetrics(cls) {
  // CORRECT: use cls.childForFieldName('body') to access class body directly
  // (the god-class.ts source iterates cls.namedChildren and calls c.childForFieldName('body')
  //  on each child — that always returns null because the body field is on the class node,
  //  not on its children — hence the WMC/numMethods bug)
  const classBody = cls.childForFieldName?.('body');
  const methods = classBody
    ? classBody.namedChildren.filter(m => METHOD_TYPES.has(m.type))
    : [];

  // WMC: sum of (control flow decisions + 1) per method
  const wmc = methods.reduce((t, m) => {
    const b = m.childForFieldName?.('body');
    return t + (b ? countDecisions(b) + 1 : 0);
  }, 0);

  // ATFD with empty importedNames (as in real code — always 0 for Java)
  const atfdReal = 0; // emptyNames = new Set() — exact reproduction

  // ATFD* = count of distinct non-this field_access objects in the class
  // (what ATFD *would be* with correct import resolution)
  const allForeignCandidates = collectAllForeignCandidates(cls);
  const atfdStar = allForeignCandidates.size;

  // LCOM4
  const lcom4 = computeLCOM4(methods, cls);

  // Field count
  const fieldNames = collectFieldNamesFromClass(cls);
  const numFields = fieldNames.length;
  const numMethods = methods.length;

  // Class line span
  const classLines = cls.endPosition.row - cls.startPosition.row + 1;

  return {
    atfd: atfdReal,       // as computed by detector (always 0 — emptyNames)
    atfdStar,             // distinct non-this field_access objects (upper bound)
    wmc,
    lcom4,
    numMethods,
    numFields,
    classLines,
    // Gate result as our detector computes it (atfd > 5 AND wmc >= 20 AND lcom4 > 1)
    gateWouldFire: atfdReal > ATFD_THRESHOLD && wmc >= WMC_THRESHOLD && lcom4 > 1,
  };
}

// ---------------------------------------------------------------------------
// Extract FeatureEnvy metrics for one method node
// ---------------------------------------------------------------------------
function extractFeatureEnvyMetrics(methodNode) {
  // Reproduce countCalls from feature-envy.ts
  // memberAccessNodeType = 'field_access', memberObjectField = 'object', selfKeyword = 'this'
  // BUT for Java method calls: method_invocation nodes use 'object' field for the receiver
  // The detector also checks for method_invocation with memberAccessNodeType='field_access'
  // Let's check what the Java profile actually uses:
  // memberAccessNodeType = 'field_access' — but Java method calls are 'method_invocation'
  // The countCalls function only looks at profile.memberAccessNodeType === 'field_access'
  // So for Java, it only counts field accesses, NOT method invocations with receivers

  // Count own (this.x accesses) and foreign (obj.x where obj is in importedNames)
  // Since importedNames is empty Set(), foreignCallCounts will always be empty
  // => Feature Envy never fires for Java either

  // What the detector actually counts:
  let ownCalls = 0; // this.x field accesses
  const foreignCandidates = new Map(); // object text -> count for non-this field_access

  function countCallsNode(node) {
    if (node.type === 'field_access') {
      const obj = node.childForFieldName?.('object');
      if (obj) {
        if (obj.text === 'this') {
          ownCalls++;
        } else {
          foreignCandidates.set(obj.text, (foreignCandidates.get(obj.text) ?? 0) + 1);
        }
      }
    }
    for (const c of node.children) countCallsNode(c);
  }
  countCallsNode(methodNode);

  // Also count method_invocation receivers (what devs think "calls" means)
  let ownMethodCalls = 0;
  const foreignMethodCandidates = new Map();

  function countMethodCallsNode(node) {
    if (node.type === 'method_invocation') {
      const obj = node.childForFieldName?.('object');
      if (obj) {
        if (obj.text === 'this') {
          ownMethodCalls++;
        } else {
          foreignMethodCandidates.set(obj.text, (foreignMethodCandidates.get(obj.text) ?? 0) + 1);
        }
      }
    }
    for (const c of node.children) countMethodCallsNode(c);
  }
  countMethodCallsNode(methodNode);

  const totalFieldAccesses = ownCalls + [...foreignCandidates.values()].reduce((s, c) => s + c, 0);
  const totalMethodCalls = ownMethodCalls + [...foreignMethodCandidates.values()].reduce((s, c) => s + c, 0);

  // Max foreign field access
  let maxForeignFieldType = '';
  let maxForeignFieldCount = 0;
  for (const [t, c] of foreignCandidates) {
    if (c > maxForeignFieldCount) { maxForeignFieldCount = c; maxForeignFieldType = t; }
  }

  // Max foreign method call
  let maxForeignMethodType = '';
  let maxForeignMethodCount = 0;
  for (const [t, c] of foreignMethodCandidates) {
    if (c > maxForeignMethodCount) { maxForeignMethodCount = c; maxForeignMethodType = t; }
  }

  // Detector's actual gate (importedNames = empty Set => foreignCallCounts always empty)
  const detectorForeignCount = 0; // emptyNames => nothing passes the importedNames check
  const detectorTotalCalls = ownCalls; // only own calls counted
  const gateWouldFire = false; // always false since detectorForeignCount = 0

  // What it WOULD be if we counted all non-this field_access as foreign:
  const pseudoForeignCount = maxForeignFieldCount;
  const pseudoTotalCalls = totalFieldAccesses;
  const pseudoRatio = pseudoTotalCalls > 0 ? pseudoForeignCount / pseudoTotalCalls : 0;
  const pseudoGate = pseudoForeignCount >= MIN_FOREIGN_CALLS && pseudoRatio >= ENVY_RATIO;

  // What it would be using method calls (the "correct" semantic interpretation):
  const methodForeignCount = maxForeignMethodCount;
  const methodTotalCalls = totalMethodCalls;
  const methodRatio = methodTotalCalls > 0 ? methodForeignCount / methodTotalCalls : 0;
  const methodGate = methodForeignCount >= MIN_FOREIGN_CALLS && methodRatio >= ENVY_RATIO;

  const methodLines = methodNode.endPosition.row - methodNode.startPosition.row + 1;

  return {
    // As computed by detector (always 0/false because importedNames=empty)
    detectorForeignFieldAccesses: detectorForeignCount,
    ownFieldAccesses: ownCalls,
    // Pseudo-foreign (all non-this field_access)
    pseudoForeignFieldCount: pseudoForeignCount,
    pseudoTotalFieldAccesses: totalFieldAccesses,
    pseudoForeignRatio: pseudoRatio,
    pseudoGateWouldFire: pseudoGate,
    // Method invocations (semantic FE)
    foreignMethodCallCount: methodForeignCount,
    ownMethodCalls: ownMethodCalls,
    totalMethodCalls: totalMethodCalls,
    foreignMethodRatio: methodRatio,
    methodGateWouldFire: methodGate,
    methodLines,
    gateWouldFire, // always false
  };
}

// ---------------------------------------------------------------------------
// Find class node closest to the MLCQ sample's line range
// ---------------------------------------------------------------------------
function findBestClassNode(rootNode, startLine, endLine) {
  // startLine/endLine are 1-based in manifest; tree-sitter uses 0-based rows
  const targetStart = startLine - 1;
  const targetEnd = endLine - 1;

  let best = null;
  let bestOverlap = -1;

  function visit(node) {
    if (CLASS_TYPES.has(node.type)) {
      const nStart = node.startPosition.row;
      const nEnd = node.endPosition.row;
      const overlapStart = Math.max(nStart, targetStart);
      const overlapEnd = Math.min(nEnd, targetEnd);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = node;
      }
    }
    for (const c of node.children) visit(c);
  }
  visit(rootNode);
  return best;
}

// ---------------------------------------------------------------------------
// Find method node closest to the MLCQ sample's line range
// ---------------------------------------------------------------------------
function findBestMethodNode(rootNode, startLine, endLine) {
  const targetStart = startLine - 1;
  const targetEnd = endLine - 1;

  let best = null;
  let bestOverlap = -1;

  function visit(node) {
    if (METHOD_TYPES.has(node.type)) {
      const nStart = node.startPosition.row;
      const nEnd = node.endPosition.row;
      const overlapStart = Math.max(nStart, targetStart);
      const overlapEnd = Math.min(nEnd, targetEnd);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = node;
      }
    }
    for (const c of node.children) visit(c);
  }
  visit(rootNode);
  return best;
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'benchmark-data/mlcq/mlcq-manifest.json'), 'utf8'));
const javaFilesDir = resolve(projectRoot, 'benchmark-data/mlcq/java_files');

const results = [];
let processed = 0;
let skipped = 0;

for (const sample of manifest) {
  if (sample.smellType !== 'blob' && sample.smellType !== 'feature envy') {
    continue;
  }

  const filePath = resolve(javaFilesDir, sample.localFile.replace('java_files/', ''));
  let code;
  try {
    code = readFileSync(filePath, 'utf8');
  } catch (e) {
    console.error(`SKIP: cannot read ${filePath}: ${e.message}`);
    skipped++;
    continue;
  }

  let tree;
  try {
    tree = parser.parse(code);
  } catch (e) {
    console.error(`SKIP: parse error ${filePath}: ${e.message}`);
    skipped++;
    continue;
  }

  const entry = {
    sampleId: sample.sampleId,
    smellType: sample.smellType === 'blob' ? 'GodClass' : 'FeatureEnvy',
    humanLabel: sample.severityLabel,
    isPositive: sample.severityLabel !== 'none',
    localFile: sample.localFile,
    codeName: sample.codeName,
    startLine: sample.startLine,
    endLine: sample.endLine,
  };

  if (sample.smellType === 'blob') {
    const cls = findBestClassNode(tree.rootNode, sample.startLine, sample.endLine);
    if (!cls) {
      entry.error = 'no class node found in range';
      entry.metrics = null;
      skipped++;
    } else {
      entry.metrics = extractGodClassMetrics(cls);
      entry.classNodeLine = cls.startPosition.row + 1;
    }
  } else {
    // feature envy — codeType is 'function'
    const method = findBestMethodNode(tree.rootNode, sample.startLine, sample.endLine);
    if (!method) {
      entry.error = 'no method node found in range';
      entry.metrics = null;
      skipped++;
    } else {
      entry.metrics = extractFeatureEnvyMetrics(method);
      entry.methodNodeLine = method.startPosition.row + 1;
    }
  }

  results.push(entry);
  processed++;
  if (processed % 20 === 0) process.stderr.write(`  processed ${processed}...\n`);
}

console.error(`Done: ${processed} processed, ${skipped} skipped`);

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------
const outPath = resolve(projectRoot, 'benchmark-data/mlcq/metric-distributions.json');
writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
console.error(`Written: ${outPath}`);

// ---------------------------------------------------------------------------
// Print summary statistics
// ---------------------------------------------------------------------------
function percentile(arr, p) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

function stats(arr) {
  if (arr.length === 0) return { n: 0, min: null, p50: null, p90: null, max: null, mean: null };
  return {
    n: arr.length,
    min: Math.min(...arr),
    mean: arr.reduce((s, v) => s + v, 0) / arr.length,
    p50: percentile(arr, 50),
    p90: percentile(arr, 90),
    max: Math.max(...arr),
  };
}

// GodClass stats
const godClasses = results.filter(r => r.smellType === 'GodClass' && r.metrics);
const gcPos = godClasses.filter(r => r.isPositive);
const gcNeg = godClasses.filter(r => !r.isPositive);

console.log('\n==============================');
console.log('GOD CLASS (blob) METRICS');
console.log('==============================');
for (const [label, group] of [['POSITIVES (minor+major+critical)', gcPos], ['NEGATIVES (none)', gcNeg]]) {
  console.log(`\n--- ${label} (n=${group.length}) ---`);
  for (const key of ['atfd', 'atfdStar', 'wmc', 'lcom4', 'numMethods', 'numFields', 'classLines']) {
    const vals = group.map(r => r.metrics[key]);
    const s = stats(vals);
    console.log(`  ${key.padEnd(14)}: min=${s.min} mean=${s.mean?.toFixed(1)} p50=${s.p50} p90=${s.p90} max=${s.max}`);
  }
  const fired = group.filter(r => r.metrics.gateWouldFire).length;
  console.log(`  gateWouldFire: ${fired}/${group.length} (${(100*fired/Math.max(group.length,1)).toFixed(1)}%)`);
}

console.log('\nGOD CLASS GATE: atfd > 5 AND wmc >= 20 AND lcom4 > 1');
console.log('  atfd is always 0 (importedNames = emptyNames in Java analyzer)');
console.log(`  Positive cases with WMC >= 20: ${gcPos.filter(r => r.metrics.wmc >= 20).length}/${gcPos.length}`);
console.log(`  Positive cases with LCOM4 > 1: ${gcPos.filter(r => r.metrics.lcom4 > 1).length}/${gcPos.length}`);

// FeatureEnvy stats
const feEnvies = results.filter(r => r.smellType === 'FeatureEnvy' && r.metrics);
const fePos = feEnvies.filter(r => r.isPositive);
const feNeg = feEnvies.filter(r => !r.isPositive);

console.log('\n==============================');
console.log('FEATURE ENVY METRICS');
console.log('==============================');
for (const [label, group] of [['POSITIVES (minor+major)', fePos], ['NEGATIVES (none)', feNeg]]) {
  console.log(`\n--- ${label} (n=${group.length}) ---`);
  for (const key of [
    'detectorForeignFieldAccesses', 'ownFieldAccesses', 'pseudoForeignFieldCount',
    'pseudoTotalFieldAccesses', 'pseudoForeignRatio',
    'foreignMethodCallCount', 'ownMethodCalls', 'totalMethodCalls',
    'foreignMethodRatio', 'methodLines'
  ]) {
    const vals = group.map(r => r.metrics[key]);
    const s = stats(vals);
    console.log(`  ${key.padEnd(28)}: min=${s.min?.toFixed?.(2)??s.min} mean=${s.mean?.toFixed(1)} p50=${s.p50?.toFixed?.(2)??s.p50} p90=${s.p90?.toFixed?.(2)??s.p90} max=${s.max?.toFixed?.(2)??s.max}`);
  }
  const fired = group.filter(r => r.metrics.gateWouldFire).length;
  const pseudoFired = group.filter(r => r.metrics.pseudoGateWouldFire).length;
  const methodFired = group.filter(r => r.metrics.methodGateWouldFire).length;
  console.log(`  detectorGateFires: ${fired}/${group.length} (always 0 — empty importedNames)`);
  console.log(`  pseudoGateFires (field_access, all non-this): ${pseudoFired}/${group.length} (${(100*pseudoFired/Math.max(group.length,1)).toFixed(1)}%)`);
  console.log(`  methodGateFires  (method_invocation):         ${methodFired}/${group.length} (${(100*methodFired/Math.max(group.length,1)).toFixed(1)}%)`);
}

console.log('\nFEATURE ENVY GATE: foreignCount >= 3 AND foreignCount/totalCalls >= 0.6');
console.log('  foreignCount is always 0 (importedNames = emptyNames in Java analyzer)');
