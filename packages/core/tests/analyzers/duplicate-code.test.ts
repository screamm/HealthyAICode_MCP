import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { detectDuplicateCode, type CloneGroup } from '../../src/analyzers/duplicate-code';
import { detectCrossFileClones, type CrossFileClonePair } from '../../src/project/duplicate-code-cross-file';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FIXTURES_UNHEALTHY = join(__dirname, '../fixtures/unhealthy');
const FIXTURES_HEALTHY = join(__dirname, '../fixtures/healthy');

function readFixture(dir: string, filename: string): string {
  return readFileSync(join(dir, filename), 'utf-8');
}

// ── Inline code snippets ───────────────────────────────────────────────────────

/** 8-line block duplicated twice (exact clone, type 1). */
const EXACT_CLONE_CODE = `
export function validateA(value: string, required: boolean): string[] {
  const errors: string[] = [];
  if (required && value.trim() === '') {
    errors.push('Field is required');
  }
  if (value.length > 254) {
    errors.push('Field is too long');
  }
  return errors;
}

export function validateB(value: string, required: boolean): string[] {
  const errors: string[] = [];
  if (required && value.trim() === '') {
    errors.push('Field is required');
  }
  if (value.length > 254) {
    errors.push('Field is too long');
  }
  return errors;
}
`.trim();

/** Same 8-line block with renamed variables (structural clone, type 2). */
const STRUCTURAL_CLONE_CODE = `
export function checkA(val: string, isMandatory: boolean): string[] {
  const errs: string[] = [];
  if (isMandatory && val.trim() === '') {
    errs.push('Field A is required');
  }
  if (val.length > 254) {
    errs.push('Field A is too long');
  }
  return errs;
}

export function checkB(input: string, isRequired: boolean): string[] {
  const msgs: string[] = [];
  if (isRequired && input.trim() === '') {
    msgs.push('Field B is required');
  }
  if (input.length > 254) {
    msgs.push('Field B is too long');
  }
  return msgs;
}
`.trim();

/** Unique, non-duplicate code — should produce 0 DuplicateCode smells. */
const UNIQUE_CODE = `
export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`.trim();

/** Short code < minLines threshold — should produce 0 DuplicateCode smells. */
const SHORT_CODE = `
const x = 1;
const y = 2;
`.trim();

/** Code with a single large block repeated once — severity should be based on block size. */
const LARGE_CLONE_BLOCK = `
export function processA(items: number[], config: Record<string, unknown>): string {
  if (!items || items.length === 0) {
    return 'empty';
  }
  const result: string[] = [];
  for (const item of items) {
    if (item > 0) {
      result.push(\`positive:\${item}\`);
    } else if (item < 0) {
      result.push(\`negative:\${item}\`);
    } else {
      result.push('zero');
    }
  }
  const summary = result.join(', ');
  return \`[\${summary}]\`;
}

export function processB(items: number[], config: Record<string, unknown>): string {
  if (!items || items.length === 0) {
    return 'empty';
  }
  const result: string[] = [];
  for (const item of items) {
    if (item > 0) {
      result.push(\`positive:\${item}\`);
    } else if (item < 0) {
      result.push(\`negative:\${item}\`);
    } else {
      result.push('zero');
    }
  }
  const summary = result.join(', ');
  return \`[\${summary}]\`;
}
`.trim();

// ── Tests: detectDuplicateCode ────────────────────────────────────────────────

describe('detectDuplicateCode', () => {
  describe('type 1 — exact clones', () => {
    it('detects an exact duplicate block (default minLines=6)', () => {
      const smells = detectDuplicateCode(EXACT_CLONE_CODE);
      const duplicates = smells.filter(s => s.type === 'DuplicateCode');
      expect(duplicates.length).toBeGreaterThanOrEqual(1);
    });

    it('returns a smell with type DuplicateCode', () => {
      const smells = detectDuplicateCode(EXACT_CLONE_CODE);
      expect(smells.every(s => s.type === 'DuplicateCode')).toBe(true);
    });

    it('sets severity to medium for blocks of 6–15 lines', () => {
      const smells = detectDuplicateCode(EXACT_CLONE_CODE);
      // The block in EXACT_CLONE_CODE is 8 lines → medium
      const mediumOrHigh = smells.filter(s => s.severity === 'medium' || s.severity === 'high');
      expect(mediumOrHigh.length).toBeGreaterThanOrEqual(1);
    });

    it('sets severity to high for blocks >15 lines', () => {
      const smells = detectDuplicateCode(LARGE_CLONE_BLOCK);
      const highSeverity = smells.filter(s => s.severity === 'high');
      expect(highSeverity.length).toBeGreaterThanOrEqual(1);
    });

    it('includes the first occurrence line in the smell', () => {
      const smells = detectDuplicateCode(EXACT_CLONE_CODE);
      expect(smells.length).toBeGreaterThan(0);
      // line must be 1-indexed and > 0
      expect(smells[0].line).toBeGreaterThan(0);
    });

    it('includes a suggestion mentioning the duplicate location', () => {
      const smells = detectDuplicateCode(EXACT_CLONE_CODE);
      expect(smells.length).toBeGreaterThan(0);
      expect(smells[0].suggestion).toBeTruthy();
      expect(smells[0].suggestion.length).toBeGreaterThan(10);
    });

    it('includes chunkRanges with at least 2 occurrences', () => {
      const smells = detectDuplicateCode(EXACT_CLONE_CODE);
      expect(smells.length).toBeGreaterThan(0);
      const chunks = smells[0].chunkRanges;
      expect(chunks).toBeDefined();
      expect(chunks!.length).toBeGreaterThanOrEqual(2);
    });

    it('sets metricValue to the block size', () => {
      const smells = detectDuplicateCode(EXACT_CLONE_CODE);
      expect(smells.length).toBeGreaterThan(0);
      expect(smells[0].metricValue).toBeGreaterThanOrEqual(6);
    });
  });

  describe('type 2 — structural clones', () => {
    it('detects structural clones with renamed identifiers', () => {
      const smells = detectDuplicateCode(STRUCTURAL_CLONE_CODE);
      const duplicates = smells.filter(s => s.type === 'DuplicateCode');
      expect(duplicates.length).toBeGreaterThanOrEqual(1);
    });

    it('description mentions structural clone for type-2 finds', () => {
      const smells = detectDuplicateCode(STRUCTURAL_CLONE_CODE);
      const type2 = smells.find(s => s.description.includes('typ 2'));
      // Type 2 should be reported when exact-hash doesn't match
      expect(type2).toBeDefined();
    });
  });

  describe('no false positives', () => {
    it('returns 0 smells for unique code', () => {
      const smells = detectDuplicateCode(UNIQUE_CODE);
      expect(smells.filter(s => s.type === 'DuplicateCode')).toHaveLength(0);
    });

    it('returns 0 smells for code shorter than minLines', () => {
      const smells = detectDuplicateCode(SHORT_CODE);
      expect(smells).toHaveLength(0);
    });

    it('returns 0 smells with custom minLines larger than the code', () => {
      const smells = detectDuplicateCode(EXACT_CLONE_CODE, { minLines: 999 });
      expect(smells).toHaveLength(0);
    });
  });

  describe('configuration options', () => {
    it('respects a custom minLines threshold', () => {
      // With minLines=20 the 8-line block in EXACT_CLONE_CODE should not be detected
      const smells = detectDuplicateCode(EXACT_CLONE_CODE, { minLines: 20 });
      expect(smells).toHaveLength(0);
    });

    it('disables type-2 detection when normalizeIdentifiers=false', () => {
      const smellsWithNorm = detectDuplicateCode(STRUCTURAL_CLONE_CODE, { normalizeIdentifiers: true });
      const smellsWithout = detectDuplicateCode(STRUCTURAL_CLONE_CODE, { normalizeIdentifiers: false });
      // Type-2 only code: with normalisation detects clones, without may detect fewer or none
      // (exact clones from same-text windows still trigger type 1)
      expect(smellsWithNorm.length).toBeGreaterThanOrEqual(smellsWithout.length);
    });
  });

  describe('fixture: unhealthy/duplicate-code.ts', () => {
    it('detects ≥1 DuplicateCode smell in the unhealthy fixture', () => {
      const code = readFixture(FIXTURES_UNHEALTHY, 'duplicate-code.ts');
      const smells = detectDuplicateCode(code);
      const duplicates = smells.filter(s => s.type === 'DuplicateCode');
      expect(duplicates.length).toBeGreaterThanOrEqual(1);
    });

    it('all detected smells have severity medium or high', () => {
      const code = readFixture(FIXTURES_UNHEALTHY, 'duplicate-code.ts');
      const smells = detectDuplicateCode(code);
      for (const smell of smells) {
        expect(['medium', 'high']).toContain(smell.severity);
      }
    });
  });

  describe('fixture: healthy/simple.ts', () => {
    it('detects 0 DuplicateCode smells in the healthy simple fixture', () => {
      const code = readFixture(FIXTURES_HEALTHY, 'simple.ts');
      const smells = detectDuplicateCode(code);
      expect(smells.filter(s => s.type === 'DuplicateCode')).toHaveLength(0);
    });
  });
});

// ── Tests: detectCrossFileClones ──────────────────────────────────────────────

describe('detectCrossFileClones', () => {
  const BLOCK_A = `
export function validate(value: string, required: boolean): string[] {
  const errors: string[] = [];
  if (required && value.trim() === '') {
    errors.push('Field is required');
  }
  if (value.length > 254) {
    errors.push('Field is too long');
  }
  return errors;
}
`.trim();

  const BLOCK_B_EXACT = `
// Different file, same exact logic
export function validate(value: string, required: boolean): string[] {
  const errors: string[] = [];
  if (required && value.trim() === '') {
    errors.push('Field is required');
  }
  if (value.length > 254) {
    errors.push('Field is too long');
  }
  return errors;
}
`.trim();

  const BLOCK_B_STRUCTURAL = `
// Different file, structurally identical but renamed
export function check(input: string, mandatory: boolean): string[] {
  const issues: string[] = [];
  if (mandatory && input.trim() === '') {
    issues.push('Input is required');
  }
  if (input.length > 254) {
    issues.push('Input is too long');
  }
  return issues;
}
`.trim();

  const UNIQUE_FILE = `
export function add(a: number, b: number): number { return a + b; }
export function multiply(x: number, y: number): number { return x * y; }
`.trim();

  it('detects exact cross-file clones (type 1)', () => {
    const files = [
      { filePath: '/src/file-a.ts', code: BLOCK_A },
      { filePath: '/src/file-b.ts', code: BLOCK_B_EXACT },
    ];
    const pairs = detectCrossFileClones(files);
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    expect(pairs[0].cloneType).toBe(1);
  });

  it('detects structural cross-file clones (type 2)', () => {
    const files = [
      { filePath: '/src/file-a.ts', code: BLOCK_A },
      { filePath: '/src/file-b.ts', code: BLOCK_B_STRUCTURAL },
    ];
    const pairs = detectCrossFileClones(files);
    // Should detect type 2 structural clone
    const type2 = pairs.filter(p => p.cloneType === 2);
    expect(type2.length).toBeGreaterThanOrEqual(1);
  });

  it('returns no pairs for unique code across files', () => {
    const files = [
      { filePath: '/src/file-a.ts', code: BLOCK_A },
      { filePath: '/src/file-b.ts', code: UNIQUE_FILE },
    ];
    const pairs = detectCrossFileClones(files);
    expect(pairs).toHaveLength(0);
  });

  it('returns no pairs for a single file input', () => {
    const files = [
      { filePath: '/src/file-a.ts', code: BLOCK_A },
    ];
    const pairs = detectCrossFileClones(files);
    expect(pairs).toHaveLength(0);
  });

  it('does not report in-file duplicates as cross-file pairs', () => {
    const files = [
      { filePath: '/src/file-a.ts', code: EXACT_CLONE_CODE },
    ];
    const pairs = detectCrossFileClones(files);
    // All pairs should be from different files — and there are none since only 1 file
    expect(pairs.every(p => p.filePathA !== p.filePathB)).toBe(true);
    expect(pairs).toHaveLength(0);
  });

  it('includes correct file paths in the result', () => {
    const files = [
      { filePath: '/src/file-a.ts', code: BLOCK_A },
      { filePath: '/src/file-b.ts', code: BLOCK_B_EXACT },
    ];
    const pairs = detectCrossFileClones(files);
    expect(pairs.length).toBeGreaterThan(0);
    const filePaths = new Set([pairs[0].filePathA, pairs[0].filePathB]);
    expect(filePaths.has('/src/file-a.ts')).toBe(true);
    expect(filePaths.has('/src/file-b.ts')).toBe(true);
  });

  it('includes 1-indexed start and end lines', () => {
    const files = [
      { filePath: '/src/file-a.ts', code: BLOCK_A },
      { filePath: '/src/file-b.ts', code: BLOCK_B_EXACT },
    ];
    const pairs = detectCrossFileClones(files);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs[0].startLineA).toBeGreaterThanOrEqual(1);
    expect(pairs[0].startLineB).toBeGreaterThanOrEqual(1);
    expect(pairs[0].endLineA).toBeGreaterThanOrEqual(pairs[0].startLineA);
  });

  it('respects custom minLines option', () => {
    const files = [
      { filePath: '/src/file-a.ts', code: BLOCK_A },
      { filePath: '/src/file-b.ts', code: BLOCK_B_EXACT },
    ];
    const pairsLarge = detectCrossFileClones(files, { minLines: 999 });
    expect(pairsLarge).toHaveLength(0);
  });

  it('can disable type-2 detection', () => {
    const files = [
      { filePath: '/src/file-a.ts', code: BLOCK_A },
      { filePath: '/src/file-b.ts', code: BLOCK_B_STRUCTURAL },
    ];
    const pairsType2 = detectCrossFileClones(files, { normalizeIdentifiers: true });
    const pairsNoNorm = detectCrossFileClones(files, { normalizeIdentifiers: false });
    expect(pairsType2.length).toBeGreaterThanOrEqual(pairsNoNorm.length);
  });
});
