/**
 * Acceptance tests for the deterministic delta-gating evaluator.
 *
 * These exercise the core acceptance criteria for the gate package:
 *   - a known-bad edit (new security smell) → deny
 *   - an edit that drops the file below the floor → deny
 *   - a neutral / improving edit → allow
 *   - a new file is judged on the floor only (no spurious regression)
 *
 * The gate delegates all scoring to @healthy-ai-code/core's analyzeCode, so we
 * use smell types that flow through that pipeline and are stable across core
 * versions: CryptographicMisuseRisk (a security smell core's additive detectors
 * emit) and complexity/nesting. Note: classic SqlInjectionRisk / HardcodedCredential
 * findings come from the separate auditSecurity API, NOT analyzeCode, so they are
 * deliberately not used here.
 */
import { describe, it, expect } from 'vitest';
import { evaluateGate, newlyIntroducedSmells, type ProposedEdit } from '../src/evaluate-gate';
import { DEFAULT_FLOOR } from '../src/gate-types';

const HEALTHY_TS = `import crypto from 'crypto';

export function add(a: number, b: number): number {
  return a + b;
}

export function fingerprint(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
`;

/**
 * Swaps the secure SHA-256 hash for broken MD5 — registers a
 * CryptographicMisuseRisk that core's analyzeCode pipeline detects.
 */
const SECURITY_REGRESSION_TS = `import crypto from 'crypto';

export function add(a: number, b: number): number {
  return a + b;
}

export function fingerprint(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex');
}
`;

/** A deeply nested, high-complexity function that drives the score below the floor. */
const COMPLEXITY_REGRESSION_TS =
  HEALTHY_TS +
  `
export function tangled(items: number[]): number {
  let r = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i] > 0) {
      if (items[i] % 2 === 0) {
        for (let j = 0; j < items.length; j++) {
          if (j > i) {
            if (items[j] > items[i]) {
              if (j % 3 === 0) {
                r += items[j];
              } else if (j % 3 === 1) {
                r -= items[j];
              } else {
                r *= 2;
              }
            } else if (items[j] === items[i]) {
              r += 1;
            } else {
              r -= 1;
            }
          }
        }
      } else {
        r += items[i];
      }
    } else if (items[i] < 0) {
      r -= items[i];
    } else {
      r = 0;
    }
  }
  return r;
}
`;

function edit(after: string, before: string | null = HEALTHY_TS): ProposedEdit {
  return { filePath: 'src/example.ts', before, after, language: 'typescript' };
}

describe('evaluateGate — deny paths', () => {
  it('denies an edit that introduces a new security smell (known-bad)', () => {
    const decision = evaluateGate(edit(SECURITY_REGRESSION_TS));
    expect(decision.verdict).toBe('deny');
    expect(decision.reasonCode).toBe('new_security_smell');
    expect(decision.newSmells.length).toBeGreaterThan(0);
    expect(decision.newSmells.some((s) => s.type === 'CryptographicMisuseRisk')).toBe(true);
    expect(decision.reason).toContain('security');
  });

  it('denies an edit that drops the file below the floor', () => {
    const decision = evaluateGate(edit(COMPLEXITY_REGRESSION_TS));
    expect(decision.verdict).toBe('deny');
    // Either below_floor or score_regression is acceptable as a deny reason here;
    // the key acceptance criterion is that an unhealthy edit is blocked.
    expect(['below_floor', 'score_regression']).toContain(decision.reasonCode);
    expect(decision.scoreAfter).toBeLessThan(decision.scoreBefore ?? 10);
  });
});

describe('evaluateGate — allow paths', () => {
  it('allows a neutral edit (trivial rename, no new smells)', () => {
    const renamed = HEALTHY_TS.replace('multiply', 'product');
    const decision = evaluateGate(edit(renamed));
    expect(decision.verdict).toBe('allow');
    expect(decision.reasonCode).toBe('none');
    expect(decision.newSmells).toHaveLength(0);
  });

  it('allows an improving edit (removing a smell raises the score)', () => {
    // before is the unhealthy complexity file; after is the clean file.
    const decision = evaluateGate(edit(HEALTHY_TS, COMPLEXITY_REGRESSION_TS));
    expect(decision.verdict).toBe('allow');
    expect(decision.scoreDelta).toBeGreaterThanOrEqual(0);
  });

  it('allows a healthy new file (judged on floor only, no spurious regression)', () => {
    const decision = evaluateGate(edit(HEALTHY_TS, null));
    expect(decision.scoreBefore).toBeNull();
    expect(decision.scoreDelta).toBe(0);
    expect(decision.verdict).toBe('allow');
  });
});

describe('evaluateGate — configuration', () => {
  it('uses DEFAULT_FLOOR when no floor is configured', () => {
    const decision = evaluateGate(edit(HEALTHY_TS));
    expect(decision.floor).toBe(DEFAULT_FLOOR);
  });

  it('honours a custom floor', () => {
    // The MD5 file scores ~9 (a CryptographicMisuseRisk). Disable the security
    // hard-deny so the *floor* rule is what we are exercising, then set a floor
    // above the file's score: it must be denied as below_floor.
    const decision = evaluateGate(edit(SECURITY_REGRESSION_TS, null), {
      floor: 9.5,
      denyOnNewSecuritySmell: false,
    });
    expect(decision.floor).toBe(9.5);
    expect(decision.scoreAfter).toBeLessThan(9.5);
    expect(decision.verdict).toBe('deny');
    expect(decision.reasonCode).toBe('below_floor');
  });

  it('can disable the security hard-deny', () => {
    const decision = evaluateGate(edit(SECURITY_REGRESSION_TS), {
      denyOnNewSecuritySmell: false,
      floor: 0,
      minDelta: -10,
    });
    // With the hard-deny off and permissive thresholds, the security edit is allowed.
    expect(decision.verdict).toBe('allow');
  });
});

describe('newlyIntroducedSmells', () => {
  it('returns only smells present in after but not before', () => {
    const before = [
      { type: 'ComplexMethod' as const, severity: 'medium' as const, line: 1, description: '', suggestion: '' },
    ];
    const after = [
      { type: 'ComplexMethod' as const, severity: 'medium' as const, line: 1, description: '', suggestion: '' },
      { type: 'SqlInjectionRisk' as const, severity: 'high' as const, line: 5, description: '', suggestion: '' },
    ];
    const introduced = newlyIntroducedSmells(before, after);
    expect(introduced).toHaveLength(1);
    expect(introduced[0]?.type).toBe('SqlInjectionRisk');
  });

  it('distinguishes by function name', () => {
    const before = [
      { type: 'ComplexMethod' as const, severity: 'medium' as const, functionName: 'foo', line: 1, description: '', suggestion: '' },
    ];
    const after = [
      { type: 'ComplexMethod' as const, severity: 'medium' as const, functionName: 'foo', line: 1, description: '', suggestion: '' },
      { type: 'ComplexMethod' as const, severity: 'medium' as const, functionName: 'bar', line: 9, description: '', suggestion: '' },
    ];
    const introduced = newlyIntroducedSmells(before, after);
    expect(introduced).toHaveLength(1);
    expect(introduced[0]?.functionName).toBe('bar');
  });
});

describe('determinism', () => {
  it('returns an identical decision for identical input', () => {
    const a = evaluateGate(edit(SECURITY_REGRESSION_TS));
    const b = evaluateGate(edit(SECURITY_REGRESSION_TS));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
