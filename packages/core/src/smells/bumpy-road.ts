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
 * Covers TypeScript, Python, Java, and C# node names:
 * - `for_in_statement`   covers both for...in and for...of in tree-sitter-typescript
 * - `enhanced_for_statement` covers Java's for-each
 * - `foreach_statement`  covers C# foreach
 * - `do_statement`       Java/C#
 * - `with_statement`     Python `with`
 */
const CHUNK_NODE_TYPES = new Set([
  // TypeScript / shared
  'if_statement',
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement',
  'switch_statement',
  'try_statement',
  // Python-specific
  'with_statement',
  // Java-specific
  'enhanced_for_statement',
  // C#-specific
  'foreach_statement',
]);

/**
 * Body node types that represent a function's statement block.
 * - TypeScript: `statement_block`
 * - Python / Java / C#: `block`
 */
const BODY_NODE_TYPES = new Set(['statement_block', 'block']);

/** Locates the statement block that forms a function's body. */
function findFunctionBody(fnNode: Parser.SyntaxNode): Parser.SyntaxNode | null {
  // Try the 'body' field first (works for TypeScript, Python, Java, C#)
  const candidate = fnNode.childForFieldName('body');
  if (candidate && BODY_NODE_TYPES.has(candidate.type)) return candidate;
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
 * MULTI-LANGUAGE SUPPORT (Sprint 17 C1):
 * CHUNK_NODE_TYPES and findFunctionBody now cover TypeScript, Python, Java, and C#.
 * Python/Java/C# analyzers call detectBumpyRoadChunks per function node exactly as TypeScript does.
 * Kotlin support is deferred to a future sprint.
 */
export function detectBumpyRoadChunks(fnNode: Parser.SyntaxNode): Smell | null {
  const body = findFunctionBody(fnNode);
  if (!body) return null;

  const chunkRanges = collectChunkRanges(body);
  if (chunkRanges.length < BUMPY_ROAD_CHUNK_THRESHOLD) return null;

  // getFunctionName handles TypeScript-specific patterns; for other languages fall back to the
  // 'name' field on the function node (Python function_definition, Java method_declaration, etc.)
  const name = getFunctionName(fnNode) !== '<anonymous>'
    ? getFunctionName(fnNode)
    : (fnNode.childForFieldName('name')?.text ?? '<anonymous>');
  // Severity is always 'high' — matches legacy detector default and avoids silent downgrade to 'medium'.
  // (C3: preserving 'high' to avoid severity shift with no documentation.)
  const severity: 'high' = 'high';
  return {
    type: 'BumpyRoad',
    severity,
    line: fnNode.startPosition.row + 1,
    functionName: name,
    description: `'${name}' has ${chunkRanges.length} sequential control-flow chunks in the same function (limit: ${BUMPY_ROAD_CHUNK_THRESHOLD}). The function does not encapsulate its responsibilities.`,
    suggestion: `Extract each top-level chunk in '${name}' into a named helper function (e.g. handle<WhatTheBlockDoes>). This makes the function's story clear and each chunk testable in isolation.`,
    chunkRanges,
  };
}
