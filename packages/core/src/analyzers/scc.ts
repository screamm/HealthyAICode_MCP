/**
 * scc.ts
 * Iterative Tarjan's Strongly Connected Components algorithm.
 * Returns all SCCs as arrays of node identifiers.
 * Uses an explicit call-stack to avoid V8 stack overflow on large graphs (~10k+ nodes).
 *
 * Time complexity: O(V + E)
 */

type Frame = {
  node: string;
  iter: IterableIterator<string>;
  phase: 'enter' | 'next';
};

/**
 * Finds all strongly connected components in the given directed graph.
 * Only the graph edges are needed — nodes without outgoing edges are
 * discovered implicitly if they appear as edge targets.
 *
 * @returns Array of SCCs, each SCC is an array of node identifiers.
 *          SCCs of size 1 are acyclic nodes; SCCs of size > 1 are cycles.
 */
export function findStronglyConnectedComponents(
  edges: Map<string, Set<string>>,
): string[][] {
  const index = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Map<string, boolean>();
  const sccStack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  // Collect all nodes (sources + any referenced targets)
  const allNodes = new Set<string>();
  for (const [from, tos] of edges) {
    allNodes.add(from);
    for (const to of tos) allNodes.add(to);
  }

  for (const startNode of allNodes) {
    if (index.has(startNode)) continue;

    // Iterative DFS using an explicit frame stack
    const callStack: Frame[] = [];

    // Helper to push an "enter" frame
    const pushEnter = (node: string) => {
      index.set(node, counter);
      lowlink.set(node, counter);
      counter++;
      onStack.set(node, true);
      sccStack.push(node);
      const neighbours = edges.get(node) ?? new Set<string>();
      callStack.push({ node, iter: neighbours.values(), phase: 'next' });
    };

    pushEnter(startNode);

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1];
      const { node, iter } = frame;

      const next = iter.next();
      if (!next.done) {
        const neighbour = next.value;
        if (!index.has(neighbour)) {
          // Unvisited — recurse
          pushEnter(neighbour);
        } else if (onStack.get(neighbour)) {
          // Neighbour is on the DFS stack — update lowlink
          const current = lowlink.get(node)!;
          const neighbourIdx = index.get(neighbour)!;
          if (neighbourIdx < current) {
            lowlink.set(node, neighbourIdx);
          }
        }
        // Already visited and not on stack: cross/forward edge, ignore
      } else {
        // Done iterating neighbours — pop frame
        callStack.pop();

        if (callStack.length > 0) {
          const parent = callStack[callStack.length - 1];
          const parentLow = lowlink.get(parent.node)!;
          const nodeLow = lowlink.get(node)!;
          if (nodeLow < parentLow) {
            lowlink.set(parent.node, nodeLow);
          }
        }

        // Check if this node is an SCC root
        if (lowlink.get(node) === index.get(node)) {
          const scc: string[] = [];
          let w: string;
          do {
            w = sccStack.pop()!;
            onStack.set(w, false);
            scc.push(w);
          } while (w !== node);
          sccs.push(scc);
        }
      }
    }
  }

  return sccs;
}
