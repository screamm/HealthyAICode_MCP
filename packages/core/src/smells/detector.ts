import type { FunctionResult, MetricBreakdown, Smell } from '../types';

const LARGE_FILE_LINES = 500;
const COMPLEX_METHOD_THRESHOLD = 10;
const CRITICAL_COMPLEXITY_THRESHOLD = 20;
const DEEP_NESTING_THRESHOLD = 4;
const CRITICAL_NESTING_THRESHOLD = 6;
const LARGE_METHOD_LINES = 30;
const LONG_PARAMETER_LIST = 5;
const BUMPY_ROAD_NESTING = 3;
const BUMPY_ROAD_MIN_FUNCTIONS = 3;

export function detectSmells(
  functions: FunctionResult[],
  metrics: MetricBreakdown,
): Smell[] {
  const smells: Smell[] = [];

  const largeFile = detectLargeFile(metrics);
  if (largeFile) smells.push(largeFile);

  for (const fn of functions) {
    smells.push(...detectFunctionSmells(fn));
  }

  const bumpyRoad = detectBumpyRoad(functions);
  if (bumpyRoad) smells.push(bumpyRoad);

  return smells;
}

function detectLargeFile(metrics: MetricBreakdown): Smell | null {
  if (metrics.totalLines <= LARGE_FILE_LINES) return null;
  return {
    type: 'LargeFile',
    severity: 'medium',
    line: 1,
    description: `Fil har ${metrics.totalLines} rader (gräns: ${LARGE_FILE_LINES})`,
    suggestion: 'Dela upp filen i mindre, fokuserade moduler',
  };
}

function detectFunctionSmells(fn: FunctionResult): Smell[] {
  const out: Smell[] = [];
  const complex = detectComplexMethod(fn);
  if (complex) out.push(complex);
  const nested = detectDeepNesting(fn);
  if (nested) out.push(nested);
  const large = detectLargeMethod(fn);
  if (large) out.push(large);
  const params = detectLongParameterList(fn);
  if (params) out.push(params);
  return out;
}

function detectComplexMethod(fn: FunctionResult): Smell | null {
  if (fn.cyclomaticComplexity <= COMPLEX_METHOD_THRESHOLD) return null;
  return {
    type: 'ComplexMethod',
    severity: fn.cyclomaticComplexity > CRITICAL_COMPLEXITY_THRESHOLD ? 'critical' : 'high',
    functionName: fn.name,
    line: fn.line,
    description: `'${fn.name}' har cyklomatisk komplexitet ${fn.cyclomaticComplexity} (gräns: ${COMPLEX_METHOD_THRESHOLD})`,
    suggestion: `Extrahera logik från '${fn.name}' till separata hjälpfunktioner`,
  };
}

function detectDeepNesting(fn: FunctionResult): Smell | null {
  if (fn.nestingDepth <= DEEP_NESTING_THRESHOLD) return null;
  return {
    type: 'DeepNesting',
    severity: fn.nestingDepth > CRITICAL_NESTING_THRESHOLD ? 'critical' : 'high',
    functionName: fn.name,
    line: fn.line,
    description: `'${fn.name}' har nestningsdjup ${fn.nestingDepth} (gräns: ${DEEP_NESTING_THRESHOLD})`,
    suggestion: `Tillämpa early-return pattern i '${fn.name}'`,
  };
}

function detectLargeMethod(fn: FunctionResult): Smell | null {
  if (fn.length <= LARGE_METHOD_LINES) return null;
  return {
    type: 'LargeMethod',
    severity: 'medium',
    functionName: fn.name,
    line: fn.line,
    description: `'${fn.name}' är ${fn.length} rader (gräns: ${LARGE_METHOD_LINES})`,
    suggestion: `Dela upp '${fn.name}' i mindre funktioner`,
  };
}

function detectLongParameterList(fn: FunctionResult): Smell | null {
  if (fn.parameterCount <= LONG_PARAMETER_LIST) return null;
  return {
    type: 'LongParameterList',
    severity: 'medium',
    functionName: fn.name,
    line: fn.line,
    description: `'${fn.name}' har ${fn.parameterCount} parametrar (gräns: ${LONG_PARAMETER_LIST})`,
    suggestion: 'Gruppera parametrar i ett options-objekt',
  };
}

function detectBumpyRoad(functions: FunctionResult[]): Smell | null {
  const bumpy = functions.filter(f => f.nestingDepth >= BUMPY_ROAD_NESTING);
  if (bumpy.length < BUMPY_ROAD_MIN_FUNCTIONS) return null;
  return {
    type: 'BumpyRoad',
    severity: 'high',
    line: bumpy[0].line,
    description: `${bumpy.length} funktioner med djup nestning — bumpy road-mönster`,
    suggestion: 'Förenkla kontrollflödet med early returns och hjälpfunktioner',
  };
}
