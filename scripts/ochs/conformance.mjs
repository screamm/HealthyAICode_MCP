/**
 * OCHS Conformance Kit — scripts/ochs/conformance.mjs
 *
 * Usage:
 *   node scripts/ochs/conformance.mjs                        # run all corpus fixtures
 *   node scripts/ochs/conformance.mjs <filePath> <language>  # score a single file
 *
 * For a single-file run the script emits an OCHS-conformant score object on stdout (JSON).
 * For the corpus run it checks each fixture against its expected score and exits 1 if any fail.
 *
 * OCHS v0.1 spec:
 *   score = 10 - Σ(avgEffectiveWeight × sqrt(count))   per smell type
 *   floor = 1.0
 *   Weights: see packages/core/src/scoring/weights.ts
 *
 * ISO 25010 mapping summary (see docs/ochs/SPEC.md for full table):
 *   security biomarkers → ISO 25010 Security
 *   complexity/nesting  → ISO 25010 Analysability
 *   duplication         → ISO 25010 Reusability
 *   documentation       → ISO 25010 Analysability
 *   LLM-integration     → ISO 25010 Maintainability (AI-native sub-characteristic)
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const require = createRequire(import.meta.url);
/** @type {{ analyzeCode: Function, analyzeFile: Function }} */
const core = require(join(ROOT, 'packages', 'core', 'dist', 'index.js'));

// ── OCHS spec constants ────────────────────────────────────────────────────────
const OCHS_VERSION = '0.1';
const THRESHOLDS = { aiReady: 9.5, healthy: 9.0, problematic: 6.0 };

/**
 * Builds an OCHS-conformant score object from a HealthResult returned by analyzeCode/analyzeFile.
 *
 * The output shape is the stable OCHS v0.1 wire format. Conformant implementations must emit
 * at minimum: ochsVersion, toolVersion, language, score, category, aiReady, smells[].
 *
 * @param {import('../../packages/core/dist/index.js').HealthResult} result
 * @param {string} filePath  Path as passed to the analyser (used for reproducibility tracking).
 * @returns {OchsScoreObject}
 */
function toOchsObject(result, filePath) {
  return {
    ochsVersion: OCHS_VERSION,
    toolVersion: getToolVersion(),
    filePath,
    language: result.language,
    score: result.score,
    category: result.category,
    aiReady: result.score >= THRESHOLDS.aiReady,
    thresholds: THRESHOLDS,
    smells: result.smells.map((s) => ({
      type: s.type,
      severity: s.severity,
      line: s.line,
      functionName: s.functionName ?? null,
      description: s.description,
      suggestion: s.suggestion,
    })),
    metrics: result.metrics,
    subscores: result.subscores,
  };
}

/** Reads the core package version from its package.json. Returns 'unknown' on error. */
function getToolVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, 'packages', 'core', 'package.json'), 'utf8'),
    );
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── Single-file mode ─────────────────────────────────────────────────────────
async function runSingleFile(filePath, language) {
  let result;
  if (language) {
    const code = readFileSync(filePath, 'utf8');
    result = core.analyzeCode(code, language, filePath);
  } else {
    result = await core.analyzeFile(filePath);
  }
  const ochs = toOchsObject(result, filePath);
  process.stdout.write(JSON.stringify(ochs, null, 2) + '\n');
}

// ── Corpus conformance run ────────────────────────────────────────────────────
async function runCorpus() {
  const corpusPath = join(ROOT, 'docs', 'ochs', 'conformance', 'corpus.json');
  const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const fixture of corpus.fixtures) {
    const absPath = join(ROOT, 'docs', 'ochs', 'conformance', fixture.path);
    let result;
    try {
      result = await core.analyzeFile(absPath);
    } catch (err) {
      console.error(`ERROR  ${fixture.id}: analysis threw: ${err.message}`);
      failed++;
      results.push({ id: fixture.id, status: 'ERROR', error: err.message });
      continue;
    }

    const ochs = toOchsObject(result, absPath);
    const scoreDiff = Math.abs(ochs.score - fixture.expectedScore);
    const scoreOk = scoreDiff <= fixture.tolerance;
    const categoryOk = ochs.category === fixture.expectedCategory;
    const smellCountOk = ochs.smells.length === fixture.expectedSmellCount;

    const ok = scoreOk && categoryOk && smellCountOk;
    const status = ok ? 'PASS' : 'FAIL';
    if (ok) passed++; else failed++;

    const detail = {
      id: fixture.id,
      status,
      score: { expected: fixture.expectedScore, actual: ochs.score, diff: scoreDiff },
      category: { expected: fixture.expectedCategory, actual: ochs.category },
      smellCount: { expected: fixture.expectedSmellCount, actual: ochs.smells.length },
      language: ochs.language,
    };
    results.push(detail);

    const icon = ok ? '✓' : '✗';
    const scoreStr = `score=${ochs.score} (expected ${fixture.expectedScore})`;
    const catStr = `category=${ochs.category}`;
    const smellStr = `smells=${ochs.smells.length} (expected ${fixture.expectedSmellCount})`;
    console.log(`${icon}  ${fixture.id.padEnd(38)} ${scoreStr}  ${catStr}  ${smellStr}`);
    if (!ok) {
      if (!scoreOk)      console.log(`   score mismatch: got ${ochs.score}, expected ${fixture.expectedScore} (tolerance ±${fixture.tolerance})`);
      if (!categoryOk)   console.log(`   category mismatch: got "${ochs.category}", expected "${fixture.expectedCategory}"`);
      if (!smellCountOk) console.log(`   smell count mismatch: got ${ochs.smells.length}, expected ${fixture.expectedSmellCount}`);
    }
  }

  console.log('');
  console.log(`OCHS conformance: ${passed}/${corpus.fixtures.length} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
const [, , filePath, language] = process.argv;

if (filePath) {
  runSingleFile(filePath, language).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  runCorpus().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
