import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { createHash } from 'crypto';

const parser = new Parser();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
parser.setLanguage((TypeScript as any).typescript);

const N_GRAM_SIZE = 10;
const MIN_TOKENS = 30;

export interface FunctionFingerprint {
  filePath: string;
  functionName: string;
  startLine: number;
  hashes: Set<string>;
  tokenCount: number;
}

export function fingerprintFile(filePath: string, source: string): FunctionFingerprint[] {
  const tree = parser.parse(source);
  const fingerprints: FunctionFingerprint[] = [];
  collectFromNode(tree.rootNode, filePath, fingerprints);
  return fingerprints.filter(fp => fp.tokenCount >= MIN_TOKENS);
}

function collectFromNode(
  node: Parser.SyntaxNode,
  filePath: string,
  out: FunctionFingerprint[],
): void {
  if (isFunctionNode(node)) {
    const tokens = normalizeTokens(node);
    const hashes = ngramHashes(tokens, N_GRAM_SIZE);
    out.push({
      filePath,
      functionName: getFunctionName(node),
      startLine: node.startPosition.row + 1,
      hashes,
      tokenCount: tokens.length,
    });
  }
  for (const child of node.children) collectFromNode(child, filePath, out);
}

function normalizeTokens(root: Parser.SyntaxNode): string[] {
  const tokens: string[] = [];
  function walk(n: Parser.SyntaxNode): void {
    if (n.children.length === 0) {
      tokens.push(normalizeLeaf(n));
      return;
    }
    for (const child of n.children) walk(child);
  }
  walk(root);
  return tokens.filter(Boolean);
}

function normalizeLeaf(node: Parser.SyntaxNode): string {
  switch (node.type) {
    case 'identifier':
    case 'property_identifier':
      return '_VAR_';
    case 'string':
    case 'template_string':
      return '_STR_';
    case 'number':
      return '_NUM_';
    case 'comment':
      return '';
    default:
      return node.text;
  }
}

function ngramHashes(tokens: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= tokens.length; i++) {
    const slice = tokens.slice(i, i + n).join(' ');
    out.add(createHash('sha1').update(slice).digest('hex').slice(0, 16));
  }
  return out;
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
