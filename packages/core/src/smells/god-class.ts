import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';
import { computeLCOM4 } from './god-class-lcom4';

const ATFD_THRESHOLD = 5, WMC_THRESHOLD = 20;
const DECISION_NODES = new Set(['if_statement', 'while_statement', 'for_statement', 'switch_case', 'ternary_expression']);
const METHOD_TYPES = new Set(['method_definition', 'function_declaration']);

/** Detects God Class antipatterns in a TypeScript/JavaScript AST. */
export function detectGodClass(tree: SyntaxNode, importedTypeNames: Set<string>): Smell[] {
  const findings: Smell[] = [];
  for (const cls of findClasses(tree)) analyzeClass(cls, importedTypeNames, findings);
  return findings;
}

function findClasses(node: SyntaxNode): SyntaxNode[] {
  const r: SyntaxNode[] = (node.type === 'class_declaration' || node.type === 'class') ? [node] : [];
  for (const c of node.children) r.push(...findClasses(c));
  return r;
}

function analyzeClass(cls: SyntaxNode, names: Set<string>, acc: Smell[]): void {
  const methods = cls.namedChildren.flatMap(c => { const b = c.childForFieldName?.('body'); return b ? b.namedChildren.filter(m => METHOD_TYPES.has(m.type)) : []; });
  const wmc = methods.reduce((t, m) => { const b = m.childForFieldName?.('body'); return t + (b ? countDecisions(b) + 1 : 0); }, 0);
  const atfdSet = new Set<string>();
  findForeignAccesses(cls, names, atfdSet);
  const atfd = atfdSet.size, lcom4 = computeLCOM4(methods, cls);
  if (atfd > ATFD_THRESHOLD && wmc >= WMC_THRESHOLD && lcom4 > 1)
    acc.push({ type: 'GodClass', severity: 'high', description: `God Class: ATFD=${atfd} (>${ATFD_THRESHOLD}), WMC=${wmc} (>=${WMC_THRESHOLD}), LCOM4=${lcom4} (>1). Class centralizes too much responsibility.`, suggestion: 'Split into smaller classes, each with a single responsibility. Move foreign-data access into separate services.', line: cls.startPosition.row + 1 });
}

function countDecisions(node: SyntaxNode): number {
  let c = DECISION_NODES.has(node.type) ? 1 : 0;
  for (const ch of node.children) c += countDecisions(ch);
  return c;
}

function findForeignAccesses(node: SyntaxNode, importedNames: Set<string>, acc: Set<string>): void {
  if (node.type === 'member_expression') { const obj = node.childForFieldName?.('object'); if (obj && importedNames.has(obj.text)) acc.add(obj.text); }
  for (const c of node.children) findForeignAccesses(c, importedNames, acc);
}
