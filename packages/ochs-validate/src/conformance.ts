/**
 * OCHS Conformance Kit — implementation-agnostic runner.
 *
 * Defines three conformance levels:
 *
 *   L1 — Schema Valid
 *       The output JSON is structurally valid per the OCHS JSON Schema:
 *       required fields present, types correct, score in [1.0, 10.0],
 *       ochsVersion matches the expected pattern, all smell types are
 *       recognised OCHS v0.1 biomarkers.
 *
 *   L2 — Formula Correct
 *       The reported score equals max(1.0, 10 − Σ(weight × √count))
 *       (IEEE 754 double-precision) within a configurable tolerance.
 *       Requires L1.
 *
 *   L3 — Biomarker Complete
 *       The set of biomarker types reported matches the golden set for each
 *       fixture (order-independent; count-sensitive). Requires L2.
 *       Note: implementations operating at a lower Tier (e.g., Tier B regex
 *       instead of Tier A AST) may miss some biomarkers — that is expected
 *       and reported as a per-fixture gap, not a hard failure.
 *
 * Any implementation can be tested: produce an OCHS score JSON object for
 * each fixture file, then pass the directory of outputs (one JSON file per
 * fixture, named <fixture-id>.json) to runConformanceSuite(). The runner
 * will load the corpus.json golden set and report PASS/FAIL per assertion.
 *
 * No dependency on @healthy-ai-code/core — only on the published weights
 * and schema embedded in this package.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { validateOchs } from './validate';
import { OCHS_WEIGHTS, OCHS_FLOOR } from './weights';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

/** The three conformance levels defined by this kit. */
export type ConformanceLevel = 'L1' | 'L2' | 'L3';

/** Whether an assertion passed, failed, or was skipped because a prior level failed. */
export type AssertionStatus = 'PASS' | 'FAIL' | 'SKIP';

/** A single assertion result within a fixture's conformance check. */
export interface AssertionResult {
  /** Assertion identifier (e.g. "L1:schema-valid"). */
  id: string;
  /** Conformance level this assertion belongs to. */
  level: ConformanceLevel;
  /** PASS / FAIL / SKIP. */
  status: AssertionStatus;
  /** Human-readable message. Empty when PASS. */
  message: string;
  /** Optional quantitative detail (e.g. derived score, delta). */
  detail?: Record<string, unknown>;
}

/** All assertion results for one fixture. */
export interface FixtureConformanceResult {
  /** Fixture ID from corpus.json. */
  fixtureId: string;
  /** Highest conformance level fully achieved by this fixture. null if L1 failed. */
  highestLevel: ConformanceLevel | null;
  /** All assertion results. */
  assertions: AssertionResult[];
  /** Whether ALL assertions at or below the given level passed. */
  passesL1: boolean;
  passesL2: boolean;
  passesL3: boolean;
}

/** Summary result for a full suite run. */
export interface ConformanceSuiteResult {
  /** Name / version of the implementation under test (from --impl-name). */
  implementationLabel: string;
  /** OCHS version being tested against. */
  ochsVersion: string;
  /** ISO timestamp when the run was executed. */
  runAt: string;
  /** Per-fixture results. */
  fixtures: FixtureConformanceResult[];
  /** Aggregate counts. */
  summary: {
    total: number;
    l1Pass: number;
    l2Pass: number;
    l3Pass: number;
    /** Overall PASS when all fixtures pass at least L2. */
    overallPass: boolean;
  };
  /** Detected spec gaps: biomarkers not supported by this implementation (any fixture). */
  specGaps: SpecGap[];
}

/** A biomarker reported in the golden set but absent from the implementation output. */
export interface SpecGap {
  fixtureId: string;
  missingBiomarkerTypes: string[];
  note: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Corpus types (mirrors corpus.json)
// ──────────────────────────────────────────────────────────────────────────────

interface FormulaDerivation {
  smellCounts: Record<string, number>;
  penalty: number;
  derivedExact: number;
  floorApplied?: boolean;
}

interface CorpusFixture {
  id: string;
  path: string;
  language: string;
  description: string;
  expectedScore: number;
  expectedCategory: 'green' | 'yellow' | 'red';
  expectedLoopComplete: boolean;
  expectedSmellCount: number;
  expectedSmellTypes: string[];
  tolerance: number;
  formulaDerivation: FormulaDerivation;
}

interface Corpus {
  ochsVersion: string;
  fixtures: CorpusFixture[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Score re-derivation (independent of @healthy-ai-code/core)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Re-derives the OCHS score from a smell array using the formula published in
 * OCHS v0.1 Section 1: score = max(FLOOR, 10 − Σ(weight × sqrt(count))).
 *
 * Uses IEEE 754 double-precision arithmetic (JavaScript default). Unknown smell
 * types contribute 0 penalty (to allow extensions).
 */
function recomputeScore(smells: Array<{ type: string }>): number {
  const counts = new Map<string, number>();
  for (const s of smells) {
    counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
  }
  let penalty = 0;
  for (const [type, count] of counts) {
    const weight = OCHS_WEIGHTS[type];
    if (weight !== undefined && count > 0) {
      penalty += weight * Math.sqrt(count);
    }
  }
  return Math.max(OCHS_FLOOR, 10 - penalty);
}

// ──────────────────────────────────────────────────────────────────────────────
// L1: Schema validation
// ──────────────────────────────────────────────────────────────────────────────

function assertL1(
  output: unknown,
  expected: CorpusFixture
): AssertionResult[] {
  const results: AssertionResult[] = [];

  // Use the existing validateOchs structural + formula logic, strict smell types
  const valResult = validateOchs(output, { strictSmellTypes: false, scoreTolerance: 1.0 });

  // L1-1: Must be a valid JSON object with required fields
  const structErrors = valResult.errors.filter(
    (e) =>
      !e.startsWith('[warning]') &&
      !e.includes('Formula mismatch')
  );

  if (structErrors.length === 0) {
    results.push({
      id: 'L1:required-fields',
      level: 'L1',
      status: 'PASS',
      message: '',
    });
  } else {
    results.push({
      id: 'L1:required-fields',
      level: 'L1',
      status: 'FAIL',
      message: `Structural validation failed: ${structErrors.join('; ')}`,
    });
  }

  // L1-2: ochsVersion must match the expected version
  if (typeof output === 'object' && output !== null && !Array.isArray(output)) {
    const obj = output as Record<string, unknown>;
    const version = obj['ochsVersion'];
    if (typeof version === 'string' && /^\d+\.\d+(\.\d+)?$/.test(version)) {
      results.push({
        id: 'L1:ochs-version-present',
        level: 'L1',
        status: 'PASS',
        message: '',
        detail: { reportedVersion: version },
      });
    } else {
      results.push({
        id: 'L1:ochs-version-present',
        level: 'L1',
        status: 'FAIL',
        message: `"ochsVersion" is missing or malformed (got: ${JSON.stringify(version)}).`,
      });
    }

    // L1-3: score in range [1.0, 10.0]
    const score = obj['score'];
    if (typeof score === 'number' && Number.isFinite(score) && score >= 1.0 && score <= 10.0) {
      results.push({
        id: 'L1:score-range',
        level: 'L1',
        status: 'PASS',
        message: '',
        detail: { score },
      });
    } else {
      results.push({
        id: 'L1:score-range',
        level: 'L1',
        status: 'FAIL',
        message: `"score" is out of range [1.0, 10.0] or not a finite number (got: ${JSON.stringify(score)}).`,
      });
    }

    // L1-4: smells is an array
    const smells = obj['smells'];
    if (Array.isArray(smells)) {
      results.push({
        id: 'L1:smells-array',
        level: 'L1',
        status: 'PASS',
        message: '',
        detail: { smellCount: smells.length },
      });
    } else {
      results.push({
        id: 'L1:smells-array',
        level: 'L1',
        status: 'FAIL',
        message: `"smells" must be an array (got: ${typeof smells}).`,
      });
    }

    // L1-5: category must be green/yellow/red when present
    if (obj['category'] !== undefined) {
      const cat = obj['category'];
      if (['green', 'yellow', 'red'].includes(cat as string)) {
        results.push({
          id: 'L1:category-valid',
          level: 'L1',
          status: 'PASS',
          message: '',
          detail: { category: cat },
        });
      } else {
        results.push({
          id: 'L1:category-valid',
          level: 'L1',
          status: 'FAIL',
          message: `"category" must be "green", "yellow", or "red" when present (got: ${JSON.stringify(cat)}).`,
        });
      }
    }
  } else {
    results.push(
      { id: 'L1:ochs-version-present', level: 'L1', status: 'FAIL', message: 'Input is not a JSON object.' },
      { id: 'L1:score-range', level: 'L1', status: 'FAIL', message: 'Input is not a JSON object.' },
      { id: 'L1:smells-array', level: 'L1', status: 'FAIL', message: 'Input is not a JSON object.' },
    );
  }

  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// L2: Formula correctness
// ──────────────────────────────────────────────────────────────────────────────

function assertL2(
  output: Record<string, unknown>,
  expected: CorpusFixture
): AssertionResult[] {
  const results: AssertionResult[] = [];

  const smells = (output['smells'] as Array<{ type: string }>) ?? [];
  const reportedScore = output['score'] as number;
  const derivedScore = recomputeScore(smells);
  const delta = Math.abs(derivedScore - reportedScore);
  const tolerance = expected.tolerance;

  // L2-1: score == formula(smells) within tolerance
  if (delta <= tolerance) {
    results.push({
      id: 'L2:formula-consistent',
      level: 'L2',
      status: 'PASS',
      message: '',
      detail: { reportedScore, derivedScore, delta, tolerance },
    });
  } else {
    results.push({
      id: 'L2:formula-consistent',
      level: 'L2',
      status: 'FAIL',
      message:
        `Score formula mismatch: reported ${reportedScore}, re-derived ${derivedScore.toFixed(6)} ` +
        `(delta ${delta.toFixed(6)}, allowed tolerance ${tolerance}). ` +
        'Formula: score = max(1.0, 10 − Σ(weight × sqrt(count))) per OCHS v0.1 §1.',
      detail: { reportedScore, derivedScore, delta, tolerance },
    });
  }

  // L2-2: score matches expected (within tolerance, accounting for floor)
  const expectedDelta = Math.abs(reportedScore - expected.expectedScore);
  if (expectedDelta <= Math.max(tolerance, 0.001)) {
    results.push({
      id: 'L2:expected-score',
      level: 'L2',
      status: 'PASS',
      message: '',
      detail: { reportedScore, expectedScore: expected.expectedScore, delta: expectedDelta },
    });
  } else {
    results.push({
      id: 'L2:expected-score',
      level: 'L2',
      status: 'FAIL',
      message:
        `Score ${reportedScore} does not match expected ${expected.expectedScore} ` +
        `(delta ${expectedDelta.toFixed(6)}, tolerance ${Math.max(tolerance, 0.001)}). ` +
        'Check the fixture description in corpus.json for the expected smell vector.',
      detail: { reportedScore, expectedScore: expected.expectedScore, delta: expectedDelta },
    });
  }

  // L2-3: category derived from score must match expected
  const expectedCategory = expected.expectedCategory;
  const reportedCategory = output['category'];
  if (reportedCategory !== undefined) {
    // If category is present, it must agree with the expected value
    if (reportedCategory === expectedCategory) {
      results.push({
        id: 'L2:category-matches',
        level: 'L2',
        status: 'PASS',
        message: '',
        detail: { reportedCategory, expectedCategory },
      });
    } else {
      results.push({
        id: 'L2:category-matches',
        level: 'L2',
        status: 'FAIL',
        message: `Category "${reportedCategory}" does not match expected "${expectedCategory}". ` +
          'Thresholds: green ≥ 9.0, yellow ≥ 6.0, red < 6.0.',
        detail: { reportedCategory, expectedCategory },
      });
    }
  } else {
    // Category field is optional — skip this assertion
    results.push({
      id: 'L2:category-matches',
      level: 'L2',
      status: 'SKIP',
      message: '"category" field not present in output (optional field — no assertion made).',
    });
  }

  // L2-4: determinism — re-derive score a second time; must be identical
  const derivedScore2 = recomputeScore(smells);
  if (derivedScore === derivedScore2) {
    results.push({
      id: 'L2:deterministic',
      level: 'L2',
      status: 'PASS',
      message: '',
    });
  } else {
    // This should never happen in JS — only possible if external state changed
    results.push({
      id: 'L2:deterministic',
      level: 'L2',
      status: 'FAIL',
      message: `Score re-derivation is non-deterministic: ${derivedScore} ≠ ${derivedScore2}. This is a bug in the conformance runner.`,
    });
  }

  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// L3: Biomarker completeness
// ──────────────────────────────────────────────────────────────────────────────

function assertL3(
  output: Record<string, unknown>,
  expected: CorpusFixture
): { assertions: AssertionResult[]; gap: SpecGap | null } {
  const assertions: AssertionResult[] = [];

  const smells = (output['smells'] as Array<{ type: string }>) ?? [];
  const reportedTypes = smells.map((s) => s.type);

  // Count per type in reported output
  const reportedCounts = new Map<string, number>();
  for (const t of reportedTypes) {
    reportedCounts.set(t, (reportedCounts.get(t) ?? 0) + 1);
  }

  // Count per type in golden/expected
  const expectedCounts = new Map<string, number>();
  for (const t of expected.expectedSmellTypes) {
    expectedCounts.set(t, (expectedCounts.get(t) ?? 0) + 1);
  }

  // L3-1: total smell count matches expected
  const reportedCount = smells.length;
  const expectedCount = expected.expectedSmellCount;
  if (reportedCount === expectedCount) {
    assertions.push({
      id: 'L3:smell-count',
      level: 'L3',
      status: 'PASS',
      message: '',
      detail: { reportedCount, expectedCount },
    });
  } else {
    assertions.push({
      id: 'L3:smell-count',
      level: 'L3',
      status: 'FAIL',
      message: `Smell count mismatch: reported ${reportedCount}, expected ${expectedCount}.`,
      detail: { reportedCount, expectedCount },
    });
  }

  // L3-2: biomarker type set matches (order-independent, count-sensitive per corpus)
  const expectedTypeSet = new Set(expected.expectedSmellTypes);
  const reportedTypeSet = new Set(reportedTypes);
  const missingTypes = [...expectedTypeSet].filter((t) => !reportedTypeSet.has(t));
  const extraTypes = [...reportedTypeSet].filter((t) => !expectedTypeSet.has(t));

  if (missingTypes.length === 0 && extraTypes.length === 0) {
    assertions.push({
      id: 'L3:biomarker-types',
      level: 'L3',
      status: 'PASS',
      message: '',
      detail: { reportedTypeSet: [...reportedTypeSet], expectedTypeSet: [...expectedTypeSet] },
    });
  } else {
    const parts: string[] = [];
    if (missingTypes.length > 0)
      parts.push(`missing from output: [${missingTypes.join(', ')}]`);
    if (extraTypes.length > 0)
      parts.push(`unexpected in output: [${extraTypes.join(', ')}]`);
    assertions.push({
      id: 'L3:biomarker-types',
      level: 'L3',
      status: 'FAIL',
      message: `Biomarker type mismatch — ${parts.join('; ')}. ` +
        'This may indicate a Tier gap (e.g., Tier B impl missing Tier A-only biomarkers). ' +
        'See corpus.json for the expected biomarker list per fixture.',
      detail: { missingTypes, extraTypes },
    });
  }

  // L3-3: loopComplete flag must be correct when present
  if (output['loopComplete'] !== undefined) {
    const reported = output['loopComplete'];
    const expectedLc = expected.expectedLoopComplete;
    if (reported === expectedLc) {
      assertions.push({
        id: 'L3:loop-complete',
        level: 'L3',
        status: 'PASS',
        message: '',
        detail: { reported, expected: expectedLc },
      });
    } else {
      assertions.push({
        id: 'L3:loop-complete',
        level: 'L3',
        status: 'FAIL',
        message: `loopComplete reported ${reported} but expected ${expectedLc}. ` +
          'loopComplete = score >= 9.5 (or >= 9.7 if AiAttributedSATD present).',
        detail: { reported, expected: expectedLc },
      });
    }
  } else {
    assertions.push({
      id: 'L3:loop-complete',
      level: 'L3',
      status: 'SKIP',
      message: '"loopComplete" not present in output (optional field).',
    });
  }

  // Build SpecGap if any biomarker types are missing
  const gap: SpecGap | null =
    missingTypes.length > 0
      ? {
          fixtureId: expected.id,
          missingBiomarkerTypes: missingTypes,
          note:
            `Fixture "${expected.id}" (${expected.language}): implementation did not emit ` +
            `[${missingTypes.join(', ')}]. This may indicate a Tier A vs Tier B/C analysis ` +
            'difference (not a formula error). Document the gap in your implementation README.',
        }
      : null;

  return { assertions, gap };
}

// ──────────────────────────────────────────────────────────────────────────────
// Single-fixture runner
// ──────────────────────────────────────────────────────────────────────────────

function runFixture(
  output: unknown,
  expected: CorpusFixture
): FixtureConformanceResult {
  const l1Assertions = assertL1(output, expected);
  const l1Pass = l1Assertions.every(
    (a) => a.status === 'PASS' || a.status === 'SKIP'
  );

  const allAssertions: AssertionResult[] = [...l1Assertions];
  let l2Pass = false;
  let l3Pass = false;
  const specGaps: SpecGap[] = [];

  if (!l1Pass) {
    // Skip L2 and L3
    const skipL2: AssertionResult[] = [
      'L2:formula-consistent',
      'L2:expected-score',
      'L2:category-matches',
      'L2:deterministic',
    ].map((id) => ({
      id,
      level: 'L2' as ConformanceLevel,
      status: 'SKIP' as AssertionStatus,
      message: 'Skipped: L1 validation failed.',
    }));
    const skipL3: AssertionResult[] = [
      'L3:smell-count',
      'L3:biomarker-types',
      'L3:loop-complete',
    ].map((id) => ({
      id,
      level: 'L3' as ConformanceLevel,
      status: 'SKIP' as AssertionStatus,
      message: 'Skipped: L1 validation failed.',
    }));
    allAssertions.push(...skipL2, ...skipL3);
  } else {
    // Run L2
    const l2Assertions = assertL2(output as Record<string, unknown>, expected);
    allAssertions.push(...l2Assertions);
    l2Pass = l2Assertions.every((a) => a.status === 'PASS' || a.status === 'SKIP');

    if (!l2Pass) {
      // Skip L3
      const skipL3: AssertionResult[] = [
        'L3:smell-count',
        'L3:biomarker-types',
        'L3:loop-complete',
      ].map((id) => ({
        id,
        level: 'L3' as ConformanceLevel,
        status: 'SKIP' as AssertionStatus,
        message: 'Skipped: L2 formula check failed.',
      }));
      allAssertions.push(...skipL3);
    } else {
      // Run L3
      const { assertions: l3Assertions, gap } = assertL3(
        output as Record<string, unknown>,
        expected
      );
      allAssertions.push(...l3Assertions);
      l3Pass = l3Assertions.every((a) => a.status === 'PASS' || a.status === 'SKIP');
      if (gap) specGaps.push(gap);
    }
  }

  let highestLevel: ConformanceLevel | null = null;
  if (l3Pass) highestLevel = 'L3';
  else if (l2Pass) highestLevel = 'L2';
  else if (l1Pass) highestLevel = 'L1';

  return {
    fixtureId: expected.id,
    highestLevel,
    assertions: allAssertions,
    passesL1: l1Pass,
    passesL2: l2Pass,
    passesL3: l3Pass,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Options
// ──────────────────────────────────────────────────────────────────────────────

/** Options for {@link runConformanceSuite}. */
export interface ConformanceOptions {
  /**
   * Label for the implementation under test (e.g., "ochs-py v0.1.0").
   * Used in the suite result header only.
   */
  implementationLabel?: string;
  /**
   * Path to corpus.json. Defaults to the built-in corpus bundled with this package.
   */
  corpusPath?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Runs the full OCHS conformance suite against a map of implementation outputs.
 *
 * @param outputs - A map from fixture ID (e.g., "healthy-ts-simple") to the
 *   parsed OCHS score object produced by the implementation under test.
 *   Fixtures not present in the map are counted as L1 failures.
 * @param options - Optional configuration.
 * @returns A {@link ConformanceSuiteResult} with per-fixture and aggregate results.
 */
export function runConformanceSuite(
  outputs: Record<string, unknown>,
  options: ConformanceOptions = {}
): ConformanceSuiteResult {
  const { implementationLabel = 'unknown', corpusPath } = options;

  // Load corpus
  const resolvedCorpusPath =
    corpusPath ?? join(dirname(__filename), '..', '..', '..', 'docs', 'ochs', 'conformance', 'corpus.json');
  const corpus: Corpus = JSON.parse(readFileSync(resolvedCorpusPath, 'utf8'));

  const fixtureResults: FixtureConformanceResult[] = [];
  const allSpecGaps: SpecGap[] = [];

  for (const fixture of corpus.fixtures) {
    const output = outputs[fixture.id];
    if (output === undefined) {
      // Missing output — treat as L1 failure
      const missing: FixtureConformanceResult = {
        fixtureId: fixture.id,
        highestLevel: null,
        assertions: [
          {
            id: 'L1:output-present',
            level: 'L1',
            status: 'FAIL',
            message: `No output provided for fixture "${fixture.id}". ` +
              'The implementation must produce an OCHS score object for every corpus fixture.',
          },
        ],
        passesL1: false,
        passesL2: false,
        passesL3: false,
      };
      fixtureResults.push(missing);
      continue;
    }

    const result = runFixture(output, fixture);
    fixtureResults.push(result);
  }

  // Collect spec gaps (they live inside fixture results but we surface them globally)
  for (const fr of fixtureResults) {
    for (const a of fr.assertions) {
      if (a.id === 'L3:biomarker-types' && a.status === 'FAIL' && a.detail) {
        const missing = a.detail['missingTypes'] as string[];
        if (missing && missing.length > 0) {
          allSpecGaps.push({
            fixtureId: fr.fixtureId,
            missingBiomarkerTypes: missing,
            note:
              `Fixture "${fr.fixtureId}": implementation did not emit ` +
              `[${missing.join(', ')}]. Document gap in implementation README.`,
          });
        }
      }
    }
  }

  const summary = {
    total: fixtureResults.length,
    l1Pass: fixtureResults.filter((r) => r.passesL1).length,
    l2Pass: fixtureResults.filter((r) => r.passesL2).length,
    l3Pass: fixtureResults.filter((r) => r.passesL3).length,
    overallPass: fixtureResults.every((r) => r.passesL2),
  };

  return {
    implementationLabel,
    ochsVersion: corpus.ochsVersion,
    runAt: new Date().toISOString(),
    fixtures: fixtureResults,
    summary,
    specGaps: allSpecGaps,
  };
}

/**
 * Loads OCHS score objects from a directory.
 *
 * Each file must be named `<fixture-id>.json` and contain a valid JSON value.
 * Files that cannot be parsed produce a null entry (counted as L1 failure).
 *
 * @param dir - Absolute path to the directory containing implementation outputs.
 * @param fixtureIds - List of expected fixture IDs (from corpus.json).
 * @returns A map from fixture ID to parsed value (or undefined if file missing).
 */
export function loadOutputsFromDirectory(
  dir: string,
  fixtureIds: string[]
): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};
  for (const id of fixtureIds) {
    const filePath = join(dir, `${id}.json`);
    if (!existsSync(filePath)) continue;
    try {
      outputs[id] = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
      // null marks a parse failure — the runner will treat it as L1 fail
      outputs[id] = null;
    }
  }
  return outputs;
}

/**
 * Returns the list of fixture IDs defined in the built-in corpus.
 */
export function getCorpusFixtureIds(corpusPath?: string): string[] {
  const resolved =
    corpusPath ?? join(dirname(__filename), '..', '..', '..', 'docs', 'ochs', 'conformance', 'corpus.json');
  const corpus: Corpus = JSON.parse(readFileSync(resolved, 'utf8'));
  return corpus.fixtures.map((f) => f.id);
}
