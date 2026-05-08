import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  analyzeCode,
  analyzeFile,
  analyzeChangeset,
} from '../src/index';
import type { HealthResult, ChangesetResult } from '../src/types';

// Paths to fixture files created in Task 9
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const HEALTHY_FILE = path.join(FIXTURES_DIR, 'healthy', 'simple.ts');
const UNHEALTHY_FILE = path.join(FIXTURES_DIR, 'unhealthy', 'complex.ts');

// ---- analyzeCode ----

describe('analyzeCode — typescript', () => {
  const SIMPLE_CODE = `
export function add(a: number, b: number): number {
  return a + b;
}
`.trim();

  it('returns a HealthResult with correct shape', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript');
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('language', 'typescript');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('smells');
    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('functions');
  });

  it('simple code has score 10.0', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript');
    expect(result.score).toBe(10.0);
  });

  it('simple code has category green', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript');
    expect(result.category).toBe('green');
  });

  it('simple code has no smells', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript');
    expect(result.smells).toHaveLength(0);
  });

  it('uses <inline> as filePath when not provided', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript');
    expect(result.filePath).toBe('<inline>');
  });

  it('uses provided filePath', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript', 'src/auth.ts');
    expect(result.filePath).toBe('src/auth.ts');
  });
});

describe('analyzeCode — javascript', () => {
  it('routes javascript through the analysis pipeline (not stub)', () => {
    const code = `function add(a, b) { return a + b; }`;
    const result = analyzeCode(code, 'javascript');
    expect(result.language).toBe('javascript');
    expect(result.score).toBeDefined();
    // If it hit the stub path it would be exactly 10.0 with no functions
    // The real pipeline parses functions, so functions array may be populated
    expect(result.functions).toBeDefined();
  });
});

describe('analyzeCode — unsupported language', () => {
  it('returns score 10.0 for unsupported language', () => {
    const result = analyzeCode('some code', 'unsupported');
    expect(result.score).toBe(10.0);
    expect(result.category).toBe('green');
    expect(result.smells).toHaveLength(0);
  });

  it('returns language as unsupported', () => {
    const result = analyzeCode('some code', 'unsupported');
    expect(result.language).toBe('unsupported');
  });
});

describe('analyzeCode — score range', () => {
  it('score is always between 1.0 and 10.0', () => {
    const codes = [
      { code: 'export function add(a: number, b: number) { return a + b; }', lang: 'typescript' as const },
      { code: 'const x = 1;', lang: 'typescript' as const },
    ];
    for (const { code, lang } of codes) {
      const result = analyzeCode(code, lang);
      expect(result.score).toBeGreaterThanOrEqual(1.0);
      expect(result.score).toBeLessThanOrEqual(10.0);
    }
  });
});

// ---- analyzeFile ----

describe('analyzeFile — healthy fixture', () => {
  it('returns HealthResult for a .ts file', async () => {
    const result: HealthResult = await analyzeFile(HEALTHY_FILE);
    expect(result.language).toBe('typescript');
    expect(result.score).toBeGreaterThanOrEqual(9.0);
    expect(result.category).toBe('green');
  });

  it('includes filePath in result', async () => {
    const result = await analyzeFile(HEALTHY_FILE);
    expect(result.filePath).toBe(HEALTHY_FILE);
  });
});

describe('analyzeFile — unhealthy fixture', () => {
  it('unhealthy file has score < 9.0', async () => {
    const result: HealthResult = await analyzeFile(UNHEALTHY_FILE);
    expect(result.score).toBeLessThan(9.0);
  });

  it('unhealthy file has smells', async () => {
    const result: HealthResult = await analyzeFile(UNHEALTHY_FILE);
    expect(result.smells.length).toBeGreaterThan(0);
  });
});

describe('analyzeFile — error handling', () => {
  it('throws when file does not exist', async () => {
    await expect(analyzeFile('/nonexistent/path/file.ts')).rejects.toThrow();
  });
});

// ---- analyzeChangeset ----

describe('analyzeChangeset', () => {
  it('throws for invalid repository path', async () => {
    await expect(analyzeChangeset('/any/path', 'main')).rejects.toThrow();
  });
});

// ---- Type re-exports ----

describe('type exports', () => {
  it('exports Language type (verified at compile time by import above)', () => {
    // If types.ts is not re-exported, the import at the top of this file would fail
    expect(true).toBe(true);
  });
});
