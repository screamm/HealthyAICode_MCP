import Parser from 'tree-sitter';
import Scala from 'tree-sitter-scala';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';
import { scalaProfile } from '../smells/language-profile';
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
parser.setLanguage(Scala as unknown as ParserLanguage);

// Scala control-flow nodes that increase cyclomatic complexity
const CYCLOMATIC_NODE_TYPES = new Set([
  'if_expression', 'for_expression', 'while_expression',
  'do_while_expression', 'case_clause', 'catch_clause',
  'try_expression',
]);

// Nesting nodes for max-depth calculation
const NESTING_NODE_TYPES = new Set([
  'if_expression', 'for_expression', 'while_expression',
  'do_while_expression', 'match_expression', 'try_expression',
  'block',
]);

// Function node types — both concrete (function_definition) and abstract (function_declaration)
const FUNCTION_NODE_TYPES = new Set([
  'function_definition',
  'function_declaration', // abstract def in traits
]);

function scalaBinaryCheck(n: Parser.SyntaxNode): boolean {
  if (n.type !== 'infix_expression') return false;
  // infix_expression child at index 1 is the operator identifier
  const op = n.children.find(c => c.type === 'operator_identifier' || c.type === 'identifier');
  return op?.text === '&&' || op?.text === '||';
}

/** Collects all function nodes and FunctionResult objects from the AST. */
function collectFunctions(rootNode: Parser.SyntaxNode): {
  fnNodes: Parser.SyntaxNode[];
  fns: FunctionResult[];
} {
  const fnNodes: Parser.SyntaxNode[] = [];
  const fns: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      fnNodes.push(node);
      fns.push(extractFunction(node));
    }
    for (const child of node.children) visit(child);
  }
  visit(rootNode);
  return { fnNodes, fns };
}

/** Detects AST-based and text-based smells for a Scala file. */
function detectScalaSmells(
  rootNode: Parser.SyntaxNode,
  fnNodes: Parser.SyntaxNode[],
  code: string,
  filePath: string,
): Smell[] {
  const smells: Smell[] = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ];
  const emptyNames = new Set<string>();
  smells.push(
    ...detectGodClass(rootNode, emptyNames, scalaProfile),
    ...detectFeatureEnvy(rootNode, emptyNames, scalaProfile),
    ...detectMessageChain(rootNode, scalaProfile),
    ...detectDataClumps(rootNode, scalaProfile),
    ...detectPrimitiveObsession(rootNode, scalaProfile),
    ...detectComplexConditional(rootNode, scalaProfile),
    ...detectLowDocCoverage(rootNode, code, scalaProfile),
  );
  for (const fnNode of fnNodes) {
    const br = detectBumpyRoadChunks(fnNode);
    if (br) smells.push(br);
  }
  return smells;
}

export function analyzeScala(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  if (!code || code.trim() === '') {
    return { functions: [], smells: detectSATDFromText(code), metrics: emptyMetrics(0) };
  }
  const tree = parser.parse(code);
  const { fnNodes, fns } = collectFunctions(tree.rootNode);
  const totalLines = code.split('\n').length;
  const smells = detectScalaSmells(tree.rootNode, fnNodes, code, filePath);
  return { functions: fns, metrics: buildSimpleMetrics(fns, totalLines), smells };
}

function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  return {
    name: getFunctionName(node),
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES, scalaBinaryCheck),
    cognitiveComplexity: 0,
    nestingDepth: calculateMaxNestingDepth(node, NESTING_NODE_TYPES),
    parameterCount: countParameters(node),
    smells: [],
  };
}

function getFunctionName(node: Parser.SyntaxNode): string {
  // function_definition: name is via 'name' field, which is an identifier node
  const nameNode = node.childForFieldName('name');
  if (nameNode) return nameNode.text;
  // Fallback: first identifier child
  const id = node.namedChildren.find(c => c.type === 'identifier');
  return id?.text ?? '<anonymous>';
}

function countParameters(node: Parser.SyntaxNode): number {
  // Scala: function_definition has a 'parameters' named child
  const paramList = node.namedChildren.find(c => c.type === 'parameters');
  if (!paramList) return 0;
  return paramList.namedChildren.filter(c => c.type === 'parameter').length;
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
