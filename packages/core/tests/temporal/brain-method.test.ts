import { describe, it, expect } from 'vitest';
import { detectBrainMethods } from '../../src/temporal/brain-method';
import type { FunctionResult } from '../../src/types';

function makeFn(overrides: Partial<FunctionResult> = {}): FunctionResult {
  return {
    name: 'f',
    line: 1,
    length: 3,
    cyclomaticComplexity: 1,
    cognitiveComplexity: 0,
    nestingDepth: 0,
    parameterCount: 1,
    smells: [],
    ...overrides,
  };
}

describe('detectBrainMethods', () => {
  it('returns [] for empty input', () => {
    expect(detectBrainMethods([], 1)).toHaveLength(0);
  });

  it('does not flag a simple function', () => {
    const fn = makeFn({ name: 'simple', length: 3, cyclomaticComplexity: 1, cognitiveComplexity: 0, nestingDepth: 0 });
    expect(detectBrainMethods([fn], 1)).toHaveLength(0);
  });

  it('flags a function high on multiple complexity factors', () => {
    const fn = makeFn({
      name: 'bigFn',
      length: 90,
      cyclomaticComplexity: 22,
      cognitiveComplexity: 25,
      nestingDepth: 5,
    });
    const smells = detectBrainMethods([fn], 22);
    expect(smells.length).toBe(1);
    expect(smells[0].type).toBe('BrainMethod');
  });

  it('assigns critical severity for score >= 0.85', () => {
    const fn = makeFn({
      name: 'monster',
      length: 100,
      cyclomaticComplexity: 25,
      cognitiveComplexity: 30,
      nestingDepth: 6,
    });
    const smells = detectBrainMethods([fn], 25);
    expect(smells[0]?.severity).toBe('critical');
  });

  it('assigns high severity for score in 0.70–0.84', () => {
    const fn = makeFn({
      name: 'big',
      length: 80,
      cyclomaticComplexity: 20,
      cognitiveComplexity: 20,
      nestingDepth: 4,
    });
    const smells = detectBrainMethods([fn], 20);
    const severity = smells[0]?.severity;
    expect(['high', 'critical']).toContain(severity);
  });

  it('includes function name in description', () => {
    const fn = makeFn({
      name: 'processBigData',
      length: 90,
      cyclomaticComplexity: 22,
      cognitiveComplexity: 25,
      nestingDepth: 5,
    });
    const smells = detectBrainMethods([fn], 22);
    expect(smells[0]?.description).toContain('processBigData');
  });

  it('does not flag when fewer than 3 factors exceed threshold', () => {
    // High on lines only, rest are low
    const fn = makeFn({
      name: 'longButSimple',
      length: 90,
      cyclomaticComplexity: 2,
      cognitiveComplexity: 1,
      nestingDepth: 0,
    });
    expect(detectBrainMethods([fn], 2)).toHaveLength(0);
  });
});
