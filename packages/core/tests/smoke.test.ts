import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fsp from 'fs/promises';
import * as os from 'os';
import { analyzeFile } from '../src/index';

async function writeTmp(name: string, content: string): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'haic-smoke-'));
  const filePath = path.join(dir, name);
  await fsp.writeFile(filePath, content, 'utf-8');
  return filePath;
}

describe('analyzeFile smoke tests', () => {
  it('analyzes a TypeScript file end-to-end', async () => {
    const filePath = await writeTmp('smoke.ts', `
function add(a: number, b: number): number {
  return a + b;
}
`);
    const result = await analyzeFile(filePath);
    expect(result.language).toBe('typescript');
    expect(result.functions).toHaveLength(1);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('analyzes a Python file end-to-end', async () => {
    const filePath = await writeTmp('smoke.py', `
def add(a: int, b: int) -> int:
    return a + b
`);
    const result = await analyzeFile(filePath);
    expect(result.language).toBe('python');
    expect(result.functions).toHaveLength(1);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('analyzes a Java file end-to-end', async () => {
    const filePath = await writeTmp('Smoke.java', `
public class Smoke {
    public int add(int a, int b) {
        return a + b;
    }
}
`);
    const result = await analyzeFile(filePath);
    expect(result.language).toBe('java');
    expect(result.functions).toHaveLength(1);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('analyzes a C# file end-to-end', async () => {
    const filePath = await writeTmp('Smoke.cs', `
public class Smoke {
    public int Add(int a, int b) => a + b;
}
`);
    const result = await analyzeFile(filePath);
    expect(result.language).toBe('csharp');
    expect(result.functions).toHaveLength(1);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });

  it('returns unsupported for unrecognized extensions', async () => {
    const filePath = await writeTmp('data.csv', 'a,b,c\n1,2,3\n');
    const result = await analyzeFile(filePath);
    expect(result.language).toBe('unsupported');
    expect(result.score).toBe(10.0);
  });
});
