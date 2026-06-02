// pair: ts-eq-01-recursive-to-iterative
// expected: equivalent
// bugClass: none
// description: factorial: recursive -> iterative. Same result for all n >= 0.
// provenance: scripts/spikes/behavior-equiv/corpus/ts/pairs.mjs

export function before(n: number): number {
  return n <= 1 ? 1 : n * before(n - 1);
}

export function after(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// before(0)==1, after(0)==1; before(5)==120, after(5)==120
