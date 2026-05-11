import type { SyntaxNode } from 'tree-sitter';

/** Computes LCOM4 (Lack of Cohesion in Methods, version 4) for a class. */
export function computeLCOM4(methods: SyntaxNode[], cls: SyntaxNode): number {
  if (methods.length === 0) return 0;
  const fieldNames = collectFieldNames(cls);
  const adjacency = new Map<number, Set<number>>();
  for (let i = 0; i < methods.length; i++) adjacency.set(i, new Set());
  for (const field of fieldNames) {
    const using = methods.map((m, i) => usesField(m, field) ? i : -1).filter(i => i >= 0);
    for (let i = 0; i < using.length; i++) {
      const a = using[i]!;
      for (const b of using.slice(i + 1)) { adjacency.get(a)!.add(b); adjacency.get(b)!.add(a); }
    }
  }
  return connectedComponents(adjacency, methods.length);
}

function collectFieldNames(cls: SyntaxNode): string[] {
  const FIELD_TYPES = new Set(['public_field_definition', 'field_definition']);
  return cls.namedChildren.flatMap(ch => {
    const b = ch.childForFieldName?.('body');
    if (!b) return [];
    return b.namedChildren.filter(m => FIELD_TYPES.has(m.type)).map(m => m.childForFieldName?.('name')?.text).filter((n): n is string => Boolean(n));
  });
}

function usesField(m: SyntaxNode, f: string): boolean { return m.text.includes(`this.${f}`); }

function connectedComponents(adj: Map<number, Set<number>>, n: number): number {
  const visited = new Set<number>();
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (!visited.has(i)) { count++; bfs(i, adj, visited); }
  }
  return count;
}

function bfs(start: number, adj: Map<number, Set<number>>, visited: Set<number>): void {
  const queue = [start];
  visited.add(start);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const n of [...(adj.get(current) ?? [])]) {
      if (!visited.has(n)) { visited.add(n); queue.push(n); }
    }
  }
}
