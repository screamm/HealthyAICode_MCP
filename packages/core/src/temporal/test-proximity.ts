import * as fsp from 'fs/promises';
import * as path from 'path';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

// 'TestProximity' is not yet in SmellType; define the finding type locally.
export interface TestProximityFinding {
  filePath: string;
  exportCount: number;
  searchedPaths: string[];
  severity: 'low' | 'medium' | 'high';
}

const tsParser = new Parser();
// tree-sitter-typescript exposes both typescript and tsx sub-languages.
// Use the .typescript property if available, otherwise fall back to the module itself.
const tsLanguage =
  (TypeScript as unknown as { typescript?: unknown }).typescript ?? TypeScript;
// @ts-ignore — setLanguage accepts the language object from tree-sitter-typescript
tsParser.setLanguage(tsLanguage);

/**
 * Detects source files that lack an adjacent test file.
 *
 * For each `.ts`/`.tsx` source file (excluding test files themselves):
 *  1. Counts exported declarations using a lightweight AST parse.
 *  2. If the file has at least one export, checks whether any of the
 *     conventional test-file locations exist.
 *  3. Emits a finding when no test file is found.
 *
 * @param sourceFiles  Absolute paths to all files in the project
 *                     (both source and test files — test files are used to
 *                     build the "known test" set).
 * @param rootPath     Optional project root; improves candidate path resolution
 *                     for `tests/` and `__tests__/` subtree patterns.
 */
export async function detectTestProximity(
  sourceFiles: string[],
  rootPath?: string,
): Promise<TestProximityFinding[]> {
  const testFileSet = new Set(
    sourceFiles.filter(isTestFile).map(f => path.resolve(f)),
  );

  const onlySource = sourceFiles.filter(f => !isTestFile(f));

  const findings: TestProximityFinding[] = [];

  for (const file of onlySource) {
    const exportCount = await countExports(file);
    if (exportCount === 0) continue;

    const root = rootPath ?? inferProjectRoot(file);
    const candidates = candidateTestPaths(root, file);
    const hasTest = candidates.some(p => testFileSet.has(path.resolve(p)));
    if (hasTest) continue;

    findings.push({
      filePath: file,
      exportCount,
      searchedPaths: candidates,
      severity: classifySeverity(file, exportCount),
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.[tj]sx?$/.test(file);
}

async function countExports(filePath: string): Promise<number> {
  let source: string;
  try {
    source = await fsp.readFile(filePath, 'utf-8');
  } catch {
    return 0;
  }

  try {
    const tree = tsParser.parse(source);
    let count = 0;
    function walk(n: Parser.SyntaxNode): void {
      if (n.type === 'export_statement') count++;
      for (const c of n.children) walk(c);
    }
    walk(tree.rootNode);
    return count;
  } catch {
    // Fallback: cheap regex count if tree-sitter parsing fails for this file
    const matches = source.match(/^\s*export\s+/gm);
    return matches ? matches.length : 0;
  }
}

/**
 * Returns the list of conventional test-file paths for a given source file.
 * Checked in order of convention prevalence.
 */
function candidateTestPaths(rootPath: string, sourceFile: string): string[] {
  const ext = path.extname(sourceFile);           // e.g. '.ts'
  const base = path.basename(sourceFile, ext);    // e.g. 'foo'
  const dir = path.dirname(sourceFile);           // absolute dir of source

  // Relative path from root without extension, e.g. 'src/foo'
  const relNoExt = path.relative(rootPath, sourceFile).replace(/\.tsx?$/, '');

  return [
    // 1. Sibling: foo.test.ts / foo.spec.ts
    path.join(dir, `${base}.test${ext}`),
    path.join(dir, `${base}.spec${ext}`),
    // Also accept .ts when source is .tsx and vice-versa
    path.join(dir, `${base}.test.ts`),
    path.join(dir, `${base}.spec.ts`),

    // 2. Root-level tests/ or __tests__/ subtree
    path.join(rootPath, 'tests', `${relNoExt}.test.ts`),
    path.join(rootPath, '__tests__', `${path.basename(relNoExt)}.test.ts`),

    // 3. Package-level tests/ directory (monorepo: packages/<pkg>/tests/...)
    path.join(packageRoot(sourceFile), 'tests', relFromSrc(sourceFile)),
  ];
}

/**
 * Walks up the directory tree looking for the package boundary
 * (the directory that *contains* a `src/` folder).
 */
function packageRoot(file: string): string {
  let dir = path.dirname(file);
  while (dir !== path.parse(dir).root) {
    if (path.basename(dir) === 'src') return path.dirname(dir);
    dir = path.dirname(dir);
  }
  return path.dirname(file);
}

/**
 * Returns the relative test-file path from the `tests/` directory
 * that corresponds to a source file under `src/`.
 */
function relFromSrc(file: string): string {
  const pkg = packageRoot(file);
  const srcDir = path.join(pkg, 'src');
  const rel = path.relative(srcDir, file).replace(/\.tsx?$/, '');
  return `${rel}.test.ts`;
}

/**
 * Heuristic: infer the project root by walking up until we find `package.json`
 * or `tsconfig.json`. Falls back to the file's directory.
 */
function inferProjectRoot(file: string): string {
  let dir = path.dirname(file);
  while (dir !== path.parse(dir).root) {
    try {
      // Synchronous check — acceptable here since this is a fallback path
      // only triggered when callers omit rootPath.
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    } catch {
      break;
    }
  }
  return path.dirname(file);
}

function classifySeverity(
  filePath: string,
  exportCount: number,
): 'low' | 'medium' | 'high' {
  if (exportCount >= 6) return 'high';
  // Files under core/src/ are critical infrastructure — always high severity
  const normalised = filePath.replace(/\\/g, '/');
  if (normalised.includes('/core/src/')) return 'high';
  if (exportCount >= 3) return 'medium';
  return 'low';
}
