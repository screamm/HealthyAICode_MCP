/**
 * Tests for Sprint 52: edit-mode-selector.ts
 *
 * Covers:
 *  1. selectEditMode — all three branches (patch / funcRewrite / fileRewrite).
 *  2. buildPatchDiff — unified diff header format and content validity.
 *  3. Round-trip fixture test: applying the generated diff to unhealthy content
 *     yields the healthy fixture (byte-for-byte).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { selectEditMode, buildPatchDiff } from '../../src/refactor/edit-mode-selector';
import type { SmellType } from '../../src/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a fixture path relative to the tests/ directory. */
function fixture(rel: string): string {
  return join(__dirname, '..', 'fixtures', rel);
}

/**
 * Very small patch applicator — understands the subset of unified diff that
 * `buildPatchDiff` can produce (no fuzzy matching needed for deterministic diffs).
 * Applies the diff to `original` and returns the result.
 */
function applyPatch(original: string, diff: string): string {
  if (!diff) return original;

  const originalLines = original.split('\n');
  const result = [...originalLines];

  const diffLines = diff.split('\n');
  let i = 0;

  // Skip header lines (--- / +++)
  while (i < diffLines.length && (diffLines[i].startsWith('---') || diffLines[i].startsWith('+++'))) {
    i++;
  }

  // Offset tracks net insertions/deletions already applied.
  let offset = 0;

  while (i < diffLines.length) {
    const line = diffLines[i];
    if (!line.startsWith('@@')) {
      i++;
      continue;
    }

    // Parse @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
    if (!hunkMatch) {
      i++;
      continue;
    }

    const oldStart = parseInt(hunkMatch[1], 10) - 1; // convert to 0-based
    i++;

    let pos = oldStart + offset;

    while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
      const dl = diffLines[i];
      if (dl.startsWith('-')) {
        result.splice(pos, 1);
        // do NOT advance pos — next edit targets the same position
      } else if (dl.startsWith('+')) {
        result.splice(pos, 0, dl.slice(1));
        pos++;
        offset++;
      } else if (dl.startsWith(' ')) {
        pos++;
      }
      i++;
    }
  }

  return result.join('\n');
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const UNHEALTHY = readFileSync(fixture('unhealthy/magic-number-patch.ts'), 'utf-8');
const HEALTHY   = readFileSync(fixture('healthy/magic-number-patch-fixed.ts'), 'utf-8');

// ─── selectEditMode tests ─────────────────────────────────────────────────────

describe('selectEditMode — patch branch', () => {
  it('MagicNumber always returns patch', () => {
    expect(selectEditMode('MagicNumber', 10)).toBe('patch');
    expect(selectEditMode('MagicNumber', 50)).toBe('patch');
    expect(selectEditMode('MagicNumber', 200)).toBe('patch');
  });

  it('HardcodedCredential always returns patch', () => {
    expect(selectEditMode('HardcodedCredential', 5)).toBe('patch');
    expect(selectEditMode('HardcodedCredential', 100)).toBe('patch');
  });

  it('HardcodedApiKey always returns patch', () => {
    expect(selectEditMode('HardcodedApiKey', 0)).toBe('patch');
    expect(selectEditMode('HardcodedApiKey', 300)).toBe('patch');
  });

  it('any smell on a very small function (< 20 lines) returns patch', () => {
    expect(selectEditMode('ComplexMethod', 5)).toBe('patch');
    expect(selectEditMode('DeepNesting', 15)).toBe('patch');
    expect(selectEditMode('BrainMethod', 19)).toBe('patch');
    expect(selectEditMode('SATD', 1)).toBe('patch');
  });
});

describe('selectEditMode — funcRewrite branch', () => {
  it('ComplexMethod on a mid-size function returns funcRewrite', () => {
    expect(selectEditMode('ComplexMethod', 20)).toBe('funcRewrite');
    expect(selectEditMode('ComplexMethod', 100)).toBe('funcRewrite');
    expect(selectEditMode('ComplexMethod', 150)).toBe('funcRewrite');
  });

  it('BrainMethod on a mid-size function returns funcRewrite', () => {
    expect(selectEditMode('BrainMethod', 40)).toBe('funcRewrite');
    expect(selectEditMode('BrainMethod', 149)).toBe('funcRewrite');
  });

  it('DeepNesting on a mid-size function returns funcRewrite', () => {
    expect(selectEditMode('DeepNesting', 30)).toBe('funcRewrite');
  });

  it('BumpyRoad on a mid-size function returns funcRewrite', () => {
    expect(selectEditMode('BumpyRoad', 60)).toBe('funcRewrite');
  });
});

describe('selectEditMode — fileRewrite branch', () => {
  it('GodClass always returns fileRewrite', () => {
    expect(selectEditMode('GodClass', 0)).toBe('fileRewrite');
    expect(selectEditMode('GodClass', 500)).toBe('fileRewrite');
  });

  it('FeatureEnvy always returns fileRewrite', () => {
    expect(selectEditMode('FeatureEnvy', 10)).toBe('fileRewrite');
  });

  it('LargeFile always returns fileRewrite', () => {
    expect(selectEditMode('LargeFile', 0)).toBe('fileRewrite');
  });

  it('any smell on a very large function (> 150 lines) returns fileRewrite', () => {
    expect(selectEditMode('ComplexMethod', 151)).toBe('fileRewrite');
    expect(selectEditMode('BrainMethod', 200)).toBe('fileRewrite');
    expect(selectEditMode('SATD', 200)).toBe('fileRewrite');
  });
});

// ─── buildPatchDiff — format tests ───────────────────────────────────────────

describe('buildPatchDiff — unified diff header format', () => {
  const original    = 'const x = 1;\nconst y = 2;\n';
  const transformed = 'const X = 1;\nconst y = 2;\n';

  it('starts with --- a/<filePath>', () => {
    const diff = buildPatchDiff(original, transformed, 'src/utils.ts');
    expect(diff).toMatch(/^--- a\/src\/utils\.ts\n/);
  });

  it('has +++ b/<filePath> on the second line', () => {
    const diff = buildPatchDiff(original, transformed, 'src/utils.ts');
    expect(diff).toMatch(/\+\+\+ b\/src\/utils\.ts\n/);
  });

  it('contains a @@ hunk header', () => {
    const diff = buildPatchDiff(original, transformed, 'src/utils.ts');
    expect(diff).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
  });

  it('marks removed lines with -', () => {
    const diff = buildPatchDiff(original, transformed, 'utils.ts');
    expect(diff).toContain('-const x = 1;');
  });

  it('marks added lines with +', () => {
    const diff = buildPatchDiff(original, transformed, 'utils.ts');
    expect(diff).toContain('+const X = 1;');
  });

  it('returns empty string for identical inputs', () => {
    const diff = buildPatchDiff(original, original, 'unchanged.ts');
    expect(diff).toBe('');
  });
});

describe('buildPatchDiff — context and structure', () => {
  it('includes up to 3 context lines around changes', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i + 1}`);
    const original    = lines.join('\n') + '\n';
    // Change line5 (index 4)
    const changed = [...lines];
    changed[4] = 'CHANGED';
    const transformed = changed.join('\n') + '\n';

    const diff = buildPatchDiff(original, transformed, 'f.ts');
    // Context lines immediately before and after the change should be present
    expect(diff).toContain(' line2');  // 3 before
    expect(diff).toContain(' line8');  // 3 after (1-indexed: line5 changed, lines 2..4 and 6..8 context)
  });

  it('merges adjacent hunks within 2*CONTEXT window', () => {
    // Two changes 4 lines apart — should appear in ONE hunk (gap <= 2*3=6).
    const original    = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\n';
    const transformed = 'A\nb\nc\nd\nE\nf\ng\nh\ni\nj\n';
    const diff = buildPatchDiff(original, transformed, 'merged.ts');
    // Only one @@ header expected.
    const hunkCount = (diff.match(/@@ /g) ?? []).length;
    expect(hunkCount).toBe(1);
  });
});

// ─── Round-trip fixture test ─────────────────────────────────────────────────

describe('buildPatchDiff — fixture round-trip', () => {
  it('produces a diff that transforms the unhealthy fixture into the healthy one', () => {
    const diff = buildPatchDiff(UNHEALTHY, HEALTHY, 'magic-number-patch.ts');

    // Verify the diff is non-empty (the files differ).
    expect(diff.length).toBeGreaterThan(0);

    // Verify header format.
    expect(diff).toMatch(/^--- a\/magic-number-patch\.ts\n/);
    expect(diff).toMatch(/\+\+\+ b\/magic-number-patch\.ts\n/);
    expect(diff).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);

    // Apply the patch and verify the result matches the healthy fixture.
    const patched = applyPatch(UNHEALTHY, diff);
    expect(patched).toBe(HEALTHY);
  });

  it('generates a parsable hunk header with non-negative counts', () => {
    const diff = buildPatchDiff(UNHEALTHY, HEALTHY, 'magic-number-patch.ts');
    const hunkMatch = diff.match(/@@ -(\d+),(\d+) \+(\d+),(\d+) @@/);
    expect(hunkMatch).not.toBeNull();
    if (hunkMatch) {
      const [, oldStart, oldCount, newStart, newCount] = hunkMatch.map(Number);
      expect(oldStart).toBeGreaterThan(0);
      expect(newStart).toBeGreaterThan(0);
      expect(oldCount).toBeGreaterThanOrEqual(0);
      expect(newCount).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('buildPatchDiff — edge cases', () => {
  it('handles empty original → all lines are insertions', () => {
    const diff = buildPatchDiff('', 'hello\nworld\n', 'new.ts');
    expect(diff).toContain('+hello');
    expect(diff).toContain('+world');
  });

  it('handles empty transformed → all lines are deletions', () => {
    const diff = buildPatchDiff('hello\nworld\n', '', 'deleted.ts');
    expect(diff).toContain('-hello');
    expect(diff).toContain('-world');
  });

  it('handles single-line files', () => {
    const diff = buildPatchDiff('old\n', 'new\n', 'single.ts');
    expect(diff).toContain('-old');
    expect(diff).toContain('+new');
  });

  it('handles files with no trailing newline', () => {
    const diff = buildPatchDiff('foo', 'bar', 'no-newline.ts');
    expect(diff).toContain('-foo');
    expect(diff).toContain('+bar');
  });
});
