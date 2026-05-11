import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

const ATFD_THRESHOLD = 5, WMC_THRESHOLD = 20;
const DECISION_NODES = new Set(['if_statement', 'while_statement', 'for_statement', 'switch_case', 'ternary_expression']);

/** Detects God Class antipatterns in a TypeScript/JavaScript AST. */
export function detectGodClass(tree: SyntaxNode, importedTypeNames: Set<string>): Smell[] {
  const smells: Smell[] = [];
  for (const cls of findClasses(tree)) analyzeClass(cls, importedTypeNames, smells);
  return smells;
}

function findClasses(node: SyntaxNode): SyntaxNode[] {
  const r: SyntaxNode[] = node.type === 'class_declaration' || node.type === 'class' ? [node] : [];
  for (const c of node.children) r.push(...findClasses(c));
  return r;
}

function analyzeClass(cls: SyntaxNode, importedTypeNames: Set<string>, acc: Smell[]): void {
  const methods = collectMethods(cls), wmc = computeWMC(methods), atfd = computeATFD(cls, importedTypeNames), lcom4 = computeLCOM4(methods, cls);
  if (atfd > ATFD_THRESHOLD && wmc >= WMC_THRESHOLD && lcom4 > 1)
    acc.push({ type: 'GodClass', severity: 'high', description: `God Class: ATFD=${atfd} (>${ATFD_THRESHOLD}), WMC=${wmc} (>=${WMC_THRESHOLD}), LCOM4=${lcom4} (>1). Class centralizes too much responsibility.`, suggestion: 'Split into smaller classes, each with a single responsibility. Move foreign-data access into separate services.', line: cls.startPosition.row + 1 });
}

function collectMethods(cls: SyntaxNode): SyntaxNode[] {
  const MT = new Set(['method_definition', 'function_declaration']), r: SyntaxNode[] = [];
  cls.namedChildren.forEach(c => { const b = c.childForFieldName?.('body'); if (b) b.namedChildren.filter(m => MT.has(m.type)).forEach(m => r.push(m)); });
  return r;
}

function computeWMC(methods: SyntaxNode[]): number {
  let total = 0;
  for (const m of methods) { const b = m.childForFieldName?.('body'); if (b) total += countDecisions(b) + 1; }
  return total;
}

function countDecisions(node: SyntaxNode): number {
  let c = DECISION_NODES.has(node.type) ? 1 : 0;
  for (const ch of node.children) c += countDecisions(ch);
  return c;
}

function computeATFD(cls: SyntaxNode, importedTypeNames: Set<string>): number {
  const acc = new Set<string>(); findForeignAccesses(cls, importedTypeNames, acc); return acc.size;
}

function findForeignAccesses(node: SyntaxNode, importedNames: Set<string>, acc: Set<string>): void {
  if (node.type === 'member_expression') { const obj = node.childForFieldName?.('object'); if (obj && importedNames.has(obj.text)) acc.add(obj.text); }
  for (const c of node.children) findForeignAccesses(c, importedNames, acc);
}

function computeLCOM4(methods: SyntaxNode[], cls: SyntaxNode): number {
  if (methods.length === 0) return 0;
  const fieldNames = collectFieldNames(cls);
  const adjacency = new Map<number, Set<number>>();
  for (let i = 0; i < methods.length; i++) adjacency.set(i, new Set());
  for (const field of fieldNames) {
    const acc = methods.map((m, i) => usesField(m, field) ? i : -1).filter(i => i >= 0);
    acc.forEach((a, i) => acc.slice(i + 1).forEach(b => { adjacency.get(a)!.add(b); adjacency.get(b)!.add(a); }));
  }
  return connectedComponents(adjacency, methods.length);
}

function collectFieldNames(cls: SyntaxNode): string[] {
  const names: string[] = [];
  cls.namedChildren.forEach(ch => {
    const b = ch.childForFieldName?.('body');
    if (b) b.namedChildren.filter(m => m.type === 'public_field_definition' || m.type === 'field_definition').forEach(m => { const n = m.childForFieldName?.('name')?.text; if (n) names.push(n); });
  });
  return names;
}

function usesField(m: SyntaxNode, f: string): boolean { return m.text.includes(`this.${f}`); }

function connectedComponents(adj: Map<number, Set<number>>, n: number): number {
  const v = new Set<number>(); let c = 0;
  for (let i = 0; i < n; i++) if (!v.has(i)) { c++; bfs(i, adj, v); }
  return c;
}

function bfs(start: number, adj: Map<number, Set<number>>, visited: Set<number>): void {
  const queue = [start]; visited.add(start);
  while (queue.length > 0) { const ns = [...(adj.get(queue.shift()!) ?? [])]; ns.filter(n => !visited.has(n)).forEach(n => { visited.add(n); queue.push(n); }); }
}
