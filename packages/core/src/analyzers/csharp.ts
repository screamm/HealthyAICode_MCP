import Parser from 'tree-sitter';
import CSharp from 'tree-sitter-c-sharp';
import type { FunctionResult, MetricBreakdown } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';

const parser = new Parser();
parser.setLanguage(CSharp as unknown as object);

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'foreach_statement',
  'while_statement', 'do_statement', 'conditional_expression',
  'catch_clause', 'case_switch_label',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'foreach_statement',
  'while_statement', 'do_statement', 'try_statement',
]);

const METHOD_NODE_TYPES = new Set([
  'method_declaration', 'constructor_declaration', 'local_function_statement',
]);

function csharpBinaryCheck(n: Parser.SyntaxNode): boolean {
  if (n.type !== 'binary_expression') return false;
  const op = n.childForFieldName('operator')?.text;
  return op === '&&' || op === '||' || op === '??';
}

export function analyzeCSharp(code: string): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: never[];
} {
  const tree = parser.parse(code);
  const fns: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (METHOD_NODE_TYPES.has(node.type)) fns.push(extractFunction(node));
    for (const child of node.children) visit(child);
  }
  visit(tree.rootNode);
  const totalLines = code === '' ? 0 : code.split('\n').length;
  return { functions: fns, metrics: buildSimpleMetrics(fns, totalLines), smells: [] };
}

function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const params = node.childForFieldName('parameters');
  const paramCount = params
    ? params.namedChildren.filter(c => c.type === 'parameter').length
    : 0;
  return {
    name: node.childForFieldName('name')?.text ?? '<anonymous>',
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES, csharpBinaryCheck),
    cognitiveComplexity: 0,
    nestingDepth: calculateMaxNestingDepth(node, NESTING_NODE_TYPES),
    parameterCount: paramCount,
    smells: [],
  };
}
