import type { SyntaxNode } from 'tree-sitter';
import type { LanguageProfile } from './language-profile';

/** Computes LCOM4 (Lack of Cohesion in Methods, version 4) for a class. */
export function computeLCOM4(methods: SyntaxNode[], cls: SyntaxNode, profile: LanguageProfile): number {
  if (methods.length === 0) return 0;
  const fieldNames = collectFieldNames(cls, profile);
  const adjacency = new Map<number, Set<number>>();
  for (let i = 0; i < methods.length; i++) adjacency.set(i, new Set());
  for (const field of fieldNames) {
    const using = methods.map((m, i) => usesField(m, field, profile) ? i : -1).filter(i => i >= 0);
    for (let i = 0; i < using.length; i++) {
      const a = using[i]!;
      for (const b of using.slice(i + 1)) { adjacency.get(a)!.add(b); adjacency.get(b)!.add(a); }
    }
  }
  return connectedComponents(adjacency, methods.length);
}

function collectFieldNames(cls: SyntaxNode, profile: LanguageProfile): string[] {
  return cls.namedChildren.flatMap(ch => {
    const b = ch.childForFieldName?.('body');
    if (!b) return [];
    return b.namedChildren
      .map(m => profile.collectFieldName(m))
      .filter((n): n is string => Boolean(n));
  });
}

function usesField(m: SyntaxNode, f: string, profile: LanguageProfile): boolean {
  return m.text.includes(`${profile.selfKeyword}.${f}`);
}

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
