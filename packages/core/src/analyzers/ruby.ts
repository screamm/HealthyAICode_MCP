import Parser from 'tree-sitter';
import Ruby from 'tree-sitter-ruby';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';
import { rubyProfile } from '../smells/language-profile';
import { detectGodClass } from '../smells/god-class';
import { detectFeatureEnvy } from '../smells/feature-envy';
import { detectMessageChain } from '../smells/message-chain';
import { detectDataClumps } from '../smells/data-clumps';
import { detectPrimitiveObsession } from '../smells/primitive-obsession';
import { detectComplexConditional } from '../smells/complex-conditional';
import { detectLowDocCoverage } from '../smells/doc-coverage';
import { detectBumpyRoadChunks } from '../smells/bumpy-road';

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
  const fnNodes: Parser.SyntaxNode[] = [];
  const fns: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (METHOD_NODE_TYPES.has(node.type)) {
      fnNodes.push(node);
      fns.push(extractFunction(node));
    }
    for (const child of node.children) visit(child);
  }
  visit(tree.rootNode);
  const totalLines = code === '' ? 0 : code.split('\n').length;

  // Text-based detectors (language-agnostic)
  const smells: Smell[] = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ];

  // AST-based profile detectors — Ruby is dynamically typed with no explicit
  // imports, so we pass an empty Set for god-class/feature-envy importedTypeNames.
  const emptyNames = new Set<string>();
  smells.push(
    ...detectGodClass(tree.rootNode, emptyNames, rubyProfile),
    ...detectFeatureEnvy(tree.rootNode, emptyNames, rubyProfile),
    ...detectMessageChain(tree.rootNode, rubyProfile),
    ...detectDataClumps(tree.rootNode, rubyProfile),
    ...detectPrimitiveObsession(tree.rootNode, rubyProfile),
    ...detectComplexConditional(tree.rootNode, rubyProfile),
    ...detectLowDocCoverage(tree.rootNode, code, rubyProfile),
  );

  // Per-function BumpyRoad detection
  for (const fnNode of fnNodes) {
    const br = detectBumpyRoadChunks(fnNode);
    if (br) smells.push(br);
  }

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
