/**
 * Sprint 54 — Pre-Act whole-file planning.
 *
 * Pre-Act (arXiv 2505.09970, May 2025) generates a whole-file plan BEFORE invoking any
 * tool, then refines it after each observation; on the Almita benchmark a Pre-Act Llama-70B
 * reached 82% goal completion vs. 32% for ReAct GPT-4. This module builds the structural,
 * deterministic analogue: it analyses the file once and emits an ordered plan
 * (smell priority, predicted score delta, fix strategy per function) that the refactoring
 * loop can follow, reducing mid-loop correction iterations.
 *
 * The plan is deterministic (smell-weight × √count → marginalDelta), not an extra LLM call:
 * reproducible, zero added latency, and orderable by the diminishing-returns √count curve.
 */

import type { Smell, SmellType, FunctionResult, Language } from '../types';
import { SMELL_WEIGHTS } from '../scoring/weights';
import { analyzeCode } from '../index';
import { findFunction, DERIVED_SMELL_TYPES } from './smell-picker';
import { getRefactoringTemplate, type RefactoringStrategy } from './smell-instructions';

/** A single planned refactoring step targeting one smell on one function. */
export interface PreActStep {
  /** The function this step refactors (best-effort; '<file>' when no function resolves). */
  functionName: string;
  /** The smell type addressed by this step. */
  smellType: SmellType;
  /** Predicted score recovered by this step: `weight × (√n − √(n-1))` for its rank in the type. */
  marginalDelta: number;
  /** The recommended refactoring strategy for the smell. */
  strategy: RefactoringStrategy;
  /** One-line rationale describing why this step is ordered where it is. */
  rationale: string;
}

/** Whole-file plan produced before the first auto-refactor call. */
export interface PreActPlan {
  /** Ordered steps, descending by marginalDelta (highest-impact first). */
  steps: PreActStep[];
  /** Sum of all step marginalDeltas — an upper bound on recoverable score this pass. */
  totalPredictedDelta: number;
  /** The single heaviest smell type (highest total `w × √n`); the loop's primary target. */
  primarySmellType: SmellType;
}

/** Marginal score recovered by fixing the rank-th instance of a type: `w × (√rank − √(rank-1))`. */
function marginalDeltaAt(type: SmellType, rank: number): number {
  const weight = SMELL_WEIGHTS[type] ?? 0;
  return weight * (Math.sqrt(rank) - Math.sqrt(rank - 1));
}

/** Resolves the refactoring strategy for a smell, falling back to extract_method on failure. */
function strategyFor(smell: Smell, fn: FunctionResult | null): RefactoringStrategy {
  if (fn === null) return 'extract_method';
  try {
    return getRefactoringTemplate(smell, fn, '').strategy;
  } catch {
    return 'extract_method';
  }
}

/** Picks the smell type with the highest total penalty `w × √n` among actionable smells. */
function pickPrimaryType(smells: Smell[]): SmellType {
  const counts = new Map<SmellType, number>();
  for (const s of smells) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);

  let best: SmellType | null = null;
  let bestPenalty = -Infinity;
  for (const [type, count] of counts) {
    if (DERIVED_SMELL_TYPES.has(type)) continue;
    const penalty = (SMELL_WEIGHTS[type] ?? 0) * Math.sqrt(count);
    if (penalty > bestPenalty) {
      bestPenalty = penalty;
      best = type;
    }
  }
  // Fall back to the first smell's type if every smell is derived/temporal.
  return best ?? smells[0].type;
}

/**
 * Builds a whole-file Pre-Act plan from a single `analyzeCode()` pass.
 *
 * Steps are one per actionable smell, each carrying the marginal score delta for its rank
 * within its smell type, the recommended strategy, and a rationale. Steps are sorted
 * descending by marginalDelta so the highest-impact fix runs first.
 *
 * Acceptance: for `unhealthy/pre-act-multi-smell.ts`, `steps.length >= 3` and
 * `steps[0].smellType` is `ComplexMethod` or `BrainMethod`.
 */
export function buildPreActPlan(code: string, language: Language, filePath: string): PreActPlan {
  const health = analyzeCode(code, language, filePath);
  const { smells, functions } = health;

  // Only actionable smells become steps; derived/temporal metrics are skipped (the loop
  // cannot fix them by editing source). Fall back to all smells if none are actionable.
  const actionable = smells.filter(s => !DERIVED_SMELL_TYPES.has(s.type));
  const planned = actionable.length > 0 ? actionable : smells;

  if (planned.length === 0) {
    return { steps: [], totalPredictedDelta: 0, primarySmellType: 'ComplexMethod' };
  }

  const primarySmellType = pickPrimaryType(planned);

  // Track per-type rank so each instance's marginalDelta reflects its position on the √ curve.
  const rankByType = new Map<SmellType, number>();
  const steps: PreActStep[] = planned.map(smell => {
    const rank = (rankByType.get(smell.type) ?? 0) + 1;
    rankByType.set(smell.type, rank);
    const fn = findFunction(functions, smell);
    const marginalDelta = marginalDeltaAt(smell.type, rank);
    const functionName = fn?.name ?? smell.functionName ?? '<file>';
    const strategy = strategyFor(smell, fn);
    return {
      functionName,
      smellType: smell.type,
      marginalDelta,
      strategy,
      rationale:
        `Fix ${smell.type} #${rank} in '${functionName}' via ${strategy}; ` +
        `marginal score gain ${marginalDelta.toFixed(2)} (rank ${rank} on the √count curve).`,
    };
  });

  steps.sort((a, b) => b.marginalDelta - a.marginalDelta);

  const totalPredictedDelta = steps.reduce((sum, step) => sum + step.marginalDelta, 0);

  return { steps, totalPredictedDelta, primarySmellType };
}
