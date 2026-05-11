import type { FunctionResult, Smell } from '../types';

const THRESHOLDS = { lines: 100, cyclomatic: 25, cognitive: 30, nesting: 6 };
const WEIGHTS = { lines: 0.30, cyclomatic: 0.25, cognitive: 0.25, nesting: 0.10, centrality: 0.10 };
const SMELL_THRESHOLD = 0.55, MIN_HIGH_FACTORS = 3;

export function detectBrainMethods(functions: FunctionResult[], avgCC: number): Smell[] {
  if (functions.length === 0) return [];
  const centralityMap = buildCentralityProxy(functions);
  const maxCentrality = Math.max(1, ...centralityMap.values());
  return functions.flatMap(fn => checkFunction(fn, centralityMap, maxCentrality));
}

function checkFunction(fn: FunctionResult, cmap: Map<string, number>, maxC: number): Smell[] {
  const factors = {
    lines: clamp01(fn.length / THRESHOLDS.lines),
    cyclomatic: clamp01(fn.cyclomaticComplexity / THRESHOLDS.cyclomatic),
    cognitive: clamp01(fn.cognitiveComplexity / THRESHOLDS.cognitive),
    nesting: clamp01(fn.nestingDepth / THRESHOLDS.nesting),
    centrality: clamp01((cmap.get(fn.name) ?? 0) / maxC),
  };
  const score = WEIGHTS.lines * factors.lines + WEIGHTS.cyclomatic * factors.cyclomatic + WEIGHTS.cognitive * factors.cognitive + WEIGHTS.nesting * factors.nesting + WEIGHTS.centrality * factors.centrality;
  const highCount = Object.values(factors).filter(v => v > 0.5).length;
  if (score < SMELL_THRESHOLD || highCount < MIN_HIGH_FACTORS) return [];
  let sev: Smell['severity'] = 'medium';
  if (score >= 0.85) sev = 'critical'; else if (score >= 0.70) sev = 'high';
  return [{ type: 'BrainMethod', severity: sev, functionName: fn.name, line: fn.line, description: `'${fn.name}' är en Brain Method (brain_score=${score.toFixed(2)}) — central, lång och komplex`, suggestion: `Bryt upp '${fn.name}'; varje av de ${highCount} höga faktorerna pekar mot en separat ansvarspunkt` } as Smell];
}

function clamp01(x: number): number { return Math.max(0, Math.min(1, x)); }

function buildCentralityProxy(functions: FunctionResult[]): Map<string, number> {
  const names = new Set(functions.map(f => f.name).filter(n => n !== '<anonymous>'));
  const counts = new Map<string, number>();
  for (const fn of functions) {
    if (names.has(fn.name)) counts.set(fn.name, (counts.get(fn.name) ?? 0) + fn.cyclomaticComplexity);
  }
  return counts;
}
