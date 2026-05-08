import Parser from 'tree-sitter';
import Python from 'tree-sitter-python';
import type { FunctionResult, MetricBreakdown } from '../types';

const parser = new Parser();
parser.setLanguage(Python as unknown as Parser.Language);

const PY_CYCLOMATIC_NODES = new Set([
  'if_statement',
  'elif_clause',
  'for_statement',
  'while_statement',
  'except_clause',
  'conditional_expression',
  'boolean_operator',
]);

const PY_NESTING_NODES = new Set([
  'if_statement',
  'for_statement',
  'while_statement',
  'try_statement',
  'with_statement',
]);

export function analyzePython(code: string): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
} {
  const tree = parser.parse(code);
  const functions: FunctionResult[] = [];

  function visitNode(node: Parser.SyntaxNode): void {
    if (node.type === 'function_definition') {
      const name = node.childForFieldName('name')?.text ?? '<anonymous>';
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const params = node.childForFieldName('parameters');
      const paramCount = params
        ? params.namedChildren.filter(c =>
            [
              'identifier',
              'typed_parameter',
              'default_parameter',
              'typed_default_parameter',
              'list_splat_pattern',
              'dictionary_splat_pattern',
            ].includes(c.type)
          ).length
        : 0;

      functions.push({
        name,
        line: startLine,
        length: endLine - startLine + 1,
        cyclomaticComplexity: calculatePyCyclomatic(node),
        nestingDepth: calculatePyNesting(node),
        parameterCount: paramCount,
        smells: [],
      });
    }
    for (const child of node.children) visitNode(child);
  }

  visitNode(tree.rootNode);

  const totalLines = code.length === 0 ? 0 : code.split('\n').length;
  const metrics = buildMetrics(functions, totalLines);
  return { functions, metrics };
}

function calculatePyCyclomatic(node: Parser.SyntaxNode): number {
  let cc = 1;
  function traverse(n: Parser.SyntaxNode): void {
    if (PY_CYCLOMATIC_NODES.has(n.type)) cc++;
    for (const child of n.children) traverse(child);
  }
  traverse(node);
  return cc;
}

function calculatePyNesting(node: Parser.SyntaxNode): number {
  let maxDepth = 0;
  function traverse(n: Parser.SyntaxNode, depth: number): void {
    const isNesting = PY_NESTING_NODES.has(n.type);
    const newDepth = isNesting ? depth + 1 : depth;
    if (isNesting) maxDepth = Math.max(maxDepth, newDepth);
    for (const child of n.children) traverse(child, newDepth);
  }
  traverse(node, 0);
  return maxDepth;
}

function buildMetrics(functions: FunctionResult[], totalLines: number): MetricBreakdown {
  if (functions.length === 0) {
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
