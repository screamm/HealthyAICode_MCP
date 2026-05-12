import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

const COMMENT_NODES = new Set(['comment', 'line_comment', 'block_comment']);

type Tier = { pattern: RegExp; severity: 'critical' | 'high' | 'medium' | 'low'; label: string };

const TIERS: Tier[] = [
  { pattern: /\b(HACK|XXX|BUG)\b/i,                   severity: 'critical', label: 'Critical debt' },
  { pattern: /\b(FIXME|BROKEN)\b/i,                   severity: 'high',     label: 'Must-fix debt' },
  { pattern: /\b(TODO|TEMP|WORKAROUND|KLUDGE)\b/i,    severity: 'medium',   label: 'Technical debt' },
  { pattern: /\b(REFACTOR)\b/i,                        severity: 'low',      label: 'Refactoring note' },
];

export function detectSATD(tree: SyntaxNode): Smell[] {
  const smells: Smell[] = [];
  visitAll(tree, smells);
  return smells;
}

function visitAll(node: SyntaxNode, acc: Smell[]): void {
  if (COMMENT_NODES.has(node.type)) checkComment(node, acc);
  for (const child of node.children) visitAll(child, acc);
}

function checkComment(node: SyntaxNode, acc: Smell[]): void {
  const text = node.text;
  for (const { pattern, severity, label } of TIERS) {
    const found = text.match(pattern);
    if (found) {
      acc.push({
        type: 'SATD',
        severity,
        description: `${label}: "${found[0]}" in comment — self-admitted technical debt.`,
        suggestion: 'Create a tracked issue for this debt and remove the comment, or resolve it now.',
        line: node.startPosition.row + 1,
      });
      return;
    }
  }
}
