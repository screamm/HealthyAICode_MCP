import { createHash } from 'crypto';
import type { Smell } from '../types';

/**
 * Represents a group of cloned code blocks within a single file.
 * cloneType 1 = exact clone (whitespace-normalised), 2 = structural clone (identifier-normalised).
 */
export interface CloneGroup {
  hash: string;
  occurrences: Array<{ startLine: number; endLine: number }>;
  cloneType: 1 | 2;
}

/** TypeScript/JavaScript/Python reserved keywords used for identifier normalisation in type-2 detection. */
const TS_KEYWORDS = new Set([
  'if', 'else', 'return', 'const', 'let', 'var', 'function', 'class', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof', 'instanceof',
  'in', 'of', 'try', 'catch', 'finally', 'throw', 'import', 'export', 'default', 'from',
  'async', 'await', 'yield', 'true', 'false', 'null', 'undefined', 'void', 'this', 'super',
  'extends', 'implements', 'interface', 'type', 'enum', 'namespace', 'module', 'declare',
  'abstract', 'public', 'private', 'protected', 'static', 'readonly', 'override', 'as',
  'is', 'keyof', 'typeof', 'infer', 'never', 'any', 'unknown', 'object', 'string',
  'number', 'boolean', 'symbol', 'bigint',
  // Python keywords (for polyglot use)
  'def', 'pass', 'and', 'or', 'not', 'with', 'lambda', 'global', 'nonlocal', 'assert',
  'del', 'raise', 'except', 'None', 'True', 'False', 'self', 'cls',
]);

/** Hashes a string with SHA-1 for clone identity (not for security; see sprint-58 technical decisions §5). */
function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

/**
 * Normalises a window of lines for type-1 detection:
 * strips leading/trailing whitespace per line and removes blank lines.
 */
function normaliseType1(lines: string[]): string {
  return lines
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n');
}

/**
 * Normalises a window of lines for type-2 detection:
 * applies type-1 normalisation then replaces non-keyword identifiers with `$ID`.
 */
function normaliseType2(lines: string[]): string {
  const base = normaliseType1(lines);
  // Replace identifiers that are not in the keywords set with $ID
  return base.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g, (match) =>
    TS_KEYWORDS.has(match) ? match : '$ID'
  );
}

/**
 * A region of the file where a duplicate pattern was found.
 * start and end are 0-indexed line numbers.
 */
interface CloneRegion {
  start: number;
  end: number;
}

/**
 * Collects all starting positions (0-indexed) that share the given normalised hash,
 * for the given window size.
 */
function buildWindowMap(
  normalise: (lines: string[]) => string,
  lines: string[],
  minLines: number,
): Map<string, number[]> {
  const map = new Map<string, number[]>();
  const total = lines.length;
  for (let i = 0; i <= total - minLines; i++) {
    const window = lines.slice(i, i + minLines);
    const normalised = normalise(window);
    if (normalised.trim().length === 0) continue; // skip all-blank windows
    const h = sha1(normalised);
    const existing = map.get(h);
    if (existing) {
      existing.push(i);
    } else {
      map.set(h, [i]);
    }
  }
  return map;
}

/**
 * Groups all window start positions into contiguous clone regions.
 *
 * Given a hash→starts map (each entry has ≥2 starts meaning duplicates),
 * we collect, per-pair-of-clone-occurrences, which line ranges are covered.
 *
 * The key insight: multiple hash groups represent consecutive windows within the same
 * duplicated block. We detect regions by grouping consecutive starts in sorted order —
 * consecutive starts are at most 1 apart.
 *
 * Returns an array of {original, duplicate} region pairs, where each pair is a set
 * of positions indicating the full extent of the cloned block.
 */
function findCloneRegions(
  windowMap: Map<string, number[]>,
  minLines: number,
): Array<{ regions: CloneRegion[]; cloneType: 1 | 2 }> {
  // Build a set of (position_a, position_b) pairs that are duplicated,
  // then group consecutive pairs into contiguous clone blocks.

  // Collect all pairs of duplicated window starts
  const pairs: Array<[number, number]> = [];
  for (const starts of windowMap.values()) {
    if (starts.length < 2) continue;
    const sorted = [...starts].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        pairs.push([sorted[i], sorted[j]]);
      }
    }
  }

  if (pairs.length === 0) return [];

  // Sort pairs by (first, second) to group consecutive windows
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  // Merge consecutive pairs into contiguous clone block pairs
  // Two pairs [a1, b1] and [a2, b2] are consecutive if a2 = a1+1 and b2 = b1+1
  const mergedPairs: Array<{ startA: number; endA: number; startB: number; endB: number }> = [];

  for (const [a, b] of pairs) {
    const last = mergedPairs[mergedPairs.length - 1];
    if (last && a === last.endA + 1 && b === last.endB + 1) {
      // Extend the current merged block
      last.endA = a;
      last.endB = b;
    } else {
      mergedPairs.push({ startA: a, endA: a, startB: b, endB: b });
    }
  }

  // Convert merged pairs to CloneRegion arrays
  // The actual block end is endA + minLines - 1 (the last window extends minLines beyond its start)
  return mergedPairs.map(p => ({
    regions: [
      { start: p.startA, end: p.endA + minLines - 1 },
      { start: p.startB, end: p.endB + minLines - 1 },
    ],
    cloneType: 1 as const,
  }));
}

/**
 * Heuristic guard against false positives on purely *declarative* blocks.
 *
 * Aligned constant tables, struct/dataclass field lists, import groups, and type
 * aliases are frequently structurally similar across a file but are NOT refactorable
 * code clones (extracting them yields no benefit). A genuine code clone contains
 * executable logic: control flow, a call, a return, an assignment with an operator,
 * or a throw/raise. We require at least one such "logic line" inside the cloned block
 * before reporting it.
 */
const LOGIC_LINE_RE =
  /\b(?:if|else|for|while|switch|case|do|try|catch|except|return|throw|raise|await|yield|match|when|guard|foreach|elif|loop|repeat)\b|=>|\)\s*\{|\w\s*\([^)]*\)\s*[;{]?$|\.\w+\s*\(/;

/** True when any two of the given 0-indexed regions overlap in their line spans. */
function regionsOverlap(regions: CloneRegion[]): boolean {
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i];
      const b = regions[j];
      if (a.start <= b.end && b.start <= a.end) return true;
    }
  }
  return false;
}

/** True when at least one non-comment line in the block carries executable logic. */
function hasLogicContent(blockLines: string[]): boolean {
  for (const raw of blockLines) {
    const line = raw.trim();
    if (line.length === 0) continue;
    // Skip pure comment lines (//, #, --, ;, *, /* ... */) — they carry no logic.
    if (/^(?:\/\/|#|--|;|\*|\/\*|\*\/)/.test(line)) continue;
    if (LOGIC_LINE_RE.test(line)) return true;
  }
  return false;
}

/**
 * Converts clone region pairs to CloneGroup objects, deduplicating by normalised hash
 * of the first region.
 */
function regionPairsToCloneGroups(
  regionPairs: Array<{ regions: CloneRegion[]; cloneType: 1 | 2 }>,
  lines: string[],
  normalise: (lines: string[]) => string,
  cloneType: 1 | 2,
): CloneGroup[] {
  const groups: CloneGroup[] = [];
  const seen = new Set<string>();

  for (const { regions } of regionPairs) {
    if (regions.length < 2) continue;
    // Reject groups whose occurrences overlap each other. Overlapping ranges
    // (e.g. [58-63] vs [59-64]) are sliding-window artifacts of a single block,
    // not genuine clones — a real clone has two disjoint occurrences.
    if (regionsOverlap(regions)) continue;
    const [first] = regions;
    const blockLines = lines.slice(first.start, first.end + 1);
    // Skip purely declarative/comment blocks — not real refactorable clones.
    if (!hasLogicContent(blockLines)) continue;
    const blockHash = sha1(normalise(blockLines));

    if (seen.has(blockHash)) continue;
    seen.add(blockHash);

    groups.push({
      hash: blockHash,
      occurrences: regions.map(r => ({
        startLine: r.start + 1, // convert to 1-indexed
        endLine: r.end + 1,
      })),
      cloneType,
    });
  }

  return groups;
}

/**
 * Converts CloneGroups to Smell objects.
 * Each group produces one Smell pointing to the first occurrence, with a suggestion
 * listing all duplicate occurrences.
 */
function cloneGroupsToSmells(groups: CloneGroup[]): Smell[] {
  const smells: Smell[] = [];
  for (const group of groups) {
    const [first, ...rest] = group.occurrences;
    const blockSize = first.endLine - first.startLine + 1;
    const severity: Smell['severity'] = blockSize > 15 ? 'high' : 'medium';
    const typeLabel =
      group.cloneType === 1
        ? 'exact clone (type 1) — identical code'
        : 'structural clone (type 2) — identical structures with differently named identifiers';
    const dupRanges = rest
      .map(o => `lines ${o.startLine}–${o.endLine}`)
      .join(', ');
    smells.push({
      type: 'DuplicateCode',
      severity,
      line: first.startLine,
      description: `DuplicateCode — ${typeLabel} (block of ${blockSize} lines duplicated ${rest.length + 1} times)`,
      suggestion: `Extract the duplicated block (lines ${first.startLine}–${first.endLine}) into a shared function. Duplicates are at: ${dupRanges}.`,
      metricValue: blockSize,
      chunkRanges: group.occurrences,
    });
  }
  return smells;
}

/**
 * Detects in-file duplicate code blocks using sliding-window SHA-1 hashing.
 *
 * Type 1: exact clones (whitespace-normalised).
 * Type 2: structural clones (identifier-normalised via keyword filtering).
 * Type 3 (near-clones via edit distance): deferred to Sprint 59 — TODO.
 *
 * Uses SHA-1 as a fast identity hash for code windows — not for security purposes
 * (see sprint-58 technical decisions §5). The CryptographicMisuseRisk detector
 * correctly ignores this usage since it only targets application-level crypto contexts.
 *
 * @param code - full source text of the file to analyse
 * @param options.minLines - minimum duplicated block size in lines (default: 6)
 * @param options.normalizeIdentifiers - whether to run type-2 detection in addition to type-1 (default: true)
 */
export function detectDuplicateCode(
  code: string,
  options?: { minLines?: number; normalizeIdentifiers?: boolean },
): Smell[] {
  const minLines = options?.minLines ?? 6;
  const normalizeIdentifiers = options?.normalizeIdentifiers ?? true;
  const maxLines = 2000; // performance guard for very large files (see risk §3 in sprint doc)

  const allLines = code.split('\n');
  const lines = allLines.length > maxLines ? allLines.slice(0, maxLines) : allLines;

  if (lines.length < minLines * 2) {
    // Not enough lines to have two non-overlapping clone blocks
    return [];
  }

  // --- Type 1: exact clones ---
  const type1Map = buildWindowMap(normaliseType1, lines, minLines);
  const type1Regions = findCloneRegions(type1Map, minLines);
  const type1Groups = regionPairsToCloneGroups(type1Regions, lines, normaliseType1, 1);

  // Collect the line ranges covered by type-1 clones for exclusion from type-2
  const type1CoveredRanges = new Set<string>();
  for (const g of type1Groups) {
    for (const occ of g.occurrences) {
      for (let ln = occ.startLine; ln <= occ.endLine; ln++) {
        type1CoveredRanges.add(String(ln));
      }
    }
  }

  // --- Type 2: structural clones (only those not already caught by type 1) ---
  const type2Groups: CloneGroup[] = [];

  if (normalizeIdentifiers) {
    const type2Map = buildWindowMap(normaliseType2, lines, minLines);
    const type2Regions = findCloneRegions(type2Map, minLines);
    const candidates = regionPairsToCloneGroups(type2Regions, lines, normaliseType2, 2);

    for (const group of candidates) {
      // Skip if both occurrences are fully covered by type-1 clones
      const allCoveredByType1 = group.occurrences.every(occ =>
        Array.from({ length: occ.endLine - occ.startLine + 1 }, (_, i) => occ.startLine + i)
          .every(ln => type1CoveredRanges.has(String(ln)))
      );
      if (!allCoveredByType1) {
        type2Groups.push(group);
      }
    }
  }

  const allGroups = [...type1Groups, ...type2Groups];
  return cloneGroupsToSmells(allGroups);
}
