import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import type { LanguageMixFinding } from '.';

const parser = new Parser();
parser.setLanguage((TypeScript as unknown as Record<string, unknown>).typescript as Parser.Language);
const SV_STOP = new Set('och att är kan ska inte inga redan med för till som eller mellan har varit vara blir blev denna dessa'.split(' '));
const EN_STOP = new Set('the and is of to if else not with for from as or between has have been this these into about because'.split(' '));
const SV_CHARS = /[åäöÅÄÖ]/;
type Region = { line: number; detected: string; snippet: string };

export function analyzeFileLang(filePath: string, source: string): LanguageMixFinding | null {
  const tree = parser.parse(source);
  const cl = classify(tree.rootNode, 'comment'), sl = classify(tree.rootNode, 'string');
  if (cl === 'unknown' || sl === 'unknown' || cl === sl) return null;
  return { filePath, primaryLanguage: cl, mixedRegions: regions(tree.rootNode, sl, source) };
}

function walkTokens(n: Parser.SyntaxNode, types: Set<string>, counts: [number, number]): void {
  if (types.has(n.type)) { if (SV_CHARS.test(n.text)) counts[0] += 2; for (const w of (n.text.toLowerCase().match(/[a-zåäö]+/g) ?? [])) { if (SV_STOP.has(w)) counts[0]++; if (EN_STOP.has(w)) counts[1]++; } }
  for (const c of n.children) walkTokens(c, types, counts);
}

function classify(root: Parser.SyntaxNode, kind: 'comment' | 'string'): 'sv' | 'en' | 'unknown' {
  const types = kind === 'comment' ? new Set(['comment']) : new Set(['string', 'template_string', 'string_fragment']);
  const counts: [number, number] = [0, 0];
  walkTokens(root, types, counts);
  const [sv, en] = counts;
  if (sv === 0 && en === 0) return 'unknown';
  if (sv > en * 1.5) return 'sv';
  if (en > sv * 1.5) return 'en';
  return 'unknown';
}

function walkRegions(n: Parser.SyntaxNode, odd: 'sv' | 'en', lines: string[], out: Region[]): void {
  if (n.type === 'string' || n.type === 'template_string') { const isOdd = odd === 'sv' ? SV_CHARS.test(n.text) : /[a-z]/i.test(n.text); if (isOdd) out.push({ line: n.startPosition.row + 1, detected: odd, snippet: lines[n.startPosition.row]?.trim().slice(0, 80) ?? '' }); }
  for (const c of n.children) walkRegions(c, odd, lines, out);
}

function regions(root: Parser.SyntaxNode, odd: 'sv' | 'en', source: string): Region[] {
  const out: Region[] = [];
  walkRegions(root, odd, source.split('\n'), out);
  return out;
}
