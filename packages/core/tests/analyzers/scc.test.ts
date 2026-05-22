import { describe, it, expect } from 'vitest';
import { findStronglyConnectedComponents } from '../../src/analyzers/scc';

function makeEdges(pairs: [string, string][]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [from, to] of pairs) {
    if (!map.has(from)) map.set(from, new Set());
    if (!map.has(to)) map.set(to, new Set());
    map.get(from)!.add(to);
  }
  return map;
}

describe('findStronglyConnectedComponents', () => {
  it('DAG A->B->C: all SCCs have size 1 (no cycles)', () => {
    const edges = makeEdges([['a', 'b'], ['b', 'c']]);
    const sccs = findStronglyConnectedComponents(edges);
    expect(sccs.every(scc => scc.length === 1)).toBe(true);
    expect(sccs).toHaveLength(3);
  });

  it('direct cycle X<->Y: SCC with size 2', () => {
    const edges = makeEdges([['x', 'y'], ['y', 'x']]);
    const sccs = findStronglyConnectedComponents(edges);
    const cycleScc = sccs.find(scc => scc.length === 2);
    expect(cycleScc).toBeDefined();
    expect(cycleScc).toContain('x');
    expect(cycleScc).toContain('y');
  });

  it('longer cycle A->B->C->A: SCC with size 3', () => {
    const edges = makeEdges([['a', 'b'], ['b', 'c'], ['c', 'a']]);
    const sccs = findStronglyConnectedComponents(edges);
    const cycleScc = sccs.find(scc => scc.length === 3);
    expect(cycleScc).toBeDefined();
    expect(cycleScc).toContain('a');
    expect(cycleScc).toContain('b');
    expect(cycleScc).toContain('c');
  });

  it('mixed: cycle P<->Q + acyclic R->P: one cycle SCC', () => {
    const edges = makeEdges([['p', 'q'], ['q', 'p'], ['r', 'p']]);
    const sccs = findStronglyConnectedComponents(edges);
    const cycleSccs = sccs.filter(scc => scc.length > 1);
    expect(cycleSccs).toHaveLength(1);
    expect(cycleSccs[0]).toContain('p');
    expect(cycleSccs[0]).toContain('q');
  });

  it('empty graph: returns empty array', () => {
    const edges = new Map<string, Set<string>>();
    const sccs = findStronglyConnectedComponents(edges);
    expect(sccs).toHaveLength(0);
  });

  it('single node without edges: SCC with size 1', () => {
    const edges = new Map<string, Set<string>>([['a', new Set()]]);
    const sccs = findStronglyConnectedComponents(edges);
    expect(sccs).toHaveLength(1);
    expect(sccs[0]).toHaveLength(1);
    expect(sccs[0][0]).toBe('a');
  });

  it('large cycle of 10 nodes: SCC with size 10 (no stack overflow)', () => {
    const nodes = Array.from({ length: 10 }, (_, i) => `n${i}`);
    const pairs: [string, string][] = nodes.map((n, i) => [n, nodes[(i + 1) % 10]]);
    const edges = makeEdges(pairs);
    const sccs = findStronglyConnectedComponents(edges);
    const cycleScc = sccs.find(scc => scc.length === 10);
    expect(cycleScc).toBeDefined();
    expect(cycleScc).toHaveLength(10);
  });
});
