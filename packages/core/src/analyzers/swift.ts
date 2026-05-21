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
    p.setLanguage(Swift as unknown as object);
    swiftParser = p;
    return p;
  } catch {
    return null;
  }
}

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement', 'for_in_statement', 'while_statement', 'repeat_while_statement',
  'switch_case', 'catch_clause', 'guard_statement',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement', 'for_in_statement', 'while_statement',
  'repeat_while_statement', 'do_statement',
]);

const FUNCTION_NODE_TYPES = new Set([
  'function_declaration', 'initializer_declaration', 'deinit_declaration',
]);

function swiftBinaryCheck(n: Parser.SyntaxNode): boolean {
  if (n.type !== 'conjunction_expression' && n.type !== 'disjunction_expression') return false;
  return true;
}

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
    // No native build — return stub metrics (similar to unsupported language)
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
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES, swiftBinaryCheck),
    cognitiveComplexity: 0,
    nestingDepth: calculateMaxNestingDepth(node, NESTING_NODE_TYPES),
    parameterCount: countParameters(node),
    smells: [],
  };
}

function countParameters(node: Parser.SyntaxNode): number {
  const params = node.childForFieldName('parameters');
  if (!params) return 0;
  return params.namedChildren.filter(c => c.type === 'parameter').length;
}
