// pair: ts-eq-08-clamp-boundary
// expected: equivalent
// bugClass: none
// description: clamp: x >= hi vs x > hi — at x===hi both branches return hi. Provably equivalent.
// provenance: scripts/spikes/behavior-equiv/corpus/ts/pairs.mjs (ts-clamp-boundary, relabelled TN)
// note: This pair is deliberately tricky — the condition looks like a boundary bug but is not.
//       At x === hi: before returns hi (x >= hi fires), after returns hi (x > hi misses, but x
//       is not < lo, so falls through to `return x` which is hi). Same result.

export function before(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x >= hi) return hi;
  return x;
}

export function after(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

// before(10, 0, 10) === 10, after(10, 0, 10) === 10 (after falls to `return x` which is 10)
// No divergence exists for any (x, lo, hi) with lo <= hi.
