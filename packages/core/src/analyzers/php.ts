import Parser from 'tree-sitter';
import PhpPkg from 'tree-sitter-php';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

const parser = new Parser();
// php_only handles files beginning with <?php (no HTML interleaving)
parser.setLanguage(PhpPkg.php_only as unknown as object);

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
