import { describe, it, expect } from 'vitest';
import { detectSmells } from '../../src/smells/detector';
import type { FunctionResult, MetricBreakdown } from '../../src/types';

function makeFunction(overrides: Partial<FunctionResult> = {}): FunctionResult {
  return {
    name: 'testFn',
    line: 1,
    length: 10,
    cyclomaticComplexity: 1,
    nestingDepth: 0,
    parameterCount: 2,
    smells: [],
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<MetricBreakdown> = {}): MetricBreakdown {
  return {
    cyclomaticComplexity: 1,
    cognitiveComplexity: 1,
    maxNestingDepth: 0,
    avgFunctionLength: 10,
    maxFunctionLength: 10,
    avgParameterCount: 2,
    maxParameterCount: 2,
    totalLines: 50,
    duplicationScore: 0,
    ...overrides,
  };
}

describe('detectSmells — LargeFile', () => {
  it('does NOT flag LargeFile when totalLines = 500', () => {
    const smells = detectSmells([], makeMetrics({ totalLines: 500 }));
    expect(smells.filter(s => s.type === 'LargeFile')).toHaveLength(0);
  });

  it('flags LargeFile when totalLines = 501', () => {
    const smells = detectSmells([], makeMetrics({ totalLines: 501 }));
    expect(smells.filter(s => s.type === 'LargeFile')).toHaveLength(1);
  });

  it('LargeFile smell has line = 1', () => {
    const smells = detectSmells([], makeMetrics({ totalLines: 600 }));
    const largeFile = smells.find(s => s.type === 'LargeFile');
    expect(largeFile?.line).toBe(1);
  });

  it('LargeFile smell has severity medium', () => {
    const smells = detectSmells([], makeMetrics({ totalLines: 1000 }));
    const largeFile = smells.find(s => s.type === 'LargeFile');
    expect(largeFile?.severity).toBe('medium');
  });
});

describe('detectSmells — ComplexMethod', () => {
  it('does NOT flag ComplexMethod when cyclomaticComplexity = 10', () => {
    const fn = makeFunction({ cyclomaticComplexity: 10 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'ComplexMethod')).toHaveLength(0);
  });

  it('flags ComplexMethod when cyclomaticComplexity = 11', () => {
    const fn = makeFunction({ cyclomaticComplexity: 11 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'ComplexMethod')).toHaveLength(1);
  });

  it('ComplexMethod is critical when cyclomaticComplexity > 20', () => {
    const fn = makeFunction({ cyclomaticComplexity: 21 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'ComplexMethod');
    expect(smell?.severity).toBe('critical');
  });

  it('ComplexMethod is high when cyclomaticComplexity = 15', () => {
    const fn = makeFunction({ cyclomaticComplexity: 15 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'ComplexMethod');
    expect(smell?.severity).toBe('high');
  });

  it('flags one ComplexMethod per function when two complex functions', () => {
    const fn1 = makeFunction({ name: 'fn1', cyclomaticComplexity: 12 });
    const fn2 = makeFunction({ name: 'fn2', cyclomaticComplexity: 15, line: 20 });
    const smells = detectSmells([fn1, fn2], makeMetrics());
    expect(smells.filter(s => s.type === 'ComplexMethod')).toHaveLength(2);
  });
});

describe('detectSmells — DeepNesting', () => {
  it('does NOT flag DeepNesting when nestingDepth = 4', () => {
    const fn = makeFunction({ nestingDepth: 4 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'DeepNesting')).toHaveLength(0);
  });

  it('flags DeepNesting when nestingDepth = 5', () => {
    const fn = makeFunction({ nestingDepth: 5 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'DeepNesting')).toHaveLength(1);
  });

  it('DeepNesting is critical when nestingDepth > 6', () => {
    const fn = makeFunction({ nestingDepth: 7 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'DeepNesting');
    expect(smell?.severity).toBe('critical');
  });

  it('DeepNesting is high when nestingDepth = 5', () => {
    const fn = makeFunction({ nestingDepth: 5 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'DeepNesting');
    expect(smell?.severity).toBe('high');
  });
});

describe('detectSmells — LargeMethod', () => {
  it('does NOT flag LargeMethod when length = 30', () => {
    const fn = makeFunction({ length: 30 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'LargeMethod')).toHaveLength(0);
  });

  it('flags LargeMethod when length = 31', () => {
    const fn = makeFunction({ length: 31 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'LargeMethod')).toHaveLength(1);
  });

  it('LargeMethod has severity medium', () => {
    const fn = makeFunction({ length: 50 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'LargeMethod');
    expect(smell?.severity).toBe('medium');
  });
});

describe('detectSmells — LongParameterList', () => {
  it('does NOT flag LongParameterList when parameterCount = 5', () => {
    const fn = makeFunction({ parameterCount: 5 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'LongParameterList')).toHaveLength(0);
  });

  it('flags LongParameterList when parameterCount = 6', () => {
    const fn = makeFunction({ parameterCount: 6 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'LongParameterList')).toHaveLength(1);
  });
});

describe('detectSmells — BumpyRoad', () => {
  it('does NOT flag BumpyRoad when fewer than 3 deeply nested functions', () => {
    const fns = [
      makeFunction({ nestingDepth: 3 }),
      makeFunction({ nestingDepth: 3, line: 20 }),
    ];
    const smells = detectSmells(fns, makeMetrics());
    expect(smells.filter(s => s.type === 'BumpyRoad')).toHaveLength(0);
  });

  it('flags BumpyRoad when 3 or more functions have nestingDepth >= 3', () => {
    const fns = [
      makeFunction({ nestingDepth: 3 }),
      makeFunction({ nestingDepth: 4, line: 20 }),
      makeFunction({ nestingDepth: 3, line: 40 }),
    ];
    const smells = detectSmells(fns, makeMetrics());
    expect(smells.filter(s => s.type === 'BumpyRoad')).toHaveLength(1);
  });

  it('BumpyRoad has severity high', () => {
    const fns = [
      makeFunction({ nestingDepth: 3 }),
      makeFunction({ nestingDepth: 3, line: 20 }),
      makeFunction({ nestingDepth: 3, line: 40 }),
    ];
    const smells = detectSmells(fns, makeMetrics());
    const smell = smells.find(s => s.type === 'BumpyRoad');
    expect(smell?.severity).toBe('high');
  });
});

describe('detectSmells — clean code produces no smells', () => {
  it('returns empty array for simple functions below all thresholds', () => {
    const fn = makeFunction({
      cyclomaticComplexity: 3,
      nestingDepth: 1,
      length: 10,
      parameterCount: 2,
    });
    const smells = detectSmells([fn], makeMetrics({ totalLines: 100 }));
    expect(smells).toHaveLength(0);
  });
});

describe('detectSmells — smell descriptions and suggestions', () => {
  it('ComplexMethod description mentions the function name and complexity', () => {
    const fn = makeFunction({ name: 'myComplexFn', cyclomaticComplexity: 15 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'ComplexMethod');
    expect(smell?.description).toContain('myComplexFn');
    expect(smell?.description).toContain('15');
  });

  it('all smells have non-empty suggestion', () => {
    const fn = makeFunction({
      cyclomaticComplexity: 15,
      nestingDepth: 5,
      length: 50,
      parameterCount: 7,
    });
    const smells = detectSmells([fn], makeMetrics({ totalLines: 600 }));
    for (const smell of smells) {
      expect(smell.suggestion.length).toBeGreaterThan(0);
    }
  });
});
