import type { FunctionResult, MetricBreakdown, Smell } from '../types';

const LARGE_FILE_LINES = 500, COMPLEX_METHOD_THRESHOLD = 10, CRITICAL_COMPLEXITY_THRESHOLD = 20;
const DEEP_NESTING_THRESHOLD = 3, HIGH_NESTING_THRESHOLD = 4, CRITICAL_NESTING_THRESHOLD = 5, LARGE_METHOD_LINES = 50;
const LONG_PARAMETER_LIST = 4;
const COGNITIVE_COMPLEXITY_THRESHOLD = 15, CRITICAL_COGNITIVE_THRESHOLD = 25;

export function detectSmells(functions: FunctionResult[], metrics: MetricBreakdown): Smell[] {
  const smells: Smell[] = [];
  const lf = detectLargeFile(metrics); if (lf) smells.push(lf);
  for (const fn of functions) {
    const cm = detectComplexMethod(fn); if (cm) smells.push(cm);
    const dn = detectDeepNesting(fn); if (dn) smells.push(dn);
    const lm = detectLargeMethod(fn); if (lm) smells.push(lm);
    const pl = detectLongParameterList(fn); if (pl) smells.push(pl);
    const cc = detectHighCognitiveComplexity(fn); if (cc) smells.push(cc);
  }
  return smells;
}

function detectLargeFile(metrics: MetricBreakdown): Smell | null {
  if (metrics.totalLines <= LARGE_FILE_LINES) return null;
  return { type: 'LargeFile', severity: 'medium', line: 1, description: `Fil har ${metrics.totalLines} rader (gräns: ${LARGE_FILE_LINES})`, suggestion: 'Dela upp filen i mindre, fokuserade moduler' };
}

function detectComplexMethod(fn: FunctionResult): Smell | null {
  if (fn.cyclomaticComplexity <= COMPLEX_METHOD_THRESHOLD) return null;
  return { type: 'ComplexMethod', line: fn.line, functionName: fn.name, severity: fn.cyclomaticComplexity > CRITICAL_COMPLEXITY_THRESHOLD ? 'critical' : 'high', description: `'${fn.name}' har cyklomatisk komplexitet ${fn.cyclomaticComplexity} (gräns: ${COMPLEX_METHOD_THRESHOLD})`, suggestion: `Extrahera logik från '${fn.name}' till separata hjälpfunktioner` };
}

function detectDeepNesting(fn: FunctionResult): Smell | null {
  if (fn.nestingDepth <= DEEP_NESTING_THRESHOLD) return null;
  let severity: 'critical' | 'high' | 'medium';
  if (fn.nestingDepth > CRITICAL_NESTING_THRESHOLD) {
    severity = 'critical';
  } else if (fn.nestingDepth > HIGH_NESTING_THRESHOLD) {
    severity = 'high';
  } else {
    severity = 'medium';
  }
  return { type: 'DeepNesting', line: fn.line, functionName: fn.name, severity, description: `'${fn.name}' har nestningsdjup ${fn.nestingDepth} (gräns: ${DEEP_NESTING_THRESHOLD})`, suggestion: `Tillämpa early-return pattern i '${fn.name}'` };
}

function detectLargeMethod(fn: FunctionResult): Smell | null {
  if (fn.length <= LARGE_METHOD_LINES) return null;
  return { type: 'LargeMethod', severity: 'medium', line: fn.line, functionName: fn.name, description: `'${fn.name}' är ${fn.length} rader (gräns: ${LARGE_METHOD_LINES})`, suggestion: `Dela upp '${fn.name}' i mindre funktioner` };
}

function detectLongParameterList(fn: FunctionResult): Smell | null {
  if (fn.parameterCount <= LONG_PARAMETER_LIST) return null;
  return { type: 'LongParameterList', severity: 'medium', line: fn.line, functionName: fn.name, description: `'${fn.name}' har ${fn.parameterCount} parametrar (gräns: ${LONG_PARAMETER_LIST})`, suggestion: 'Gruppera parametrar i ett options-objekt' };
}

function detectHighCognitiveComplexity(fn: FunctionResult): Smell | null {
  if (fn.cognitiveComplexity <= COGNITIVE_COMPLEXITY_THRESHOLD) return null;
  return {
    type: 'CognitiveComplexity',
    line: fn.line,
    functionName: fn.name,
    severity: fn.cognitiveComplexity > CRITICAL_COGNITIVE_THRESHOLD ? 'critical' : 'high',
    description: `'${fn.name}' har kognitiv komplexitet ${fn.cognitiveComplexity} (gräns: ${COGNITIVE_COMPLEXITY_THRESHOLD})`,
    suggestion: `Förenkla '${fn.name}' — extrahera villkorliga grenar till namngivna hjälpfunktioner`,
  };
}

