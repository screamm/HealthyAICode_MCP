import type { SyntaxNode } from 'tree-sitter';
import type { Smell, SmellType } from '../types';

const CHAIN_THRESHOLD = 4;

export function detectMessageChain(tree: SyntaxNode): Smell[] {
  const smells: Smell[] = [];
  visitAll(tree, smells);
  return smells;
}

function visitAll(node: SyntaxNode, acc: Smell[]): void {
  if (node.type === 'call_expression' && isChainRoot(node)) {
    const depth = chainDepth(node);
    if (depth >= CHAIN_THRESHOLD) {
      acc.push({
        // @ts-ignore - MessageChain added to SmellType in Wave 2 integration
        type: 'MessageChain' as SmellType,
        severity: 'medium',
        description: `Method chain of depth ${depth} — violates Law of Demeter and hides dependencies.`,
        suggestion: 'Introduce intermediate variables or delegate to a helper.',
        line: node.startPosition.row + 1,
      });
    }
  }
  for (const child of node.children) visitAll(child, acc);
}

function isChainRoot(node: SyntaxNode): boolean {
  const p = node.parent;
  if (!p) return true;
  if (p.type === 'member_expression' && p.parent?.type === 'call_expression') return false;
  return true;
}

function chainDepth(node: SyntaxNode): number {
  if (node.type !== 'call_expression') return 0;
  const fn = node.childForFieldName('function');
  if (fn?.type !== 'member_expression') return 1;
  const obj = fn.childForFieldName('object');
  return 1 + (obj ? chainDepth(obj) : 0);
}
