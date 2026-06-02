// pair: ts-03-dropped-default
// expected: divergent
// bugClass: dropped-default-arg
// description: greet: default parameter `name = 'world'` removed; undefined call yields 'hi undefined'.
// provenance: scripts/spikes/behavior-equiv/corpus/ts/pairs.mjs

export function before(name: string = 'world'): string {
  return `hi ${name}`;
}

export function after(name: string): string {
  // BUG: default removed; caller omitting name gets 'hi undefined'
  return `hi ${name}`;
}

// Divergence witness: before(undefined) === 'hi world', after(undefined) === 'hi undefined'
