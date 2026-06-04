import type Parser from 'tree-sitter';
import { getFunctionName } from '../analyzers/typescript-ast-helpers';
import type { Smell } from '../types';
import { BUMPY_ROAD_CHUNK_THRESHOLD, getTopLevelChunkRanges } from './bumpy-road';

/**
 * Lower bound of the advisory window. A function with 0–1 top-level control-flow chunks is
 * trivially fine and produces no advisory.
 */
export const TIDY_OPPORTUNITY_MIN_CHUNKS = 2;

/**
 * Non-scored clean-code advisory (Design A). Fires when a function has between
 * {@link TIDY_OPPORTUNITY_MIN_CHUNKS} (2) and {@link BUMPY_ROAD_CHUNK_THRESHOLD} − 1 (3) sequential
 * top-level control-flow chunks: too few to be a (scored) BumpyRoad, but enough that each chunk
 * reads better as a named helper — the "extract each chunk into a named function" nudge.
 *
 * Weight 0 in `SMELL_WEIGHTS`, so it never lowers the score, never blocks `loopComplete`, and is
 * registered in `DERIVED_SMELL_TYPES` (never a refactor-loop target) and `ADVISORY_SMELL_TYPES`
 * (excluded from the gate's regression judgement). Mutually exclusive with BumpyRoad by
 * construction (2–3 here, ≥4 there), so a function is never double-reported.
 *
 * Severity is `'low'` — deliberately NOT a new `'info'` level, because the MCP output schemas
 * constrain severity to exactly {critical, high, medium, low}; an unknown value would fail
 * structured-output validation (-32602) on every call.
 */
export function detectTidyOpportunity(fnNode: Parser.SyntaxNode): Smell | null {
  const chunkRanges = getTopLevelChunkRanges(fnNode);
  if (
    chunkRanges.length < TIDY_OPPORTUNITY_MIN_CHUNKS ||
    chunkRanges.length >= BUMPY_ROAD_CHUNK_THRESHOLD
  ) {
    return null;
  }

  // Mirror BumpyRoad's name resolution: getFunctionName handles TypeScript patterns; for other
  // languages fall back to the 'name' field on the function node.
  const name = getFunctionName(fnNode) !== '<anonymous>'
    ? getFunctionName(fnNode)
    : (fnNode.childForFieldName('name')?.text ?? '<anonymous>');

  return {
    type: 'TidyOpportunity',
    severity: 'low',
    line: fnNode.startPosition.row + 1,
    functionName: name,
    description: `'${name}' has ${chunkRanges.length} sequential control-flow chunks — each one could become a named function. Advisory only: this does not affect the health score or AI-readiness.`,
    suggestion: `Optional clean-code improvement: extract each top-level chunk in '${name}' into a named helper so the function reads as a sequence of named intentions.`,
    chunkRanges,
  };
}
