import type Parser from 'tree-sitter';
import { getFunctionName } from '../analyzers/typescript-ast-helpers';
import type { Smell } from '../types';

/**
 * Default threshold: a function with ≥ this many top-level sibling control-flow chunks is a Bumpy Road.
 * Set empirically at 4; adjust in Task 7 self-audit if self-audit shows too many false positives.
 */
export const BUMPY_ROAD_CHUNK_THRESHOLD = 4;
export const BUMPY_ROAD_HIGH_SEVERITY_CHUNKS = 5;

/**
 * AST node types that count as a "chunk" when appearing as a top-level sibling inside a function body.
 *
 * Note: `for_of_statement` is intentionally absent — tree-sitter-typescript parses both
 * `for...in` and `for...of` as `for_in_statement`. `for_of_statement` is never emitted.
 */
const CHUNK_NODE_TYPES = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',   // covers both for...in and for...of in tree-sitter-typescript
  'while_statement',
  'do_statement',
  'switch_statement',
  'try_statement',
]);

/**
 * Tree-sitter field names whose value is the function body block.
 *
 * Note: `'value'` is intentionally absent — none of the relevant TS function node types
 * (function_declaration, arrow_function, function_expression, method_definition) use a `value`
 * field for their body in tree-sitter-typescript.
 */
const BODY_FIELD_NAMES = ['body'];

/** Locates the statement_block that forms a function's body. */
function findFunctionBody(fnNode: Parser.SyntaxNode): Parser.SyntaxNode | null {
  for (const fieldName of BODY_FIELD_NAMES) {
    const candidate = fnNode.childForFieldName(fieldName);
    if (candidate && candidate.type === 'statement_block') return candidate;
  }
  // Arrow function expressions without braces have a body that's an expression — no chunks possible.
  return null;
}

/** Returns line ranges (1-indexed, inclusive) for every top-level sibling chunk inside a function body. */
function collectChunkRanges(body: Parser.SyntaxNode): Array<{ startLine: number; endLine: number }> {
  const ranges: Array<{ startLine: number; endLine: number }> = [];
  for (const child of body.namedChildren) {
    if (!CHUNK_NODE_TYPES.has(child.type)) continue;
    ranges.push({
      startLine: child.startPosition.row + 1,
      endLine: child.endPosition.row + 1,
    });
  }
  return ranges;
}

/**
 * Detects Bumpy Road: a single function whose body contains too many sequential top-level
 * control-flow chunks. Operates on ONE function node; returns a single Smell or null.
 *
 * Only top-level siblings inside the function body count — nested control flow does not
 * increase the chunk count (that's DeepNesting's domain).
 *
 * Severity:
 *   - 4 chunks: 'high' (was always 'high' in the legacy file-level detector; preserved intentionally)
 *   - ≥5 chunks: 'high'
 * Both levels are 'high' because a 4-chunk Bumpy Road is already a significant smell.
 * A future sprint may introduce 'critical' for ≥7 chunks if self-audit data justifies it.
 *
 * BACKWARD COMPATIBILITY NOTE (Sprint 17):
 * The old file-level detectBumpyRoad() in detector.ts ran for ALL languages (TS/JS/Python/Java/Kotlin/C#).
 * This new per-function detector is wired ONLY into TypeScript. Python/Java/Kotlin/C# will not
 * emit BumpyRoad smells after this sprint. This is an acknowledged regression; chunk-detection
 * for other languages is deferred to a future sprint (requires per-language CHUNK_NODE_TYPES sets).
 */
export function detectBumpyRoadChunks(fnNode: Parser.SyntaxNode): Smell | null {
  const body = findFunctionBody(fnNode);
  if (!body) return null;

  const chunkRanges = collectChunkRanges(body);
  if (chunkRanges.length < BUMPY_ROAD_CHUNK_THRESHOLD) return null;

  const name = getFunctionName(fnNode);
  // Severity is always 'high' — matches legacy detector default and avoids silent downgrade to 'medium'.
  // (C3: preserving 'high' to avoid severity shift with no documentation.)
  const severity: 'high' = 'high';
  return {
    type: 'BumpyRoad',
    severity,
    line: fnNode.startPosition.row + 1,
    functionName: name,
    description: `'${name}' har ${chunkRanges.length} sekventiella kontrollflödes-chunks i samma funktion (gräns: ${BUMPY_ROAD_CHUNK_THRESHOLD}). Funktionen kapslar inte in sitt ansvar.`,
    suggestion: `Extract each top-level chunk i '${name}' till en namngiven hjälpfunktion (t.ex. handle<Vad-block-gör>). Detta gör funktionens story tydlig och varje chunk testbart isolerat.`,
    chunkRanges,
  };
}
