import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';
import type { LanguageProfile } from './language-profile';

const CHAIN_THRESHOLD = 4;

export function detectMessageChain(tree: SyntaxNode, profile: LanguageProfile): Smell[] {
  const smells: Smell[] = [];
  visitAll(tree, profile, smells);
  return smells;
}

function visitAll(node: SyntaxNode, profile: LanguageProfile, acc: Smell[]): void {
  if (node.type === profile.callExpressionNodeType && isChainRoot(node, profile)) {
    const depth = chainDepth(node, profile);
    if (depth >= CHAIN_THRESHOLD) {
      acc.push({
        type: 'MessageChain',
        severity: 'medium',
        description: `Method chain of depth ${depth} — violates Law of Demeter and hides dependencies.`,
        suggestion: 'Introduce intermediate variables or delegate to a helper.',
        line: node.startPosition.row + 1,
      });
    }
  }
  for (const child of node.children) visitAll(child, profile, acc);
}

function isChainRoot(node: SyntaxNode, profile: LanguageProfile): boolean {
  const p = node.parent;
  if (!p) return true;
  if (p.type === profile.memberAccessNodeType && p.parent?.type === profile.callExpressionNodeType) return false;
  return true;
}

function chainDepth(node: SyntaxNode, profile: LanguageProfile): number {
  if (node.type !== profile.callExpressionNodeType) return 0;
  if (profile.callFunctionField !== null) {
    // TypeScript / Python / C# style: call_expression has a 'function' (or 'expression') field
    // that points to a member_access node, whose 'object' is the next call in the chain.
    const fn = node.childForFieldName(profile.callFunctionField);
    if (fn?.type !== profile.memberAccessNodeType) return 1;
    const obj = fn.childForFieldName(profile.memberObjectField);
    return 1 + (obj ? chainDepth(obj, profile) : 0);
  } else {
    // Java style: method_invocation has an 'object' field that points directly to the
    // next method_invocation in the chain (no intermediate member-access node).
    const obj = node.childForFieldName('object');
    if (obj?.type !== profile.callExpressionNodeType) return 1;
    return 1 + chainDepth(obj, profile);
  }
}
