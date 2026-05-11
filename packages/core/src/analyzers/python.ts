import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import type { FunctionResult, MetricBreakdown } from '../types';

const parser = new Parser();
parser.setLanguage(Python as unknown as Parser.Language);

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement',
  'elif_clause',
  'for_statement',
  'while_statement',
  'except_clause',
  'conditional_expression',
  'boolean_operator',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement',
  'for_statement',
  'while_statement',
  'try_statement',
  'with_statement',
]);

const PARAMETER_NODE_TYPES = new Set([
  'identifier',
  'typed_parameter',
  'default_parameter',
  'typed_default_parameter',
  'list_splat_pattern',
  'dictionary_splat_pattern',
]);

const IMPLICIT_PARAMS = new Set(['self', 'cls']);

export function analyzePython(code: string): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: never[];
} {
  const tree = parser.parse(code);
  const functions = collectFunctions(tree.rootNode);
  const totalLines = code === '' ? 0 : code.split('\n').length;
  const metrics = buildMetrics(functions, totalLines);
  return { functions, metrics, smells: [] };
}

function collectFunctions(root: Parser.SyntaxNode): FunctionResult[] {
  const functions: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'function_definition') {
      functions.push(extractFunction(node));
    }
    for (const child of node.children) visit(child);
  }
  visit(root);
  return functions;
}

function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  return {
    name: node.childForFieldName('name')?.text ?? '<anonymous>',
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: calculatePyCyclomatic(node),
    cognitiveComplexity: 0,
    nestingDepth: calculatePyNesting(node),
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

function calculatePyCyclomatic(node: Parser.SyntaxNode): number {
  let cc = 1;
  function traverse(n: Parser.SyntaxNode): void {
    if (CYCLOMATIC_NODE_TYPES.has(n.type)) cc++;
    for (const child of n.children) traverse(child);
  }
  traverse(node);
  return cc;
}

function calculatePyNesting(node: Parser.SyntaxNode): number {
  let maxDepth = 0;
  function traverse(n: Parser.SyntaxNode, depth: number): void {
    const isNesting = NESTING_NODE_TYPES.has(n.type);
    const newDepth = isNesting ? depth + 1 : depth;
    if (isNesting) maxDepth = Math.max(maxDepth, newDepth);
    for (const child of n.children) traverse(child, newDepth);
  }
  traverse(node, 0);
  return maxDepth;
}

function buildMetrics(functions: FunctionResult[], totalLines: number): MetricBreakdown {
  if (functions.length === 0) return emptyMetrics(totalLines);
  return {
    cyclomaticComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    cognitiveComplexity: 0, // not computed; placeholder
    maxNestingDepth: Math.max(...functions.map(f => f.nestingDepth)),
    avgFunctionLength: Math.round(
      functions.reduce((s, f) => s + f.length, 0) / functions.length
    ),
    maxFunctionLength: Math.max(...functions.map(f => f.length)),
    avgParameterCount: parseFloat(
      (functions.reduce((s, f) => s + f.parameterCount, 0) / functions.length).toFixed(1)
    ),
    maxParameterCount: Math.max(...functions.map(f => f.parameterCount)),
    totalLines,
    duplicationScore: 0,
  };
}

function emptyMetrics(totalLines: number): MetricBreakdown {
  return {
    cyclomaticComplexity: 1,
    cognitiveComplexity: 0, // not computed; placeholder
    maxNestingDepth: 0,
    avgFunctionLength: 0,
    maxFunctionLength: 0,
    avgParameterCount: 0,
    maxParameterCount: 0,
    totalLines,
    duplicationScore: 0,
  };
}
