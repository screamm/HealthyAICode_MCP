// pair: ts-eq-03-switch-to-map
// expected: equivalent
// bugClass: none
// description: classify: switch statement replaced by ternary chain. Semantics identical.
// provenance: scripts/spikes/behavior-equiv/corpus/ts/pairs.mjs

export function before(n: number): string {
  switch (true) {
    case n < 0: return 'neg';
    case n === 0: return 'zero';
    default: return 'pos';
  }
}

export function after(n: number): string {
  return n < 0 ? 'neg' : n === 0 ? 'zero' : 'pos';
}

// Same output for all integers.
