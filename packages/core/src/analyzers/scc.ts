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

/** Shared traversal state passed through helper functions to avoid closure captures. */
interface TarjanState {
  index: Map<string, number>;
  lowlink: Map<string, number>;
  onStack: Map<string, boolean>;
  sccStack: string[];
  sccs: string[][];
  counter: number;
}

/** Full DFS execution context: combines graph edges, the iterative call stack, and Tarjan state. */
interface DfsContext {
  edges: Map<string, Set<string>>;
  callStack: Frame[];
  state: TarjanState;
}

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
  const state: TarjanState = {
    index: new Map(),
    lowlink: new Map(),
    onStack: new Map(),
    sccStack: [],
    sccs: [],
    counter: 0,
  };

  const allNodes = collectAllNodes(edges);

  for (const startNode of allNodes) {
    if (!state.index.has(startNode)) {
      runIterativeDfs(startNode, edges, state);
    }
  }

  return state.sccs;
}

/** Collects every node referenced as a source or target in the edge map. */
function collectAllNodes(edges: Map<string, Set<string>>): Set<string> {
  const allNodes = new Set<string>();
  for (const [from, tos] of edges) {
    allNodes.add(from);
    for (const to of tos) allNodes.add(to);
  }
  return allNodes;
}

/** Pushes an "enter" frame onto the call stack and initialises Tarjan bookkeeping for the node. */
function pushEnterFrame(node: string, ctx: DfsContext): void {
  ctx.state.index.set(node, ctx.state.counter);
  ctx.state.lowlink.set(node, ctx.state.counter);
  ctx.state.counter++;
  ctx.state.onStack.set(node, true);
  ctx.state.sccStack.push(node);
  const neighbours = ctx.edges.get(node) ?? new Set<string>();
  ctx.callStack.push({ node, iter: neighbours.values(), phase: 'next' });
}

/** Processes one neighbour during DFS iteration: recurse if unvisited, update lowlink if on stack. */
function processNeighbour(neighbour: string, currentNode: string, ctx: DfsContext): void {
  if (!ctx.state.index.has(neighbour)) {
    pushEnterFrame(neighbour, ctx);
  } else if (ctx.state.onStack.get(neighbour)) {
    const current = ctx.state.lowlink.get(currentNode)!;
    const neighbourIdx = ctx.state.index.get(neighbour)!;
    if (neighbourIdx < current) {
      ctx.state.lowlink.set(currentNode, neighbourIdx);
    }
  }
  // Already visited and not on stack: cross/forward edge, ignore
}

/** Propagates lowlink upward to the parent frame after a node finishes its neighbour iteration. */
function propagateLowlinkToParent(node: string, ctx: DfsContext): void {
  if (ctx.callStack.length === 0) return;
  const parent = ctx.callStack[ctx.callStack.length - 1];
  const parentLow = ctx.state.lowlink.get(parent.node)!;
  const nodeLow = ctx.state.lowlink.get(node)!;
  if (nodeLow < parentLow) {
    ctx.state.lowlink.set(parent.node, nodeLow);
  }
}

/** Pops all nodes in the current SCC off the stack and records it when an SCC root is detected. */
function popSccIfRoot(node: string, state: TarjanState): void {
  if (state.lowlink.get(node) !== state.index.get(node)) return;

  const scc: string[] = [];
  let w: string;
  do {
    w = state.sccStack.pop()!;
    state.onStack.set(w, false);
    scc.push(w);
  } while (w !== node);
  state.sccs.push(scc);
}

/** Runs the iterative DFS from a single start node, recording SCCs as they are completed. */
function runIterativeDfs(
  startNode: string,
  edges: Map<string, Set<string>>,
  state: TarjanState,
): void {
  const ctx: DfsContext = { edges, callStack: [], state };
  pushEnterFrame(startNode, ctx);

  while (ctx.callStack.length > 0) {
    const frame = ctx.callStack[ctx.callStack.length - 1];
    const { node, iter } = frame;

    const next = iter.next();
    if (!next.done) {
      processNeighbour(next.value, node, ctx);
    } else {
      ctx.callStack.pop();
      propagateLowlinkToParent(node, ctx);
      popSccIfRoot(node, state);
    }
  }
}
