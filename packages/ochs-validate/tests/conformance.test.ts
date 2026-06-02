/**
 * Conformance kit tests.
 *
 * Tests the conformance runner itself (not the reference implementation) to
 * verify that:
 *
 *  1. Known-good OCHS objects pass all three levels.
 *  2. L1 failures block L2/L3 (SKIP cascading).
 *  3. L2 formula failures block L3.
 *  4. L3 biomarker mismatches are reported correctly.
 *  5. The full golden set from the built-in corpus (healthy + unhealthy fixtures)
 *     produces the expected overall PASS/FAIL per fixture when fed golden outputs.
 *  6. Spec gaps are surfaced for implementations that miss biomarkers.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  runConformanceSuite,
  loadOutputsFromDirectory,
  getCorpusFixtureIds,
  type ConformanceSuiteResult,
} from '../src/conformance';

// ──────────────────────────────────────────────────────────────────────────────
// Paths
// ──────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = join(__dirname, '..', '..', '..');
const CORPUS_PATH = join(REPO_ROOT, 'docs', 'ochs', 'conformance', 'corpus.json');
const GOLDEN_DIR = join(REPO_ROOT, 'docs', 'ochs', 'conformance', 'golden');

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Minimal OCHS object that should pass L1. */
function minimalValid(score = 10.0, smells: object[] = []): object {
  return { ochsVersion: '0.1', score, smells };
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. Runner with fully-correct golden fixtures
// ──────────────────────────────────────────────────────────────────────────────

describe('golden fixtures — reference implementation output', () => {
  let result: ConformanceSuiteResult;

  beforeAll(() => {
    // Load from the golden/ directory (pre-generated from reference implementation)
    const fixtureIds = getCorpusFixtureIds(CORPUS_PATH);
    const outputs = loadOutputsFromDirectory(GOLDEN_DIR, fixtureIds);
    result = runConformanceSuite(outputs, {
      implementationLabel: 'reference (@healthy-ai-code/core)',
      corpusPath: CORPUS_PATH,
    });
  });

  it('loads corpus without error', () => {
    expect(result).toBeDefined();
    expect(result.fixtures.length).toBeGreaterThan(0);
  });

  it('all fixtures pass at least L2 (overallPass is true)', () => {
    expect(result.summary.overallPass).toBe(true);
  });

  it('all fixtures pass L1', () => {
    expect(result.summary.l1Pass).toBe(result.summary.total);
  });

  it('all fixtures pass L2', () => {
    expect(result.summary.l2Pass).toBe(result.summary.total);
  });

  it('all fixtures pass L3', () => {
    // Reference implementation should achieve L3 on all fixtures
    expect(result.summary.l3Pass).toBe(result.summary.total);
    for (const fr of result.fixtures) {
      expect(fr.passesL3, `${fr.fixtureId} should pass L3`).toBe(true);
    }
  });

  it('reports no spec gaps for reference implementation', () => {
    expect(result.specGaps).toHaveLength(0);
  });

  it('healthy-ts-simple achieves highest level L3', () => {
    const fx = result.fixtures.find((f) => f.fixtureId === 'healthy-ts-simple');
    expect(fx).toBeDefined();
    expect(fx!.highestLevel).toBe('L3');
    expect(fx!.passesL1).toBe(true);
    expect(fx!.passesL2).toBe(true);
    expect(fx!.passesL3).toBe(true);
  });

  it('unhealthy-ts-complex (floor case) achieves L3', () => {
    const fx = result.fixtures.find((f) => f.fixtureId === 'unhealthy-ts-complex');
    expect(fx).toBeDefined();
    expect(fx!.passesL3).toBe(true);
  });

  it('unhealthy-ts-godclass (score 9.0, DuplicateCode only) achieves L3', () => {
    const fx = result.fixtures.find((f) => f.fixtureId === 'unhealthy-ts-godclass');
    expect(fx).toBeDefined();
    expect(fx!.passesL3).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. L1 failures
// ──────────────────────────────────────────────────────────────────────────────

describe('L1 failures block L2 and L3', () => {
  it('missing ochsVersion fails L1', () => {
    const outputs = { 'healthy-ts-simple': { score: 10.0, smells: [] } };
    const result = runConformanceSuite(outputs, { corpusPath: CORPUS_PATH });
    const fx = result.fixtures.find((f) => f.fixtureId === 'healthy-ts-simple')!;
    expect(fx.passesL1).toBe(false);
    // L2 and L3 must be SKIPped
    const l2 = fx.assertions.filter((a) => a.level === 'L2');
    expect(l2.every((a) => a.status === 'SKIP')).toBe(true);
    const l3 = fx.assertions.filter((a) => a.level === 'L3');
    expect(l3.every((a) => a.status === 'SKIP')).toBe(true);
  });

  it('score below 1.0 fails L1', () => {
    const outputs = { 'healthy-ts-simple': { ochsVersion: '0.1', score: 0.5, smells: [] } };
    const result = runConformanceSuite(outputs, { corpusPath: CORPUS_PATH });
    const fx = result.fixtures.find((f) => f.fixtureId === 'healthy-ts-simple')!;
    expect(fx.passesL1).toBe(false);
  });

  it('null output fails L1 with informative message', () => {
    const outputs = { 'healthy-ts-simple': null };
    const result = runConformanceSuite(outputs, { corpusPath: CORPUS_PATH });
    const fx = result.fixtures.find((f) => f.fixtureId === 'healthy-ts-simple')!;
    expect(fx.passesL1).toBe(false);
    expect(fx.assertions.some((a) => a.level === 'L1' && a.status === 'FAIL')).toBe(true);
  });

  it('missing fixture output counts as L1 failure', () => {
    // Provide no outputs at all
    const result = runConformanceSuite({}, { corpusPath: CORPUS_PATH });
    for (const fx of result.fixtures) {
      expect(fx.passesL1).toBe(false);
    }
    expect(result.summary.overallPass).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. L2 formula failures
// ──────────────────────────────────────────────────────────────────────────────

describe('L2 formula check', () => {
  it('reports score mismatch when reported score differs from formula', () => {
    // ComplexMethod x1 → derived = 10 - 1.5 = 8.5; report 9.9
    const outputs = {
      'healthy-ts-simple': {
        ochsVersion: '0.1',
        score: 9.9,
        smells: [{ type: 'ComplexMethod' }],
      },
    };
    const result = runConformanceSuite(outputs, { corpusPath: CORPUS_PATH });
    const fx = result.fixtures.find((f) => f.fixtureId === 'healthy-ts-simple')!;
    expect(fx.passesL2).toBe(false);
    const l3 = fx.assertions.filter((a) => a.level === 'L3');
    expect(l3.every((a) => a.status === 'SKIP')).toBe(true);
  });

  it('passes L2 when score matches formula exactly', () => {
    // healthy-ts-simple: no smells → score must be 10.0
    const outputs = { 'healthy-ts-simple': { ochsVersion: '0.1', score: 10.0, smells: [] } };
    const result = runConformanceSuite(outputs, { corpusPath: CORPUS_PATH });
    const fx = result.fixtures.find((f) => f.fixtureId === 'healthy-ts-simple')!;
    expect(fx.passesL2).toBe(true);
  });

  it('passes L2 for floor case (score 1.0 with heavy penalty)', () => {
    // Use the golden fixture for unhealthy-ts-complex
    const goldenPath = join(GOLDEN_DIR, 'unhealthy-ts-complex.json');
    const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
    const result = runConformanceSuite(
      { 'unhealthy-ts-complex': golden },
      { corpusPath: CORPUS_PATH }
    );
    const fx = result.fixtures.find((f) => f.fixtureId === 'unhealthy-ts-complex')!;
    expect(fx.passesL2).toBe(true);
  });

  it('L2 passes for unhealthy-py-complex within tolerance 0.05', () => {
    // Reference impl rounds to 5.8; exact formula gives 5.8343... — within tolerance
    const outputs = {
      'unhealthy-py-complex': {
        ochsVersion: '0.1',
        score: 5.8,
        smells: [
          { type: 'MagicNumber' },
          { type: 'MagicNumber' },
          { type: 'DeepNesting' },
          { type: 'LongParameterList' },
          { type: 'CognitiveComplexity' },
          { type: 'BrainMethod' },
        ],
      },
    };
    const result = runConformanceSuite(outputs, { corpusPath: CORPUS_PATH });
    const fx = result.fixtures.find((f) => f.fixtureId === 'unhealthy-py-complex')!;
    expect(fx.passesL2).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. L3 biomarker completeness
// ──────────────────────────────────────────────────────────────────────────────

describe('L3 biomarker completeness', () => {
  it('fails L3 when implementation emits fewer biomarkers than golden', () => {
    // unhealthy-ts-complex expects 8 distinct biomarker types (17 total smells).
    // Supply exactly 21× HardcodedCredential so penalty = 2.0*sqrt(21) ≈ 9.165
    // → floor applies → score = 1.0 — L2 formula check passes.
    // But only 1 biomarker type vs 8 expected → L3:biomarker-types fails.
    const smells = Array.from({ length: 21 }, () => ({ type: 'HardcodedCredential' }));
    const outputs = {
      'unhealthy-ts-complex': {
        ochsVersion: '0.1',
        score: 1.0,
        smells,
      },
    };
    const result = runConformanceSuite(outputs, { corpusPath: CORPUS_PATH });
    const fx = result.fixtures.find((f) => f.fixtureId === 'unhealthy-ts-complex')!;
    // L2 formula-consistent should pass (derived 1.0 == reported 1.0)
    const formulaAssertion = fx.assertions.find((a) => a.id === 'L2:formula-consistent')!;
    expect(formulaAssertion.status).toBe('PASS');
    // L2 expected-score passes too (reported 1.0 == expected 1.0, delta 0, tolerance 0)
    expect(fx.passesL2).toBe(true);
    expect(fx.passesL3).toBe(false);
    const l3 = fx.assertions.find((a) => a.id === 'L3:biomarker-types')!;
    expect(l3.status).toBe('FAIL');
    expect(result.specGaps.some((g) => g.fixtureId === 'unhealthy-ts-complex')).toBe(true);
  });

  it('passes L3 when biomarker types match exactly (order-independent)', () => {
    // healthy-ts-simple: 0 smells
    const outputs = { 'healthy-ts-simple': { ochsVersion: '0.1', score: 10.0, smells: [] } };
    const result = runConformanceSuite(outputs, { corpusPath: CORPUS_PATH });
    const fx = result.fixtures.find((f) => f.fixtureId === 'healthy-ts-simple')!;
    expect(fx.passesL3).toBe(true);
  });

  it('L3 smell-count assertion fails when count differs', () => {
    // unhealthy-ts-complex expects 17 smells total.
    // Provide a formula-correct vector (floor at 21× HardcodedCredential) but
    // emit only 21 smells instead of 17 → count assertion fires.
    // Additionally, the biomarker types won't match, so L3:biomarker-types also fails.
    const smells = Array.from({ length: 21 }, () => ({ type: 'HardcodedCredential' }));
    const outputs = {
      'unhealthy-ts-complex': {
        ochsVersion: '0.1',
        score: 1.0,
        smells,
      },
    };
    const result = runConformanceSuite(outputs, { corpusPath: CORPUS_PATH });
    const fx = result.fixtures.find((f) => f.fixtureId === 'unhealthy-ts-complex')!;
    // L2 passes (floor case)
    expect(fx.passesL2).toBe(true);
    // L3 smell-count fails (21 ≠ 17)
    const countAssertion = fx.assertions.find((a) => a.id === 'L3:smell-count')!;
    expect(countAssertion.status).toBe('FAIL');
    expect(countAssertion.detail?.['reportedCount']).toBe(21);
    expect(countAssertion.detail?.['expectedCount']).toBe(17);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Spec gap surfacing
// ──────────────────────────────────────────────────────────────────────────────

describe('spec gap detection', () => {
  it('surfaces missing biomarkers as spec gaps in suite result', () => {
    // Implementation only emits LowDocCoverage — missing 7 biomarker types
    const outputs = {
      'unhealthy-ts-complex': {
        ochsVersion: '0.1',
        score: 1.0,
        // Make sure floor still applies: LowDocCoverage alone cannot cause floor
        // Use many high-weight smells to force floor, while only listing one type
        smells: Array.from({ length: 30 }, () => ({ type: 'HardcodedCredential' })),
      },
    };
    const result = runConformanceSuite(outputs, { corpusPath: CORPUS_PATH });
    const gap = result.specGaps.find((g) => g.fixtureId === 'unhealthy-ts-complex');
    expect(gap).toBeDefined();
    expect(gap!.missingBiomarkerTypes.length).toBeGreaterThan(0);
    expect(gap!.note).toContain('unhealthy-ts-complex');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. loadOutputsFromDirectory
// ──────────────────────────────────────────────────────────────────────────────

describe('loadOutputsFromDirectory', () => {
  it('loads all golden files from the golden directory', () => {
    const fixtureIds = getCorpusFixtureIds(CORPUS_PATH);
    const outputs = loadOutputsFromDirectory(GOLDEN_DIR, fixtureIds);
    // All 8 fixtures should be loaded
    for (const id of fixtureIds) {
      expect(outputs[id]).toBeDefined();
    }
  });

  it('returns empty object for non-existent directory contents', () => {
    const outputs = loadOutputsFromDirectory(GOLDEN_DIR, ['non-existent-fixture-id']);
    expect(outputs['non-existent-fixture-id']).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Determinism of the runner itself
// ──────────────────────────────────────────────────────────────────────────────

describe('conformance runner determinism', () => {
  it('produces identical results when called twice with same inputs', () => {
    const fixtureIds = getCorpusFixtureIds(CORPUS_PATH);
    const outputs = loadOutputsFromDirectory(GOLDEN_DIR, fixtureIds);

    const result1 = runConformanceSuite(outputs, {
      implementationLabel: 'test',
      corpusPath: CORPUS_PATH,
    });
    const result2 = runConformanceSuite(outputs, {
      implementationLabel: 'test',
      corpusPath: CORPUS_PATH,
    });

    // Strip timestamps before comparing
    const strip = (r: ConformanceSuiteResult) => ({ ...r, runAt: '' });
    expect(strip(result1)).toEqual(strip(result2));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. getCorpusFixtureIds
// ──────────────────────────────────────────────────────────────────────────────

describe('getCorpusFixtureIds', () => {
  it('returns all 8 fixture IDs from corpus', () => {
    const ids = getCorpusFixtureIds(CORPUS_PATH);
    expect(ids).toHaveLength(8);
    expect(ids).toContain('healthy-ts-simple');
    expect(ids).toContain('unhealthy-ts-complex');
    expect(ids).toContain('unhealthy-ts-godclass');
    expect(ids).toContain('unhealthy-go-nesting');
  });
});
