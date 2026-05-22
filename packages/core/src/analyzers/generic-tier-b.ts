import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics, emptySimpleMetrics } from './metrics-builder';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

/**
 * Configuration for the generic Tier B text-based analyzer.
 * Tier B analyzers use regex-based extraction instead of tree-sitter AST parsing,
 * making them faster but less precise than Tier A analyzers.
 */
export interface TierBConfig {
  /** Language identifier used in output metadata. */
  language: string;
  /**
   * Ordered list of regex patterns that match function/method definitions.
   * The first capture group (index 1) should be the function name.
   * Patterns are tested against each line individually.
   */
  functionPatterns: RegExp[];
  /**
   * Regex with global flag that matches control-flow keywords.
   * Each match increments cyclomatic complexity by 1.
   * The base CC starts at 1 (one path always exists).
   */
  controlFlowKeywords: RegExp;
  /**
   * Single-character or short string that begins a line comment.
   * Used to identify comment lines (informational only).
   */
  commentPrefix: string;
}

export interface TierBAnalyzerOutput {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
}

/**
 * Extracts functions and cyclomatic complexity from source code using
 * regex-based pattern matching. This is the shared implementation for
 * all Tier B language analyzers (Bash, Lua, Elixir, Haskell, R, Clojure).
 *
 * Function boundaries are estimated by scanning for the next function
 * start; this may overcount function length in densely-packed scripts
 * but is acceptable for Tier B analysis.
 */
export function analyzeGenericTierB(
  code: string,
  filePath: string,
  config: TierBConfig,
): TierBAnalyzerOutput {
  if (!code || code.trim() === '') {
    return {
      functions: [],
      smells: detectSATDFromText(code),
      metrics: emptySimpleMetrics(0),
    };
  }

  const lines = code.split('\n');
  const totalLines = lines.length;
  const functions = extractFunctionsTierB(lines, config);

  const smells: Smell[] = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ];

  return {
    functions,
    smells,
    metrics: buildSimpleMetrics(functions, totalLines),
  };
}

/**
 * Scans lines for function definitions and estimates their boundaries.
 * For each found function, counts control-flow keyword occurrences
 * within the function body to compute cyclomatic complexity.
 */
function extractFunctionsTierB(
  lines: string[],
  config: TierBConfig,
): FunctionResult[] {
  const functions: FunctionResult[] = [];

  // Collect function start positions and names
  const functionStarts: Array<{ lineIdx: number; name: string }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of config.functionPatterns) {
      // Strip global flag to avoid stateful lastIndex issues
      const freshPattern = new RegExp(pattern.source, pattern.flags.replace('g', ''));
      const match = freshPattern.exec(line);
      if (match) {
        const name = match[1] ?? '<anonymous>';
        functionStarts.push({ lineIdx: i, name });
        break; // Only match one pattern per line
      }
    }
  }

  for (let fi = 0; fi < functionStarts.length; fi++) {
    const { lineIdx, name } = functionStarts[fi];
    const startLine = lineIdx + 1; // 1-indexed

    // Function ends just before the next function starts, or at EOF
    const nextFuncIdx = fi + 1 < functionStarts.length
      ? functionStarts[fi + 1].lineIdx
      : lines.length;

    const bodyLines = lines.slice(lineIdx, nextFuncIdx);
    const bodyText = bodyLines.join('\n');
    const length = nextFuncIdx - lineIdx;

    // Count control-flow keywords in function body (base CC = 1)
    const cyclomaticComplexity = countControlFlow(bodyText, config.controlFlowKeywords);

    functions.push({
      name,
      line: startLine,
      length: Math.max(length, 1),
      cyclomaticComplexity,
      cognitiveComplexity: 0,
      nestingDepth: 0,
      parameterCount: 0,
      smells: [],
    });
  }

  return functions;
}

/**
 * Counts occurrences of control-flow keywords in a code block.
 * Returns 1 (base CC) + count of matches.
 */
function countControlFlow(bodyText: string, pattern: RegExp): number {
  // Re-create with global flag to enable matchAll
  const globalPattern = new RegExp(pattern.source, 'g');
  const matches = [...bodyText.matchAll(globalPattern)];
  return 1 + matches.length;
}
