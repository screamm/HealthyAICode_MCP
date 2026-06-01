/**
 * unified-diff-applier.ts — Sprint 51-60
 *
 * Applies a unified diff (as produced by rope's `changes.get_description()` and
 * `gopls codeaction -diff`) to an in-memory source string. Dependency-free.
 *
 * Only the hunk bodies are used (the `@@ -a,b +c,d @@` headers are parsed for the
 * old-side start line; the new-side is reconstructed from the hunk content). This is
 * deliberately tolerant of the header-line-count differences between rope and gopls
 * output while still being a faithful, deterministic application:
 *   - ` ` context lines must match the source at the expected position.
 *   - `-` lines are removed.
 *   - `+` lines are inserted.
 *
 * Returns null when the diff does not cleanly apply (context mismatch / malformed hunk),
 * so the caller can reject the transform rather than emit corrupted source.
 */

/** Parsed representation of one unified-diff hunk. */
interface DiffHunk {
  /** 1-based start line on the OLD side. */
  oldStart: number;
  /** Body lines, each prefixed with ' ', '-', or '+'. */
  body: string[];
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Parses every hunk out of a unified diff. Returns [] when no hunks are present. */
function parseHunks(diff: string): DiffHunk[] {
  const lines = diff.split('\n');
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;

  for (const line of lines) {
    const header = line.match(HUNK_HEADER_RE);
    if (header) {
      if (current) hunks.push(current);
      current = { oldStart: parseInt(header[1], 10), body: [] };
      continue;
    }
    if (!current) continue; // skip ---/+++ file headers and any preamble
    // A hunk body line starts with ' ', '-', '+', or '\' (no-newline marker).
    if (line.startsWith(' ') || line.startsWith('-') || line.startsWith('+')) {
      current.body.push(line);
    } else if (line.startsWith('\\')) {
      // "\ No newline at end of file" — ignore.
      continue;
    } else {
      // End of the hunk region (blank line / next file). Close the current hunk.
      hunks.push(current);
      current = null;
    }
  }
  if (current) hunks.push(current);
  return hunks;
}

/**
 * Applies a single hunk to `srcLines`, returning the new line array, or null on a
 * context mismatch. `srcLines` is 0-based; hunk.oldStart is 1-based.
 */
function applyHunk(srcLines: string[], hunk: DiffHunk): string[] | null {
  const out: string[] = srcLines.slice(0, hunk.oldStart - 1);
  let cursor = hunk.oldStart - 1; // 0-based index into srcLines

  for (const bodyLine of hunk.body) {
    const tag = bodyLine[0];
    const content = bodyLine.slice(1);
    if (tag === ' ') {
      if (srcLines[cursor] !== content) return null; // context mismatch
      out.push(srcLines[cursor]);
      cursor++;
    } else if (tag === '-') {
      if (srcLines[cursor] !== content) return null; // deletion mismatch
      cursor++;
    } else if (tag === '+') {
      out.push(content);
    }
  }
  // Append the remainder of the source after the hunk.
  out.push(...srcLines.slice(cursor));
  return out;
}

/**
 * Applies a full unified diff to `source`. Hunks are applied from the BOTTOM up so that
 * line offsets from earlier hunks do not invalidate later hunk positions.
 *
 * @returns the transformed source, or null when the diff is empty, malformed, or fails
 *   to apply cleanly (caller must reject rather than emit corrupted code).
 */
export function applyUnifiedDiff(source: string, diff: string): string | null {
  const hunks = parseHunks(diff);
  if (hunks.length === 0) return null;

  // Trailing-newline-preserving split.
  const hadTrailingNewline = source.endsWith('\n');
  const srcLines = (hadTrailingNewline ? source.slice(0, -1) : source).split('\n');

  let lines = srcLines;
  // Bottom-up application keeps earlier hunks' oldStart valid.
  const ordered = [...hunks].sort((a, b) => b.oldStart - a.oldStart);
  for (const hunk of ordered) {
    const next = applyHunk(lines, hunk);
    if (next === null) return null;
    lines = next;
  }

  const result = lines.join('\n');
  return hadTrailingNewline ? result + '\n' : result;
}
