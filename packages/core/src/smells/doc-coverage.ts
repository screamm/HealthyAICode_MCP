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
  // The line immediately above the export (index exportLine-2) must close a doc comment.
  // Requiring it to end with '*/' prevents false positives when there is no blank line
  // between consecutive exports and an earlier JSDoc would otherwise be collected.
  const closingIdx = exportLine - 2;
  if (closingIdx < 0) return false;
  const closingLine = lines[closingIdx].trim();
  if (!closingLine.endsWith('*/')) return false;
  // Walk upward to collect the full comment block so multi-line JSDoc is matched correctly.
  const commentLines: string[] = [closingLine];
  for (let i = closingIdx - 1; i >= 0; i--) {
    const l = lines[i].trim();
    commentLines.unshift(l);
    if (l.startsWith('/**') || l.startsWith('/*')) break;
    if (l === '') break;
  }
  return pattern.test(commentLines.join('\n'));
}
