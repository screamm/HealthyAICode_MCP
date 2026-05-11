import Parser from 'tree-sitter';

const NESTING_INCREMENTS = new Set([
  'if_statement', 'for_statement', 'for_in_statement', 'for_of_statement',
  'while_statement', 'do_statement', 'ternary_expression', 'catch_clause',
]);

/** Calculates cognitive complexity score for a single function node. */
export function calculateCognitiveComplexity(functionNode: Parser.SyntaxNode, functionName: string): number {
  let complexity = 0;
  visitNode(functionNode, 0, functionName, n => { complexity += n; });
  return complexity;
}

function visitNode(node: Parser.SyntaxNode, nesting: number, fnName: string, add: (n: number) => void): void {
  let inc = 0;
  if (NESTING_INCREMENTS.has(node.type) || node.type === 'switch_statement') {
    add(1 + nesting); inc = 1;
  } else if (isLabeledJump(node)) {
    add(1);
  } else if (node.type === 'binary_expression' && isBooleanOperator(node)) {
    add(countOperatorTransitions(node));
  } else if (isRecursiveCall(node, fnName)) {
    add(1);
  }
  for (const child of node.children) visitNode(child, nesting + inc, fnName, add);
}

function isBooleanOperator(node: Parser.SyntaxNode): boolean {
  const op = node.childForFieldName('operator')?.text;
  return op === '&&' || op === '||';
}

function isLabeledJump(node: Parser.SyntaxNode): boolean {
  if (node.type !== 'break_statement' && node.type !== 'continue_statement') return false;
  return node.namedChildren.some(c => c.type === 'statement_identifier');
}

function isRecursiveCall(node: Parser.SyntaxNode, functionName: string): boolean {
  if (node.type !== 'call_expression') return false;
  const callee = node.childForFieldName('function')?.text;
  return callee === functionName;
}

function countOperatorTransitions(root: Parser.SyntaxNode): number {
  const ops: string[] = [];
  collectBoolOps(root, ops);
  let groups = 0, prev = '';
  for (const op of ops) { if (op !== prev) { groups++; prev = op; } }
  return groups;
}

function collectBoolOps(n: Parser.SyntaxNode, ops: string[]): void {
  if (n.type === 'binary_expression' && isBooleanOperator(n)) {
    ops.push(n.childForFieldName('operator')!.text);
    for (const child of n.children) collectBoolOps(child, ops);
  }
}
