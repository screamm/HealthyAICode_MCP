import { describe, it, expectTypeOf } from 'vitest';
import type {
  Language,
  HealthCategory,
  SmellType,
  Smell,
  MetricBreakdown,
  FunctionResult,
  HealthResult,
  ChangesetResult,
  FileRegression,
  FileImprovement,
  NextActionType,
  NextAction,
  ToolResponse,
} from '../src/types';

describe('types — shape contracts', () => {
  it('Language should include all supported languages', () => {
    expectTypeOf<Language>().toEqualTypeOf<
      'typescript' | 'javascript' | 'python' | 'java' | 'kotlin' | 'csharp' | 'unsupported'
    >();
  });

  it('HealthCategory should be green | yellow | red', () => {
    expectTypeOf<HealthCategory>().toEqualTypeOf<'green' | 'yellow' | 'red'>();
  });

  it('SmellType should include all seven smell types', () => {
    expectTypeOf<SmellType>().toEqualTypeOf<
      | 'ComplexMethod'
      | 'DeepNesting'
      | 'BumpyRoad'
      | 'LargeMethod'
      | 'ComplexConditional'
      | 'LongParameterList'
      | 'LargeFile'
    >();
  });

  it('Smell should have required fields with correct types', () => {
    expectTypeOf<Smell>().toMatchTypeOf<{
      type: SmellType;
      severity: 'critical' | 'high' | 'medium';
      line: number;
      description: string;
      suggestion: string;
    }>();
  });

  it('MetricBreakdown should have nine numeric fields', () => {
    expectTypeOf<MetricBreakdown>().toMatchTypeOf<{
      cyclomaticComplexity: number;
      cognitiveComplexity: number;
      maxNestingDepth: number;
      avgFunctionLength: number;
      maxFunctionLength: number;
      avgParameterCount: number;
      maxParameterCount: number;
      totalLines: number;
      duplicationScore: number;
    }>();
  });

  it('HealthResult should have filePath and language fields', () => {
    expectTypeOf<HealthResult>().toMatchTypeOf<{
      filePath: string;
      language: Language;
      score: number;
      category: HealthCategory;
    }>();
  });

  it('ChangesetResult should have overallSafe boolean', () => {
    expectTypeOf<ChangesetResult>().toMatchTypeOf<{
      filesAnalyzed: number;
      overallSafe: boolean;
    }>();
  });

  it('NextAction should have toolToCallAfter as string or null', () => {
    expectTypeOf<NextAction>().toMatchTypeOf<{
      action: NextActionType;
      instruction: string;
      priority: Smell | null;
      toolToCallAfter: string | null;
    }>();
  });

  it('ToolResponse should have loopComplete boolean', () => {
    expectTypeOf<ToolResponse>().toMatchTypeOf<{
      score: number;
      category: HealthCategory;
      loopComplete: boolean;
    }>();
  });
});
