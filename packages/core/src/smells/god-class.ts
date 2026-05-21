import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';
import type { LanguageProfile } from './language-profile';
import { computeLCOM4 } from './god-class-lcom4';

const ATFD_THRESHOLD = 5, WMC_THRESHOLD = 20;

/** Detects God Class antipatterns in a parsed AST using a language-specific profile. */
export function detectGodClass(tree: SyntaxNode, importedTypeNames: Set<string>, profile: LanguageProfile): Smell[] {
  const findings: Smell[] = [];
  for (const cls of findClasses(tree, profile)) analyzeClass(cls, importedTypeNames, findings, profile);
  return findings;
}

function findClasses(node: SyntaxNode, profile: LanguageProfile): SyntaxNode[] {
  const r: SyntaxNode[] = profile.classNodeTypes.has(node.type) ? [node] : [];
  for (const c of node.children) r.push(...findClasses(c, profile));
  return r;
}

function analyzeClass(cls: SyntaxNode, names: Set<string>, acc: Smell[], profile: LanguageProfile): void {
  const methods = cls.namedChildren.flatMap(c => {
    const b = c.childForFieldName?.('body');
    return b ? b.namedChildren.filter(m => profile.methodNodeTypes.has(m.type)) : [];
  });
  const wmc = methods.reduce((t, m) => {
    const b = m.childForFieldName?.('body');
    return t + (b ? countDecisions(b, profile) + 1 : 0);
  }, 0);
  const atfdSet = new Set<string>();
  findForeignAccesses(cls, names, atfdSet, profile);
  const atfd = atfdSet.size, lcom4 = computeLCOM4(methods, cls, profile);
  if (atfd > ATFD_THRESHOLD && wmc >= WMC_THRESHOLD && lcom4 > 1)
    acc.push({
      type: 'GodClass',
      severity: 'high',
      description: `God Class: ATFD=${atfd} (>${ATFD_THRESHOLD}), WMC=${wmc} (>=${WMC_THRESHOLD}), LCOM4=${lcom4} (>1). Class centralizes too much responsibility.`,
      suggestion: 'Split into smaller classes, each with a single responsibility. Move foreign-data access into separate services.',
      line: cls.startPosition.row + 1,
    });
}

function countDecisions(node: SyntaxNode, profile: LanguageProfile): number {
  let c = profile.controlFlowNodeTypes.has(node.type) ? 1 : 0;
  for (const ch of node.children) c += countDecisions(ch, profile);
  return c;
}

function findForeignAccesses(node: SyntaxNode, importedNames: Set<string>, acc: Set<string>, profile: LanguageProfile): void {
  if (node.type === profile.memberAccessNodeType) {
    const obj = node.childForFieldName?.(profile.memberObjectField);
    if (obj && importedNames.has(obj.text)) acc.add(obj.text);
  }
  for (const c of node.children) findForeignAccesses(c, importedNames, acc, profile);
}
