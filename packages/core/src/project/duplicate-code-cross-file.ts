import { createHash } from 'crypto';
import type { FunctionResult, Smell } from '../types';

/**
 * Represents a pair of files that share cloned code blocks across file boundaries.
 * Prepared for Sprint 59 wiring into per-file health scoring.
 */
export interface CrossFileClonePair {
  filePathA: string;
  filePathB: string;
  /** Lines in filePathA where the clone starts (1-indexed). */
  startLineA: number;
  /** Lines in filePathA where the clone ends (1-indexed). */
  endLineA: number;
  /** Lines in filePathB where the clone starts (1-indexed). */
  startLineB: number;
  /** Lines in filePathB where the clone ends (1-indexed). */
  endLineB: number;
  /** Number of lines in the cloned block (based on fileA occurrence). */
  blockSize: number;
  cloneType: 1 | 2;
  /** SHA-1 hash of the normalised block (not for security use). */
  hash: string;
}

/**
 * Input record for cross-file analysis — one entry per source file.
 * Mirrors the `AnalyzerOutput` interface from `analyzers/index.ts` without importing it
 * (to keep this module usable standalone and avoid circular dependencies).
 */
export interface FileAnalysisInput {
  filePath: string;
  /** Source code text of the file. */
  code: string;
  /** Function results from the language analyzer (used for block boundary hints). */
  functions?: FunctionResult[];
  /** Smells already detected by per-file analysis (not consumed here, available for callers). */
  smells?: Smell[];
}

/** TypeScript/JavaScript/Python keywords used for type-2 identifier normalisation. */
const KEYWORDS = new Set([
  'if', 'else', 'return', 'const', 'let', 'var', 'function', 'class', 'for', 'while',
  'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof', 'instanceof',
  'in', 'of', 'try', 'catch', 'finally', 'throw', 'import', 'export', 'default', 'from',
  'async', 'await', 'yield', 'true', 'false', 'null', 'undefined', 'void', 'this', 'super',
  'extends', 'implements', 'interface', 'type', 'enum', 'namespace', 'module', 'declare',
  'abstract', 'public', 'private', 'protected', 'static', 'readonly', 'override', 'as',
  'is', 'keyof', 'never', 'any', 'unknown', 'object', 'string', 'number', 'boolean',
  'def', 'pass', 'and', 'or', 'not', 'with', 'lambda', 'global', 'nonlocal', 'assert',
  'del', 'raise', 'except', 'None', 'True', 'False', 'self', 'cls',
]);

/** SHA-1 hash for identity comparison (not security; see sprint-58 technical decisions §5). */
function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

function normaliseType1(lines: string[]): string {
  return lines.map(l => l.trim()).filter(l => l.length > 0).join('\n');
}

function normaliseType2(lines: string[]): string {
  const base = normaliseType1(lines);
  return base.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g, (match) =>
    KEYWORDS.has(match) ? match : '$ID'
  );
}

interface WindowEntry {
  filePath: string;
  startLine: number; // 0-indexed
  endLine: number;   // 0-indexed inclusive
}

/**
 * Builds a hash→occurrences map across all files using a sliding window of `minLines`.
 * @param normalise - normalisation function (type 1 or type 2)
 * @param files - array of { filePath, lines } pairs
 * @param minLines - window size
 */
function buildCrossFileMap(
  normalise: (lines: string[]) => string,
  files: Array<{ filePath: string; lines: string[] }>,
  minLines: number,
): Map<string, WindowEntry[]> {
  const map = new Map<string, WindowEntry[]>();
  for (const { filePath, lines } of files) {
    const total = lines.length;
    for (let i = 0; i <= total - minLines; i++) {
      const window = lines.slice(i, i + minLines);
      const normalised = normalise(window);
      if (normalised.trim().length === 0) continue;
      const h = sha1(normalised);
      const existing = map.get(h);
      const entry: WindowEntry = { filePath, startLine: i, endLine: i + minLines - 1 };
      if (existing) {
        existing.push(entry);
      } else {
        map.set(h, [entry]);
      }
    }
  }
  return map;
}

/**
 * Checks whether two occurrences in the same file overlap (i.e. are from the same file
 * and their windows intersect). Cross-file pairs with the same file are excluded.
 */
function areDifferentFiles(a: WindowEntry, b: WindowEntry): boolean {
  return a.filePath !== b.filePath;
}

/**
 * Scans a repository's set of files for cross-file code clones (type 1 and type 2).
 *
 * This function is not yet wired into the per-file health score — it is prepared
 * for Sprint 59 integration. It returns a flat list of `CrossFileClonePair` objects
 * that callers can use to enrich project-level reports.
 *
 * Performance note: O(n × m) comparisons where n = total windows, m = average clone group size.
 * For very large repos, a pre-filtering step (file size, language type) is recommended.
 *
 * @param files - one entry per source file to analyse
 * @param options.minLines - minimum clone block size (default: 6)
 * @param options.normalizeIdentifiers - whether to include type-2 (structural) clones (default: true)
 */
export function detectCrossFileClones(
  files: FileAnalysisInput[],
  options?: { minLines?: number; normalizeIdentifiers?: boolean },
): CrossFileClonePair[] {
  const minLines = options?.minLines ?? 6;
  const normalizeIdentifiers = options?.normalizeIdentifiers ?? true;
  const maxLinesPerFile = 2000; // performance guard

  const preparedFiles = files.map(f => ({
    filePath: f.filePath,
    lines: f.code.split('\n').slice(0, maxLinesPerFile),
  }));

  const pairs: CrossFileClonePair[] = [];
  const seenPairs = new Set<string>(); // deduplicate by (fileA, startA, fileB, startB)

  // --- Type 1: exact clones ---
  const type1Map = buildCrossFileMap(normaliseType1, preparedFiles, minLines);
  const type1Hashes = new Set<string>();

  for (const [hash, occurrences] of type1Map) {
    if (occurrences.length < 2) continue;

    // Only keep cross-file pairs
    const crossFile = getCrossFilePairs(occurrences);
    if (crossFile.length === 0) continue;
    type1Hashes.add(hash);

    for (const [a, b] of crossFile) {
      const key = pairKey(a, b);
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      pairs.push({
        filePathA: a.filePath,
        filePathB: b.filePath,
        startLineA: a.startLine + 1,
        endLineA: a.endLine + 1,
        startLineB: b.startLine + 1,
        endLineB: b.endLine + 1,
        blockSize: minLines,
        cloneType: 1,
        hash,
      });
    }
  }

  // --- Type 2: structural clones (not already caught by type 1) ---
  if (normalizeIdentifiers) {
    const type2Map = buildCrossFileMap(normaliseType2, preparedFiles, minLines);

    for (const [hash2, occurrences] of type2Map) {
      if (occurrences.length < 2) continue;

      const crossFile = getCrossFilePairs(occurrences);
      if (crossFile.length === 0) continue;

      // Check if all occurrences already have the same type-1 hash (meaning they are exact)
      // and that type-1 hash is already in the type-1 result set — if so, skip to avoid duplicates.
      for (const [a, b] of crossFile) {
        const key = pairKey(a, b);
        if (seenPairs.has(key)) continue;

        // Compute type-1 hashes for a and b to check for exact-clone overlap
        const fileALines = preparedFiles.find(f => f.filePath === a.filePath)?.lines ?? [];
        const fileBLines = preparedFiles.find(f => f.filePath === b.filePath)?.lines ?? [];
        const hashA = sha1(normaliseType1(fileALines.slice(a.startLine, a.endLine + 1)));
        const hashB = sha1(normaliseType1(fileBLines.slice(b.startLine, b.endLine + 1)));

        if (hashA === hashB && type1Hashes.has(hashA)) {
          // Already reported as type 1
          continue;
        }

        seenPairs.add(key);
        pairs.push({
          filePathA: a.filePath,
          filePathB: b.filePath,
          startLineA: a.startLine + 1,
          endLineA: a.endLine + 1,
          startLineB: b.startLine + 1,
          endLineB: b.endLine + 1,
          blockSize: minLines,
          cloneType: 2,
          hash: hash2,
        });
      }
    }
  }

  return pairs;
}

/** Returns all unique cross-file pairs (a.filePath !== b.filePath) from a list of occurrences. */
function getCrossFilePairs(occurrences: WindowEntry[]): Array<[WindowEntry, WindowEntry]> {
  const result: Array<[WindowEntry, WindowEntry]> = [];
  for (let i = 0; i < occurrences.length; i++) {
    for (let j = i + 1; j < occurrences.length; j++) {
      if (areDifferentFiles(occurrences[i], occurrences[j])) {
        result.push([occurrences[i], occurrences[j]]);
      }
    }
  }
  return result;
}

/** Canonical key for a cross-file clone pair to avoid reporting A↔B and B↔A separately. */
function pairKey(a: WindowEntry, b: WindowEntry): string {
  const [fa, sa, fb, sb] =
    a.filePath < b.filePath
      ? [a.filePath, a.startLine, b.filePath, b.startLine]
      : [b.filePath, b.startLine, a.filePath, a.startLine];
  return `${fa}:${sa}::${fb}:${sb}`;
}
