import Parser from 'tree-sitter';
import PhpPkg from 'tree-sitter-php';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';
import { phpProfile } from '../smells/language-profile';
import { detectGodClass } from '../smells/god-class';
import { detectFeatureEnvy } from '../smells/feature-envy';
import { detectMessageChain } from '../smells/message-chain';
import { detectDataClumps } from '../smells/data-clumps';
import { detectPrimitiveObsession } from '../smells/primitive-obsession';
import { detectComplexConditional } from '../smells/complex-conditional';
import { detectLowDocCoverage } from '../smells/doc-coverage';
import { detectBumpyRoadChunks } from '../smells/bumpy-road';

const parser = new Parser();
// php_only handles files beginning with <?php (no HTML interleaving)
parser.setLanguage(PhpPkg.php_only as unknown as Parameters<(typeof parser)['setLanguage']>[0]);

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement', 'else_if_clause', 'for_statement', 'foreach_statement',
  'while_statement', 'do_statement', 'switch_statement', 'case_statement',
  'match_conditional_expression', 'conditional_expression',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'foreach_statement',
  'while_statement', 'do_statement', 'switch_statement',
]);

const FUNCTION_NODE_TYPES = new Set([
  'function_definition', 'method_declaration', 'arrow_function', 'anonymous_function',
]);

const PARAMETER_NODE_TYPES = new Set([
  'simple_parameter', 'variadic_parameter', 'property_promotion_parameter',
]);

export function analyzePhp(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
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
  const totalLines = code === '' ? 0 : code.split('\n').length;

  // Text-based detectors (language-agnostic)
  const smells: Smell[] = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ];

  // AST-based profile detectors — PHP global functions have no class context,
  // so we pass an empty Set for god-class/feature-envy importedTypeNames.
  const emptyNames = new Set<string>();
  smells.push(
    ...detectGodClass(tree.rootNode, emptyNames, phpProfile),
    ...detectFeatureEnvy(tree.rootNode, emptyNames, phpProfile),
    ...detectMessageChain(tree.rootNode, phpProfile),
    ...detectDataClumps(tree.rootNode, phpProfile),
    ...detectPrimitiveObsession(tree.rootNode, phpProfile),
    ...detectComplexConditional(tree.rootNode, phpProfile),
    ...detectLowDocCoverage(tree.rootNode, code, phpProfile),
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
