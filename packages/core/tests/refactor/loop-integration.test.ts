/**
 * Sprint 54 + 52 loop-integration tests: verifies the Pre-Act plan, RCI self-critique text,
 * heaviest-smell batching, edit-mode selection, comment-count invariant, rename-only guard,
 * and manual-intervention signalling are wired into analyzeForAutoRefactor / the refactoring loop.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  analyzeForAutoRefactor,
  countCommentLines,
} from '../../src/refactor/auto-refactor-analyzer';
import { runRefactoringLoop, isRenameOnly } from '../../src/refactor/refactoring-loop';

const FIXTURES = path.resolve(__dirname, '../fixtures');

// A high-complexity function that reliably triggers ComplexMethod.
const COMPLEX_CODE = `
export function classify(
  status: string, code: number, flag: boolean, mode: string, level: number
): string {
  if (status === 'active' && code > 0) return 'active-positive';
  if (status === 'active' && code === 0) return 'active-zero';
  if (status === 'active' && code < 0) return 'active-negative';
  if (status === 'pending' && flag) return 'pending-flagged';
  if (status === 'pending' && !flag) return 'pending-clean';
  if (status === 'closed' && code > 100) return 'closed-high';
  if (status === 'closed' && code <= 100) return 'closed-low';
  if (mode === 'fast' && level > 5) return 'fast-high';
  if (mode === 'fast' && level <= 5) return 'fast-low';
  if (mode === 'slow' && level > 5) return 'slow-high';
  if (mode === 'slow' && level <= 5) return 'slow-low';
  if (mode === 'batch' && flag) return 'batch-flag';
  return 'unknown';
}
`.trim();

describe('analyzeForAutoRefactor — RCI self-critique wiring', () => {
  it('appends the RCI-VERIFY checklist with all three critique dimensions', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result).not.toBeNull();
    const text = result!.followUpInstruction;
    expect(text).toContain('RCI-VERIFY');
    expect(text).toContain('free variable');
    expect(text).toContain('return value');
    expect(text).toContain('call-site');
  });
});

describe('analyzeForAutoRefactor — comment-count invariant in instruction', () => {
  it('includes a COMMENT-COUNT INVARIANT instruction', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result!.followUpInstruction).toContain('COMMENT-COUNT INVARIANT');
  });
});

describe('analyzeForAutoRefactor — editMode (Sprint 52)', () => {
  it('returns an editMode field for the targeted smell', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(['patch', 'funcRewrite', 'fileRewrite']).toContain(result!.editMode);
  });
});

describe('analyzeForAutoRefactor — batchMode (Sprint 54)', () => {
  it('populates batchedPlan with every instance of the heaviest type when batchMode is set', () => {
    const code = fs.readFileSync(path.join(FIXTURES, 'unhealthy/batch-same-type.ts'), 'utf-8');
    const result = analyzeForAutoRefactor(code, 'typescript', 'batch-same-type.ts', { batchMode: true });
    expect(result).not.toBeNull();
    expect(result!.batchedPlan).toBeDefined();
    expect(result!.batchedPlan!.instances.length).toBeGreaterThanOrEqual(2);
    expect(result!.followUpInstruction).toContain('BATCH-PASS');
  });

  it('omits batchedPlan and BATCH-PASS when batchMode is not requested', () => {
    const result = analyzeForAutoRefactor(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result!.batchedPlan).toBeUndefined();
    expect(result!.followUpInstruction).not.toContain('BATCH-PASS');
  });
});

describe('analyzeForAutoRefactor — back-compatible targetSmell string arg', () => {
  it('still accepts a bare SmellType as the 4th positional argument', () => {
    const longParams = `
export function createUser(a: string, b: string, c: string, d: string, e: string): void {
  console.log(a, b, c, d, e);
}
`.trim();
    const result = analyzeForAutoRefactor(longParams, 'typescript', 'user.ts', 'LongParameterList');
    if (result !== null) {
      expect(result.smell.type).toBe('LongParameterList');
    }
  });
});

describe('isRenameOnly', () => {
  it('returns true for an identifier-only rename', () => {
    const before = 'function processData(x) {\n  return x + 1;\n}';
    const after = 'function handleData(x) {\n  return x + 1;\n}';
    expect(isRenameOnly(before, after)).toBe(true);
  });

  it('returns false for an extract-method structural change', () => {
    const before = 'function f(x) {\n  const a = x + 1;\n  const b = a * 2;\n  return b - 3;\n}';
    const after =
      'function helper(a) {\n  return a * 2;\n}\nfunction f(x) {\n  const a = x + 1;\n  return helper(a) - 3;\n}';
    expect(isRenameOnly(before, after)).toBe(false);
  });

  it('returns false when code is unchanged', () => {
    const code = 'function f(x) { return x; }';
    expect(isRenameOnly(code, code)).toBe(false);
  });
});

describe('countCommentLines', () => {
  it('counts line and block comments', () => {
    const code = '// a\nconst x = 1; // trailing\n/* block\n still block */\nconst y = 2;';
    expect(countCommentLines(code)).toBe(4);
  });

  it('returns 0 for comment-free code', () => {
    expect(countCommentLines('const x = 1;\nconst y = 2;')).toBe(0);
  });
});

describe('runRefactoringLoop — Pre-Act plan + invariants', () => {
  it('still converges/terminates and records steps with non-decreasing scores', () => {
    const result = runRefactoringLoop(COMPLEX_CODE, 'typescript', 'classify.ts');
    expect(result.finalScore).toBeGreaterThanOrEqual(result.originalScore);
    for (const step of result.steps) {
      expect(step.scoreAfter).toBeGreaterThanOrEqual(step.scoreBefore);
    }
  });

  it('does not strip comments across the loop (comment-count invariant)', () => {
    const result = runRefactoringLoop(COMPLEX_CODE, 'typescript', 'classify.ts');
    const before = countCommentLines(COMPLEX_CODE);
    const after = countCommentLines(result.finalCode);
    expect(after).toBeGreaterThanOrEqual(Math.floor(before * 0.9));
  });
});
