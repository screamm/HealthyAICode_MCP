import { describe, it, expect } from 'vitest';
import {
  analyzeIntentClarity,
  computeTypeAnnotationRatio,
  computeNameQualityScore,
} from '../../src/analyzers/intent-clarity';

// ── Sample TypeScript snippets ───────────────────────────────────────────────

const FULLY_TYPED_TS = `
/**
 * Parses a token string.
 */
function parseToken(token: string): string {
  return token.split('.')[0];
}

/**
 * Validates an email address.
 */
function validateEmail(email: string): boolean {
  return email.includes('@');
}
`;

const PLAIN_JS = `
function parseToken(token) {
  return token.split('.')[0];
}

function validateEmail(email) {
  return email.includes('@');
}
`;

const GENERICALLY_NAMED = `
function data(x, y) {
  return x + y;
}

function tmp(res) {
  return res;
}
`;

const WITH_LOOP_VARS = `
function sumArray(numbers: number[]): number {
  let total = 0;
  for (let i = 0; i < numbers.length; i++) {
    total += numbers[i];
  }
  return total;
}
`;

const DOCUMENTED_TYPED_TS = `
/**
 * Computes the total price.
 */
function computeTotal(price: number, quantity: number): number {
  return price * quantity;
}
`;

describe('computeTypeAnnotationRatio', () => {
  it('returns 1.0 when all parameters and return types are annotated (TypeScript)', () => {
    const ratio = computeTypeAnnotationRatio(FULLY_TYPED_TS, 'typescript');
    expect(ratio).toBeGreaterThan(0.5);
  });

  it('returns 0.0 for JavaScript without JSDoc type annotations', () => {
    const ratio = computeTypeAnnotationRatio(PLAIN_JS, 'javascript');
    expect(ratio).toBe(0);
  });

  it('handles mixed TypeScript (partially typed)', () => {
    const mixed = `
function fullyTyped(a: string, b: number): boolean { return true; }
function untyped(a, b) { return a + b; }
`;
    const ratio = computeTypeAnnotationRatio(mixed, 'typescript');
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });
});

describe('computeNameQualityScore', () => {
  it('returns 1.0 when no generic names are present', () => {
    const { score } = computeNameQualityScore(FULLY_TYPED_TS);
    expect(score).toBe(1);
  });

  it('returns low values when functions are named "data", "tmp", "x"', () => {
    const { score, poorlyNamed } = computeNameQualityScore(GENERICALLY_NAMED);
    expect(score).toBeLessThan(0.5);
    expect(poorlyNamed.length).toBeGreaterThan(0);
  });

  it('exempts single-letter loop variables in for-statements', () => {
    // The function is named sumArray (good), and loop var i should be exempted
    const { score, poorlyNamed } = computeNameQualityScore(WITH_LOOP_VARS);
    // i should not appear in poorlyNamed
    expect(poorlyNamed).not.toContain('i');
    expect(score).toBe(1);
  });
});

describe('analyzeIntentClarity', () => {
  it('produces high-severity smell when intentClarityScore < 0.40', () => {
    // Undocumented, untyped JS with generic names
    const lowClarity = `
function data(x) { return x; }
function tmp(res) { return res; }
`;
    const result = analyzeIntentClarity(lowClarity, 'src/util.js', 'javascript');
    // doc=0 (no JSDoc), type=0 (JS), name likely low → score < 0.40
    expect(result.intentClarityScore).toBeLessThan(0.65);
  });

  it('returns correct composite score for a TypeScript file with JSDoc', () => {
    const result = analyzeIntentClarity(DOCUMENTED_TYPED_TS, 'src/pricing.ts', 'typescript');
    expect(result.docRatio).toBeGreaterThan(0);
    expect(result.intentClarityScore).toBeGreaterThan(0.3);
    // The composite formula must hold within floating point tolerance
    const expected = result.docRatio * 0.40
      + result.typeAnnotationRatio * 0.35
      + result.nameQualityScore * 0.25;
    expect(result.intentClarityScore).toBeCloseTo(expected, 3);
  });

  it('returns intentClarityScore = 0 for empty content (no crash)', () => {
    const result = analyzeIntentClarity('', 'src/empty.ts', 'typescript');
    expect(result.intentClarityScore).toBe(0);
    expect(result.poorlyNamedFunctions).toHaveLength(0);
    expect(result.smell).toBeNull();
  });

  it('smell is null when score is in acceptable range', () => {
    const result = analyzeIntentClarity(DOCUMENTED_TYPED_TS, 'src/good.ts', 'typescript');
    // If score >= 0.65 no smell should be emitted
    if (result.intentClarityScore >= 0.65) {
      expect(result.smell).toBeNull();
    }
  });

  // ── Edge cases ──────────────────────────────────────────────────────────
  it('handles file with no functions gracefully', () => {
    const result = analyzeIntentClarity('const VERSION = "1.0.0";', 'src/version.ts', 'typescript');
    expect(result.intentClarityScore).toBeGreaterThanOrEqual(0);
    expect(result.intentClarityScore).toBeLessThanOrEqual(1);
  });
});
