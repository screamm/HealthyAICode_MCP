/**
 * Smell selection and function-lookup helpers for the auto-refactor pipeline.
 * Extracted from auto-refactor-analyzer to keep file size within health thresholds.
 */

import type { Smell, SmellType, FunctionResult } from '../types';
import { SMELL_WEIGHTS } from '../scoring/weights';

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Smell types that are derived or temporal metrics and are never selected as the primary
 * auto-refactor target. Targeting them directly wastes an iteration without moving the score:
 *
 * - LowMaintainability: derived from CC + SLOC; fix ComplexMethod/LargeMethod instead.
 *   Rationale: MI = 171 − 5.2·ln(HV) − 0.23·CC − 10.2·ln(SLOC).
 *
 * - Temporal smells (CodeChurn, DeveloperCongestion, KnowledgeLoss, MethodTemporalCoupling):
 *   reflect git history, not source code content. Code-level refactoring cannot fix them —
 *   they require process/team changes and will resolve naturally over time.
 */
export const DERIVED_SMELL_TYPES = new Set<SmellType>([
  'LowMaintainability',
  'CodeChurn',
  'DeveloperCongestion',
  'KnowledgeLoss',
  'MethodTemporalCoupling',
  // Non-scored clean-code advisory (weight 0). Never a refactor-loop target: there is no
  // score to recover, so targeting it would waste an iteration (rejected by the convergence
  // noise floor anyway). The advisory is surfaced for the human/AI to act on optionally.
  'TidyOpportunity',
]);

/**
 * Returns the highest-priority smell using severity first, then marginal score gain.
 *
 * Marginal gain = w × (√n − √(n-1)) where n = count of that smell type in this file.
 * Because the scoring formula uses √count, fixing the FIRST instance of a smell type
 * returns w (full weight), while fixing a 4th instance returns only ≈0.27w — so one
 * high-weight unique smell is worth more than the same smell type appearing many times.
 * Research: score formula derivation; arXiv 2604.10508 confirms most gains in first pass.
 *
 * Derived metrics (LowMaintainability, temporal smells) are deprioritised — they resolve
 * automatically once their root-cause smells are addressed.
 */
export function pickWorst(smells: Smell[]): Smell | null {
  if (smells.length === 0) return null;

  // Precompute per-type count so we can compute marginal gain for each smell.
  const typeCounts = new Map<string, number>();
  for (const s of smells) typeCounts.set(s.type, (typeCounts.get(s.type) ?? 0) + 1);

  // Marginal gain: fixing one instance reduces the score penalty by w × (√n − √(n-1)).
  const marginalGain = (s: Smell): number => {
    const w = SMELL_WEIGHTS[s.type as SmellType] ?? 0;
    const n = typeCounts.get(s.type) ?? 1;
    return w * (Math.sqrt(n) - Math.sqrt(n - 1));
  };

  const sort = (arr: Smell[]) =>
    [...arr].sort((a, b) => {
      const severityDiff = (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4);
      if (severityDiff !== 0) return severityDiff;
      // Break severity ties by marginal score gain — not raw weight.
      return marginalGain(b) - marginalGain(a);
    });

  // Prefer actionable smells over derived metrics; fall back if only derived smells exist.
  const actionable = smells.filter(s => !DERIVED_SMELL_TYPES.has(s.type as SmellType));
  return sort(actionable.length > 0 ? actionable : smells)[0];
}

/**
 * Groups smells by their type into a `Map<SmellType, Smell[]>`, preserving the input order
 * of instances within each group. Used by the Sprint 54 batcher to compute per-type penalties.
 */
export function groupByType(smells: Smell[]): Map<SmellType, Smell[]> {
  const groups = new Map<SmellType, Smell[]>();
  for (const smell of smells) {
    const existing = groups.get(smell.type);
    if (existing) existing.push(smell);
    else groups.set(smell.type, [smell]);
  }
  return groups;
}

/** Returns the first smell matching the requested type, or the worst smell if none match. */
export function pickByType(smells: Smell[], type: SmellType): Smell | null {
  const matching = smells.filter(s => s.type === type);
  if (matching.length === 0) return null;
  return pickWorst(matching);
}

/** Finds the FunctionResult associated with a smell, matching by functionName or closest line. */
export function findFunction(functions: FunctionResult[], smell: Smell): FunctionResult | null {
  if (functions.length === 0) return null;

  // Prefer an exact name match.
  if (smell.functionName) {
    const exact = functions.find(f => f.name === smell.functionName);
    if (exact) return exact;
  }

  // Fall back to the function whose range contains the smell's line.
  const containing = functions.filter(f => {
    const end = f.line + f.length - 1;
    return smell.line >= f.line && smell.line <= end;
  });
  if (containing.length > 0) {
    // Pick the narrowest (innermost) matching function.
    return containing.sort((a, b) => a.length - b.length)[0];
  }

  // Last resort: function with the closest start line.
  return [...functions].sort((a, b) => Math.abs(a.line - smell.line) - Math.abs(b.line - smell.line))[0];
}
