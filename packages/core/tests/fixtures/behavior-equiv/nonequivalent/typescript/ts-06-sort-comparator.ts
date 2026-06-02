// pair: ts-06-sort-comparator
// expected: divergent
// bugClass: comparator-sign-swap
// description: topTwo: (y-x) becomes (x-y) flipping sort to ascending; wrong top-2 returned.
// provenance: scripts/spikes/behavior-equiv/corpus/ts/pairs.mjs

export function before(a: number[]): number[] {
  // Descending sort, take first two
  return [...a].sort((x, y) => y - x).slice(0, 2);
}

export function after(a: number[]): number[] {
  // BUG: comparator sign flipped -> ascending -> returns two smallest, not two largest
  return [...a].sort((x, y) => x - y).slice(0, 2);
}

// Divergence witness: before([3,1,4,1,5,9]) === [9,5], after([3,1,4,1,5,9]) === [1,1]
