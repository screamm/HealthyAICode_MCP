import type { FunctionResult, MetricBreakdown } from '../types';

/** Builds a MetricBreakdown by aggregating per-function measurements. */
export function buildMetrics(functions: FunctionResult[], totalLines: number, maintainabilityIndex: number): MetricBreakdown {
  if (functions.length === 0) return emptyMetrics(totalLines, maintainabilityIndex);
  return {
    cyclomaticComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    cognitiveComplexity: Math.max(...functions.map(f => f.cognitiveComplexity)),
    maxNestingDepth: Math.max(...functions.map(f => f.nestingDepth)),
    avgFunctionLength: Math.round(functions.reduce((s, f) => s + f.length, 0) / functions.length),
    maxFunctionLength: Math.max(...functions.map(f => f.length)),
    avgParameterCount: parseFloat((functions.reduce((s, f) => s + f.parameterCount, 0) / functions.length).toFixed(1)),
    maxParameterCount: Math.max(...functions.map(f => f.parameterCount)),
    totalLines,
    duplicationScore: 0,
    maintainabilityIndex,
  };
}

/** Returns a zeroed-out MetricBreakdown suitable for empty or stub files. */
export function emptyMetrics(totalLines: number, maintainabilityIndex = 100): MetricBreakdown {
  return { cyclomaticComplexity: 1, cognitiveComplexity: 0, maxNestingDepth: 0, avgFunctionLength: 0, maxFunctionLength: 0, avgParameterCount: 0, maxParameterCount: 0, totalLines, duplicationScore: 0, maintainabilityIndex };
}
