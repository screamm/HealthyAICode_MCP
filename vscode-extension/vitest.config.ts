import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  test: {
    include: ['src/test/**/*.test.ts'],
    environment: 'node',
    alias: {
      // Redirect 'vscode' imports to our headless mock so tests can run
      // without an active VS Code extension host.
      vscode: path.resolve(__dirname, 'src/test/vscode-mock.ts'),
    },
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/test/vscode-mock.ts'),
    },
  },
});
