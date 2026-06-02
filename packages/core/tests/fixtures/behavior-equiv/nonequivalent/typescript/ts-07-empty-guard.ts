// pair: ts-07-empty-guard
// expected: divergent
// bugClass: dropped-edge-case
// description: firstOr: empty-array guard removed; returns undefined instead of default on [].
// provenance: scripts/spikes/behavior-equiv/corpus/ts/pairs.mjs

export function before(a: number[], d: number): number {
  return a.length === 0 ? d : a[0];
}

export function after(a: number[], d: number): number | undefined {
  // BUG: no guard — a[0] is undefined on empty array, ignoring default d
  return a[0];
}

// Divergence witness: before([], 42) === 42, after([], 42) === undefined
