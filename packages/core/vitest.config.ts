import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks', // Required for tree-sitter native addons
    // Increase global timeouts to accommodate slow git operations on Windows.
    // Individual tests that need longer still pass their own timeout argument.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
