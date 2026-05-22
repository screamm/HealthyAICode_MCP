import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { readProjectFiles } from '../../src/analyzers/project-file-reader';

let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pfr-test-'));

  // Create src directory with TypeScript and Python files
  const srcDir = path.join(tmpDir, 'src');
  await fsp.mkdir(srcDir, { recursive: true });
  await fsp.writeFile(path.join(srcDir, 'a.ts'), 'export const a = 1;', 'utf-8');
  await fsp.writeFile(path.join(srcDir, 'b.ts'), 'export const b = 2;', 'utf-8');
  await fsp.writeFile(path.join(srcDir, 'c.py'), 'x = 1', 'utf-8');

  // node_modules should be ignored
  const nmDir = path.join(tmpDir, 'node_modules', 'lodash');
  await fsp.mkdir(nmDir, { recursive: true });
  await fsp.writeFile(path.join(nmDir, 'index.js'), '// lodash', 'utf-8');
});

afterAll(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('readProjectFiles', () => {
  it('finds .ts and .py files', async () => {
    const files = await readProjectFiles(tmpDir);
    const keys = Object.keys(files);
    expect(keys.some(k => k.endsWith('.ts'))).toBe(true);
    expect(keys.some(k => k.endsWith('.py'))).toBe(true);
  });

  it('ignores node_modules directory', async () => {
    const files = await readProjectFiles(tmpDir);
    const keys = Object.keys(files);
    expect(keys.every(k => !k.includes('node_modules'))).toBe(true);
  });

  it('language is "typescript" for .ts files', async () => {
    const files = await readProjectFiles(tmpDir);
    const tsFiles = Object.entries(files).filter(([k]) => k.endsWith('.ts'));
    expect(tsFiles.length).toBeGreaterThan(0);
    for (const [, v] of tsFiles) {
      expect(v.language).toBe('typescript');
    }
  });

  it('uses relative paths (forward slash, not absolute)', async () => {
    const files = await readProjectFiles(tmpDir);
    const keys = Object.keys(files);
    for (const key of keys) {
      expect(path.isAbsolute(key)).toBe(false);
      expect(key).not.toContain('\\');
    }
  });
});
