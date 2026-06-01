/**
 * Synchronous loader for the tree-sitter C# grammar.
 *
 * Why this exists:
 * `tree-sitter-c-sharp` >= 0.23.5 ships its Node binding as an ES module
 * (`"type": "module"`) whose `bindings/node/index.js` uses **top-level await**
 * (`await import("node-gyp-build")`). When `@healthy-ai-code/core` is compiled
 * to CommonJS and loaded via `require()` (e.g. `scripts/health-audit.mjs` doing
 * `require('../packages/core/dist/index.js')`), Node >= 20.19 / 22.12 / 24
 * refuses to `require()` an ESM graph that contains top-level await and throws
 * `ERR_REQUIRE_ASYNC_MODULE`. See:
 *   https://joyeecheung.github.io/blog/2025/12/30/require-esm-in-node-js-from-experiment-to-stability/
 *
 * The public analysis API (`analyzeCode` / `analyzeByLanguage`) is synchronous,
 * so we cannot switch to `await import(...)`. Instead we load the grammar
 * synchronously with a two-step strategy:
 *
 *   1. Try the normal module resolution (`require('tree-sitter-c-sharp')`).
 *      This succeeds under ESM/esbuild (vitest) and on any runtime where the
 *      binding is loadable via `require` — keeping us on the official binding.
 *   2. If that throws `ERR_REQUIRE_ASYNC_MODULE`, replicate exactly what the
 *      binding's wrapper does sans the async `import()`: locate the package
 *      root and load the prebuilt native addon synchronously via
 *      `node-gyp-build`. `node-gyp-build` is itself CommonJS, so this path is
 *      fully synchronous and yields the same native `Language` object.
 *
 * The C# analyzer only ever calls `parser.setLanguage(grammar)` and
 * `parser.parse(code)`; it never touches `nodeTypeInfo` or the query getters
 * that the wrapper attaches, so loading the bare native addon is sufficient for
 * full, undegraded C# analysis.
 */

// `require` is provided by the CommonJS module wrapper at runtime (this package
// compiles to CJS). `createRequire` keeps it explicit and lets us resolve
// `node-gyp-build` relative to the C# package even though it is not a direct
// dependency of this package.
import { createRequire } from 'module';
import { dirname } from 'path';

const localRequire = createRequire(__filename);

/** Loaded once and cached — the native tree-sitter Language object for C#. */
let cachedGrammar: unknown;

function loadViaNodeGypBuild(): unknown {
  // Resolve the C# package's own directory so node-gyp-build finds its prebuild.
  const pkgJsonPath = localRequire.resolve('tree-sitter-c-sharp/package.json');
  const pkgRoot = dirname(pkgJsonPath);
  // node-gyp-build is a (CommonJS) dependency of tree-sitter-c-sharp; resolve it
  // from the C# package so we get the exact version it ships with.
  const requireFromCsharp = createRequire(pkgJsonPath);
  const nodeGypBuild = requireFromCsharp('node-gyp-build') as (root: string) => unknown;
  return nodeGypBuild(pkgRoot);
}

/**
 * Returns the tree-sitter C# `Language` grammar, loading it synchronously on
 * first call and caching thereafter. Works under both CommonJS `require()`
 * (production / health-audit) and ESM (vitest) without degrading C# analysis.
 */
export function loadCSharpGrammar(): unknown {
  if (cachedGrammar !== undefined) return cachedGrammar;
  try {
    const mod = localRequire('tree-sitter-c-sharp') as { default?: unknown };
    cachedGrammar = mod?.default ?? mod;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ERR_REQUIRE_ASYNC_MODULE') {
      cachedGrammar = loadViaNodeGypBuild();
    } else {
      throw err;
    }
  }
  return cachedGrammar;
}
