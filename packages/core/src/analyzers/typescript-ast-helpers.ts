import type Parser from 'tree-sitter';
import { calculateCognitiveComplexity } from './cognitive-complexity';
import type { FunctionResult } from '../types';

const CYCLOMATIC_NODE_TYPES = new Set(['if_statement','for_statement','for_in_statement','for_of_statement','while_statement','do_statement','ternary_expression','catch_clause','switch_case']);
const NESTING_NODE_TYPES = new Set(['if_statement','for_statement','for_in_statement','for_of_statement','while_statement','do_statement','switch_statement','try_statement']);

/** Recursively counts cyclomatic-complexity decision points in an AST subtree. */
export function countCC(n: Parser.SyntaxNode, acc: { v: number }): void {
  if (CYCLOMATIC_NODE_TYPES.has(n.type)) { acc.v++; }
  else if (n.type === 'binary_expression') { const op = n.childForFieldName('operator')?.text; if (op === '&&' || op === '||' || op === '??') acc.v++; }
  for (const child of n.children) countCC(child, acc);
}

/** Calculates cyclomatic complexity for a function node. */
export function calculateCyclomaticComplexity(node: Parser.SyntaxNode): number {
  const acc = { v: 1 };
  countCC(node, acc);
  return acc.v;
}

/** Recursively tracks maximum nesting depth in an AST subtree.
 * `else if` chains are excluded: tree-sitter nests them as if_statement inside else_clause,
 * but they represent branching alternatives, not increased nesting (per Cognitive Complexity spec). */
export function countNesting(n: Parser.SyntaxNode, depth: number, max: { v: number }): void {
  const isElseIf = n.type === 'if_statement' && n.parent?.type === 'else_clause';
  const d = (NESTING_NODE_TYPES.has(n.type) && !isElseIf) ? depth + 1 : depth;
  if (d > max.v) max.v = d;
  for (const child of n.children) countNesting(child, d, max);
}

/** Calculates the maximum nesting depth of control structures within a function. */
export function calculateMaxNestingDepth(node: Parser.SyntaxNode): number {
  const max = { v: 0 };
  countNesting(node, 0, max);
  return max.v;
}

/** Returns the number of named parameters for a function node. */
export function getParameterCount(node: Parser.SyntaxNode): number {
  const params = node.childForFieldName('parameters');
  if (!params) return 0;
  return params.namedChildren.filter(c => c.type !== 'comment').length;
}

/** Extracts the function name from a function AST node. */
export function getFunctionName(node: Parser.SyntaxNode): string {
  if (node.type === 'function_declaration' || node.type === 'method_definition') return node.childForFieldName('name')?.text ?? '<anonymous>';
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') return parent.childForFieldName('name')?.text ?? '<anonymous>';
  return '<anonymous>';
}

/** Extracts a FunctionResult record from a function AST node. */
export function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const name = getFunctionName(node);
  return {
    name,
    line: startLine,
    length: node.endPosition.row + 1 - startLine + 1,
    cyclomaticComplexity: calculateCyclomaticComplexity(node),
    cognitiveComplexity: calculateCognitiveComplexity(node, name),
    nestingDepth: calculateMaxNestingDepth(node),
    parameterCount: getParameterCount(node),
    smells: [],
  };
}
