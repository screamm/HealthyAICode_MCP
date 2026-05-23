import Parser from 'tree-sitter';
import Rust from 'tree-sitter-rust';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

const parser = new Parser();
parser.setLanguage(Rust as unknown as Parameters<(typeof parser)['setLanguage']>[0]);

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_expression', 'else_clause', 'for_expression', 'while_expression',
  'loop_expression', 'match_arm', 'while_let_expression',
]);

const NESTING_NODE_TYPES = new Set([
  'if_expression', 'for_expression', 'while_expression',
  'loop_expression',
]);

function rustBinaryCheck(n: Parser.SyntaxNode): boolean {
  if (n.type !== 'binary_expression') return false;
  const op = n.childForFieldName('operator')?.text;
  return op === '&&' || op === '||';
}

export function analyzeRust(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  const tree = parser.parse(code);
  const fns: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'function_item') fns.push(extractFunction(node));
    for (const child of node.children) visit(child);
  }
  visit(tree.rootNode);
  const totalLines = code === '' ? 0 : code.split('\n').length;
  const smells: Smell[] = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ];
  return { functions: fns, metrics: buildSimpleMetrics(fns, totalLines), smells };
}

function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  return {
    name: node.childForFieldName('name')?.text ?? '<anonymous>',
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES, rustBinaryCheck),
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
