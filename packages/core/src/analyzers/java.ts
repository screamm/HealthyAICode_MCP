import Parser from 'tree-sitter';
import Java from 'tree-sitter-java';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

const parser = new Parser();
parser.setLanguage(Java as unknown as object);

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
  const params = node.childForFieldName('parameters');
  const paramCount = params
    ? params.namedChildren.filter(c => c.type === 'formal_parameter').length
    : 0;
  return {
    name: node.childForFieldName('name')?.text ?? '<anonymous>',
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES, javaBinaryCheck),
    cognitiveComplexity: 0,
    nestingDepth: calculateMaxNestingDepth(node, NESTING_NODE_TYPES),
    parameterCount: paramCount,
    smells: [],
  };
}
