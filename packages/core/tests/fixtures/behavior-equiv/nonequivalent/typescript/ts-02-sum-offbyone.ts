// pair: ts-02-sum-offbyone
// expected: divergent
// bugClass: off-by-one
// description: sumRange: loop `i < a.length - 1` drops last element.
// provenance: scripts/spikes/behavior-equiv/corpus/ts/pairs.mjs

export function before(a: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}

export function after(a: number[]): number {
  // BUG: a.length - 1 skips last element
  let s = 0;
  for (let i = 0; i < a.length - 1; i++) s += a[i];
  return s;
}

// Divergence witness: before([1,2,3]) === 6, after([1,2,3]) === 3
