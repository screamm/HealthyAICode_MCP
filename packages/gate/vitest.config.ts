import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  // Resolve @healthy-ai-code/core to its TypeScript SOURCE rather than the compiled
  // dist. Per the integration mandate, the gate imports core "via relative paths
  // until integration": vitest/esbuild transforms the source on the fly, which (a)
  // lets the gate run against the current core API before core's dist is rebuilt,
  // and (b) sidesteps a top-level-await issue in the compiled tree-sitter bindings
  // that breaks a plain CJS require() of core/dist under Node 24.
  resolve: {
    alias: {
      // Deep import of the security-sink detector (crypto-misuse / SSRF / unsafe
      // deserialization). Core's public index does not re-export it, so the gate
      // reaches it via the package's compiled subpath at runtime; in tests we map
      // that same subpath to the on-the-fly-transformed source. Must precede the
      // bare-specifier alias below so the longer prefix wins.
      '@healthy-ai-code/core/dist/analyzers/security-sink-detector': path.resolve(
        __dirname,
        '../core/src/analyzers/security-sink-detector.ts',
      ),
      // Same rationale for core's scoring function: the gate recomputes a file's
      // score from the *merged* smell set (analyzeCode smells + the security
      // smells analyzeCode omits) so `scoreAfter` reflects the file's true
      // health. `calculateScore` is not re-exported from core's index.
      '@healthy-ai-code/core/dist/scoring/scorer': path.resolve(
        __dirname,
        '../core/src/scoring/scorer.ts',
      ),
      '@healthy-ai-code/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    pool: 'forks', // Required for tree-sitter native addons pulled in transitively via @healthy-ai-code/core
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
