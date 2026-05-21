import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';
import { javaProfile } from '../smells/language-profile';
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
parser.setLanguage(Java as unknown as Parameters<(typeof parser)['setLanguage']>[0]);

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'enhanced_for_statement',
  'while_statement', 'do_statement', 'ternary_expression',
  'catch_clause', 'switch_label',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'enhanced_for_statement',
  'while_statement', 'do_statement', 'try_statement',
]);

const METHOD_NODE_TYPES = new Set([
  'method_declaration', 'constructor_declaration',
]);

function javaBinaryCheck(n: Parser.SyntaxNode): boolean {
  if (n.type !== 'binary_expression') return false;
  const op = n.childForFieldName('operator')?.text;
  return op === '&&' || op === '||';
}

export function analyzeJava(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  const tree = parser.parse(code);

  // Collect method nodes for per-function analysis
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

  // AST-based profile detectors
  const emptyNames = new Set<string>();
  smells.push(
    ...detectGodClass(tree.rootNode, emptyNames, javaProfile),
    ...detectFeatureEnvy(tree.rootNode, emptyNames, javaProfile),
    ...detectMessageChain(tree.rootNode, javaProfile),
    ...detectDataClumps(tree.rootNode, javaProfile),
    ...detectPrimitiveObsession(tree.rootNode, javaProfile),
    ...detectComplexConditional(tree.rootNode, javaProfile),
    ...detectLowDocCoverage(tree.rootNode, code, javaProfile),
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
  const params = node.childForFieldName('parameters');
  const paramCount = params
    ? params.namedChildren.filter(c => c.type === 'formal_parameter').length
    : 0;
  return {
    name: node.childForFieldName('name')?.text ?? '<anonymous>',
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES, javaBinaryCheck),
    cognitiveComplexity: computeCognitiveComplexity(node, javaProfile),
    nestingDepth: calculateMaxNestingDepth(node, NESTING_NODE_TYPES),
    parameterCount: paramCount,
    smells: [],
  };
}
