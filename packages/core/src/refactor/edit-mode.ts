/**
 * Shared edit-mode contract for server-side token reduction (Sprint 52).
 *
 * This file declares ONLY the type contract that `code_health_auto_refactor`'s
 * `editMode` parameter and the forthcoming `edit-mode-selector.ts` will use.
 * No selection logic lives here — `selectEditMode()` / `buildPatchDiff()` are
 * implemented in a later phase against this type.
 */

/**
 * How `code_health_auto_refactor` returns a refactoring edit:
 * - `'patch'`      — minimal unified diff (deterministic transforms, short functions / point fixes).
 * - `'funcRewrite'` — full rewrite of a single function (mid-size functions).
 * - `'fileRewrite'` — full rewrite of the file (GodClass or very large functions).
 */
export type EditMode = 'patch' | 'funcRewrite' | 'fileRewrite';

/** Unified-diff patch payload returned for `editMode: 'patch'` (Sprint 52). */
export interface DiffPatch {
  editMode: 'patch';
  /** Unified diff text (`--- a/`, `+++ b/`, `@@ -N,M +N,M @@`). */
  diff: string;
  /** Human-readable list of changes applied. */
  changes: string[];
  /** The refactoring strategy that produced the patch. */
  strategy: string;
}
