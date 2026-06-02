// pair: ts-eq-07-rename-internal
// expected: equivalent
// bugClass: none
// description: buildSlug: internal variable `tmp` renamed to `cleaned`. Pure rename, behavior unchanged.
// provenance: arXiv:2602.15761 rename class

export function before(s: string): string {
  const tmp = s.trim().toLowerCase();
  return tmp.replace(/\s+/g, '-');
}

export function after(s: string): string {
  const cleaned = s.trim().toLowerCase();
  return cleaned.replace(/\s+/g, '-');
}

// Identical: only the local variable name changed.
