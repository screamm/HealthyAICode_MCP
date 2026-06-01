import type { Smell, SmellType } from '../types';
import { SMELL_WEIGHTS } from './weights';

/**
 * Co-occurrence multiplier for cohesion/size smell pairs (Sprint 56).
 *
 * The additive model `score = 10 − Σ(weight × √count)` treats `GodClass` and `BrainMethod`
 * on the same file as independent. Imran et al. (IET Software, 2025,
 * https://ietresearch.onlinelibrary.wiley.com/doi/full/10.1049/sfw2/5579438) show that the
 * *co-occurrence* of cohesion/size smell pairs has a significant joint effect on the
 * cohesion and size dimensions relevant to exactly the GodClass+BrainMethod pair.
 *
 * When a file contains at least one smell of each member of a cohesion/size pair, we apply a
 * conservative 1.2× multiplier to the **heavier** member's weight contribution. The lighter
 * member is unchanged. The effect is applied at most once per file (the strongest activated
 * pair wins, see {@link coOccurrenceMultiplier}) to avoid the compounding `1.2ⁿ` blow-up that
 * would result from naïvely stacking multipliers across multiple pairs.
 *
 * This module is a **pure** transformation over a smell list — it does NOT mutate smells and
 * is NOT yet wired into the scorer. Consumers obtain a `Map<SmellType, number>` of per-type
 * weight multipliers and apply them multiplicatively on top of the base/calibrated weights.
 */

/** Conservative multiplier applied to the heavier member of an activated cohesion/size pair. */
export const CO_OCCURRENCE_MULTIPLIER = 1.2;

/**
 * Hard ceiling on the *effective* weight of any smell after the co-occurrence multiplier,
 * expressed as a factor of its original weight. Prevents extreme outcomes when the
 * multiplier interacts with calibrated weights (Sprint 56 risk note 4).
 */
export const CO_OCCURRENCE_MAX_FACTOR = 1.3;

/**
 * Cohesion/size smell pairs whose co-occurrence in one file warrants the multiplier.
 * Designed for easy extension — add tuples as new joint-effect pairs are empirically validated.
 */
export const COHESION_SIZE_PAIRS: ReadonlyArray<readonly [SmellType, SmellType]> = [
  ['GodClass', 'BrainMethod'],
] as const;

/** Returns the heavier of two smell types by base weight (ties → first argument). */
function heavierOf(a: SmellType, b: SmellType): SmellType {
  return SMELL_WEIGHTS[b] > SMELL_WEIGHTS[a] ? b : a;
}

/**
 * Computes per-`SmellType` weight multipliers for the smells present in a single file.
 *
 * Returns a `Map<SmellType, number>` containing an entry for every type that appears in
 * `smells`. Each value defaults to `1.0`; a type receives `CO_OCCURRENCE_MULTIPLIER` (1.2)
 * when it is the heavier member of an activated cohesion/size pair (i.e. both members of the
 * pair are present in the file). At most one type is multiplied — the heavier member of the
 * strongest activated pair (by that member's base weight). Types absent from `smells` are not
 * included in the map, so callers can treat a missing key as a 1.0 multiplier.
 *
 * Pure: does not read or mutate anything outside its arguments and the static weight table.
 */
export function coOccurrenceMultiplier(smells: Smell[]): Map<SmellType, number> {
  const present = new Set<SmellType>();
  for (const s of smells) present.add(s.type);

  const result = new Map<SmellType, number>();
  for (const t of present) result.set(t, 1.0);

  let bestTarget: SmellType | null = null;
  for (const [a, b] of COHESION_SIZE_PAIRS) {
    if (!present.has(a) || !present.has(b)) continue;
    const target = heavierOf(a, b);
    if (bestTarget === null || SMELL_WEIGHTS[target] > SMELL_WEIGHTS[bestTarget]) {
      bestTarget = target;
    }
  }

  if (bestTarget !== null) {
    result.set(bestTarget, CO_OCCURRENCE_MULTIPLIER);
  }

  return result;
}

/**
 * Convenience helper: applies {@link coOccurrenceMultiplier} to a base weight map, returning
 * a new map of *effective* weights. The original `weights` map is not mutated. Each effective
 * weight is clamped to `originalWeight × CO_OCCURRENCE_MAX_FACTOR` to bound interaction with
 * calibrated weights.
 *
 * @param smells   Smells present in the file (drives which types get multiplied).
 * @param weights  Base or calibrated weight per smell type (defaults to {@link SMELL_WEIGHTS}).
 */
export function applyCoOccurrenceToWeights(
  smells: Smell[],
  weights: Record<SmellType, number> = SMELL_WEIGHTS,
): Map<SmellType, number> {
  const multipliers = coOccurrenceMultiplier(smells);
  const effective = new Map<SmellType, number>();
  for (const [type, mult] of multipliers) {
    const base = weights[type];
    const scaled = base * mult;
    const ceiling = base * CO_OCCURRENCE_MAX_FACTOR;
    effective.set(type, Math.min(scaled, ceiling));
  }
  return effective;
}
