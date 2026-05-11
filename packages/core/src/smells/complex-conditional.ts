import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

const TERNARY = 'ternary_expression', BINARY = 'binary_expression', PAREN = 'parenthesized_expression';
const LOGICAL_OPS = new Set(['&&', '||']);
const BOOLEAN_CHAIN_THRESHOLD = 3;

export function detectComplexConditional(tree: SyntaxNode): Smell[] {
  const smells: Smell[] = [];
  visitAll(tree, smells);
  return smells;
}

function visitAll(node: SyntaxNode, acc: Smell[]): void {
  if (node.type === TERNARY) checkNestedTernary(node, acc);
  if (node.type === BINARY) checkBoolChain(node, acc);
  for (const child of node.children) visitAll(child, acc);
}

function unwrapParens(node: SyntaxNode): SyntaxNode {
  let n = node;
  while (n.type === PAREN && n.childCount >= 3) {
    const inner = n.child(1);
    if (!inner) break;
    n = inner;
  }
  return n;
}

function checkNestedTernary(node: SyntaxNode, acc: Smell[]): void {
  const c = node.childForFieldName('consequence');
  const a = node.childForFieldName('alternative');
  const cu = c ? unwrapParens(c) : null;
  const au = a ? unwrapParens(a) : null;
  if (cu?.type !== TERNARY && au?.type !== TERNARY) return;
  acc.push({ type: 'ComplexConditional', severity: 'high',
    description: 'Nested ternary operator makes logic extremely hard to read.',
    suggestion: 'Extract to named variables or use if/else blocks.',
    line: node.startPosition.row + 1 });
}

function logicalOpCount(node: SyntaxNode): number {
  if (node.type !== BINARY) return 0;
  const op = node.childForFieldName('operator')?.text ?? '';
  if (!LOGICAL_OPS.has(op)) return 0;
  const l = node.child(0), r = node.child(2);
  return 1 + (l ? logicalOpCount(l) : 0) + (r ? logicalOpCount(r) : 0);
}

function checkBoolChain(node: SyntaxNode, acc: Smell[]): void {
  const parentOp = node.parent?.childForFieldName?.('operator')?.text ?? '';
  if (LOGICAL_OPS.has(parentOp)) return;
  const ops = logicalOpCount(node);
  if (ops < BOOLEAN_CHAIN_THRESHOLD) return;
  acc.push({ type: 'ComplexConditional', severity: 'medium',
    description: `Boolean expression has ${ops} logical operators — hard to parse mentally.`,
    suggestion: 'Extract sub-conditions into named boolean variables.',
    line: node.startPosition.row + 1 });
}
