import * as fsp from 'fs/promises';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import type { LanguageMixFinding } from '.';
const parser = new Parser();
parser.setLanguage((TypeScript as unknown as Record<string, unknown>).typescript);
const SWEDISH_STOPWORDS = new Set('och att är kan ska inte inga redan med för till som eller mellan har varit vara blir blev denna dessa'.split(' '));
const ENGLISH_STOPWORDS = new Set('the and is of to if else not with for from as or between has have been this these into about because'.split(' '));
const SWEDISH_CHARS = /[åäöÅÄÖ]/;
type Counts = [number, number];
export async function detectLanguageMix(files: string[]): Promise<LanguageMixFinding[]> {
  const findings: LanguageMixFinding[] = [];
  for (const file of files) { const source = await fsp.readFile(file, 'utf-8'); const f = analyzeFileLang(file, source); if (f) findings.push(f); }
  return findings;
}
function analyzeFileLang(filePath: string, source: string): LanguageMixFinding | null {
  const tree = parser.parse(source);
  const cl = dominantLanguage(collectTokens(tree.rootNode, 'comment'));
  const sl = dominantLanguage(collectTokens(tree.rootNode, 'string'));
  if (cl === 'unknown' || sl === 'unknown' || cl === sl) return null;
  return { filePath, primaryLanguage: cl, mixedRegions: collectRegions(tree.rootNode, sl, source) };
}
function collectTokens(root: Parser.SyntaxNode, kind: 'comment' | 'string'): string[] {
  const types = kind === 'comment' ? new Set(['comment']) : new Set(['string', 'template_string', 'string_fragment']);
  const tokens: string[] = [];
  walkForTokens(root, types, tokens);
  return tokens;
}
function walkForTokens(n: Parser.SyntaxNode, types: Set<string>, out: string[]): void {
  if (types.has(n.type)) out.push(n.text);
  for (const c of n.children) walkForTokens(c, types, out);
}
function scorePair(text: string, c: Counts): Counts {
  let [sv, en] = c;
  if (SWEDISH_CHARS.test(text)) sv += 2;
  for (const w of (text.toLowerCase().match(/[a-zåäö]+/g) ?? [])) {
    if (SWEDISH_STOPWORDS.has(w)) sv++;
    if (ENGLISH_STOPWORDS.has(w)) en++;
  }
  return [sv, en];
}
function dominantLanguage(tokens: string[]): 'sv' | 'en' | 'unknown' {
  let c: Counts = [0, 0];
  for (const text of tokens) c = scorePair(text, c);
  const [sv, en] = c;
  if (sv === 0 && en === 0) return 'unknown';
  if (sv > en * 1.5) return 'sv';
  if (en > sv * 1.5) return 'en';
  return 'unknown';
}
type Region = { line: number; detected: string; snippet: string };
function collectRegions(root: Parser.SyntaxNode, odd: 'sv' | 'en', source: string): Region[] {
  const out: Region[] = [], lines = source.split('\n');
  walkRegions(root, odd, lines, out);
  return out;
}
function walkRegions(n: Parser.SyntaxNode, odd: 'sv' | 'en', lines: string[], out: Region[]): void {
  if (n.type === 'string' || n.type === 'template_string') {
    const isOdd = odd === 'sv' ? SWEDISH_CHARS.test(n.text) : /[a-z]/i.test(n.text);
    if (isOdd) out.push({ line: n.startPosition.row + 1, detected: odd, snippet: lines[n.startPosition.row]?.trim().slice(0, 80) ?? '' });
  }
  for (const c of n.children) walkRegions(c, odd, lines, out);
}
