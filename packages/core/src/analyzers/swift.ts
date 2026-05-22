import Parser from 'tree-sitter';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics, emptySimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

// tree-sitter-swift may not have a prebuilt native binary on all platforms.
// We load it lazily and fall back to stub output if unavailable.
let swiftParser: Parser | null = null;

function getParser(): Parser | null {
  if (swiftParser !== null) return swiftParser;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Swift = require('tree-sitter-swift');
    const p = new Parser();
    type Language = Parameters<(typeof p)['setLanguage']>[0];
    p.setLanguage(Swift as unknown as Language);
    swiftParser = p;
    return p;
  } catch {
    return null;
  }
}

// NOTE: verify against tree-sitter-swift grammar if counts are off.
// Node types confirmed from src/node-types.json in tree-sitter-swift@0.6.0.
// 'conditional_expression' does NOT exist — use 'ternary_expression'.
// 'for_statement' is the correct name (not 'for_in_statement').
// 'switch_entry' is one branch in a switch (not 'switch_case').
const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement', 'guard_statement', 'for_statement', 'while_statement',
  'repeat_while_statement', 'switch_entry', 'ternary_expression',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement', 'guard_statement', 'for_statement', 'while_statement',
  'repeat_while_statement', 'switch_statement',
]);

const FUNCTION_NODE_TYPES = new Set([
  'function_declaration',
]);

export function analyzeSwift(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  const p = getParser();
  const totalLines = code === '' ? 0 : code.split('\n').length;
  const smells: Smell[] = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ];

  if (!p) {
    // No native build available — return stub metrics (similar to unsupported language).
    return { functions: [], metrics: emptySimpleMetrics(totalLines), smells };
  }

  const tree = p.parse(code);
  const fns: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (FUNCTION_NODE_TYPES.has(node.type)) fns.push(extractFunction(node));
    for (const child of node.children) visit(child);
  }
  visit(tree.rootNode);
  return { functions: fns, metrics: buildSimpleMetrics(fns, totalLines), smells };
}

function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  return {
    name: node.childForFieldName('name')?.text ?? '<anonymous>',
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES),
    cognitiveComplexity: 0,
    nestingDepth: calculateMaxNestingDepth(node, NESTING_NODE_TYPES),
    parameterCount: countParameters(node),
    smells: [],
  };
}

function countParameters(node: Parser.SyntaxNode): number {
  // Swift function_declaration has 'parameter' nodes as direct children (not a field).
  // NOTE: verify against tree-sitter-swift grammar if counts are off.
  return node.namedChildren.filter(c => c.type === 'parameter').length;
}
