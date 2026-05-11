import Parser from 'tree-sitter';

const NESTING_INCREMENTS = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'for_of_statement',
  'while_statement',
  'do_statement',
  'ternary_expression',
  'catch_clause',
]);

const FLAT_INCREMENTS = new Set([
  'switch_statement',
  'break_statement',     // only when labeled
  'continue_statement',  // only when labeled
]);

export function calculateCognitiveComplexity(
  functionNode: Parser.SyntaxNode,
  functionName: string,
): number {
  let complexity = 0;

  function visit(node: Parser.SyntaxNode, nesting: number): void {
    let nestingIncrement = 0;

    if (NESTING_INCREMENTS.has(node.type)) {
      complexity += 1 + nesting;
      nestingIncrement = 1;
    } else if (node.type === 'switch_statement') {
      complexity += 1 + nesting;
      nestingIncrement = 1;
    } else if (isLabeledJump(node)) {
      complexity += 1;
    } else if (node.type === 'binary_expression' && isBooleanOperator(node)) {
      complexity += countOperatorTransitions(node);
    } else if (isRecursiveCall(node, functionName)) {
      complexity += 1;
    }

    for (const child of node.children) {
      visit(child, nesting + nestingIncrement);
    }
  }

  visit(functionNode, 0);
  return complexity;
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
  // Walk the boolean-operator tree, return 1 per distinct operator group.
  const ops: string[] = [];
  function collect(n: Parser.SyntaxNode): void {
    if (n.type === 'binary_expression' && isBooleanOperator(n)) {
      const op = n.childForFieldName('operator')!.text;
      ops.push(op);
      for (const child of n.children) collect(child);
    }
  }
  collect(root);

  let groups = 0;
  let prev = '';
  for (const op of ops) {
    if (op !== prev) {
      groups++;
      prev = op;
    }
  }
  return groups;
}
