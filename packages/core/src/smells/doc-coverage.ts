import Parser from 'tree-sitter';
import type { Smell } from '../types';
import type { LanguageProfile } from './language-profile';

// Raised from 2: single/dual-export files rarely benefit from enforced JSDoc.
const MIN_EXPORTS_FOR_CHECK = 3;
const HIGH_COVERAGE_THRESHOLD = 0.8;
const MEDIUM_COVERAGE_THRESHOLD = 0.5;

/**
 * Functions shorter than this threshold are considered trivial and never flagged.
 * Getters, setters, delegating wrappers, and one-liners never need JSDoc.
 * Rationale: ESLint deprecated `valid-jsdoc` partly because trivial-function false
 * positives placed unnecessary cognitive burden on developers (ESLint issue #9308).
 */
const TRIVIAL_FUNCTION_LINE_THRESHOLD = 3;

/**
 * Symbol names that are always exempt from documentation requirements.
 * `constructor` is self-documenting by convention; its parameters are typically
 * described in the class-level JSDoc instead.
 */
const EXEMPT_NAMES = new Set(['constructor', 'ngOnInit', 'ngOnDestroy', 'setup', 'teardown']);

interface ExportInfo {
  name: string;
  line: number;
  hasJsDoc: boolean;
}

/** Bundles the tree root, source text, and language profile shared by AST traversal functions. */
interface AstContext {
  root: Parser.SyntaxNode;
  source: string;
  profile: LanguageProfile;
}

/** Bundles the source lines, 1-based export line, and doc-comment pattern for comment detection. */
interface CommentCheckArgs {
  lines: string[];
  exportLine: number;
  pattern: RegExp;
}

export function detectLowDocCoverage(root: Parser.SyntaxNode, source: string, profile: LanguageProfile): Smell[] {
  const ctx: AstContext = { root, source, profile };
  const exports = collectExports(ctx, profile.docCommentIsLineStyle ?? false);
  if (exports.length < MIN_EXPORTS_FOR_CHECK) return [];

  const documented = exports.filter(e => e.hasJsDoc).length;
  const ratio = documented / exports.length;

  if (ratio >= HIGH_COVERAGE_THRESHOLD) return [];

  const severity: Smell['severity'] = ratio < MEDIUM_COVERAGE_THRESHOLD ? 'medium' : 'low';
  return [{
    type: 'LowDocCoverage',
    severity,
    line: 1,
    description: `${documented}/${exports.length} exported symbols have JSDoc (${Math.round(ratio * 100)}%)`,
    suggestion: 'Add /** … */ above exported functions and types to reach 80% coverage',
  }];
}

function collectExports({ root, source, profile }: AstContext, isLineStyle: boolean): ExportInfo[] {
  const lines = source.split('\n');
  const exports: ExportInfo[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (profile.exportableNodeTypes.has(node.type)) {
      const name = getExportedName(node) ?? '<anonymous>';

      // Skip exempt names (constructor, lifecycle hooks, etc.).
      if (EXEMPT_NAMES.has(name)) return;

      // Skip trivially short functions — they never need JSDoc.
      const lineCount = node.endPosition.row - node.startPosition.row + 1;
      if (lineCount <= TRIVIAL_FUNCTION_LINE_THRESHOLD) return;

      const line = node.startPosition.row + 1;
      const args: CommentCheckArgs = { lines, exportLine: line, pattern: profile.docCommentPattern };
      const hasJsDoc = isLineStyle
        ? lineAboveMatchesLineComment(args)
        : lineAboveMatchesDocPattern(args);
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

/**
 * For line-comment languages (Go `//`, Ruby `#`, Rust `///`):
 * Check whether any of the consecutive comment lines immediately above the
 * exported symbol matches the doc-comment pattern.
 * We walk upward from the line before the export, skipping blank lines, and
 * check the first non-blank line. If it matches the pattern (i.e. is a doc
 * comment), the symbol is considered documented.
 */
function lineAboveMatchesLineComment({ lines, exportLine, pattern }: CommentCheckArgs): boolean {
  // Walk backward from the line immediately above the exported symbol.
  let idx = exportLine - 2; // exportLine is 1-based; idx is 0-based
  // Skip at most one blank line (allow one blank line between comment and symbol).
  if (idx >= 0 && lines[idx].trim() === '') idx--;
  if (idx < 0) return false;
  return pattern.test(lines[idx].trim());
}

function lineAboveMatchesDocPattern({ lines, exportLine, pattern }: CommentCheckArgs): boolean {
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
