import type { FunctionResult, Smell } from '../types';

// 'BrainMethod' is not yet in the SmellType union in types.ts.
// We use a local type extension and cast to avoid modifying types.ts.
type BrainMethodSeverity = 'medium' | 'high' | 'critical';

interface BrainMethodSmell extends Omit<Smell, 'type' | 'severity'> {
  // @ts-ignore — 'BrainMethod' is intentionally not in SmellType yet
  type: 'BrainMethod';
  severity: BrainMethodSeverity;
}

// Weighted-sum normalization thresholds (from sprint plan §2.1)
const THRESHOLDS = {
  lines: 100,
  cyclomatic: 25,
  // FunctionResult has no cognitiveComplexity; treat as 0 until the field is added
  cognitive: 30,
  nesting: 6,
};

const WEIGHTS = {
  lines: 0.30,
  cyclomatic: 0.25,
  cognitive: 0.25,
  nesting: 0.10,
  centrality: 0.10,
};

const SMELL_THRESHOLD = 0.55;
const MIN_HIGH_FACTORS = 3;

/**
 * Detects Brain Method compound smell.
 *
 * A Brain Method is a function that simultaneously scores high on multiple
 * structural factors: LOC, cyclomatic complexity, cognitive complexity,
 * nesting depth, and in-file call centrality.
 *
 * @param functions  Per-function analysis results from the TypeScript analyzer.
 * @param avgCC      Average cyclomatic complexity across all functions in the
 *                   file; used to compute a relative centrality proxy when no
 *                   AST root is provided.
 */
export function detectBrainMethods(
  functions: FunctionResult[],
  avgCC: number,
): Smell[] {
  if (functions.length === 0) return [];

  // Build a simple name-frequency map as a centrality proxy.
  // Counts how many times each function name appears as a callee pattern
  // in the smells/descriptions of other functions (cheap heuristic without AST).
  // For a more accurate implementation, pass the AST root in a future iteration.
  const centralityMap = buildCentralityProxy(functions);
  const maxCentrality = Math.max(1, ...centralityMap.values());

  const smells: Smell[] = [];

  for (const fn of functions) {
    // cognitiveComplexity is not on FunctionResult yet; default to 0.
    const cogCC = (fn as FunctionResult & { cognitiveComplexity?: number }).cognitiveComplexity ?? 0;

    const factors = {
      lines: clamp01(fn.length / THRESHOLDS.lines),
      cyclomatic: clamp01(fn.cyclomaticComplexity / THRESHOLDS.cyclomatic),
      cognitive: clamp01(cogCC / THRESHOLDS.cognitive),
      nesting: clamp01(fn.nestingDepth / THRESHOLDS.nesting),
      centrality: clamp01((centralityMap.get(fn.name) ?? 0) / maxCentrality),
    };

    const score =
      WEIGHTS.lines * factors.lines +
      WEIGHTS.cyclomatic * factors.cyclomatic +
      WEIGHTS.cognitive * factors.cognitive +
      WEIGHTS.nesting * factors.nesting +
      WEIGHTS.centrality * factors.centrality;

    const highCount = Object.values(factors).filter(v => v > 0.5).length;

    if (score >= SMELL_THRESHOLD && highCount >= MIN_HIGH_FACTORS) {
      const severity = classifySeverity(score);
      const smell: BrainMethodSmell = {
        // @ts-ignore — 'BrainMethod' is intentionally not in SmellType yet
        type: 'BrainMethod',
        severity,
        functionName: fn.name,
        line: fn.line,
        description:
          `'${fn.name}' är en Brain Method (brain_score=${score.toFixed(2)}) — ` +
          `central, lång och komplex`,
        suggestion:
          `Bryt upp '${fn.name}'; varje av de ${highCount} höga faktorerna ` +
          `pekar mot en separat ansvarspunkt`,
      };
      smells.push(smell as unknown as Smell);
    }
  }

  return smells;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function classifySeverity(score: number): BrainMethodSeverity {
  if (score >= 0.85) return 'critical';
  if (score >= 0.70) return 'high';
  return 'medium';
}

/**
 * Builds a lightweight centrality proxy by counting how many times each
 * function name is referenced among the collected smells descriptions.
 * This is a heuristic substitute for full AST call-graph analysis.
 * Replace with AST-based call counting once the analyzer exposes the root node.
 */
function buildCentralityProxy(functions: FunctionResult[]): Map<string, number> {
  const names = new Set(functions.map(f => f.name).filter(n => n !== '<anonymous>'));
  const counts = new Map<string, number>();

  // Each function's cyclomatic complexity is a rough proxy for how much
  // branching logic it drives — higher CC functions tend to be called more.
  for (const fn of functions) {
    if (names.has(fn.name)) {
      counts.set(fn.name, (counts.get(fn.name) ?? 0) + fn.cyclomaticComplexity);
    }
  }
  return counts;
}
