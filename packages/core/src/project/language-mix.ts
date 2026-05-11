import * as fsp from 'fs/promises';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import type { LanguageMixFinding } from '.';

const parser = new Parser();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
parser.setLanguage((TypeScript as any).typescript);

const SWEDISH_STOPWORDS = new Set([
  'och','att','är','kan','ska','inte','inga','redan','med','för','till',
  'som','eller','mellan','har','varit','vara','blir','blev','denna','dessa',
]);

const ENGLISH_STOPWORDS = new Set([
  'the','and','is','of','to','if','else','not','with','for','from','as','or',
  'between','has','have','been','this','these','into','about','because',
]);

const SWEDISH_CHARS = /[åäöÅÄÖ]/;

export async function detectLanguageMix(files: string[]): Promise<LanguageMixFinding[]> {
  const findings: LanguageMixFinding[] = [];
  for (const file of files) {
    const source = await fsp.readFile(file, 'utf-8');
    const finding = analyzeFileLang(file, source);
    if (finding) findings.push(finding);
  }
  return findings;
}

function analyzeFileLang(filePath: string, source: string): LanguageMixFinding | null {
  const tree = parser.parse(source);
  const commentLang = dominantLanguage(collectTokens(tree.rootNode, 'comment'));
  const stringLang = dominantLanguage(collectTokens(tree.rootNode, 'string'));

  if (commentLang === 'unknown' || stringLang === 'unknown') return null;
  if (commentLang === stringLang) return null;

  return {
    filePath,
    primaryLanguage: commentLang,
    mixedRegions: collectRegions(tree.rootNode, stringLang, source),
  };
}

function collectTokens(root: Parser.SyntaxNode, kind: 'comment' | 'string'): string[] {
  const matchTypes = kind === 'comment'
    ? new Set(['comment'])
    : new Set(['string', 'template_string', 'string_fragment']);
  const tokens: string[] = [];
  function walk(n: Parser.SyntaxNode): void {
    if (matchTypes.has(n.type)) tokens.push(n.text);
    for (const c of n.children) walk(c);
  }
  walk(root);
  return tokens;
}

function dominantLanguage(tokens: string[]): 'sv' | 'en' | 'unknown' {
  let sv = 0, en = 0;
  for (const text of tokens) {
    if (SWEDISH_CHARS.test(text)) sv += 2;
    const words = text.toLowerCase().match(/[a-zåäö]+/g) ?? [];
    for (const w of words) {
      if (SWEDISH_STOPWORDS.has(w)) sv++;
      if (ENGLISH_STOPWORDS.has(w)) en++;
    }
  }
  if (sv === 0 && en === 0) return 'unknown';
  if (sv > en * 1.5) return 'sv';
  if (en > sv * 1.5) return 'en';
  return 'unknown';
}

function collectRegions(
  root: Parser.SyntaxNode,
  oddLanguage: 'sv' | 'en',
  source: string,
): Array<{ line: number; detected: string; snippet: string }> {
  const out: Array<{ line: number; detected: string; snippet: string }> = [];
  const lines = source.split('\n');
  function walk(n: Parser.SyntaxNode): void {
    if (n.type === 'string' || n.type === 'template_string') {
      const text = n.text;
      const isOdd = oddLanguage === 'sv' ? SWEDISH_CHARS.test(text) : /[a-z]/i.test(text);
      if (isOdd) {
        out.push({
          line: n.startPosition.row + 1,
          detected: oddLanguage,
          snippet: lines[n.startPosition.row]?.trim().slice(0, 80) ?? '',
        });
      }
    }
    for (const c of n.children) walk(c);
  }
  walk(root);
  return out;
}
