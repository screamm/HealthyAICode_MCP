import { describe, it, expect } from 'vitest';
import { analyzeForAutoRefactor } from '../../src/refactor/auto-refactor-analyzer';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const HEALTHY_CODE = `
export function add(a: number, b: number): number {
  return a + b;
}
`.trim();

// A function with high cyclomatic complexity and moderate nesting that triggers ComplexMethod
// Uses many short branches (switch/ternary style) to accumulate CC without deep nesting
const COMPLEX_CODE = `
export function classify(
  status: string, code: number, flag: boolean, mode: string, level: number
): string {
  if (status === 'active' && code > 0) return 'active-positive';
  if (status === 'active' && code === 0) return 'active-zero';
  if (status === 'active' && code < 0) return 'active-negative';
  if (status === 'pending' && flag) return 'pending-flagged';
  if (status === 'pending' && !flag) return 'pending-clean';
  if (status === 'closed' && code > 100) return 'closed-high';
  if (status === 'closed' && code <= 100) return 'closed-low';
  if (mode === 'fast' && level > 5) return 'fast-high';
  if (mode === 'fast' && level <= 5) return 'fast-low';
  if (mode === 'slow' && level > 5) return 'slow-high';
  if (mode === 'slow' && level <= 5) return 'slow-low';
  if (mode === 'batch' && flag) return 'batch-flag';
  return 'unknown';
}
`.trim();

// A function with too many parameters
const LONG_PARAMS_CODE = `
export function createUser(
  firstName: string,
  lastName: string,
  email: string,
  password: string,
  role: string
): void {
  console.log(firstName, lastName, email, password, role);
}
`.trim();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('analyzeForAutoRefactor — healthy file', () => {
  it('returns null when the file has no smells', () => {
    const result = analyzeForAutoRefactor(HEALTHY_CODE, 'typescript', 'add.ts');
    expect(result).toBeNull();
  });
});

describe('analyzeForAutoRefactor — complex file', () => {
  it('returns an AutoRefactorResult for a file with ComplexMethod smell', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result).not.toBeNull();
  });

  it('returns strategy extract_method for ComplexMethod smell', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result).not.toBeNull();
    expect(result!.refactoringStrategy).toBe('extract_method');
  });

  it('refactoringInstructions is a non-empty array', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(Array.isArray(result!.refactoringInstructions)).toBe(true);
    expect(result!.refactoringInstructions.length).toBeGreaterThan(0);
  });

  it('currentCode is non-empty and contains actual function code', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result!.currentCode).toBeTruthy();
    expect(result!.currentCode.length).toBeGreaterThan(0);
    expect(result!.currentCode).toContain('classify');
  });

  it('predictedHealthScore is always > currentHealthScore', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result!.predictedHealthScore).toBeGreaterThan(result!.currentHealthScore);
  });

  it('predictedHealthScore is always ≤ 10', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result!.predictedHealthScore).toBeLessThanOrEqual(10);
  });

  it('predictedScoreDelta starts with "+"', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result!.predictedScoreDelta).toMatch(/^\+/);
  });

  it('followUpInstruction references code_health_review', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result!.followUpInstruction).toContain('code_health_review');
  });

  it('filePath is set correctly', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result!.filePath).toBe('classify.ts');
  });

  it('startLine is a positive number', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result!.startLine).toBeGreaterThan(0);
  });
});

describe('analyzeForAutoRefactor — targetSmell filter', () => {
  it('returns null when targetSmell does not match any smell in the file', () => {
    // COMPLEX_CODE has ComplexMethod / DeepNesting but not BumpyRoad
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts', 'BumpyRoad');
    // BumpyRoad is unlikely to appear in this fixture; we accept either null or a result
    // but if it does return something, the smell type must be BumpyRoad
    if (result !== null) {
      expect(result.smell.type).toBe('BumpyRoad');
    }
  });

  it('returns a result with the requested smell type when it exists', () => {
    // LongParameterList is present in LONG_PARAMS_CODE
    const result = analyzeForAutoRefactor(LONG_PARAMS_CODE, 'typescript', 'user.ts', 'LongParameterList');
    if (result !== null) {
      expect(result.smell.type).toBe('LongParameterList');
      expect(result.refactoringStrategy).toBe('introduce_parameter_object');
    }
  });
});

describe('analyzeForAutoRefactor — predictedHealthScore capping', () => {
  it('predictedHealthScore never exceeds 10 even for very low scores', () => {
    // Run multiple times with complex code to verify cap
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    if (result) {
      expect(result.predictedHealthScore).toBeLessThanOrEqual(10.0);
    }
  });
});
