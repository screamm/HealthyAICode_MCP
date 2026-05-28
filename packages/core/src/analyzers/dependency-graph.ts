/**
 * dependency-graph.ts
 * Builds a directed dependency graph by parsing import/require statements per language.
 * Only relative imports (starting with ./ or ../) are included — node_modules are excluded.
 */

import * as path from 'path';

/**
 * Directed dependency graph representing inter-file imports.
 * - nodes: every file path that appears as a source or import target.
 * - edges: directed adjacency map from importer to set of importees.
 */
export interface DependencyGraph {
  nodes: Set<string>;
  edges: Map<string, Set<string>>;
}

/**
 * Options for extracting imports from source content.
 * Grouped to avoid passing three primitive strings as positional arguments.
 */
export interface ExtractImportsOptions {
  content: string;
  language: string;
  filePath: string;
}

// Module-level regex constants (compiled once per process)
const TS_STATIC_RE = /import\s+(?:type\s+)?(?:[\w{},\s*]+from\s+)?['"](\.{1,2}[^'"]*)['"]/g;
const TS_REQUIRE_RE = /require\s*\(\s*['"](\.{1,2}[^'"]*)['"]\s*\)/g;
const PY_FROM_RE = /^from\s+(\.[\w./]*)\s+import/gm;
const PY_IMPORT_RE = /^import\s+(\.[\w.]+)/gm;
const RUST_USE_RE = /^use\s+crate::([\w:]+)/gm;
const GO_IMPORT_RE = /import\s+(?:\w+\s+)?"(\.[/][^"]+)"/gm;
const PHP_RE = /(?:require|include)(?:_once)?\s*['"](\.{1,2}[^'"]*)['"]/gm;
const RUBY_RE = /require_relative\s+['"]([^'"]+)['"]/gm;

/** Resets `re.lastIndex` and collects all `m[1]` captures into an array. */
function runPattern(re: RegExp, content: string): string[] {
  re.lastIndex = 0;
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) results.push(m[1]);
  return results;
}

/** Runs multiple patterns and concatenates their captures. */
function runPatterns(content: string, patterns: RegExp[]): string[] {
  return patterns.flatMap(re => runPattern(re, content));
}

const LANGUAGE_EXTRACTORS: Record<string, (content: string) => string[]> = {
  typescript: c => runPatterns(c, [TS_STATIC_RE, TS_REQUIRE_RE]),
  javascript: c => runPatterns(c, [TS_STATIC_RE, TS_REQUIRE_RE]),
  python: c => runPatterns(c, [PY_FROM_RE, PY_IMPORT_RE]),
  rust: c => runPattern(RUST_USE_RE, c).map(s => s.replace(/::/g, '/')),
  go: c => runPattern(GO_IMPORT_RE, c),
  php: c => runPattern(PHP_RE, c),
  ruby: c => runPattern(RUBY_RE, c).map(s => (s.startsWith('.') ? s : `./${s}`)),
};

/**
 * Extracts all relative import paths from the given source code for the specified language.
 *
 * @param content  - Source code to scan for import statements.
 * @param language - Programming language of the source (e.g. 'typescript', 'python').
 * @param filePath - Absolute or repo-relative path to the source file; used to resolve
 *                   relative specifiers into normalised paths.
 * @returns Array of normalised, resolved import paths (forward-slash separators).
 *          Only relative imports are returned; absolute/node_modules imports are excluded.
 */
export function extractImports(content: string, language: string, filePath: string): string[] {
  return resolveRawSpecifiers({ content, language, filePath });
}

function resolveRawSpecifiers({ content, language, filePath }: ExtractImportsOptions): string[] {
  const extractor = LANGUAGE_EXTRACTORS[language.toLowerCase()];
  const raw = extractor ? extractor(content) : [];
  return resolveSpecifiers(raw, filePath, language);
}

function resolveSpecifiers(specifiers: string[], filePath: string, language: string): string[] {
  const lang = language.toLowerCase();
  const dir = path.dirname(filePath);
  const resolved: string[] = [];
  for (const spec of specifiers) {
    if (!spec.startsWith('./') && !spec.startsWith('../') && !spec.startsWith('.')) continue;
    let resolvedPath = path.normalize(path.join(dir, spec));
    if ((lang === 'typescript' || lang === 'javascript') && !path.extname(resolvedPath)) {
      resolvedPath = resolvedPath + '.ts';
    }
    resolved.push(resolvedPath.replace(/\\/g, '/'));
  }
  return resolved;
}

/**
 * Builds a directed dependency graph from a map of source files.
 *
 * Each file path becomes a graph node; relative imports between files become directed edges.
 * Non-relative imports (node_modules, absolute paths) are excluded.
 *
 * @param files - Map of file path → `{ content, language }`.
 * @returns A `DependencyGraph` with all discovered nodes and directed edges.
 */
export function buildDependencyGraph(
  files: Record<string, { content: string; language: string }>,
): DependencyGraph {
  const nodes = new Set<string>();
  const edges = new Map<string, Set<string>>();
  for (const filePath of Object.keys(files)) {
    const normalised = filePath.replace(/\\/g, '/');
    nodes.add(normalised);
    if (!edges.has(normalised)) edges.set(normalised, new Set());
  }
  for (const [filePath, { content, language }] of Object.entries(files)) {
    const from = filePath.replace(/\\/g, '/');
    const imports = extractImports(content, language, from);
    for (const to of imports) {
      if (to === from) continue;
      nodes.add(to);
      if (!edges.has(to)) edges.set(to, new Set());
      edges.get(from)!.add(to);
    }
  }
  return { nodes, edges };
}
