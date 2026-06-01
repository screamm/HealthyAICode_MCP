import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Required for tree-sitter native addons and ESM bindings (same as core package).
    pool: 'forks',
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
