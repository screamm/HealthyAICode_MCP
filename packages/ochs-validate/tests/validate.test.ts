/**
 * Tests for the ochs-validate package.
 *
 * Covers:
 *   - Determinism regression: same input → same score, run twice → identical
 *   - Valid OCHS objects pass
 *   - Malformed objects fail with useful error messages
 *   - Formula consistency check catches wrong scores
 *   - CLI acceptance / rejection criteria
 */

import { describe, it, expect } from 'vitest';
import {
  validateOchs,
  validateOchsJson,
  deriveScore,
  scoreToCategory,
  deriveLoopComplete,
  OCHS_WEIGHTS,
  OCHS_FLOOR,
  AI_READY_THRESHOLD,
  ALL_SMELL_TYPES,
} from '../src/index';

// ──────────────────────────────────────────────────────────────────────────────
// Sample OCHS objects used across tests
// ──────────────────────────────────────────────────────────────────────────────

const CLEAN_FILE: object = {
  ochsVersion: '0.1',
  score: 10.0,
  smells: [],
};

const ONE_COMPLEX_METHOD: object = {
  ochsVersion: '0.1',
  score: 8.5, // 10 - 1.5*sqrt(1) = 10 - 1.5 = 8.5
  smells: [{ type: 'ComplexMethod', severity: 'high', message: 'CC=28' }],
  filePath: 'src/foo.ts',
  language: 'typescript',
};

const FLOOR_CASE: object = {
  ochsVersion: '0.1',
  score: 1.0,
  smells: [
    { type: 'HardcodedCredential' }, // weight 2.0
    { type: 'HardcodedApiKey' },     // weight 2.0
    { type: 'ComplexMethod' },       // weight 1.5
    { type: 'GodClass' },            // weight 1.5
    { type: 'SqlInjectionRisk' },    // weight 1.5
    { type: 'XssRisk' },             // weight 1.5
    { type: 'CommandInjectionRisk' },// weight 1.5
    { type: 'DeepNesting' },         // weight 1.2
    { type: 'BrainMethod' },         // weight 1.2
    { type: 'KnowledgeLoss' },       // weight 1.0
  ],
};

// ──────────────────────────────────────────────────────────────────────────────
// 1. Determinism regression — MUST run twice and produce identical results
// ──────────────────────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('produces identical score from same smell vector on first call', () => {
    const smells = [
      { type: 'ComplexMethod' },
      { type: 'ComplexMethod' },
      { type: 'DeepNesting' },
    ];
    // ComplexMethod count=2: 1.5*sqrt(2)=2.121...; DeepNesting count=1: 1.2*sqrt(1)=1.2
    // penalty = 2.121... + 1.2 = 3.321...; score = 10 - 3.321... = 6.678...
    const score1 = deriveScore(smells);
    expect(score1).toBeGreaterThan(1.0);
    expect(score1).toBeLessThan(10.0);
    return score1;
  });

  it('produces identical score from same smell vector on second call (determinism)', () => {
    const smells = [
      { type: 'ComplexMethod' },
      { type: 'ComplexMethod' },
      { type: 'DeepNesting' },
    ];
    const score1 = deriveScore(smells);
    const score2 = deriveScore(smells);
    // Must be byte-for-byte identical — not just within tolerance
    expect(score1).toBe(score2);
  });

  it('validateOchs is deterministic — same input gives same result twice', () => {
    const r1 = validateOchs(ONE_COMPLEX_METHOD);
    const r2 = validateOchs(ONE_COMPLEX_METHOD);
    expect(r1.valid).toBe(r2.valid);
    expect(r1.derivedScore).toBe(r2.derivedScore);
    expect(r1.errors).toEqual(r2.errors);
  });

  it('validateOchsJson is deterministic across multiple calls', () => {
    const json = JSON.stringify(FLOOR_CASE);
    const results = Array.from({ length: 5 }, () => validateOchsJson(json));
    const first = results[0];
    for (const r of results.slice(1)) {
      expect(r.derivedScore).toBe(first.derivedScore);
      expect(r.valid).toBe(first.valid);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Valid objects pass
// ──────────────────────────────────────────────────────────────────────────────

describe('valid OCHS objects', () => {
  it('accepts a clean file with score 10.0 and empty smells', () => {
    const r = validateOchs(CLEAN_FILE);
    expect(r.valid).toBe(true);
    expect(r.errors.filter((e) => !e.startsWith('[warning]'))).toHaveLength(0);
    expect(r.derivedScore).toBe(10.0);
    expect(r.derivedCategory).toBe('green');
  });

  it('accepts a file with one ComplexMethod finding and score 8.5', () => {
    const r = validateOchs(ONE_COMPLEX_METHOD);
    expect(r.valid).toBe(true);
    // 10 - 1.5*sqrt(1) = 8.5 exactly; 8.5 < HEALTHY_THRESHOLD (9.0) → yellow
    expect(r.derivedScore).toBeCloseTo(8.5, 5);
    expect(r.derivedCategory).toBe('yellow');
  });

  it('score 8.5 is categorised as "yellow" (below HEALTHY_THRESHOLD 9.0)', () => {
    const r = validateOchs(ONE_COMPLEX_METHOD);
    // 8.5 is below HEALTHY (9.0) and above PROBLEMATIC (6.0) → yellow
    expect(r.derivedCategory).toBe('yellow');
  });

  it('accepts a floor-case object with score 1.0', () => {
    const r = validateOchs(FLOOR_CASE);
    expect(r.valid).toBe(true);
    expect(r.derivedScore).toBe(OCHS_FLOOR);
    expect(r.derivedCategory).toBe('red');
  });

  it('accepts version string "0.1.0"', () => {
    const r = validateOchs({ ochsVersion: '0.1.0', score: 10.0, smells: [] });
    expect(r.valid).toBe(true);
  });

  it('accepts additional top-level fields (open schema)', () => {
    const r = validateOchs({
      ...CLEAN_FILE,
      custom: 'extension data',
      metrics: { lineCount: 42 },
    });
    expect(r.valid).toBe(true);
  });

  it('accepts optional loopComplete field', () => {
    const r = validateOchs({ ...CLEAN_FILE, loopComplete: true });
    expect(r.valid).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Malformed objects fail
// ──────────────────────────────────────────────────────────────────────────────

describe('malformed OCHS objects', () => {
  it('rejects null input', () => {
    const r = validateOchs(null);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('JSON object'))).toBe(true);
  });

  it('rejects array input', () => {
    const r = validateOchs([]);
    expect(r.valid).toBe(false);
  });

  it('rejects missing ochsVersion', () => {
    const r = validateOchs({ score: 10.0, smells: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('ochsVersion'))).toBe(true);
  });

  it('rejects ochsVersion with bad format "v0.1"', () => {
    const r = validateOchs({ ochsVersion: 'v0.1', score: 10.0, smells: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('ochsVersion'))).toBe(true);
  });

  it('rejects missing score', () => {
    const r = validateOchs({ ochsVersion: '0.1', smells: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('"score"'))).toBe(true);
  });

  it('rejects score above 10', () => {
    const r = validateOchs({ ochsVersion: '0.1', score: 10.5, smells: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('out of the valid OCHS range'))).toBe(true);
  });

  it('rejects score below 1', () => {
    const r = validateOchs({ ochsVersion: '0.1', score: 0.5, smells: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('out of the valid OCHS range'))).toBe(true);
  });

  it('rejects missing smells array', () => {
    const r = validateOchs({ ochsVersion: '0.1', score: 10.0 });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('"smells"'))).toBe(true);
  });

  it('rejects smell entry without type field', () => {
    const r = validateOchs({ ochsVersion: '0.1', score: 10.0, smells: [{ severity: 'high' }] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('type'))).toBe(true);
  });

  it('rejects invalid severity value', () => {
    const r = validateOchs({
      ochsVersion: '0.1',
      score: 10.0,
      smells: [{ type: 'ComplexMethod', severity: 'blocker' }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('severity'))).toBe(true);
  });

  it('rejects invalid category value', () => {
    const r = validateOchs({ ochsVersion: '0.1', score: 10.0, smells: [], category: 'blue' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('category'))).toBe(true);
  });

  it('rejects non-boolean loopComplete', () => {
    const r = validateOchs({ ochsVersion: '0.1', score: 10.0, smells: [], loopComplete: 'yes' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('loopComplete'))).toBe(true);
  });

  it('rejects invalid JSON string', () => {
    const r = validateOchsJson('{bad json}');
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/JSON parse error/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Formula consistency checks
// ──────────────────────────────────────────────────────────────────────────────

describe('formula consistency', () => {
  it('detects score mismatch when reported score is too high', () => {
    const r = validateOchs({
      ochsVersion: '0.1',
      score: 9.9, // reported 9.9 but derived = 8.5
      smells: [{ type: 'ComplexMethod' }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Formula mismatch'))).toBe(true);
  });

  it('detects score mismatch when reported score is too low', () => {
    const r = validateOchs({
      ochsVersion: '0.1',
      score: 5.0, // reported 5.0 but derived = 8.5
      smells: [{ type: 'ComplexMethod' }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Formula mismatch'))).toBe(true);
  });

  it('passes when score matches within default tolerance', () => {
    // 10 - 1.5*sqrt(1) = 8.5 exactly
    const r = validateOchs({
      ochsVersion: '0.1',
      score: 8.5,
      smells: [{ type: 'ComplexMethod' }],
    });
    expect(r.valid).toBe(true);
  });

  it('passes with score rounded to 1 decimal place within tolerance 0.05', () => {
    // 10 - 1.2*sqrt(1) = 8.8 exactly — round to 8.8 passes
    const r = validateOchs({
      ochsVersion: '0.1',
      score: 8.8,
      smells: [{ type: 'DeepNesting' }],
    });
    expect(r.valid).toBe(true);
  });

  it('applies floor: very high penalty still gives score 1.0', () => {
    const score = deriveScore(FLOOR_CASE['smells' as keyof typeof FLOOR_CASE] as never);
    expect(score).toBe(OCHS_FLOOR);
  });

  it('uses strict tolerance when specified', () => {
    // Score 8.49 vs derived 8.5 — delta 0.01; within 0.05 default but test with 0.001
    const r = validateOchs(
      { ochsVersion: '0.1', score: 8.49, smells: [{ type: 'ComplexMethod' }] },
      { scoreTolerance: 0.001 }
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Formula mismatch'))).toBe(true);
  });

  it('correctly derives score for two smells of same type', () => {
    // 2× ComplexMethod: 1.5 * sqrt(2) = 2.1213...
    const score = deriveScore([{ type: 'ComplexMethod' }, { type: 'ComplexMethod' }]);
    const expected = Math.max(1.0, 10 - 1.5 * Math.sqrt(2));
    expect(score).toBe(expected);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Helper functions
// ──────────────────────────────────────────────────────────────────────────────

describe('helper functions', () => {
  it('scoreToCategory returns "green" for score >= 9.0', () => {
    expect(scoreToCategory(10.0)).toBe('green');
    expect(scoreToCategory(9.0)).toBe('green');
    expect(scoreToCategory(9.5)).toBe('green');
  });

  it('scoreToCategory returns "yellow" for score in [6.0, 9.0)', () => {
    expect(scoreToCategory(8.9)).toBe('yellow');
    expect(scoreToCategory(6.0)).toBe('yellow');
    expect(scoreToCategory(7.5)).toBe('yellow');
  });

  it('scoreToCategory returns "red" for score < 6.0', () => {
    expect(scoreToCategory(5.9)).toBe('red');
    expect(scoreToCategory(1.0)).toBe('red');
  });

  it('deriveLoopComplete uses 9.5 threshold normally', () => {
    expect(deriveLoopComplete(9.5, [])).toBe(true);
    expect(deriveLoopComplete(9.49, [])).toBe(false);
    expect(deriveLoopComplete(10.0, [])).toBe(true);
  });

  it('deriveLoopComplete uses 9.7 threshold when AiAttributedSATD is present', () => {
    const smells = [{ type: 'AiAttributedSATD' }];
    expect(deriveLoopComplete(9.5, smells)).toBe(false);
    expect(deriveLoopComplete(9.7, smells)).toBe(true);
    expect(deriveLoopComplete(9.69, smells)).toBe(false);
  });

  it('OCHS_WEIGHTS covers all 55 biomarkers', () => {
    expect(ALL_SMELL_TYPES.size).toBe(55);
  });

  it('all OCHS_WEIGHTS values are positive numbers', () => {
    for (const [type, weight] of Object.entries(OCHS_WEIGHTS)) {
      expect(typeof weight).toBe('number');
      expect(weight).toBeGreaterThan(0);
      expect(Number.isFinite(weight)).toBe(true);
    }
  });

  it('deriveScore with empty smells returns 10.0', () => {
    expect(deriveScore([])).toBe(10.0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Extension smell types (warning, not error in lenient mode)
// ──────────────────────────────────────────────────────────────────────────────

describe('extension biomarkers', () => {
  it('unknown smell type produces warning in lenient mode but does not fail', () => {
    const r = validateOchs({
      ochsVersion: '0.1',
      score: 10.0,
      smells: [{ type: 'MyCustomSmell' }],
    });
    // Score derived from smells: unknown type contributes 0 penalty → derived = 10.0 ✓
    expect(r.valid).toBe(true);
    const warnings = r.errors.filter((e) => e.startsWith('[warning]'));
    expect(warnings.some((w) => w.includes('MyCustomSmell'))).toBe(true);
  });

  it('unknown smell type fails in strict mode', () => {
    const r = validateOchs(
      { ochsVersion: '0.1', score: 10.0, smells: [{ type: 'MyCustomSmell' }] },
      { strictSmellTypes: true }
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('MyCustomSmell'))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. validateOchsJson convenience wrapper
// ──────────────────────────────────────────────────────────────────────────────

describe('validateOchsJson', () => {
  it('parses and validates a valid JSON string', () => {
    const json = JSON.stringify(CLEAN_FILE);
    const r = validateOchsJson(json);
    expect(r.valid).toBe(true);
  });

  it('returns parse error for malformed JSON', () => {
    const r = validateOchsJson('{ invalid }');
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/JSON parse error/);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. Specific weight spot-checks from OCHS v0.1 spec Table 2
// ──────────────────────────────────────────────────────────────────────────────

describe('weight spot-checks (OCHS v0.1 Table 2)', () => {
  const cases: Array<{ smell: string; weight: number }> = [
    { smell: 'HardcodedCredential', weight: 2.0 },
    { smell: 'HardcodedApiKey', weight: 2.0 },
    { smell: 'ComplexMethod', weight: 1.5 },
    { smell: 'GodClass', weight: 1.5 },
    { smell: 'SqlInjectionRisk', weight: 1.5 },
    { smell: 'XssRisk', weight: 1.5 },
    { smell: 'CommandInjectionRisk', weight: 1.5 },
    { smell: 'HallucinatedPackageImport', weight: 1.5 },
    { smell: 'SlopsquattingRisk', weight: 1.5 },
    { smell: 'SsrfRisk', weight: 1.3 },
    { smell: 'BrainMethod', weight: 1.2 },
    { smell: 'DeepNesting', weight: 1.2 },
    { smell: 'UnsafeDeserialization', weight: 1.2 },
    { smell: 'PathTraversalRisk', weight: 1.2 },
    { smell: 'ComplexityMassConcentration', weight: 1.2 },
    { smell: 'KnowledgeLoss', weight: 1.0 },
    { smell: 'DependencyVulnerability', weight: 1.0 },
    { smell: 'DuplicateCode', weight: 1.0 },
    { smell: 'LlmUnboundedCall', weight: 1.0 },
    { smell: 'LlmUnpinnedModel', weight: 1.0 },
    { smell: 'LlmNoSystemMessage', weight: 1.0 },
    { smell: 'LlmNoStructuredOutput', weight: 1.0 },
    { smell: 'CryptographicMisuseRisk', weight: 1.0 },
    { smell: 'AiAttributedSATD', weight: 0.8 },
    { smell: 'ExceptionHandlingAntiPattern', weight: 0.8 },
    { smell: 'BumpyRoad', weight: 0.8 },
    { smell: 'CognitiveComplexity', weight: 0.8 },
    { smell: 'LlmUnsetTemperature', weight: 0.8 },
    { smell: 'TypeSafetyEscape', weight: 0.7 },
    { smell: 'FeatureEnvy', weight: 0.7 },
    { smell: 'DeveloperCongestion', weight: 0.7 },
    { smell: 'AsyncAntiPattern', weight: 0.7 },
    { smell: 'ArchitectureDebt', weight: 0.6 },
    { smell: 'CodeChurn', weight: 0.6 },
    { smell: 'LargeMethod', weight: 0.6 },
    { smell: 'SATD', weight: 0.6 },
    { smell: 'AbstractionLeakage', weight: 0.6 },
    { smell: 'DataClumps', weight: 0.5 },
    { smell: 'MessageChain', weight: 0.5 },
    { smell: 'PrimitiveObsession', weight: 0.5 },
    { smell: 'TestProximity', weight: 0.5 },
    { smell: 'SplitResidue', weight: 0.5 },
    { smell: 'ComplexConditional', weight: 0.5 },
    { smell: 'HardcodedAssumption', weight: 0.5 },
    { smell: 'MissingEdgeCase', weight: 0.5 },
    { smell: 'DocumentationDebt', weight: 0.5 },
    { smell: 'LongParameterList', weight: 0.4 },
    { smell: 'MagicNumber', weight: 0.4 },
    { smell: 'IntentClarity', weight: 0.4 },
    { smell: 'LargeFile', weight: 0.3 },
    { smell: 'LowDocCoverage', weight: 0.3 },
    { smell: 'LowMaintainability', weight: 0.3 },
    { smell: 'StyleInconsistency', weight: 0.3 },
    { smell: 'FragmentedCode', weight: 0.3 },
    { smell: 'MethodTemporalCoupling', weight: 0.3 },
  ];

  for (const { smell, weight } of cases) {
    it(`${smell} has weight ${weight}`, () => {
      expect(OCHS_WEIGHTS[smell]).toBe(weight);
    });
  }
});
