import { describe, it, expect } from 'vitest';
import { calculateScore, categorize } from '../../src/scoring/scorer';
import type { Smell } from '../../src/types';

function makeSmell(type: Smell['type'], severity: Smell['severity'] = 'high'): Smell {
  return {
    type,
    severity,
    line: 1,
    description: 'test',
    suggestion: 'fix it',
  };
}

describe('calculateScore', () => {
  it('returns 10.0 when there are no smells', () => {
    expect(calculateScore([])).toBe(10.0);
  });

  it('deducts weight×sqrt(1) = weight for single ComplexMethod', () => {
    // weight=1.5, sqrt(1)=1 → 10 - 1.5 = 8.5
    expect(calculateScore([makeSmell('ComplexMethod')])).toBe(8.5);
  });

  it('deducts weight×sqrt(1) = weight for single DeepNesting', () => {
    // weight=1.2, sqrt(1)=1 → 10 - 1.2 = 8.8
    expect(calculateScore([makeSmell('DeepNesting')])).toBe(8.8);
  });

  it('deducts weight×sqrt(1) for single BumpyRoad', () => {
    // weight=0.8 → 10 - 0.8 = 9.2
    expect(calculateScore([makeSmell('BumpyRoad')])).toBe(9.2);
  });

  it('single smell deductions are unchanged from before (sqrt(1) = 1)', () => {
    expect(calculateScore([makeSmell('LargeMethod')])).toBe(9.4);    // 10 - 0.6
    expect(calculateScore([makeSmell('ComplexConditional')])).toBe(9.5); // 10 - 0.5
    expect(calculateScore([makeSmell('LargeFile')])).toBe(9.7);      // 10 - 0.3
  });

  it('two ComplexMethod smells deduct weight×sqrt(2)', () => {
    // weight=1.5, sqrt(2)≈1.414 → 1.5×1.414 = 2.121 → 10 - 2.121 = 7.879 → rounds to 7.9
    const smells = [makeSmell('ComplexMethod'), makeSmell('ComplexMethod')];
    expect(calculateScore(smells)).toBe(7.9);
  });

  it('three ComplexMethod smells deduct weight×sqrt(3)', () => {
    // weight=1.5, sqrt(3)≈1.732 → 1.5×1.732 = 2.598 → 10 - 2.598 = 7.402 → rounds to 7.4
    const smells = [
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
    ];
    expect(calculateScore(smells)).toBe(7.4);
  });

  it('more smells always results in lower score than fewer (progressive penalty)', () => {
    const score2 = calculateScore([makeSmell('ComplexMethod'), makeSmell('ComplexMethod')]);
    const score3 = calculateScore([
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
    ]);
    const score10 = calculateScore(Array(10).fill(makeSmell('ComplexMethod')));
    expect(score3).toBeLessThan(score2);
    expect(score10).toBeLessThan(score3);
  });

  it('multiple smell types combine independently', () => {
    // ComplexMethod x2: 1.5×sqrt(2)=2.121 | DeepNesting x1: 1.2×sqrt(1)=1.2
    // total: 3.321 → 10 - 3.321 = 6.679 → rounds to 6.7
    const smells = [
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('DeepNesting'),
    ];
    expect(calculateScore(smells)).toBe(6.7);
  });

  it('never returns a score below 1.0', () => {
    const smells = Array(20).fill(null).flatMap(() => [
      makeSmell('ComplexMethod'),
      makeSmell('DeepNesting'),
      makeSmell('BumpyRoad'),
      makeSmell('LargeMethod'),
      makeSmell('LargeFile'),
      makeSmell('LongParameterList'),
    ]);
    expect(calculateScore(smells)).toBeGreaterThanOrEqual(1.0);
  });

  it('returns score with one decimal place', () => {
    const score = calculateScore([makeSmell('LongParameterList')]); // 10 - 0.4 = 9.6
    expect(score).toBe(9.6);
    expect(score.toString()).toMatch(/^\d+\.\d$/);
  });
});

describe('categorize', () => {
  it('returns green for score >= 9.0', () => {
    expect(categorize(9.0)).toBe('green');
    expect(categorize(9.5)).toBe('green');
    expect(categorize(10.0)).toBe('green');
  });

  it('returns yellow for score >= 6.0 and < 9.0', () => {
    expect(categorize(6.0)).toBe('yellow');
    expect(categorize(7.5)).toBe('yellow');
    expect(categorize(8.9)).toBe('yellow');
  });

  it('returns red for score < 6.0', () => {
    expect(categorize(1.0)).toBe('red');
    expect(categorize(5.9)).toBe('red');
    expect(categorize(2.5)).toBe('red');
  });

  it('boundary: 9.0 is green not yellow', () => {
    expect(categorize(9.0)).toBe('green');
  });

  it('boundary: 6.0 is yellow not red', () => {
    expect(categorize(6.0)).toBe('yellow');
  });

  it('boundary: 5.9 is red not yellow', () => {
    expect(categorize(5.9)).toBe('red');
  });
});
