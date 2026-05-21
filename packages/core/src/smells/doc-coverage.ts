import Parser from 'tree-sitter';
import type { Smell } from '../types';
import type { LanguageProfile } from './language-profile';

const MIN_EXPORTS_FOR_CHECK = 2;
const HIGH_COVERAGE_THRESHOLD = 0.8;
const MEDIUM_COVERAGE_THRESHOLD = 0.5;

interface ExportInfo {
  name: string;
  line: number;
  hasJsDoc: boolean;
}

export function detectLowDocCoverage(root: Parser.SyntaxNode, source: string, profile: LanguageProfile): Smell[] {
  const exports = collectExports(root, source, profile);
  if (exports.length < MIN_EXPORTS_FOR_CHECK) return [];

  const documented = exports.filter(e => e.hasJsDoc).length;
  const ratio = documented / exports.length;

  if (ratio >= HIGH_COVERAGE_THRESHOLD) return [];

  const severity: Smell['severity'] = ratio < MEDIUM_COVERAGE_THRESHOLD ? 'medium' : 'low';
  return [{
    type: 'LowDocCoverage',
    severity,
    line: 1,
    description: `Endast ${documented}/${exports.length} exporterade symboler har JSDoc (${Math.round(ratio * 100)} %)`,
    suggestion: 'Lägg till /** … */ ovanför exporterade funktioner och typer',
  }];
}

function collectExports(root: Parser.SyntaxNode, source: string, profile: LanguageProfile): ExportInfo[] {
  const lines = source.split('\n');
  const exports: ExportInfo[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (profile.exportableNodeTypes.has(node.type)) {
      const name = getExportedName(node) ?? '<anonymous>';
      const line = node.startPosition.row + 1;
      const hasJsDoc = lineAboveMatchesDocPattern(lines, line, profile.docCommentPattern);
      exports.push({ name, line, hasJsDoc });
    }
    for (const child of node.children) visit(child);
  }
  visit(root);
  return exports;
}

function getExportedName(node: Parser.SyntaxNode): string | null {
  const decl = node.children.find(c => /declaration$/.test(c.type) || c.type === 'lexical_declaration');
  if (!decl) return null;
  const named = decl.childForFieldName('name');
  return named?.text ?? null;
}

function lineAboveMatchesDocPattern(lines: string[], exportLine: number, pattern: RegExp): boolean {
  // Collect the block of non-empty lines immediately above the export line
  const commentLines: string[] = [];
  for (let i = exportLine - 2; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === '') break;
    commentLines.unshift(line);
  }
  if (commentLines.length === 0) return false;
  return pattern.test(commentLines.join('\n'));
}
