import * as fsp from 'fs/promises';
import * as path from 'path';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import type { DeadExportFinding } from '.';
import { walkNodes } from '../analyzers/traversal-helpers';
const parser = new Parser();
parser.setLanguage((TypeScript as unknown as Record<string, unknown>).typescript);
interface ExportRecord { filePath: string; name: string; line: number; isReExport: boolean; }
interface ImportRecord { fromPath: string; importedNames: string[]; }
export async function detectDeadExports(files: string[]): Promise<DeadExportFinding[]> {
  const xports: ExportRecord[] = [], imps: ImportRecord[] = [];
  for (const file of files) {
    const tree = parser.parse(await fsp.readFile(file, 'utf-8'));
    xports.push(...collectExports(tree.rootNode, file));
    imps.push(...collectImports(tree.rootNode, file));
  }
  const idx = buildImportIndex(imps);
  return xports.filter(e => !e.isReExport)
    .filter(e => !(idx.get(e.filePath)?.has(e.name) ?? false))
    .map(e => ({ filePath: e.filePath, exportedName: e.name, line: e.line }));
}
function buildImportIndex(imps: ImportRecord[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const { fromPath, importedNames } of imps) { const s = idx.get(fromPath) ?? new Set<string>(); importedNames.forEach(n => s.add(n)); idx.set(fromPath, s); }
  return idx;
}
function collectExports(root: Parser.SyntaxNode, filePath: string): ExportRecord[] {
  const out: ExportRecord[] = [];
  walkNodes(root, n => {
    if (n.type !== 'export_statement') return;
    const isRex = n.children.some(c => c.type === 'string');
    for (const ch of n.children) { const f = ch.childForFieldName('name'); if (f) { out.push({ filePath, name: f.text, line: n.startPosition.row + 1, isReExport: isRex }); return; } }
  });
  return out;
}
function collectImports(root: Parser.SyntaxNode, importingFile: string): ImportRecord[] {
  const out: ImportRecord[] = [];
  walkNodes(root, n => {
    if (n.type !== 'import_statement') return;
    const raw = n.children.find(c => c.type === 'string')?.text?.replace(/['"]/g, '') ?? '';
    if (!raw.startsWith('.')) return;
    const base = path.resolve(path.dirname(importingFile), raw);
    const fromPath = base.endsWith('.ts') || base.endsWith('.tsx') ? base : base + '.ts';
    const names: string[] = [];
    walkNodes(n, x => { if (x.type === 'identifier' && x.parent?.type === 'import_specifier') names.push(x.text); });
    out.push({ fromPath, importedNames: names });
  });
  return out;
}
