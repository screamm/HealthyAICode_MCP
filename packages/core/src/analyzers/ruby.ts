import Parser from 'tree-sitter';
import Ruby from 'tree-sitter-ruby';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

const parser = new Parser();
type Language = Parameters<(typeof parser)['setLanguage']>[0];
parser.setLanguage(Ruby as unknown as Language);

// NOTE: Ruby's a ? b : c ternary is 'conditional' in tree-sitter-ruby, NOT 'ternary'.
const CYCLOMATIC_NODE_TYPES = new Set([
  'if', 'elsif', 'unless', 'while', 'until', 'for', 'when',
  'rescue', 'if_modifier', 'unless_modifier', 'while_modifier',
  'until_modifier', 'conditional',
]);

const NESTING_NODE_TYPES = new Set([
  'if', 'unless', 'while', 'until', 'for',
  'case', 'begin', 'block', 'do_block',
]);

const METHOD_NODE_TYPES = new Set([
  'method',           // instance methods: def foo(...)
  'singleton_method', // class-level methods: def self.foo(...)
]);

const PARAMETER_NODE_TYPES = new Set([
  'identifier',
  'optional_parameter',
  'keyword_parameter',
  'splat_parameter',
  'hash_splat_parameter',
  'block_parameter',
  'destructured_parameter',
]);

export function analyzeRuby(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  const tree = parser.parse(code);
  const fns: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (METHOD_NODE_TYPES.has(node.type)) fns.push(extractFunction(node));
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
  return params.namedChildren.filter(c => PARAMETER_NODE_TYPES.has(c.type)).length;
}
