import Parser from 'tree-sitter';
import Elixir from 'tree-sitter-elixir';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

const parser = new Parser();
type ParserLanguage = Parameters<(typeof parser)['setLanguage']>[0];
parser.setLanguage(Elixir as unknown as ParserLanguage);

// Elixir control-flow call identifiers that increase cyclomatic complexity.
// In tree-sitter-elixir all of these are 'call' nodes with an 'identifier' child
// whose text matches one of these keywords.
const CC_CALL_KEYWORDS = new Set([
  'if', 'unless', 'cond', 'case', 'receive', 'with', 'for',
  'try', 'rescue', 'catch',
]);

// "stab_clause" nodes (-> in case/cond/fn) each add a path.
// "else_block" nodes within if/try add a path.
const CC_NODE_TYPES = new Set([
  'stab_clause',
  'else_block',
  'rescue_block',
  'catch_block',
  'after_block',
]);

// Nesting depth contributors
const NESTING_CALL_KEYWORDS = new Set([
  'if', 'unless', 'case', 'cond', 'receive', 'with', 'for', 'try',
]);

// def / defp call identifiers mark function boundaries
const DEF_KEYWORDS = new Set(['def', 'defp', 'defmacro', 'defmacrop']);

export function analyzeElixir(code: string, filePath = '<inline>'): {
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
  const fnNodes: Parser.SyntaxNode[] = [];
  const fns: FunctionResult[] = [];

  // Visit top-level to find def/defp call nodes
  function visit(node: Parser.SyntaxNode): void {
    if (isDefCall(node)) {
      fnNodes.push(node);
      fns.push(extractFunction(node));
      // Don't recurse into nested defs (Elixir doesn't have them idiomatically,
      // but defmodule bodies can contain multiple defs at the same level)
      return;
    }
    for (const child of node.children) visit(child);
  }
  visit(tree.rootNode);

  const totalLines = code.split('\n').length;

  const smells: Smell[] = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ];

  return { functions: fns, metrics: buildSimpleMetrics(fns, totalLines), smells };
}

/**
 * Returns true if this node is a `call` node whose first child identifier
 * is "def", "defp", "defmacro", or "defmacrop".
 */
function isDefCall(node: Parser.SyntaxNode): boolean {
  if (node.type !== 'call') return false;
  const ident = node.children.find(c => c.type === 'identifier');
  return ident !== undefined && DEF_KEYWORDS.has(ident.text);
}

/**
 * Returns true if this is a control-flow call (if/case/cond/etc.)
 */
function isControlFlowCall(node: Parser.SyntaxNode): boolean {
  if (node.type !== 'call') return false;
  const ident = node.children.find(c => c.type === 'identifier');
  return ident !== undefined && CC_CALL_KEYWORDS.has(ident.text);
}

function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const { name, paramCount } = getFunctionMeta(node);
  return {
    name,
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: computeCC(node),
    cognitiveComplexity: 0,
    nestingDepth: computeNesting(node),
    parameterCount: paramCount,
    smells: [],
  };
}

/**
 * Extracts the function name and parameter count from a def call node.
 *
 * Structure: call[identifier="def", arguments[call[identifier=<name>, arguments[...params...]] | binary_operator[call...]]]
 */
function getFunctionMeta(node: Parser.SyntaxNode): { name: string; paramCount: number } {
  const argsNode = node.namedChildren.find(c => c.type === 'arguments');
  if (!argsNode) return { name: '<anonymous>', paramCount: 0 };

  // First named child of arguments is either:
  // - a call node (no guard): call[identifier=<name>, arguments[...]]
  // - a binary_operator node (with 'when' guard): binary_operator[call[...], when, ...]
  let callNode: Parser.SyntaxNode | undefined;

  const firstArg = argsNode.namedChildren[0];
  if (!firstArg) return { name: '<anonymous>', paramCount: 0 };

  if (firstArg.type === 'call') {
    callNode = firstArg;
  } else if (firstArg.type === 'binary_operator') {
    // when guard: left side is the function call
    callNode = firstArg.namedChildren.find(c => c.type === 'call');
  }

  if (!callNode) return { name: '<anonymous>', paramCount: 0 };

  const nameIdent = callNode.namedChildren.find(c => c.type === 'identifier');
  const name = nameIdent?.text ?? '<anonymous>';

  const paramArgs = callNode.namedChildren.find(c => c.type === 'arguments');
  const paramCount = paramArgs
    ? paramArgs.namedChildren.filter(c => c.type !== ',').length
    : 0;

  return { name, paramCount };
}

/**
 * Counts cyclomatic complexity for an Elixir function node.
 * Base CC = 1. Each control-flow call + stab_clause + else_block adds 1.
 */
function computeCC(fnNode: Parser.SyntaxNode): number {
  let cc = 1;
  function traverse(node: Parser.SyntaxNode): void {
    if (CC_NODE_TYPES.has(node.type)) {
      cc++;
    } else if (isControlFlowCall(node)) {
      cc++;
    }
    for (const child of node.children) traverse(child);
  }
  // Only traverse the do_block body (not the function signature)
  const doBlock = fnNode.namedChildren.find(c => c.type === 'do_block');
  if (doBlock) traverse(doBlock);
  return cc;
}

/**
 * Computes maximum nesting depth for an Elixir function node.
 */
function computeNesting(fnNode: Parser.SyntaxNode): number {
  let maxDepth = 0;
  function traverse(node: Parser.SyntaxNode, depth: number): void {
    const addNesting = isNestingCall(node);
    const newDepth = addNesting ? depth + 1 : depth;
    if (addNesting) maxDepth = Math.max(maxDepth, newDepth);
    for (const child of node.children) traverse(child, newDepth);
  }
  const doBlock = fnNode.namedChildren.find(c => c.type === 'do_block');
  if (doBlock) traverse(doBlock, 0);
  return maxDepth;
}

function isNestingCall(node: Parser.SyntaxNode): boolean {
  if (node.type !== 'call') return false;
  const ident = node.children.find(c => c.type === 'identifier');
  return ident !== undefined && NESTING_CALL_KEYWORDS.has(ident.text);
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
