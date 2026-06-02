// pair: ts-10-exception-swallow
// expected: divergent
// bugClass: exception-handling
// description: parseNum: catch now returns 0 instead of re-throwing; error silently swallowed.
// provenance: arXiv:2602.15761 pattern — changed exception propagation

export function before(s: string): number {
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Not a number: ${s}`);
  return n;
}

export function after(s: string): number {
  try {
    const n = Number(s);
    if (Number.isNaN(n)) throw new Error(`Not a number: ${s}`);
    return n;
  } catch {
    // BUG: swallows the parse error and returns silent sentinel 0
    return 0;
  }
}

// Divergence witness: before('abc') throws Error, after('abc') returns 0
