import type { FunctionResult, MetricBreakdown } from '../types';

/** Builds a MetricBreakdown from a list of function analysis results. */
export function buildSimpleMetrics(
  functions: FunctionResult[],
  totalLines: number,
): MetricBreakdown {
  if (functions.length === 0) return emptySimpleMetrics(totalLines);
  return {
    cyclomaticComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    cognitiveComplexity: 0,
    maxNestingDepth: Math.max(...functions.map(f => f.nestingDepth)),
    avgFunctionLength: Math.round(
      functions.reduce((s, f) => s + f.length, 0) / functions.length
    ),
    maxFunctionLength: Math.max(...functions.map(f => f.length)),
    avgParameterCount: parseFloat(
      (functions.reduce((s, f) => s + f.parameterCount, 0) / functions.length).toFixed(1)
    ),
    maxParameterCount: Math.max(...functions.map(f => f.parameterCount)),
    totalLines,
    duplicationScore: 0,
  };
}

/** Returns a zeroed MetricBreakdown for files with no parseable functions. */
export function emptySimpleMetrics(totalLines: number): MetricBreakdown {
  return {
    cyclomaticComplexity: 1,
    cognitiveComplexity: 0,
    maxNestingDepth: 0,
    avgFunctionLength: 0,
    maxFunctionLength: 0,
    avgParameterCount: 0,
    maxParameterCount: 0,
    totalLines,
    duplicationScore: 0,
  };
}
