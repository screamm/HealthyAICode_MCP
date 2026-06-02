// pair: ts-04-integer-truncation
// expected: divergent
// bugClass: integer-truncation
// description: avg: Math.floor() truncates midpoints and negatives.
// provenance: scripts/spikes/behavior-equiv/corpus/ts/pairs.mjs

export function before(a: number, b: number): number {
  return (a + b) / 2;
}

export function after(a: number, b: number): number {
  // BUG: floor truncates — (3+4)/2=3.5 becomes 3; (-3-1)/2=-2.0 becomes -2
  return Math.floor((a + b) / 2);
}

// Divergence witness: before(3, 4) === 3.5, after(3, 4) === 3
