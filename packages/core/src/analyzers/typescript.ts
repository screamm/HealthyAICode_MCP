import Parser from 'tree-sitter';
import * as TypeScript from 'tree-sitter-typescript';
import type { FunctionResult, MetricBreakdown } from '../types';

const parser = new Parser();

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement',
  'ternary_expression',
  'catch_clause',
  'switch_case',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement',
  'switch_statement',
  'try_statement',
]);

function calculateCyclomaticComplexity(node: Parser.SyntaxNode): number {
  let complexity = 1;

  function traverse(n: Parser.SyntaxNode): void {
    if (CYCLOMATIC_NODE_TYPES.has(n.type)) {
      complexity++;
    } else if (n.type === 'binary_expression') {
      const op = n.childForFieldName('operator')?.text;
      if (op === '&&' || op === '||' || op === '??') complexity++;
    }
    for (const child of n.children) traverse(child);
  }

  traverse(node);
  return complexity;
}

function calculateMaxNestingDepth(node: Parser.SyntaxNode): number {
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

function getParameterCount(node: Parser.SyntaxNode): number {
  const params = node.childForFieldName('parameters');
  if (!params) return 0;
  return params.namedChildren.filter(c => c.type !== 'comment').length;
}

function getFunctionName(node: Parser.SyntaxNode): string {
  if (node.type === 'function_declaration' || node.type === 'method_definition') {
    return node.childForFieldName('name')?.text ?? '<anonymous>';
  }
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') {
    return parent.childForFieldName('name')?.text ?? '<anonymous>';
  }
  return '<anonymous>';
}

const FUNCTION_NODE_TYPES = new Set([
  'function_declaration',
  'method_definition',
  'arrow_function',
  'function_expression',
]);

export function analyzeTypeScript(code: string): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: never[];
} {
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse(code);
  const functions: FunctionResult[] = [];

  function visitNode(node: Parser.SyntaxNode): void {
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      const name = getFunctionName(node);
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      functions.push({
        name,
        line: startLine,
        length: endLine - startLine + 1,
        cyclomaticComplexity: calculateCyclomaticComplexity(node),
        nestingDepth: calculateMaxNestingDepth(node),
        parameterCount: getParameterCount(node),
        smells: [],
      });
    }
    for (const child of node.children) visitNode(child);
  }

  visitNode(tree.rootNode);

  const totalLines = code === '' ? 0 : code.split('\n').length;
  const metrics = buildMetrics(functions, totalLines);
  return { functions, metrics, smells: [] };
}

function buildMetrics(functions: FunctionResult[], totalLines: number): MetricBreakdown {
  if (functions.length === 0) {
    return {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 1,
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
    cognitiveComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    maxNestingDepth: Math.max(...functions.map(f => f.nestingDepth)),
    avgFunctionLength: Math.round(
      functions.reduce((s, f) => s + f.length, 0) / functions.length,
    ),
    maxFunctionLength: Math.max(...functions.map(f => f.length)),
    avgParameterCount: parseFloat(
      (functions.reduce((s, f) => s + f.parameterCount, 0) / functions.length).toFixed(1),
    ),
    maxParameterCount: Math.max(...functions.map(f => f.parameterCount)),
    totalLines,
    duplicationScore: 0,
  };
}
