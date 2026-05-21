import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';
import type { LanguageProfile } from './language-profile';

const TERNARY = 'ternary_expression', PAREN = 'parenthesized_expression';
const BOOLEAN_CHAIN_THRESHOLD = 3;

export function detectComplexConditional(tree: SyntaxNode, profile: LanguageProfile): Smell[] {
  const smells: Smell[] = [];
  visitAll(tree, profile, smells);
  return smells;
}

function visitAll(node: SyntaxNode, profile: LanguageProfile, acc: Smell[]): void {
  if (node.type === TERNARY) checkNestedTernary(node, acc);
  if (node.type === profile.binaryExpressionNodeType) checkBoolChain(node, profile, acc);
  for (const child of node.children) visitAll(child, profile, acc);
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

function logicalOpCount(node: SyntaxNode, profile: LanguageProfile): number {
  if (node.type !== profile.binaryExpressionNodeType) return 0;
  const op = node.childForFieldName(profile.binaryOperatorField)?.text ?? '';
  if (!profile.logicalOperators.has(op)) return 0;
  const l = node.child(0), r = node.child(2);
  return 1 + (l ? logicalOpCount(l, profile) : 0) + (r ? logicalOpCount(r, profile) : 0);
}

function checkBoolChain(node: SyntaxNode, profile: LanguageProfile, acc: Smell[]): void {
  const parentOp = node.parent?.childForFieldName?.(profile.binaryOperatorField)?.text ?? '';
  if (profile.logicalOperators.has(parentOp)) return;
  const ops = logicalOpCount(node, profile);
  if (ops < BOOLEAN_CHAIN_THRESHOLD) return;
  acc.push({ type: 'ComplexConditional', severity: 'medium',
    description: `Boolean expression has ${ops} logical operators — hard to parse mentally.`,
    suggestion: 'Extract sub-conditions into named boolean variables.',
    line: node.startPosition.row + 1 });
}
