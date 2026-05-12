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

  it('deducts 1.5 for one ComplexMethod smell', () => {
    const smells = [makeSmell('ComplexMethod')];
    expect(calculateScore(smells)).toBe(8.5);
  });

  it('deducts 1.2 for one DeepNesting smell', () => {
    const smells = [makeSmell('DeepNesting')];
    expect(calculateScore(smells)).toBe(8.8);
  });

  it('deducts 0.8 for one BumpyRoad smell', () => {
    const smells = [makeSmell('BumpyRoad')];
    expect(calculateScore(smells)).toBe(9.2);
  });

  it('caps deduction at SMELL_MAX_DEDUCTION (3.0) per smell type', () => {
    // ComplexMethod weight=1.5, three instances = 4.5 — capped at 3.0
    const smells = [
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
    ];
    expect(calculateScore(smells)).toBe(7.0);
  });

  it('applies independent caps per smell type when multiple types present', () => {
    // ComplexMethod x3 capped at 3.0 + DeepNesting x1 = 1.2 → 10 - 3.0 - 1.2 = 5.8
    const smells = [
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('DeepNesting'),
    ];
    expect(calculateScore(smells)).toBe(5.8);
  });

  it('never returns a score below 1.0', () => {
    const smells = [
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('DeepNesting'),
      makeSmell('DeepNesting'),
      makeSmell('DeepNesting'),
      makeSmell('BumpyRoad'),
      makeSmell('BumpyRoad'),
      makeSmell('BumpyRoad'),
      makeSmell('LargeMethod'),
      makeSmell('LargeMethod'),
      makeSmell('LargeFile'),
      makeSmell('LongParameterList'),
    ];
    expect(calculateScore(smells)).toBeGreaterThanOrEqual(1.0);
  });

  it('returns score with one decimal place', () => {
    const smells = [makeSmell('LongParameterList')]; // 10 - 0.4 = 9.6
    const score = calculateScore(smells);
    expect(score).toBe(9.6);
    expect(score.toString()).toMatch(/^\d+\.\d$/);
  });

  it('deducts 0.6 for one LargeMethod smell', () => {
    expect(calculateScore([makeSmell('LargeMethod')])).toBe(9.4);
  });

  it('deducts 0.5 for one ComplexConditional smell', () => {
    expect(calculateScore([makeSmell('ComplexConditional')])).toBe(9.5);
  });

  it('deducts 0.3 for one LargeFile smell', () => {
    expect(calculateScore([makeSmell('LargeFile')])).toBe(9.7);
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
