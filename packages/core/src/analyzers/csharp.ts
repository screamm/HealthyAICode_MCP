import Parser from 'tree-sitter';
import CSharp from 'tree-sitter-c-sharp';
import type { FunctionResult, MetricBreakdown } from '../types';

const parser = new Parser();
parser.setLanguage(CSharp as unknown as Parser.Language);

const CS_CYCLOMATIC_NODES = new Set([
  'if_statement',
  'for_statement',
  'foreach_statement',
  'while_statement',
  'do_statement',
  'conditional_expression',
  'catch_clause',
  'switch_section',
  'case_switch_label',
]);

const CS_NESTING_NODES = new Set([
  'if_statement',
  'for_statement',
  'foreach_statement',
  'while_statement',
  'do_statement',
  'try_statement',
]);

export function analyzeCSharp(code: string): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
} {
  parser.setLanguage(CSharp as unknown as Parser.Language);
  const tree = parser.parse(code);
  const functions: FunctionResult[] = [];

  function visitNode(node: Parser.SyntaxNode): void {
    if (
      node.type === 'method_declaration' ||
      node.type === 'constructor_declaration' ||
      node.type === 'local_function_statement'
    ) {
      const name = node.childForFieldName('name')?.text ?? '<anonymous>';
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      const params = node.childForFieldName('parameters');
      const paramCount = params
        ? params.namedChildren.filter(c => c.type === 'parameter').length
        : 0;

      functions.push({
        name,
        line: startLine,
        length: endLine - startLine + 1,
        cyclomaticComplexity: calculateCsCyclomatic(node),
        nestingDepth: calculateCsNesting(node),
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

function calculateCsCyclomatic(node: Parser.SyntaxNode): number {
  let cc = 1;
  function traverse(n: Parser.SyntaxNode): void {
    if (CS_CYCLOMATIC_NODES.has(n.type)) cc++;
    for (const child of n.children) traverse(child);
  }
  traverse(node);
  return cc;
}

function calculateCsNesting(node: Parser.SyntaxNode): number {
  let maxDepth = 0;
  function traverse(n: Parser.SyntaxNode, depth: number): void {
    const isNesting = CS_NESTING_NODES.has(n.type);
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
