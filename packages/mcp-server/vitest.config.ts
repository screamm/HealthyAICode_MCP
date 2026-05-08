import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@healthy-ai-code/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
});
