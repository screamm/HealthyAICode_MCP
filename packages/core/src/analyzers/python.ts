import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import type { FunctionResult, MetricBreakdown } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';

const parser = new Parser();
parser.setLanguage(Python as unknown as object);

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement', 'elif_clause', 'for_statement', 'while_statement',
  'except_clause', 'conditional_expression', 'boolean_operator',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'while_statement',
  'try_statement', 'with_statement',
]);

const PARAMETER_NODE_TYPES = new Set([
  'identifier', 'typed_parameter', 'default_parameter',
  'typed_default_parameter', 'list_splat_pattern', 'dictionary_splat_pattern',
]);

const IMPLICIT_PARAMS = new Set(['self', 'cls']);

export function analyzePython(code: string): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: never[];
} {
  const tree = parser.parse(code);
  const fns: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'function_definition') fns.push(extractFunction(node));
    for (const child of node.children) visit(child);
  }
  visit(tree.rootNode);
  const totalLines = code === '' ? 0 : code.split('\n').length;
  return { functions: fns, metrics: buildSimpleMetrics(fns, totalLines), smells: [] };
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
  const params = node.childForFieldName('parameters');
  if (!params) return 0;
  return params.namedChildren.filter(isCountableParameter).length;
}

function isCountableParameter(c: Parser.SyntaxNode): boolean {
  if (!PARAMETER_NODE_TYPES.has(c.type)) return false;
  if (c.type === 'identifier' && IMPLICIT_PARAMS.has(c.text)) return false;
  return true;
}
