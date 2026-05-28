import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { getConfig } from '../config';
import { getThresholds } from '../scoring/calibration-loader';

// Hard-coded defaults — used when useCalibratedThresholds is false (default behaviour).
const LARGE_FILE_LINES = 500, COMPLEX_METHOD_THRESHOLD = 10, CRITICAL_COMPLEXITY_THRESHOLD = 20;
const DEEP_NESTING_THRESHOLD = 3, HIGH_NESTING_THRESHOLD = 4, CRITICAL_NESTING_THRESHOLD = 5, LARGE_METHOD_LINES = 50;
const LONG_PARAMETER_LIST = 4;
const COGNITIVE_COMPLEXITY_THRESHOLD = 15, CRITICAL_COGNITIVE_THRESHOLD = 25;

/** All threshold values resolved for a single `detectSmells` call. */
interface ResolvedThresholds {
  complexMethodThreshold: number;
  criticalComplexityThreshold: number;
  deepNestingThreshold: number;
  highNestingThreshold: number;
  criticalNestingThreshold: number;
  largeMethodLines: number;
  longParameterList: number;
  cognitiveComplexityThreshold: number;
  criticalCognitiveThreshold: number;
  largeFileLines: number;
}

/** Resolves effective thresholds — calibrated values when opted in, hard-coded defaults otherwise. */
function resolveThresholds(language: string, useCalibratedThresholds: boolean): ResolvedThresholds {
  const t = getThresholds(language, { useCalibratedThresholds });
  if (useCalibratedThresholds) {
    return {
      complexMethodThreshold: t.complexMethodThreshold,
      criticalComplexityThreshold: t.criticalComplexityThreshold,
      deepNestingThreshold: t.deepNestingThreshold,
      highNestingThreshold: t.highNestingThreshold,
      criticalNestingThreshold: t.criticalNestingThreshold,
      largeMethodLines: t.largeMethodLines,
      longParameterList: t.longParameterList,
      cognitiveComplexityThreshold: t.cognitiveComplexityThreshold,
      criticalCognitiveThreshold: t.criticalCognitiveThreshold,
      largeFileLines: t.largeFileLines,
    };
  }
  return {
    complexMethodThreshold: COMPLEX_METHOD_THRESHOLD,
    criticalComplexityThreshold: CRITICAL_COMPLEXITY_THRESHOLD,
    deepNestingThreshold: DEEP_NESTING_THRESHOLD,
    highNestingThreshold: HIGH_NESTING_THRESHOLD,
    criticalNestingThreshold: CRITICAL_NESTING_THRESHOLD,
    largeMethodLines: LARGE_METHOD_LINES,
    longParameterList: LONG_PARAMETER_LIST,
    cognitiveComplexityThreshold: COGNITIVE_COMPLEXITY_THRESHOLD,
    criticalCognitiveThreshold: CRITICAL_COGNITIVE_THRESHOLD,
    largeFileLines: LARGE_FILE_LINES,
  };
}

/** Runs all per-function smell detectors for a single function and appends results. */
function detectFunctionSmells(fn: FunctionResult, thresholds: ResolvedThresholds, smells: Smell[]): void {
  const candidates: (Smell | null)[] = [
    detectComplexMethod(fn, thresholds),
    detectDeepNesting(fn, thresholds),
    detectLargeMethod(fn, thresholds.largeMethodLines),
    detectLongParameterList(fn, thresholds.longParameterList),
    detectHighCognitiveComplexity(fn, thresholds),
  ];
  for (const s of candidates) { if (s) smells.push(s); }
}

export function detectSmells(functions: FunctionResult[], metrics: MetricBreakdown, language = 'typescript'): Smell[] {
  const { useCalibratedThresholds } = getConfig();
  const thresholds = resolveThresholds(language, useCalibratedThresholds);

  const smells: Smell[] = [];
  const lf = detectLargeFile(metrics, thresholds.largeFileLines); if (lf) smells.push(lf);
  for (const fn of functions) {
    detectFunctionSmells(fn, thresholds, smells);
  }
  return smells;
}

function detectLargeFile(metrics: MetricBreakdown, limit: number): Smell | null {
  if (metrics.totalLines <= limit) return null;
  return { type: 'LargeFile', severity: 'medium', line: 1, description: `Fil har ${metrics.totalLines} rader (gräns: ${limit})`, suggestion: 'Dela upp filen i mindre, fokuserade moduler' };
}

function detectComplexMethod(fn: FunctionResult, thresholds: ResolvedThresholds): Smell | null {
  const { complexMethodThreshold: limit, criticalComplexityThreshold: criticalLimit } = thresholds;
  if (fn.cyclomaticComplexity <= limit) return null;
  return { type: 'ComplexMethod', line: fn.line, functionName: fn.name, severity: fn.cyclomaticComplexity > criticalLimit ? 'critical' : 'high', description: `'${fn.name}' har cyklomatisk komplexitet ${fn.cyclomaticComplexity} (gräns: ${limit})`, suggestion: `Extrahera logik från '${fn.name}' till separata hjälpfunktioner` };
}

function detectDeepNesting(fn: FunctionResult, thresholds: ResolvedThresholds): Smell | null {
  const { deepNestingThreshold: limit, highNestingThreshold: highLimit, criticalNestingThreshold: criticalLimit } = thresholds;
  if (fn.nestingDepth <= limit) return null;
  let severity: 'critical' | 'high' | 'medium';
  if (fn.nestingDepth > criticalLimit) {
    severity = 'critical';
  } else if (fn.nestingDepth > highLimit) {
    severity = 'high';
  } else {
    severity = 'medium';
  }
  return { type: 'DeepNesting', line: fn.line, functionName: fn.name, severity, description: `'${fn.name}' har nestningsdjup ${fn.nestingDepth} (gräns: ${limit})`, suggestion: `Tillämpa early-return pattern i '${fn.name}'` };
}

function detectLargeMethod(fn: FunctionResult, limit: number): Smell | null {
  if (fn.length <= limit) return null;
  return { type: 'LargeMethod', severity: 'medium', line: fn.line, functionName: fn.name, description: `'${fn.name}' är ${fn.length} rader (gräns: ${limit})`, suggestion: `Dela upp '${fn.name}' i mindre funktioner` };
}

function detectLongParameterList(fn: FunctionResult, limit: number): Smell | null {
  if (fn.parameterCount <= limit) return null;
  return { type: 'LongParameterList', severity: 'medium', line: fn.line, functionName: fn.name, description: `'${fn.name}' har ${fn.parameterCount} parametrar (gräns: ${limit})`, suggestion: 'Gruppera parametrar i ett options-objekt' };
}

function detectHighCognitiveComplexity(fn: FunctionResult, thresholds: ResolvedThresholds): Smell | null {
  const { cognitiveComplexityThreshold: limit, criticalCognitiveThreshold: criticalLimit } = thresholds;
  if (fn.cognitiveComplexity <= limit) return null;
  return {
    type: 'CognitiveComplexity',
    line: fn.line,
    functionName: fn.name,
    severity: fn.cognitiveComplexity > criticalLimit ? 'critical' : 'high',
    description: `'${fn.name}' har kognitiv komplexitet ${fn.cognitiveComplexity} (gräns: ${limit})`,
    suggestion: `Förenkla '${fn.name}' — extrahera villkorliga grenar till namngivna hjälpfunktioner`,
  };
}
