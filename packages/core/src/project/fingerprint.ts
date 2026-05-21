import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { createHash } from 'crypto';

const parser = new Parser();
parser.setLanguage((TypeScript as unknown as Record<string, unknown>).typescript as Parser.Language);
const N_GRAM_SIZE = 10, MIN_TOKENS = 30;

/** Structural n-gram fingerprint of a single function. */
export interface FunctionFingerprint { filePath: string; functionName: string; startLine: number; hashes: Set<string>; tokenCount: number; }

/** Extracts n-gram fingerprints for all functions in a source file. */
export function fingerprintFile(filePath: string, source: string): FunctionFingerprint[] {
  const tree = parser.parse(source);
  const out: FunctionFingerprint[] = [];
  collectFromNode(tree.rootNode, filePath, out);
  return out.filter(fp => fp.tokenCount >= MIN_TOKENS);
}
function collectFromNode(node: Parser.SyntaxNode, filePath: string, out: FunctionFingerprint[]): void {
  if (isFunctionNode(node)) {
    const tokens = normalizeTokens(node);
    out.push({ filePath, functionName: getFunctionName(node), startLine: node.startPosition.row + 1, hashes: ngramHashes(tokens, N_GRAM_SIZE), tokenCount: tokens.length });
  }
  for (const child of node.children) collectFromNode(child, filePath, out);
}
function normalizeTokens(root: Parser.SyntaxNode): string[] {
  const tokens: string[] = [];
  collectLeaves(root, tokens);
  return tokens.filter(Boolean);
}
function collectLeaves(node: Parser.SyntaxNode, out: string[]): void {
  if (node.children.length === 0) { out.push(normalizeLeaf(node)); return; }
  for (const child of node.children) collectLeaves(child, out);
}
function normalizeLeaf(node: Parser.SyntaxNode): string {
  switch (node.type) {
    case 'identifier': case 'property_identifier': return '_VAR_';
    case 'string': case 'template_string': return '_STR_';
    case 'number': return '_NUM_';
    case 'comment': return '';
    default: return node.text;
  }
}
function ngramHashes(tokens: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) {
    const h = createHash('sha1').update(tokens.slice(i, i + n).join(' ')).digest('hex');
    out.add(h.slice(0, 16));
  }
  return out;
}
function isFunctionNode(node: Parser.SyntaxNode): boolean {
  return ['function_declaration', 'method_definition', 'arrow_function', 'function_expression'].includes(node.type);
}
function getFunctionName(node: Parser.SyntaxNode): string {
  if (node.type === 'function_declaration' || node.type === 'method_definition') return node.childForFieldName('name')?.text ?? '<anonymous>';
  return node.parent?.type === 'variable_declarator' ? (node.parent.childForFieldName('name')?.text ?? '<anonymous>') : '<anonymous>';
}
