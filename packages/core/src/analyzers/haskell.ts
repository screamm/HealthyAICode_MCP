import Parser from 'tree-sitter';
import Haskell from 'tree-sitter-haskell';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

const parser = new Parser();
type ParserLanguage = Parameters<(typeof parser)['setLanguage']>[0];
parser.setLanguage(Haskell as unknown as ParserLanguage);

// Node types that increase cyclomatic complexity.
// - conditional: if/then/else expression
// - alternative: each branch in a case expression
// - guard: guard clause (| condition = expr)
const CYCLOMATIC_NODE_TYPES = new Set([
  'conditional',  // if/then/else
  'alternative',  // case branch
  'guard',        // guard clause
]);

// Nesting depth contributors
const NESTING_NODE_TYPES = new Set([
  'conditional',
  'case',
  'let_expression',
  'do',
]);

export function analyzeHaskell(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  if (!code || code.trim() === '') {
    return {
      functions: [],
      smells: detectSATDFromText(code),
      metrics: emptyMetrics(0),
    };
  }

  const tree = parser.parse(code);
  const fns: FunctionResult[] = [];

  // Haskell allows multiple clauses per function (pattern matching).
  // We aggregate clauses that share the same name into one FunctionResult,
  // combining their line ranges and CC contributions.
  const fnMap = new Map<string, { startLine: number; endLine: number; cc: number; depth: number }>();

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'function') {
      const name = getFunctionName(node);
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const cc = computeCC(node);
      const depth = computeNesting(node);

      const existing = fnMap.get(name);
      if (existing) {
        // Merge clauses: extend range, accumulate CC, take max depth
        existing.startLine = Math.min(existing.startLine, startLine);
        existing.endLine = Math.max(existing.endLine, endLine);
        // Each additional clause adds one path (like a case branch)
        existing.cc += cc - 1; // subtract base-1 to avoid double-counting
        existing.depth = Math.max(existing.depth, depth);
      } else {
        fnMap.set(name, { startLine, endLine, cc, depth });
      }
      return; // don't recurse into nested function definitions
    }
    for (const child of node.children) visit(child);
  }
  visit(tree.rootNode);

  for (const [name, meta] of fnMap) {
    fns.push({
      name,
      line: meta.startLine,
      length: meta.endLine - meta.startLine + 1,
      cyclomaticComplexity: Math.max(meta.cc, 1),
      cognitiveComplexity: 0,
      nestingDepth: meta.depth,
      parameterCount: 0,
      smells: [],
    });
  }

  const totalLines = code.split('\n').length;
  const smells: Smell[] = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ];

  return { functions: fns, metrics: buildSimpleMetrics(fns, totalLines), smells };
}

function getFunctionName(node: Parser.SyntaxNode): string {
  // 'function' node's first named child is a 'variable' node with the function name
  const variable = node.namedChildren.find(c => c.type === 'variable');
  return variable?.text ?? '<anonymous>';
}

/**
 * Counts cyclomatic complexity for a Haskell function clause.
 * Base = 1. Each conditional, case alternative, or guard adds 1.
 */
function computeCC(fnNode: Parser.SyntaxNode): number {
  let cc = 1;
  function traverse(node: Parser.SyntaxNode): void {
    if (CYCLOMATIC_NODE_TYPES.has(node.type)) cc++;
    for (const child of node.children) traverse(child);
  }
  // Only traverse the match body (not the function name/patterns header)
  const matchNode = fnNode.namedChildren.find(c => c.type === 'match');
  if (matchNode) traverse(matchNode);
  return cc;
}

/**
 * Computes maximum nesting depth for a Haskell function clause.
 */
function computeNesting(fnNode: Parser.SyntaxNode): number {
  let maxDepth = 0;
  function traverse(node: Parser.SyntaxNode, depth: number): void {
    const isNesting = NESTING_NODE_TYPES.has(node.type);
    const newDepth = isNesting ? depth + 1 : depth;
    if (isNesting) maxDepth = Math.max(maxDepth, newDepth);
    for (const child of node.children) traverse(child, newDepth);
  }
  const matchNode = fnNode.namedChildren.find(c => c.type === 'match');
  if (matchNode) traverse(matchNode, 0);
  return maxDepth;
}

function emptyMetrics(totalLines: number): MetricBreakdown {
  return {
    cyclomaticComplexity: 1,
    cognitiveComplexity: 0,
    maxNestingDepth: 0,
    avgFunctionLength: 0,
    maxFunctionLength: 0,
    avgParameterCount: 0,
    maxParameterCount: 0,
    totalLines,
    duplicationScore: 0,
  };
}
