import type Parser from 'tree-sitter';

/** Counts cyclomatic complexity by recursively traversing a syntax node tree. */
export function countCyclomaticNodes(
  node: Parser.SyntaxNode,
  nodeTypes: Set<string>,
  extraCheck?: (n: Parser.SyntaxNode) => boolean,
): number {
  let cc = 1;
  function traverse(n: Parser.SyntaxNode): void {
    if (nodeTypes.has(n.type)) cc++;
    else if (extraCheck?.(n)) cc++;
    for (const child of n.children) traverse(child);
  }
  traverse(node);
  return cc;
}

/** Calculates maximum nesting depth by recursively traversing a syntax node tree. */
export function calculateMaxNestingDepth(
  node: Parser.SyntaxNode,
  nodeTypes: Set<string>,
): number {
  let maxDepth = 0;
  function traverse(n: Parser.SyntaxNode, depth: number): void {
    const isNesting = nodeTypes.has(n.type);
    const newDepth = isNesting ? depth + 1 : depth;
    if (isNesting) maxDepth = Math.max(maxDepth, newDepth);
    for (const child of n.children) traverse(child, newDepth);
  }
  traverse(node, 0);
  return maxDepth;
}

/** Visits every node in the subtree rooted at node, calling cb for each. */
export function walkNodes(node: Parser.SyntaxNode, cb: (n: Parser.SyntaxNode) => void): void {
  cb(node);
  for (const child of node.children) walkNodes(child, cb);
}
