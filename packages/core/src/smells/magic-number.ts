import Parser from 'tree-sitter';
import type { Smell } from '../types';

const ALLOWED_LITERALS = new Set(['0', '1', '-1', '2', '100']);
const FN_TYPES = new Set(['function_declaration', 'method_definition', 'arrow_function', 'function_expression']);
const MIN_MAGIC_PER_FUNCTION = 3;

export function detectMagicNumbers(root: Parser.SyntaxNode, filePath: string): Smell[] {
  if (isTestFile(filePath)) return [];
  const perFn = new Map<string, { count: number; line: number; name: string }>();
  visitNode(root, null, 0, perFn);
  return [...perFn.values()].filter(e => e.count >= MIN_MAGIC_PER_FUNCTION).map(e => ({
    type: 'MagicNumber' as const, severity: 'medium' as const, functionName: e.name, line: e.line,
    description: `'${e.name}' contains ${e.count} magic numbers`,
    suggestion: `Extract the numbers in '${e.name}' into named constants`,
  }));
}

function visitNode(node: Parser.SyntaxNode, fn: string | null, fl: number, perFn: Map<string, { count: number; line: number; name: string }>): void {
  if (isFunctionNode(node)) { const n = getFunctionName(node), l = node.startPosition.row + 1; for (const c of node.children) visitNode(c, n, l, perFn); return; }
  if (isCountableMagic(node, fn)) { const e = perFn.get(fn!) ?? { count: 0, line: fl, name: fn! }; e.count++; perFn.set(fn!, e); }
  for (const c of node.children) visitNode(c, fn, fl, perFn);
}

function isCountableMagic(node: Parser.SyntaxNode, fn: string | null): boolean {
  if (!fn || node.type !== 'number' || !/^[0-9]/.test(node.text)) return false;
  return isMagic(node);
}

function isMagic(n: Parser.SyntaxNode): boolean {
  return !ALLOWED_LITERALS.has(n.text) && !isInsideConstDeclarator(n) && !isEnumValue(n);
}

function isInsideConstDeclarator(node: Parser.SyntaxNode): boolean {
  let c: Parser.SyntaxNode | null = node.parent;
  while (c) {
    if (c.type === 'variable_declarator' && c.parent?.type === 'lexical_declaration' && c.parent.children.some(x => x.type === 'const')) return true;
    if (isFunctionNode(c)) return false;
    c = c.parent;
  }
  return false;
}

function isEnumValue(n: Parser.SyntaxNode): boolean { return n.parent?.type === 'enum_assignment'; }
function isFunctionNode(n: Parser.SyntaxNode): boolean { return FN_TYPES.has(n.type); }
function getFunctionName(n: Parser.SyntaxNode): string {
  if (n.type === 'function_declaration' || n.type === 'method_definition') return n.childForFieldName('name')?.text ?? '<anonymous>';
  return n.parent?.type === 'variable_declarator' ? n.parent.childForFieldName('name')?.text ?? '<anonymous>' : '<anonymous>';
}
function isTestFile(p: string): boolean { return /\.(test|spec)\.[tj]sx?$/.test(p); }
