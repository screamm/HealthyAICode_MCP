// pair: ts-09-mutation-vs-copy
// expected: divergent
// bugClass: mutation-vs-immutable
// description: addItem: spread-copy replaced by push; mutates caller's array.
// provenance: arXiv:2502.18454 finding — LLM changes immutable operation to mutation

export function before(arr: number[], item: number): number[] {
  // Correct: returns new array, does not mutate input
  return [...arr, item];
}

export function after(arr: number[], item: number): number[] {
  // BUG: push mutates arr in place; caller's array is modified as a side effect
  arr.push(item);
  return arr;
}

// Divergence witness:
//   const a = [1, 2]; before(a, 3); a === [1, 2]  (unchanged)
//   const a = [1, 2]; after(a, 3);  a === [1, 2, 3]  (mutated)
