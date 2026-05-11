import Parser from 'tree-sitter';
import type { Smell } from '../types';

const ALLOWED_LITERALS = new Set(['0', '1', '-1', '2', '100']);
const MIN_MAGIC_PER_FUNCTION = 3;

export function detectMagicNumbers(root: Parser.SyntaxNode, filePath: string): any[] {
  if (isTestFile(filePath)) return [];

  const smells: any[] = [];
  const perFunctionCount = new Map<string, { count: number; line: number; name: string }>();

  function visit(node: Parser.SyntaxNode, currentFn: string | null, fnLine: number): void {
    if (isFunctionNode(node)) {
      const name = getFunctionName(node);
      const fnStartLine = node.startPosition.row + 1;
      for (const child of node.children) visit(child, name, fnStartLine);
      return;
    }

    if (node.type === 'number' && /^[0-9]/.test(node.text) && isMagic(node) && currentFn) {
      const entry = perFunctionCount.get(currentFn) ?? { count: 0, line: fnLine, name: currentFn };
      entry.count++;
      perFunctionCount.set(currentFn, entry);
    }

    for (const child of node.children) visit(child, currentFn, fnLine);
  }

  visit(root, null, 0);

  for (const { count, line, name } of perFunctionCount.values()) {
    if (count >= MIN_MAGIC_PER_FUNCTION) {
      smells.push({
        // @ts-ignore
        type: 'MagicNumber',
        severity: 'medium',
        functionName: name,
        line,
        description: `'${name}' innehåller ${count} magiska tal`,
        suggestion: `Extrahera tal i '${name}' till namngivna konstanter`,
      });
    }
  }
  return smells;
}

function isMagic(node: Parser.SyntaxNode): boolean {
  if (ALLOWED_LITERALS.has(node.text)) return false;
  if (isInsideConstDeclarator(node)) return false;
  if (isEnumValue(node)) return false;
  return true;
}

function isInsideConstDeclarator(node: Parser.SyntaxNode): boolean {
  let current: Parser.SyntaxNode | null = node.parent;
  while (current) {
    if (current.type === 'variable_declarator' && current.parent?.type === 'lexical_declaration') {
      const kind = current.parent.children.find(c => c.type === 'const');
      if (kind) return true;
    }
    if (isFunctionNode(current)) return false;
    current = current.parent;
  }
  return false;
}

function isEnumValue(node: Parser.SyntaxNode): boolean {
  return node.parent?.type === 'enum_assignment';
}

function isFunctionNode(node: Parser.SyntaxNode): boolean {
  return ['function_declaration', 'method_definition', 'arrow_function', 'function_expression']
    .includes(node.type);
}

function getFunctionName(node: Parser.SyntaxNode): string {
  if (node.type === 'function_declaration' || node.type === 'method_definition') {
    return node.childForFieldName('name')?.text ?? '<anonymous>';
  }
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') {
    return parent.childForFieldName('name')?.text ?? '<anonymous>';
  }
  return '<anonymous>';
}

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(filePath);
}
