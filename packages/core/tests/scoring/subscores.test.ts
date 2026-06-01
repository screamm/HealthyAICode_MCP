import { describe, it, expect } from 'vitest';
import type { Smell } from '../../src/types';
import { computeSubscores } from '../../src/scoring/subscores';

function smell(type: Smell['type'], metricValue?: number): Smell {
  return {
    type,
    severity: 'high',
    line: 1,
    description: '',
    suggestion: '',
    ...(metricValue !== undefined ? { metricValue } : {}),
  };
}

describe('computeSubscores', () => {
  it('returns perfect dimensions and echoes baseScore when there are no smells', () => {
    const s = computeSubscores([], 10.0);
    expect(s).toEqual({
      security: 10.0,
      complexity: 10.0,
      maintainability: 10.0,
      duplication: 10.0,
      overall: 10.0,
    });
  });

  it('penalises only the security dimension for security smells', () => {
    const s = computeSubscores([smell('SqlInjectionRisk')], 8.5);
    expect(s.security).toBeLessThan(9.0);
    expect(s.complexity).toBe(10.0);
    expect(s.maintainability).toBe(10.0);
    expect(s.duplication).toBe(10.0);
    expect(s.overall).toBe(8.5);
  });

  it('penalises only the complexity dimension for complexity smells', () => {
    const s = computeSubscores([smell('ComplexMethod', 30), smell('DeepNesting')], 7.0);
    expect(s.complexity).toBeLessThan(10.0);
    expect(s.security).toBe(10.0);
    expect(s.maintainability).toBe(10.0);
  });

  it('buckets maintainability smells correctly', () => {
    const s = computeSubscores([smell('GodClass'), smell('SATD')], 7.0);
    expect(s.maintainability).toBeLessThan(10.0);
    expect(s.complexity).toBe(10.0);
    expect(s.security).toBe(10.0);
  });

  it('buckets duplication smells (DuplicateCode / StyleInconsistency)', () => {
    const s = computeSubscores([smell('DuplicateCode'), smell('StyleInconsistency')], 8.0);
    expect(s.duplication).toBeLessThan(10.0);
    expect(s.complexity).toBe(10.0);
  });

  it('applies progressive sqrt penalty per type within a dimension', () => {
    const one = computeSubscores([smell('SqlInjectionRisk')], 8.5).security;
    const four = computeSubscores(
      [
        smell('SqlInjectionRisk'),
        smell('SqlInjectionRisk'),
        smell('SqlInjectionRisk'),
        smell('SqlInjectionRisk'),
      ],
      5.0,
    ).security;
    // 1 occurrence: 10 - 1.5*sqrt(1) = 8.5 ; 4 occurrences: 10 - 1.5*sqrt(4) = 7.0
    expect(one).toBe(8.5);
    expect(four).toBe(7.0);
    expect(four).toBeLessThan(one);
  });

  it('threshold-gates ComplexMethod weight by cyclomatic complexity', () => {
    // CC in [15,24] → weight 1.0 → 10 - 1.0 = 9.0
    const low = computeSubscores([smell('ComplexMethod', 20)], 9.0).complexity;
    // CC >= 25 → weight 1.5 → 10 - 1.5 = 8.5
    const high = computeSubscores([smell('ComplexMethod', 30)], 8.5).complexity;
    expect(low).toBe(9.0);
    expect(high).toBe(8.5);
    expect(high).toBeLessThan(low);
  });

  it('falls back to full ComplexMethod weight (1.5) when metricValue is absent', () => {
    const s = computeSubscores([smell('ComplexMethod')], 8.5).complexity;
    expect(s).toBe(8.5); // 10 - 1.5
  });

  it('clamps dimension scores to the [1.0, 10.0] band', () => {
    const many = Array.from({ length: 100 }, () => smell('SqlInjectionRisk'));
    const s = computeSubscores(many, 1.0);
    expect(s.security).toBe(1.0);
    expect(s.security).toBeGreaterThanOrEqual(1.0);
  });

  it('overall mirrors the supplied baseScore (clamped)', () => {
    expect(computeSubscores([], 9.3).overall).toBe(9.3);
    expect(computeSubscores([], 0.2).overall).toBe(1.0);
  });

  it('ignores smell types not mapped to any dimension', () => {
    // TestProximity is a scored type but not in the dimension map → no dimension contribution.
    const s = computeSubscores([smell('TestProximity')], 9.5);
    expect(s.security).toBe(10.0);
    expect(s.complexity).toBe(10.0);
    expect(s.maintainability).toBe(10.0);
    expect(s.duplication).toBe(10.0);
  });
});
