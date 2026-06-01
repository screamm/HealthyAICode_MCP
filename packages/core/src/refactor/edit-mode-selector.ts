/**
 * Sprint 52: Adaptive edit-mode selection for token-efficient refactoring responses.
 *
 * `selectEditMode` maps a smell type + function size to the cheapest output format:
 *   - `'patch'`       — minimal unified diff (point fixes, short functions).
 *   - `'funcRewrite'` — full function rewrite (mid-size functions, structural smells).
 *   - `'fileRewrite'` — full file rewrite (GodClass-scale or very large functions).
 *
 * `buildPatchDiff` produces a standards-compliant unified diff without external
 * dependencies, suitable for direct consumption by patch(1) and git apply.
 *
 * Research basis: SWE-Edit (arXiv 2604.26102) shows adaptive format selection
 * gives +2.1 pp resolved rate and −17.9 % inference cost simultaneously.
 * FuncDiff/BlockDiff (arXiv 2604.27296) shows diff format matches full-rewrite
 * precision at 30 %+ lower token cost for functions > 300 tokens.
 */

import type { SmellType } from '../types';
import type { EditMode } from './edit-mode';

// ─── Size thresholds ───────────────────────────────────────────────────────────

/** Functions with fewer lines than this can be patched deterministically. */
const PATCH_MAX_LINES = 20;

/** Functions larger than this require a whole-file rewrite. */
const FUNC_REWRITE_MAX_LINES = 150;

// ─── Smell-type routing tables ─────────────────────────────────────────────────

/**
 * Smells that are always resolved with a minimal patch regardless of function size,
 * because the transformation is a deterministic find-replace on isolated tokens:
 *   - MagicNumber → named constant declaration + token replacement.
 *   - HardcodedCredential / HardcodedApiKey → env-var reference replacement.
 */
const PATCH_SMELLS: ReadonlySet<SmellType> = new Set<SmellType>([
  'MagicNumber',
  'HardcodedCredential',
  'HardcodedApiKey',
]);

/**
 * Smells that require structural rewriting of a whole function.
 * When function size is above `FUNC_REWRITE_MAX_LINES` these escalate to fileRewrite.
 */
const FUNC_REWRITE_SMELLS: ReadonlySet<SmellType> = new Set<SmellType>([
  'ComplexMethod',
  'BrainMethod',
  'DeepNesting',
  'BumpyRoad',
  'CognitiveComplexity',
  'LargeMethod',
  'LongParameterList',
  'ComplexConditional',
  'BumpyRoad',
]);

/**
 * Smells that always require a whole-file rewrite because they are class-level
 * or span the entire module structure.
 */
const FILE_REWRITE_SMELLS: ReadonlySet<SmellType> = new Set<SmellType>([
  'GodClass',
  'FeatureEnvy',
  'DataClumps',
  'LargeFile',
]);

// ─── selectEditMode ────────────────────────────────────────────────────────────

/**
 * Determine the cheapest edit mode for a given smell and function size.
 *
 * Decision logic (priority order):
 * 1. File-rewrite smells → always `'fileRewrite'`.
 * 2. Patch smells         → always `'patch'` (deterministic token replacement).
 * 3. Very small functions (< 20 lines) + any structural smell → `'patch'`
 *    (the whole function fits in a short diff).
 * 4. Func-rewrite smells in mid-size range (20–150 lines) → `'funcRewrite'`.
 * 5. Any smell on a very large function (> 150 lines)     → `'fileRewrite'`.
 * 6. Fallback → `'funcRewrite'` (safe middle ground for unrecognised smells).
 *
 * @param smellType - The detected smell category.
 * @param functionLineCount - Number of source lines in the affected function
 *   (use 0 for file-level smells such as LargeFile or GodClass).
 * @returns The recommended EditMode.
 */
export function selectEditMode(smellType: SmellType, functionLineCount: number): EditMode {
  // Priority 1: class/module-scale smells always need the full file.
  if (FILE_REWRITE_SMELLS.has(smellType)) {
    return 'fileRewrite';
  }

  // Priority 2: point-fix smells are always resolved with a patch.
  if (PATCH_SMELLS.has(smellType)) {
    return 'patch';
  }

  // Priority 3: tiny functions — the whole body fits in a short unified diff.
  if (functionLineCount < PATCH_MAX_LINES) {
    return 'patch';
  }

  // Priority 4: structural smells on mid-size functions.
  if (FUNC_REWRITE_SMELLS.has(smellType) && functionLineCount <= FUNC_REWRITE_MAX_LINES) {
    return 'funcRewrite';
  }

  // Priority 5: very large functions escalate to a full file rewrite.
  if (functionLineCount > FUNC_REWRITE_MAX_LINES) {
    return 'fileRewrite';
  }

  // Priority 6: unknown / unrouted smell on a mid-size function.
  return 'funcRewrite';
}

// ─── buildPatchDiff ────────────────────────────────────────────────────────────

/** Number of unchanged context lines on each side of a changed hunk. */
const CONTEXT_LINES = 3;

/**
 * Build a minimal unified diff from two source strings.
 *
 * Output format:
 * ```
 * --- a/<filePath>
 * +++ b/<filePath>
 * @@ -<start>,<count> +<start>,<count> @@
 *  <context line>
 * -<removed line>
 * +<added line>
 *  <context line>
 * ```
 *
 * The implementation is dependency-free and works purely on line arrays.
 * It produces the same output as `diff -u` for the common case of editing
 * short-to-medium functions (< 150 lines).  For files > 500 lines a
 * dedicated diff library should be considered (see Sprint 54 roadmap).
 *
 * @param original  - The source code before the transformation.
 * @param transformed - The source code after the transformation.
 * @param filePath  - File path used in the diff header (e.g. `'src/utils.ts'`).
 * @returns Unified diff string ready for `patch(1)` / `git apply`.
 */
export function buildPatchDiff(original: string, transformed: string, filePath: string): string {
  const oldLines = original.split('\n');
  const newLines = transformed.split('\n');

  const edits = computeEdits(oldLines, newLines);
  if (edits.length === 0) {
    return '';
  }

  const hunks = buildHunks(edits, oldLines, newLines);
  if (hunks.length === 0) {
    return '';
  }

  const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
  return header + hunks.map(renderHunk).join('');
}

// ─── Internal diff helpers ─────────────────────────────────────────────────────

/** A single edit operation on the line level. */
interface Edit {
  /** 0-based index in the OLD array (or the position it would occupy). */
  oldLine: number;
  /** 0-based index in the NEW array (or the position it would occupy). */
  newLine: number;
  /** `'equal'`, `'delete'`, or `'insert'`. */
  type: 'equal' | 'delete' | 'insert';
}

/** A rendered hunk ready to be concatenated into the diff output. */
interface Hunk {
  oldStart: number;   // 1-indexed start in old file
  oldCount: number;   // lines in old file (context + deleted)
  newStart: number;   // 1-indexed start in new file
  newCount: number;   // lines in new file (context + inserted)
  lines: string[];    // diff body lines (prefixed with ' ', '-', '+')
}

/**
 * Myers shortest-edit-script algorithm — O(ND) where N=|old|+|new|.
 * Returns a linear sequence of Edit records describing the transformation.
 */
function computeEdits(oldLines: string[], newLines: string[]): Edit[] {
  const N = oldLines.length;
  const M = newLines.length;
  const MAX = N + M;

  if (MAX === 0) return [];

  // V[k] holds the furthest-reaching x (oldLine index) for each diagonal k.
  const V: number[] = new Array(2 * MAX + 2).fill(0);
  const OFFSET = MAX + 1;

  // Store snake endpoints for backtracking.
  const trace: number[][] = [];

  outer: for (let d = 0; d <= MAX; d++) {
    trace.push(V.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && V[OFFSET + k - 1] < V[OFFSET + k + 1])) {
        x = V[OFFSET + k + 1];       // move down (insertion)
      } else {
        x = V[OFFSET + k - 1] + 1;   // move right (deletion)
      }
      let y = x - k;
      // Follow the diagonal (equal lines).
      while (x < N && y < M && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }
      V[OFFSET + k] = x;
      if (x >= N && y >= M) break outer;
    }
  }

  // Backtrack to collect the edit script.
  const edits: Edit[] = [];
  let x = N;
  let y = M;

  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const prevV = trace[d];
    const k = x - y;

    let prevK: number;
    if (k === -d || (k !== d && prevV[OFFSET + k - 1] < prevV[OFFSET + k + 1])) {
      prevK = k + 1;  // came from down (insertion)
    } else {
      prevK = k - 1;  // came from right (deletion)
    }

    const prevX = prevV[OFFSET + prevK];
    const prevY = prevX - prevK;

    // Emit equal (diagonal) edits in this snake.
    while (x > prevX && y > prevY) {
      x--;
      y--;
      edits.push({ oldLine: x, newLine: y, type: 'equal' });
    }

    if (d > 0) {
      if (x === prevX) {
        // Moved down → insertion
        y--;
        edits.push({ oldLine: x, newLine: y, type: 'insert' });
      } else {
        // Moved right → deletion
        x--;
        edits.push({ oldLine: x, newLine: y, type: 'delete' });
      }
    }
  }

  edits.reverse();
  return edits;
}

/**
 * Group the flat edit list into hunks with CONTEXT_LINES of surrounding context.
 * Adjacent change groups closer than 2 * CONTEXT_LINES are merged into one hunk.
 */
function buildHunks(edits: Edit[], oldLines: string[], newLines: string[]): Hunk[] {
  // Collect runs of non-equal edits with their surrounding context.
  interface ChangeRange {
    lo: number;  // first edit index with type != 'equal'
    hi: number;  // last  edit index with type != 'equal'
  }
  const ranges: ChangeRange[] = [];

  let inChange = false;
  let rangeStart = 0;

  for (let i = 0; i < edits.length; i++) {
    if (edits[i].type !== 'equal') {
      if (!inChange) {
        rangeStart = i;
        inChange = true;
      }
    } else {
      if (inChange) {
        ranges.push({ lo: rangeStart, hi: i - 1 });
        inChange = false;
      }
    }
  }
  if (inChange) {
    ranges.push({ lo: rangeStart, hi: edits.length - 1 });
  }

  if (ranges.length === 0) return [];

  // Merge ranges that are within 2*CONTEXT_LINES of each other.
  const merged: ChangeRange[] = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = ranges[i];
    // Gap between prev.hi and cur.lo in edit indices.
    const gap = cur.lo - prev.hi - 1;
    if (gap <= 2 * CONTEXT_LINES) {
      prev.hi = cur.hi;
    } else {
      merged.push({ lo: cur.lo, hi: cur.hi });
    }
  }

  // Build each hunk.
  return merged.map(range => {
    // Expand by CONTEXT_LINES on each side (clamped to edit array bounds).
    const start = Math.max(0, range.lo - CONTEXT_LINES);
    const end   = Math.min(edits.length - 1, range.hi + CONTEXT_LINES);

    const hunkEdits = edits.slice(start, end + 1);

    const lines: string[] = [];
    let oldStart = -1;
    let newStart = -1;
    let oldCount = 0;
    let newCount = 0;

    for (const edit of hunkEdits) {
      if (oldStart === -1) {
        oldStart = edit.type !== 'insert' ? edit.oldLine + 1 : edit.oldLine + 1;
        newStart = edit.type !== 'delete' ? edit.newLine + 1 : edit.newLine + 1;
      }
      switch (edit.type) {
        case 'equal':
          lines.push(` ${oldLines[edit.oldLine]}`);
          oldCount++;
          newCount++;
          break;
        case 'delete':
          lines.push(`-${oldLines[edit.oldLine]}`);
          oldCount++;
          break;
        case 'insert':
          lines.push(`+${newLines[edit.newLine]}`);
          newCount++;
          break;
      }
    }

    return {
      oldStart: oldStart === -1 ? 1 : oldStart,
      oldCount,
      newStart: newStart === -1 ? 1 : newStart,
      newCount,
      lines,
    };
  });
}

/** Render one hunk to a string. */
function renderHunk(hunk: Hunk): string {
  const header = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@\n`;
  return header + hunk.lines.join('\n') + '\n';
}
