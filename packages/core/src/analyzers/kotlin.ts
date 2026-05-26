import Parser from 'tree-sitter';
import Kotlin from 'tree-sitter-kotlin';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';
import { kotlinProfile } from '../smells/language-profile';
import { detectGodClass } from '../smells/god-class';
import { detectFeatureEnvy } from '../smells/feature-envy';
import { detectMessageChain } from '../smells/message-chain';
import { detectDataClumps } from '../smells/data-clumps';
import { detectPrimitiveObsession } from '../smells/primitive-obsession';
import { detectComplexConditional } from '../smells/complex-conditional';
import { detectLowDocCoverage } from '../smells/doc-coverage';
import { detectBumpyRoadChunks } from '../smells/bumpy-road';

const parser = new Parser();
type ParserLanguage = Parameters<(typeof parser)['setLanguage']>[0];
parser.setLanguage(Kotlin as unknown as ParserLanguage);

// Kotlin control-flow nodes that increase cyclomatic complexity
const CYCLOMATIC_NODE_TYPES = new Set([
  'if_expression', 'when_expression', 'when_entry',
  'for_statement', 'while_statement', 'do_while_statement',
  'catch_block', 'try_expression',
]);

// Nesting nodes for max-depth calculation
const NESTING_NODE_TYPES = new Set([
  'if_expression', 'when_expression', 'for_statement',
  'while_statement', 'do_while_statement', 'try_expression',
  'lambda_literal',
]);

// All node types that represent callable function-like constructs
const FUNCTION_NODE_TYPES = new Set([
  'function_declaration',
  'anonymous_function',
  'secondary_constructor',
]);

function kotlinBinaryCheck(n: Parser.SyntaxNode): boolean {
  if (n.type !== 'infix_expression') return false;
  // tree-sitter-kotlin: infix_expression has a middle 'operator' identifier child
  const op = n.children.find(c => c.type === 'simple_identifier' && (c.text === '&&' || c.text === '||'));
  return op !== undefined;
}

export function analyzeKotlin(code: string, filePath = '<inline>'): {
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

  function visit(node: Parser.SyntaxNode): void {
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      fnNodes.push(node);
      fns.push(extractFunction(node));
    }
    for (const child of node.children) visit(child);
  }
  visit(tree.rootNode);

  const totalLines = code.split('\n').length;

  const smells: Smell[] = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ];

  const emptyNames = new Set<string>();
  smells.push(
    ...detectGodClass(tree.rootNode, emptyNames, kotlinProfile),
    ...detectFeatureEnvy(tree.rootNode, emptyNames, kotlinProfile),
    ...detectMessageChain(tree.rootNode, kotlinProfile),
    ...detectDataClumps(tree.rootNode, kotlinProfile),
    ...detectPrimitiveObsession(tree.rootNode, kotlinProfile),
    ...detectComplexConditional(tree.rootNode, kotlinProfile),
    ...detectLowDocCoverage(tree.rootNode, code, kotlinProfile),
  );

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
    name: getFunctionName(node),
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES, kotlinBinaryCheck),
    cognitiveComplexity: 0,
    nestingDepth: calculateMaxNestingDepth(node, NESTING_NODE_TYPES),
    parameterCount: countParameters(node),
    smells: [],
  };
}

function getFunctionName(node: Parser.SyntaxNode): string {
  // function_declaration: first simple_identifier child is the name
  const si = node.namedChildren.find(c => c.type === 'simple_identifier');
  return si?.text ?? '<anonymous>';
}

function countParameters(node: Parser.SyntaxNode): number {
  const paramList = node.namedChildren.find(
    c => c.type === 'function_value_parameters',
  );
  if (!paramList) return 0;
  return paramList.namedChildren.filter(
    c => c.type === 'parameter' || c.type === 'function_value_parameter',
  ).length;
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
