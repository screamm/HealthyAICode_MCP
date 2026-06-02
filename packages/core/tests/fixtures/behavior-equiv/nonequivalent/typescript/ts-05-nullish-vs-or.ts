// pair: ts-05-nullish-vs-or
// expected: divergent
// bugClass: falsy-coercion
// description: pickLabel: ?? replaced by || so 0 and '' fall through to fallback.
// provenance: scripts/spikes/behavior-equiv/corpus/ts/pairs.mjs

export function before(val: number | null | undefined, fallback: string): number | string {
  // Correct: only null/undefined triggers fallback
  return val ?? fallback;
}

export function after(val: number | null | undefined, fallback: string): number | string {
  // BUG: || also triggers for 0 — numeric zero gets replaced by fallback string
  return val || fallback;
}

// Divergence witness: before(0, 'none') === 0, after(0, 'none') === 'none'
