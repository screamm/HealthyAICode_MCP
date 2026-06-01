/**
 * Sprint 54 — Batching of the heaviest smell type.
 *
 * The scoring formula penalises a smell type by `weight × √count`, so the marginal
 * gain of fixing the n-th instance is `weight × (√n − √(n-1))` — a diminishing-returns
 * curve. Fixing ALL instances of one type in a single pass therefore recovers the most
 * score per pass (e.g. clearing N=3 ComplexMethod recovers `1.5 × √3 ≈ 2.6` vs. `1.5`
 * for a single one). `batchTopSmellType()` selects the type with the highest total
 * penalty `w × √n`, then ranks every instance of that type by descending marginal delta.
 *
 * Research: √count score-formula derivation; GitHub Copilot's move to clustered
 * multi-line fixes reported measurable acceptance gains
 * (https://github.blog/ai-and-ml/github-copilot/60-million-copilot-code-reviews-and-counting/).
 */

import type { Smell, SmellType, FunctionResult } from '../types';
import { SMELL_WEIGHTS } from '../scoring/weights';
import { findFunction, DERIVED_SMELL_TYPES, groupByType } from './smell-picker';

/** A single ranked instance within a batched smell plan. */
export interface BatchedInstance {
  /** The smell instance to fix. */
  smell: Smell;
  /** The function the smell belongs to (best-effort match; null when unresolved). */
  fn: FunctionResult | null;
  /** Marginal score recovered by fixing this instance: `w × (√rank − √(rank-1))`. */
  marginalDelta: number;
  /** 1-based fix order: rank 1 recovers the most, the last recovers the least. */
  rank: number;
}

/** A batched plan: every instance of the single heaviest smell type, ranked by marginal delta. */
export interface BatchedSmellPlan {
  /** The smell type chosen for batching (highest total `w × √n`). */
  smellType: SmellType;
  /** Every instance of `smellType`, ordered by descending marginalDelta (rank 1 first). */
  instances: BatchedInstance[];
  /** Total recoverable score for this type: `w × √n`. */
  totalPredictedDelta: number;
}

/** Total penalty a smell type contributes to the score: `weight × √count`. */
function typePenalty(type: SmellType, count: number): number {
  const weight = SMELL_WEIGHTS[type] ?? 0;
  return weight * Math.sqrt(count);
}

/** Marginal score recovered by fixing the rank-th instance: `weight × (√rank − √(rank-1))`. */
function marginalDeltaAt(type: SmellType, rank: number): number {
  const weight = SMELL_WEIGHTS[type] ?? 0;
  return weight * (Math.sqrt(rank) - Math.sqrt(rank - 1));
}

/** Selects the smell type with the highest total penalty among actionable groups. */
function pickHeaviestType(groups: Map<SmellType, Smell[]>): SmellType | null {
  let best: SmellType | null = null;
  let bestPenalty = -Infinity;
  for (const [type, instances] of groups) {
    if (DERIVED_SMELL_TYPES.has(type)) continue;
    const penalty = typePenalty(type, instances.length);
    if (penalty > bestPenalty) {
      bestPenalty = penalty;
      best = type;
    }
  }
  return best;
}

/**
 * Groups smells by type, picks the type with the highest total penalty `w × √n`,
 * and returns every instance of that type ranked by descending marginal delta.
 *
 * Returns an empty plan (`instances: []`) when there are no actionable smells.
 */
export function batchTopSmellType(smells: Smell[], functions: FunctionResult[]): BatchedSmellPlan {
  const groups = groupByType(smells);

  // Prefer actionable smells; fall back to all groups only if nothing actionable exists.
  let topType = pickHeaviestType(groups);
  if (topType === null) {
    // All groups are derived/temporal — pick the highest-penalty one so the plan is non-empty.
    let bestPenalty = -Infinity;
    for (const [type, instances] of groups) {
      const penalty = typePenalty(type, instances.length);
      if (penalty > bestPenalty) {
        bestPenalty = penalty;
        topType = type;
      }
    }
  }

  if (topType === null) {
    return { smellType: 'ComplexMethod', instances: [], totalPredictedDelta: 0 };
  }

  const ofType = groups.get(topType) ?? [];
  const instances: BatchedInstance[] = ofType.map((smell, index) => {
    const rank = index + 1;
    return {
      smell,
      fn: findFunction(functions, smell),
      marginalDelta: marginalDeltaAt(topType as SmellType, rank),
      rank,
    };
  });

  // Already descending by construction (√rank − √(rank-1) shrinks as rank grows),
  // but sort explicitly so the contract holds regardless of input ordering.
  instances.sort((a, b) => b.marginalDelta - a.marginalDelta);
  // Re-assign ranks after sorting so rank 1 is always the highest-delta instance.
  instances.forEach((instance, index) => {
    instance.rank = index + 1;
  });

  return {
    smellType: topType,
    instances,
    totalPredictedDelta: typePenalty(topType, ofType.length),
  };
}
