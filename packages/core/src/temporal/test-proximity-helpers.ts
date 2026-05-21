import * as fsp from 'fs/promises';
import * as path from 'path';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const tsParser = new Parser();
tsParser.setLanguage((TypeScript as unknown as Record<string, unknown>).typescript as Parser.Language);

/** Counts exported declarations in a TypeScript file using AST parsing with regex fallback. */
export async function countExports(filePath: string): Promise<number> {
  let source: string;
  try { source = await fsp.readFile(filePath, 'utf-8'); } catch { return 0; }
  try {
    const tree = tsParser.parse(source);
    let count = 0;
    function walk(n: Parser.SyntaxNode): void { if (n.type === 'export_statement') count++; for (const c of n.children) walk(c); }
    walk(tree.rootNode);
    return count;
  } catch {
    return (source.match(/^\s*export\s+/gm) ?? []).length;
  }
}

/** Returns conventional test-file candidate paths for a given source file. */
export function candidateTestPaths(rootPath: string, sourceFile: string): string[] {
  const ext = path.extname(sourceFile), base = path.basename(sourceFile, ext), dir = path.dirname(sourceFile);
  const relNoExt = path.relative(rootPath, sourceFile).replace(/\.tsx?$/, '');
  return [
    path.join(dir, `${base}.test${ext}`), path.join(dir, `${base}.spec${ext}`),
    path.join(dir, `${base}.test.ts`), path.join(dir, `${base}.spec.ts`),
    path.join(rootPath, 'tests', `${relNoExt}.test.ts`),
    path.join(rootPath, '__tests__', `${path.basename(relNoExt)}.test.ts`),
    path.join(packageRoot(sourceFile), 'tests', relFromSrc(sourceFile)),
  ];
}

function packageRoot(file: string): string {
  let dir = path.dirname(file);
  while (dir !== path.parse(dir).root) { if (path.basename(dir) === 'src') return path.dirname(dir); dir = path.dirname(dir); }
  return path.dirname(file);
}

function relFromSrc(file: string): string {
  const pkg = packageRoot(file);
  return `${path.relative(path.join(pkg, 'src'), file).replace(/\.tsx?$/, '')}.test.ts`;
}

/** Returns the immediate parent directory as a fallback project root. */
export function inferProjectRoot(file: string): string { return path.dirname(file); }

/** Classifies test-coverage severity based on export count and file location. */
export function classifySeverity(filePath: string, exportCount: number): 'low' | 'medium' | 'high' {
  if (exportCount >= 6 || filePath.replace(/\\/g, '/').includes('/core/src/')) return 'high';
  return exportCount >= 3 ? 'medium' : 'low';
}
