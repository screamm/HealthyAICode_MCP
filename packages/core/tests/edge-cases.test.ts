import { describe, it, expect } from 'vitest';
import { analyzeCode, analyzeFile } from '../src/index';
import * as path from 'path';

const FIXTURES = path.resolve(__dirname, 'fixtures/edge-cases');

describe('analyzeCode — edge cases', () => {
  it('empty string returns score 10.0 with zero smells', () => {
    const result = analyzeCode('', 'typescript');
    expect(result.score).toBe(10.0);
    expect(result.smells).toHaveLength(0);
    expect(result.functions).toHaveLength(0);
    expect(result.metrics.totalLines).toBe(0);
  });

  it('whitespace-only string returns score 10.0', () => {
    const result = analyzeCode('   \n\t\n  ', 'typescript');
    expect(result.score).toBe(10.0);
    expect(result.smells).toHaveLength(0);
  });

  it('unsupported language returns score 10.0 without crashing', () => {
    const result = analyzeCode('some code', 'unsupported' as never);
    expect(result.score).toBe(10.0);
    expect(result.language).toBe('unsupported');
    expect(result.smells).toHaveLength(0);
  });

  it('file with > 10 000 lines gets a LargeFile performance warning', () => {
    const hugeLine = 'const x = 1;\n';
    const code = hugeLine.repeat(10001);
    const result = analyzeCode(code, 'typescript');
    const largeFileSmell = result.smells.find(s => s.type === 'LargeFile');
    expect(largeFileSmell).toBeDefined();
    expect(largeFileSmell!.description).toMatch(/10\s*0\d\d/);
  });

  it('invalid/unparseable TypeScript does not throw', () => {
    const brokenCode = 'function broken( { if if if }}}';
    expect(() => analyzeCode(brokenCode, 'typescript')).not.toThrow();
  });
});

describe('analyzeFile — edge-case fixtures', () => {
  it('empty.ts fixture returns score 10.0', async () => {
    const result = await analyzeFile(path.join(FIXTURES, 'empty.ts'));
    expect(result.score).toBe(10.0);
    expect(result.smells).toHaveLength(0);
  });

  it('single-line.ts fixture returns score 10.0', async () => {
    const result = await analyzeFile(path.join(FIXTURES, 'single-line.ts'));
    expect(result.score).toBe(10.0);
  });
});
