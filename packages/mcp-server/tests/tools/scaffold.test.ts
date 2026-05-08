import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

describe('mcp-server package scaffold', () => {
  it('package.json finns och har rätt fält', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    expect(fs.existsSync(pkgPath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.name).toBe('@healthy-ai-code/mcp-server');
    expect(pkg.bin['healthy-ai-code-mcp']).toBe('./dist/index.js');
    expect(pkg.scripts.build).toBeDefined();
    expect(pkg.scripts.test).toBeDefined();
  });

  it('tsconfig.json finns', () => {
    const tsconfigPath = path.resolve(__dirname, '../../tsconfig.json');
    expect(fs.existsSync(tsconfigPath)).toBe(true);
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    expect(tsconfig.compilerOptions.outDir).toBe('./dist');
  });
});
