import Parser from 'tree-sitter';
import Go from 'tree-sitter-go';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

const parser = new Parser();
parser.setLanguage(Go as unknown as Parameters<(typeof parser)['setLanguage']>[0]);

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'expression_case', 'type_case',
  'select_statement', 'communication_case',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'select_statement',
]);

const FUNCTION_NODE_TYPES = new Set([
  'function_declaration', 'method_declaration', 'func_literal',
]);

function goBinaryCheck(n: Parser.SyntaxNode): boolean {
  if (n.type !== 'binary_expression') return false;
  const op = n.childForFieldName('operator')?.text;
  return op === '&&' || op === '||';
}

export function analyzeGo(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  const tree = parser.parse(code);
  const fns: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (FUNCTION_NODE_TYPES.has(node.type)) fns.push(extractFunction(node));
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
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES, goBinaryCheck),
    cognitiveComplexity: 0,
    nestingDepth: calculateMaxNestingDepth(node, NESTING_NODE_TYPES),
    parameterCount: countParameters(node),
    smells: [],
  };
}

function countParameters(node: Parser.SyntaxNode): number {
  const params = node.childForFieldName('parameters');
  if (!params) return 0;
  // Go groups params: "a, b int" → two identifier children under one parameter_declaration
  let count = 0;
  for (const child of params.namedChildren) {
    if (child.type === 'parameter_declaration') {
      // Count the named identifiers in the declaration
      const names = child.namedChildren.filter(c => c.type === 'identifier');
      count += names.length > 0 ? names.length : 1;
    } else if (child.type === 'variadic_parameter_declaration') {
      count += 1;
    }
  }
  return count;
}
