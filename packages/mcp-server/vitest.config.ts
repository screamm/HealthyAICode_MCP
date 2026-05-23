import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    // First dynamic import of @healthy-ai-code/core loads tree-sitter native
    // addons which can take several seconds on Windows.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@healthy-ai-code/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
