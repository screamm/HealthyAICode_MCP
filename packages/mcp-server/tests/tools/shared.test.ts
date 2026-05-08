import { describe, it, expect } from 'vitest';
import { buildNextAction, formatReviewSummary } from '../../src/tools/shared';
import type { HealthResult } from '@healthy-ai-code/core';

const greenResult: HealthResult = {
  filePath: 'src/utils.ts',
  language: 'typescript',
  score: 9.8,
  category: 'green',
  smells: [],
  metrics: {
    cyclomaticComplexity: 1,
    cognitiveComplexity: 1,
    maxNestingDepth: 1,
    avgFunctionLength: 5,
    maxFunctionLength: 5,
    avgParameterCount: 2,
    maxParameterCount: 2,
    totalLines: 10,
    duplicationScore: 0,
  },
  functions: [],
};

const redResult: HealthResult = {
  filePath: 'src/order.ts',
  language: 'typescript',
  score: 3.2,
  category: 'red',
  smells: [
    {
      type: 'ComplexMethod',
      severity: 'critical',
      description: 'Cyklomatisk komplexitet 18',
      suggestion: 'Extrahera till hjälpfunktioner',
      functionName: 'processOrder',
      line: 5,
    },
    {
      type: 'DeepNesting',
      severity: 'high',
      description: 'Nestningsdjup 6',
      suggestion: 'Minska nästning',
      functionName: 'validateData',
      line: 10,
    },
  ],
  metrics: {
    cyclomaticComplexity: 18,
    cognitiveComplexity: 22,
    maxNestingDepth: 6,
    avgFunctionLength: 40,
    maxFunctionLength: 120,
    avgParameterCount: 4,
    maxParameterCount: 4,
    totalLines: 120,
    duplicationScore: 0.1,
  },
  functions: [],
};

describe('buildNextAction', () => {
  it('returnerar commit_safe när loopComplete är true', () => {
    const action = buildNextAction(greenResult, true);
    expect(action.action).toBe('commit_safe');
    expect(action.toolToCallAfter).toBeNull();
    expect(action.priority).toBeNull();
    expect(action.instruction).toContain('9.8/10.0');
  });

  it('returnerar refactor med högsta prioritet smell', () => {
    const action = buildNextAction(redResult, false);
    expect(action.action).toBe('refactor');
    expect(action.toolToCallAfter).toBe('code_health_review');
    expect(action.priority?.type).toBe('ComplexMethod');
    expect(action.instruction).toContain('code_health_review');
  });

  it('hanterar inga smells men loopComplete false', () => {
    const partialResult: HealthResult = { ...greenResult, score: 8.0, category: 'yellow', smells: [] };
    const action = buildNextAction(partialResult, false);
    expect(action.action).toBe('refactor');
    expect(action.priority).toBeNull();
  });
});

describe('formatReviewSummary', () => {
  it('formaterar grön fil korrekt', () => {
    const summary = formatReviewSummary('src/utils.ts', greenResult);
    expect(summary).toContain('src/utils.ts');
    expect(summary).toContain('9.8/10.0');
    expect(summary).toContain('Inga problem identifierade');
  });

  it('formaterar röd fil med smells', () => {
    const summary = formatReviewSummary('src/order.ts', redResult);
    expect(summary).toContain('src/order.ts');
    expect(summary).toContain('3.2/10.0');
    expect(summary).toContain('[KRITISK]');
    expect(summary).toContain('ComplexMethod');
    expect(summary).toContain('[HÖG]');
    expect(summary).toContain('DeepNesting');
  });
});
