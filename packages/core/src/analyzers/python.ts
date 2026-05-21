import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';
import { pythonProfile } from '../smells/language-profile';
import { detectGodClass } from '../smells/god-class';
import { detectFeatureEnvy } from '../smells/feature-envy';
import { detectMessageChain } from '../smells/message-chain';
import { detectDataClumps } from '../smells/data-clumps';
import { detectPrimitiveObsession } from '../smells/primitive-obsession';
import { detectComplexConditional } from '../smells/complex-conditional';
import { detectLowDocCoverage } from '../smells/doc-coverage';
import { computeCognitiveComplexity } from '../smells/cognitive-complexity';
import { detectBumpyRoadChunks } from '../smells/bumpy-road';

const parser = new Parser();
parser.setLanguage(Python as unknown as Parameters<(typeof parser)['setLanguage']>[0]);

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

export function analyzePython(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  const tree = parser.parse(code);

  // Collect function nodes for per-function analysis
  const fnNodes: Parser.SyntaxNode[] = [];
  const fns: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'function_definition') {
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

  // AST-based profile detectors
  // Python has no imported type names concept, so pass an empty Set for god-class/feature-envy
  const emptyNames = new Set<string>();
  smells.push(
    ...detectGodClass(tree.rootNode, emptyNames, pythonProfile),
    ...detectFeatureEnvy(tree.rootNode, emptyNames, pythonProfile),
    ...detectMessageChain(tree.rootNode, pythonProfile),
    ...detectDataClumps(tree.rootNode, pythonProfile),
    ...detectPrimitiveObsession(tree.rootNode, pythonProfile),
    ...detectComplexConditional(tree.rootNode, pythonProfile),
    ...detectLowDocCoverage(tree.rootNode, code, pythonProfile),
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
    cognitiveComplexity: computeCognitiveComplexity(node, pythonProfile),
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
