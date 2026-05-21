import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { getConfig } from '../config';
import { getThresholds } from '../scoring/calibration-loader';

// Hard-coded defaults — used when useCalibratedThresholds is false (default behaviour).
const LARGE_FILE_LINES = 500, COMPLEX_METHOD_THRESHOLD = 10, CRITICAL_COMPLEXITY_THRESHOLD = 20;
const DEEP_NESTING_THRESHOLD = 3, HIGH_NESTING_THRESHOLD = 4, CRITICAL_NESTING_THRESHOLD = 5, LARGE_METHOD_LINES = 50;
const LONG_PARAMETER_LIST = 4;
const COGNITIVE_COMPLEXITY_THRESHOLD = 15, CRITICAL_COGNITIVE_THRESHOLD = 25;

export function detectSmells(functions: FunctionResult[], metrics: MetricBreakdown, language = 'typescript'): Smell[] {
  const { useCalibratedThresholds } = getConfig();
  const t = getThresholds(language, { useCalibratedThresholds });

  // Resolve effective thresholds — calibrated values when opted in, otherwise the
  // module-level constants (identical to previous behaviour, ensuring backwards compat).
  const complexMethodThreshold = useCalibratedThresholds ? t.complexMethodThreshold : COMPLEX_METHOD_THRESHOLD;
  const criticalComplexityThreshold = useCalibratedThresholds ? t.criticalComplexityThreshold : CRITICAL_COMPLEXITY_THRESHOLD;
  const deepNestingThreshold = useCalibratedThresholds ? t.deepNestingThreshold : DEEP_NESTING_THRESHOLD;
  const highNestingThreshold = useCalibratedThresholds ? t.highNestingThreshold : HIGH_NESTING_THRESHOLD;
  const criticalNestingThreshold = useCalibratedThresholds ? t.criticalNestingThreshold : CRITICAL_NESTING_THRESHOLD;
  const largeMethodLines = useCalibratedThresholds ? t.largeMethodLines : LARGE_METHOD_LINES;
  const longParameterList = useCalibratedThresholds ? t.longParameterList : LONG_PARAMETER_LIST;
  const cognitiveComplexityThreshold = useCalibratedThresholds ? t.cognitiveComplexityThreshold : COGNITIVE_COMPLEXITY_THRESHOLD;
  const criticalCognitiveThreshold = useCalibratedThresholds ? t.criticalCognitiveThreshold : CRITICAL_COGNITIVE_THRESHOLD;
  const largeFileLines = useCalibratedThresholds ? t.largeFileLines : LARGE_FILE_LINES;

  const smells: Smell[] = [];
  const lf = detectLargeFile(metrics, largeFileLines); if (lf) smells.push(lf);
  for (const fn of functions) {
    const cm = detectComplexMethod(fn, complexMethodThreshold, criticalComplexityThreshold); if (cm) smells.push(cm);
    const dn = detectDeepNesting(fn, deepNestingThreshold, highNestingThreshold, criticalNestingThreshold); if (dn) smells.push(dn);
    const lm = detectLargeMethod(fn, largeMethodLines); if (lm) smells.push(lm);
    const pl = detectLongParameterList(fn, longParameterList); if (pl) smells.push(pl);
    const cc = detectHighCognitiveComplexity(fn, cognitiveComplexityThreshold, criticalCognitiveThreshold); if (cc) smells.push(cc);
  }
  return smells;
}

function detectLargeFile(metrics: MetricBreakdown, limit: number): Smell | null {
  if (metrics.totalLines <= limit) return null;
  return { type: 'LargeFile', severity: 'medium', line: 1, description: `Fil har ${metrics.totalLines} rader (gräns: ${limit})`, suggestion: 'Dela upp filen i mindre, fokuserade moduler' };
}

function detectComplexMethod(fn: FunctionResult, limit: number, criticalLimit: number): Smell | null {
  if (fn.cyclomaticComplexity <= limit) return null;
  return { type: 'ComplexMethod', line: fn.line, functionName: fn.name, severity: fn.cyclomaticComplexity > criticalLimit ? 'critical' : 'high', description: `'${fn.name}' har cyklomatisk komplexitet ${fn.cyclomaticComplexity} (gräns: ${limit})`, suggestion: `Extrahera logik från '${fn.name}' till separata hjälpfunktioner` };
}

function detectDeepNesting(fn: FunctionResult, limit: number, highLimit: number, criticalLimit: number): Smell | null {
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

function detectHighCognitiveComplexity(fn: FunctionResult, limit: number, criticalLimit: number): Smell | null {
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

