/**
 * actions/health-gate/src/bootstrap.ts
 *
 * Resolves @healthy-ai-code/core's analyzeChangeset on Node 18–24.
 *
 * Problem: tree-sitter language bindings >= 0.23 ship as ESM modules with
 * top-level await.  On Node >= 22 the CJS loader refuses synchronous
 * require() of such modules (ERR_REQUIRE_ASYNC_MODULE).  Because the core
 * package's CJS dist calls require('tree-sitter-c-sharp') at module load
 * time, a plain require('@healthy-ai-code/core') fails.
 *
 * Workaround (Node 18–24 compatible):
 *   1. Resolve the paths of all known ESM-with-TLA tree-sitter bindings.
 *   2. Dynamic-import() each binding to load it into the ESM module cache.
 *   3. Monkey-patch Module._load so the CJS loader's require() for those
 *      package names returns the already-resolved binding objects.
 *   4. require() the core CJS dist — patched loader handles the bindings.
 *   5. Restore Module._load.
 */

import * as path from 'path';
import { createRequire } from 'module';
import Module from 'module';
import type { ChangesetResult } from '@healthy-ai-code/core';

/** Known tree-sitter packages that ship as ESM-with-TLA in recent versions. */
const ESM_TLA_PKG_NAMES = ['tree-sitter-c-sharp', 'tree-sitter-swift'] as const;

type AnalyzeChangeset = (repoPath: string, baseBranch: string) => Promise<ChangesetResult>;

interface CoreModule {
  analyzeChangeset: AnalyzeChangeset;
}

/**
 * Resolves analyzeChangeset from @healthy-ai-code/core, working around
 * ERR_REQUIRE_ASYNC_MODULE on Node 22+ with tree-sitter ESM bindings.
 */
export async function resolveAnalyzeChangeset(): Promise<AnalyzeChangeset> {
  const req = createRequire(import.meta.url);

  // Step 1: Resolve the installed path of each ESM-TLA package by asking Node
  // to resolve it from the same location as @healthy-ai-code/core.  This
  // works with pnpm's virtual store structure where each package resolves its
  // deps from its own hoisted position.
  const corePkgPath = req.resolve('@healthy-ai-code/core');
  const corePkgDir = path.dirname(corePkgPath);

  const preloaded = new Map<string, unknown>();

  for (const pkgName of ESM_TLA_PKG_NAMES) {
    try {
      const bindingPath = req.resolve(pkgName, { paths: [corePkgDir] });
      // Use file:// URL for dynamic import to handle Windows absolute paths.
      const fileUrl = toFileUrl(bindingPath);
      const mod = await import(fileUrl);
      preloaded.set(pkgName, (mod as { default?: unknown }).default ?? mod);
    } catch {
      // Package not installed or already loadable via CJS — skip.
    }
  }

  if (preloaded.size === 0) {
    // No ESM-TLA packages detected.  Standard require() should work.
    const core = req('@healthy-ai-code/core') as CoreModule;
    return assertFn(core.analyzeChangeset);
  }

  // Step 2: Monkey-patch Module._load to intercept require() calls for the
  // ESM-TLA packages and return the pre-loaded binding objects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modAny = Module as any;
  const origLoad = modAny._load as (
    request: string,
    parent: unknown,
    isMain: boolean,
  ) => unknown;

  modAny._load = function (
    request: string,
    parent: unknown,
    isMain: boolean,
  ): unknown {
    const b = preloaded.get(request);
    if (b !== undefined) return b;
    return origLoad.call(Module, request, parent, isMain);
  };

  // Step 3: require() core — the patch intercepts the problematic requires.
  let core: CoreModule;
  try {
    core = req('@healthy-ai-code/core') as CoreModule;
  } finally {
    // Always restore the original loader.
    modAny._load = origLoad;
  }

  return assertFn(core.analyzeChangeset);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertFn(fn: unknown): AnalyzeChangeset {
  if (typeof fn !== 'function') {
    throw new Error('analyzeChangeset not exported from @healthy-ai-code/core');
  }
  return fn as AnalyzeChangeset;
}

/**
 * Convert an absolute file-system path to a file:// URL string suitable for
 * dynamic import().  Handles Windows paths with drive letters and backslashes.
 */
function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  // On Windows, ensure leading slash: file:///C:/path
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${withSlash}`;
}
