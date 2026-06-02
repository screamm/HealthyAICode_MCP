// pair: ts-eq-04-for-to-foreach
// expected: equivalent
// bugClass: none
// description: sumArray: for-loop replaced by reduce(). Same result for finite numeric arrays.
// provenance: arXiv:2602.15761 loop-to-higher-order class

export function before(a: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}

export function after(a: number[]): number {
  return a.reduce((acc, v) => acc + v, 0);
}

// Identical for all finite numeric arrays including empty (both return 0).
