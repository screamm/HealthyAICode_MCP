/**
 * dependency-graph.ts
 * Builds a directed dependency graph by parsing import/require statements per language.
 * Only relative imports (starting with ./ or ../) are included — node_modules are excluded.
 */

import * as path from 'path';

export interface DependencyGraph {
  nodes: Set<string>;
  edges: Map<string, Set<string>>;
}

// Regex patterns per language (module-level to avoid recompilation)
const TS_STATIC_RE = /import\s+(?:type\s+)?(?:[\w{},\s*]+from\s+)?['"](\.{1,2}[^'"]*)['"]/g;
const TS_REQUIRE_RE = /require\s*\(\s*['"](\.{1,2}[^'"]*)['"]\s*\)/g;
const PY_FROM_RE = /^from\s+(\.[\w./]*)\s+import/gm;
const PY_IMPORT_RE = /^import\s+(\.[\w.]+)/gm;
const RUST_USE_RE = /^use\s+crate::([\w:]+)/gm;
const GO_IMPORT_RE = /import\s+(?:\w+\s+)?"(\.[/][^"]+)"/gm;
const PHP_RE = /(?:require|include)(?:_once)?\s*['"](\.{1,2}[^'"]*)['"]/gm;
const RUBY_RE = /require_relative\s+['"]([^'"]+)['"]/gm;

export function extractImports(content: string, language: string, filePath: string): string[] {
  const raw = extractRawSpecifiers(content, language);
  return resolveSpecifiers(raw, filePath, language);
}

function extractRawSpecifiers(content: string, language: string): string[] {
  const results: string[] = [];
  const lang = language.toLowerCase();

  if (lang === 'typescript' || lang === 'javascript') {
    for (const re of [TS_STATIC_RE, TS_REQUIRE_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        results.push(m[1]);
      }
    }
  } else if (lang === 'python') {
    for (const re of [PY_FROM_RE, PY_IMPORT_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        results.push(m[1]);
      }
    }
  } else if (lang === 'rust') {
    RUST_USE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RUST_USE_RE.exec(content)) !== null) {
      results.push(m[1].replace(/::/g, '/'));
    }
  } else if (lang === 'go') {
    GO_IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = GO_IMPORT_RE.exec(content)) !== null) {
      results.push(m[1]);
    }
  } else if (lang === 'php') {
    PHP_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PHP_RE.exec(content)) !== null) {
      results.push(m[1]);
    }
  } else if (lang === 'ruby') {
    RUBY_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RUBY_RE.exec(content)) !== null) {
      const spec = m[1];
      results.push(spec.startsWith('.') ? spec : `./${spec}`);
    }
  }

  return results;
}

function resolveSpecifiers(specifiers: string[], filePath: string, language: string): string[] {
  const lang = language.toLowerCase();
  const dir = path.dirname(filePath);
  const resolved: string[] = [];

  for (const spec of specifiers) {
    if (!spec.startsWith('./') && !spec.startsWith('../') && !spec.startsWith('.')) {
      continue;
    }

    let resolvedPath = path.normalize(path.join(dir, spec));

    if ((lang === 'typescript' || lang === 'javascript') && !path.extname(resolvedPath)) {
      resolvedPath = resolvedPath + '.ts';
    }

    resolved.push(resolvedPath.replace(/\\/g, '/'));
  }

  return resolved;
}

export function buildDependencyGraph(
  files: Record<string, { content: string; language: string }>,
): DependencyGraph {
  const nodes = new Set<string>();
  const edges = new Map<string, Set<string>>();

  for (const filePath of Object.keys(files)) {
    const normalised = filePath.replace(/\\/g, '/');
    nodes.add(normalised);
    if (!edges.has(normalised)) {
      edges.set(normalised, new Set());
    }
  }

  for (const [filePath, { content, language }] of Object.entries(files)) {
    const from = filePath.replace(/\\/g, '/');
    const imports = extractImports(content, language, from);

    for (const to of imports) {
      if (to === from) continue;

      nodes.add(to);
      if (!edges.has(to)) {
        edges.set(to, new Set());
      }

      edges.get(from)!.add(to);
    }
  }

  return { nodes, edges };
}
