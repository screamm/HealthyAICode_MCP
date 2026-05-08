import type { FunctionResult, MetricBreakdown, Smell } from '../types';

export function detectSmells(
  functions: FunctionResult[],
  metrics: MetricBreakdown,
): Smell[] {
  const smells: Smell[] = [];

  // LargeFile: fil med fler än 500 rader
  if (metrics.totalLines > 500) {
    smells.push({
      type: 'LargeFile',
      severity: 'medium',
      line: 1,
      description: `Fil har ${metrics.totalLines} rader (gräns: 500)`,
      suggestion: 'Dela upp filen i mindre, fokuserade moduler',
    });
  }

  for (const fn of functions) {
    // ComplexMethod: cyklomatisk komplexitet > 10
    if (fn.cyclomaticComplexity > 10) {
      smells.push({
        type: 'ComplexMethod',
        severity: fn.cyclomaticComplexity > 20 ? 'critical' : 'high',
        functionName: fn.name,
        line: fn.line,
        description: `'${fn.name}' har cyklomatisk komplexitet ${fn.cyclomaticComplexity} (gräns: 10)`,
        suggestion: `Extrahera logik från '${fn.name}' till separata hjälpfunktioner`,
      });
    }

    // DeepNesting: nestningsdjup > 4
    if (fn.nestingDepth > 4) {
      smells.push({
        type: 'DeepNesting',
        severity: fn.nestingDepth > 6 ? 'critical' : 'high',
        functionName: fn.name,
        line: fn.line,
        description: `'${fn.name}' har nestningsdjup ${fn.nestingDepth} (gräns: 4)`,
        suggestion: `Tillämpa early-return pattern i '${fn.name}'`,
      });
    }

    // LargeMethod: funktion med fler än 30 rader
    if (fn.length > 30) {
      smells.push({
        type: 'LargeMethod',
        severity: 'medium',
        functionName: fn.name,
        line: fn.line,
        description: `'${fn.name}' är ${fn.length} rader (gräns: 30)`,
        suggestion: `Dela upp '${fn.name}' i mindre funktioner`,
      });
    }

    // LongParameterList: fler än 5 parametrar
    if (fn.parameterCount > 5) {
      smells.push({
        type: 'LongParameterList',
        severity: 'medium',
        functionName: fn.name,
        line: fn.line,
        description: `'${fn.name}' har ${fn.parameterCount} parametrar (gräns: 5)`,
        suggestion: `Gruppera parametrar i ett options-objekt`,
      });
    }
  }

  // BumpyRoad: 3 eller fler funktioner med nestingDepth >= 3
  const bumpyFunctions = functions.filter(f => f.nestingDepth >= 3);
  if (bumpyFunctions.length >= 3) {
    smells.push({
      type: 'BumpyRoad',
      severity: 'high',
      line: bumpyFunctions[0].line,
      description: `${bumpyFunctions.length} funktioner med djup nestning — bumpy road-mönster`,
      suggestion: 'Förenkla kontrollflödet med early returns och hjälpfunktioner',
    });
  }

  return smells;
}
