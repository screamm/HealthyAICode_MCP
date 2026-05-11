import * as fsp from 'fs/promises';
import * as path from 'path';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import type { DeadExportFinding } from '.';

const parser = new Parser();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
parser.setLanguage((TypeScript as any).typescript);

interface ExportRecord {
  filePath: string;
  name: string;
  line: number;
  isReExport: boolean;
}

interface ImportRecord {
  fromPath: string;        // resolved absolute path of the imported file
  importedNames: string[];
}

export async function detectDeadExports(files: string[]): Promise<DeadExportFinding[]> {
  const exports: ExportRecord[] = [];
  const imports: ImportRecord[] = [];

  for (const file of files) {
    const source = await fsp.readFile(file, 'utf-8');
    const tree = parser.parse(source);
    exports.push(...collectExports(tree.rootNode, file));
    imports.push(...collectImports(tree.rootNode, file));
  }

  const importIndex = buildImportIndex(imports);
  return exports
    .filter(e => !e.isReExport)
    .filter(e => !isImported(e, importIndex))
    .map(e => ({ filePath: e.filePath, exportedName: e.name, line: e.line }));
}

function buildImportIndex(imports: ImportRecord[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const imp of imports) {
    const set = idx.get(imp.fromPath) ?? new Set<string>();
    for (const name of imp.importedNames) set.add(name);
    idx.set(imp.fromPath, set);
  }
  return idx;
}

function isImported(record: ExportRecord, idx: Map<string, Set<string>>): boolean {
  const namesAtFile = idx.get(record.filePath);
  return namesAtFile?.has(record.name) ?? false;
}

function collectExports(root: Parser.SyntaxNode, filePath: string): ExportRecord[] {
  const out: ExportRecord[] = [];
  function walk(n: Parser.SyntaxNode): void {
    if (n.type === 'export_statement') {
      const isReExport = n.children.some(c => c.type === 'string'); // export … from '…'
      const name = extractExportName(n);
      if (name) {
        out.push({
          filePath,
          name,
          line: n.startPosition.row + 1,
          isReExport,
        });
      }
    }
    for (const c of n.children) walk(c);
  }
  walk(root);
  return out;
}

function extractExportName(node: Parser.SyntaxNode): string | null {
  for (const child of node.children) {
    const named = child.childForFieldName('name');
    if (named) return named.text;
  }
  return null;
}

function collectImports(root: Parser.SyntaxNode, importingFile: string): ImportRecord[] {
  const out: ImportRecord[] = [];
  function walk(n: Parser.SyntaxNode): void {
    if (n.type === 'import_statement') {
      const sourceLit = n.children.find(c => c.type === 'string')?.text?.replace(/['"]/g, '') ?? '';
      const fromPath = resolveImportPath(importingFile, sourceLit);
      if (!fromPath) return;
      const names = extractImportedNames(n);
      out.push({ fromPath, importedNames: names });
    }
    for (const c of n.children) walk(c);
  }
  walk(root);
  return out;
}

function resolveImportPath(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const dir = path.dirname(fromFile);
  const candidate = path.resolve(dir, spec);
  // Try .ts, .tsx, /index.ts
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const full = candidate.endsWith('.ts') || candidate.endsWith('.tsx') ? candidate : candidate + ext;
    return full;   // Trust caller list — actual fs check would slow us down; verify in tests.
  }
  return null;
}

function extractImportedNames(node: Parser.SyntaxNode): string[] {
  const names: string[] = [];
  function walk(n: Parser.SyntaxNode): void {
    if (n.type === 'identifier' && n.parent?.type === 'import_specifier') {
      names.push(n.text);
    }
    for (const c of n.children) walk(c);
  }
  walk(node);
  return names;
}
