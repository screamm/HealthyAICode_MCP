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

/** Output shape returned by the generic Tier B analyzer. */
export interface TierBAnalyzerOutput {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
}

/** A detected function's start line index (0-based) and name. */
interface FunctionStart {
  lineIdx: number;
  name: string;
}

/** Context required to build a FunctionResult for a single detected function. */
interface FunctionBuildContext {
  start: FunctionStart;
  nextLineIdx: number;
  lines: string[];
  controlFlowPattern: RegExp;
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
 * Scans lines for function definitions, estimates their boundaries, and
 * computes cyclomatic complexity for each function body.
 */
function extractFunctionsTierB(lines: string[], config: TierBConfig): FunctionResult[] {
  const starts = collectFunctionStarts(lines, config.functionPatterns);
  return starts.map((start, fi) => {
    const nextLineIdx = fi + 1 < starts.length ? starts[fi + 1].lineIdx : lines.length;
    return buildFunctionResult({ start, nextLineIdx, lines, controlFlowPattern: config.controlFlowKeywords });
  });
}

/**
 * Scans source lines against all configured patterns and returns ordered
 * function start positions with their names.
 */
function collectFunctionStarts(lines: string[], patterns: RegExp[]): FunctionStart[] {
  const starts: FunctionStart[] = [];
  for (let i = 0; i < lines.length; i++) {
    const name = matchFunctionLine(lines[i], patterns);
    if (name !== null) starts.push({ lineIdx: i, name });
  }
  return starts;
}

/**
 * Tests a single source line against each pattern in order.
 * Returns the captured function name on the first match, or null if none match.
 */
function matchFunctionLine(line: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    // Strip global flag to avoid stateful lastIndex issues
    const freshPattern = new RegExp(pattern.source, pattern.flags.replace('g', ''));
    const match = freshPattern.exec(line);
    if (match) return match[1] ?? '<anonymous>';
  }
  return null;
}

/**
 * Builds a FunctionResult for one detected function.
 * The body extends from this function's start line up to (but not including)
 * the next function's start line, or end-of-file.
 */
function buildFunctionResult(ctx: FunctionBuildContext): FunctionResult {
  const { start, nextLineIdx, lines, controlFlowPattern } = ctx;
  const bodyText = lines.slice(start.lineIdx, nextLineIdx).join('\n');
  return {
    name: start.name,
    line: start.lineIdx + 1,
    length: Math.max(nextLineIdx - start.lineIdx, 1),
    cyclomaticComplexity: countControlFlow(bodyText, controlFlowPattern),
    cognitiveComplexity: 0,
    nestingDepth: 0,
    parameterCount: 0,
    smells: [],
  };
}

/**
 * Counts occurrences of control-flow keywords in a code block.
 * Returns 1 (base CC) + count of matches.
 */
function countControlFlow(bodyText: string, pattern: RegExp): number {
  const globalPattern = new RegExp(pattern.source, 'g');
  const matches = [...bodyText.matchAll(globalPattern)];
  return 1 + matches.length;
}
