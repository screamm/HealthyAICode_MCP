import Parser from 'tree-sitter';
import Ruby from 'tree-sitter-ruby';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

const parser = new Parser();
parser.setLanguage(Ruby as unknown as object);

const CYCLOMATIC_NODE_TYPES = new Set([
  'if', 'elsif', 'unless', 'for', 'while', 'until',
  'rescue', 'when', 'case',
]);

const NESTING_NODE_TYPES = new Set([
  'if', 'unless', 'for', 'while', 'until', 'begin',
]);

const FUNCTION_NODE_TYPES = new Set([
  'method', 'singleton_method',
]);

function rubyBinaryCheck(n: Parser.SyntaxNode): boolean {
  return n.type === 'and' || n.type === 'or';
}

export function analyzeRuby(code: string, filePath = '<inline>'): {
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
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES, rubyBinaryCheck),
    cognitiveComplexity: 0,
    nestingDepth: calculateMaxNestingDepth(node, NESTING_NODE_TYPES),
    parameterCount: countParameters(node),
    smells: [],
  };
}

function countParameters(node: Parser.SyntaxNode): number {
  const params = node.childForFieldName('parameters');
  if (!params) return 0;
  return params.namedChildren.filter(c =>
    c.type === 'identifier' ||
    c.type === 'optional_parameter' ||
    c.type === 'splat_parameter' ||
    c.type === 'hash_splat_parameter' ||
    c.type === 'block_parameter',
  ).length;
}
