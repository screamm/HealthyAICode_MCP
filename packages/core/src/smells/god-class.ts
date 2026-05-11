import type { SyntaxNode } from 'tree-sitter';
import type { Smell, SmellType } from '../types';

const ATFD_THRESHOLD = 5;
const WMC_THRESHOLD = 20;

export function detectGodClass(tree: SyntaxNode, importedTypeNames: Set<string>): Smell[] {
  const smells: Smell[] = [];
  for (const cls of findClasses(tree)) {
    analyzeClass(cls, importedTypeNames, smells);
  }
  return smells;
}

function findClasses(node: SyntaxNode): SyntaxNode[] {
  const result: SyntaxNode[] = [];
  if (node.type === 'class_declaration' || node.type === 'class') result.push(node);
  for (const child of node.children) result.push(...findClasses(child));
  return result;
}

function analyzeClass(cls: SyntaxNode, importedTypeNames: Set<string>, acc: Smell[]): void {
  const methods = collectMethods(cls);
  const wmc = computeWMC(methods);
  const atfd = computeATFD(cls, importedTypeNames);
  const lcom4 = computeLCOM4(methods, cls);

  if (atfd > ATFD_THRESHOLD && wmc >= WMC_THRESHOLD && lcom4 > 1) {
    acc.push({
      // @ts-ignore - GodClass added to SmellType in Wave 2
      type: 'GodClass' as SmellType,
      severity: 'high',
      description: `God Class: ATFD=${atfd} (>${ATFD_THRESHOLD}), WMC=${wmc} (>=${WMC_THRESHOLD}), LCOM4=${lcom4} (>1). Class centralizes too much responsibility.`,
      suggestion: 'Split into smaller classes, each with a single responsibility. Move foreign-data access into separate services.',
      line: cls.startPosition.row + 1,
    });
  }
}

function collectMethods(cls: SyntaxNode): SyntaxNode[] {
  const METHOD_TYPES = new Set(['method_definition', 'function_declaration']);
  const result: SyntaxNode[] = [];
  for (const child of cls.namedChildren) {
    const body = child.childForFieldName?.('body');
    if (body) {
      for (const member of body.namedChildren) {
        if (METHOD_TYPES.has(member.type)) result.push(member);
      }
    }
  }
  return result;
}

function computeWMC(methods: SyntaxNode[]): number {
  let total = 0;
  for (const m of methods) {
    const body = m.childForFieldName?.('body');
    if (body) total += countDecisions(body) + 1;
  }
  return total;
}

function countDecisions(node: SyntaxNode): number {
  const DECISION_NODES = new Set(['if_statement', 'while_statement', 'for_statement', 'switch_case', 'ternary_expression']);
  let count = 0;
  if (DECISION_NODES.has(node.type)) count++;
  for (const child of node.children) count += countDecisions(child);
  return count;
}

function computeATFD(cls: SyntaxNode, importedTypeNames: Set<string>): number {
  const foreignAccesses = new Set<string>();
  findForeignAccesses(cls, importedTypeNames, foreignAccesses);
  return foreignAccesses.size;
}

function findForeignAccesses(node: SyntaxNode, importedNames: Set<string>, acc: Set<string>): void {
  if (node.type === 'member_expression') {
    const obj = node.childForFieldName?.('object');
    if (obj && importedNames.has(obj.text)) acc.add(obj.text);
  }
  for (const child of node.children) findForeignAccesses(child, importedNames, acc);
}

function computeLCOM4(methods: SyntaxNode[], cls: SyntaxNode): number {
  if (methods.length === 0) return 0;
  const fieldNames = collectFieldNames(cls);
  const adjacency = new Map<number, Set<number>>();
  for (let i = 0; i < methods.length; i++) adjacency.set(i, new Set());
  for (const field of fieldNames) {
    const accessors = methods.map((m, i) => usesField(m, field) ? i : -1).filter(i => i >= 0);
    for (let i = 0; i < accessors.length; i++) {
      for (let j = i + 1; j < accessors.length; j++) {
        adjacency.get(accessors[i])!.add(accessors[j]);
        adjacency.get(accessors[j])!.add(accessors[i]);
      }
    }
  }
  return connectedComponents(adjacency, methods.length);
}

function collectFieldNames(cls: SyntaxNode): string[] {
  const names: string[] = [];
  for (const child of cls.namedChildren) {
    const body = child.childForFieldName?.('body');
    if (body) {
      for (const member of body.namedChildren) {
        if (member.type === 'public_field_definition' || member.type === 'field_definition') {
          const name = member.childForFieldName?.('name')?.text;
          if (name) names.push(name);
        }
      }
    }
  }
  return names;
}

function usesField(method: SyntaxNode, fieldName: string): boolean {
  return method.text.includes(`this.${fieldName}`);
}

function connectedComponents(adj: Map<number, Set<number>>, n: number): number {
  const visited = new Set<number>();
  let components = 0;
  for (let i = 0; i < n; i++) {
    if (!visited.has(i)) {
      components++;
      bfs(i, adj, visited);
    }
  }
  return components;
}

function bfs(start: number, adj: Map<number, Set<number>>, visited: Set<number>): void {
  const queue = [start];
  visited.add(start);
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const neighbor of adj.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
}
