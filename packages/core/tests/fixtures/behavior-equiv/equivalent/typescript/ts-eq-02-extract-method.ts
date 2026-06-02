// pair: ts-eq-02-extract-method
// expected: equivalent
// bugClass: none
// description: normalize: extract intermediate step to local const. Semantics identical.
// provenance: scripts/spikes/behavior-equiv/corpus/ts/pairs.mjs

export function before(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '-');
}

export function after(s: string): string {
  const trimmed = s.trim().toLowerCase();
  return trimmed.replace(/\s+/g, '-');
}

// Functionally identical for all strings.
