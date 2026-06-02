// pair: ts-impure-fs
// expected: unverified (impure — filesystem IO)
// description: readConfig reads from disk; not self-contained, so differential execution
//              cannot soundly compare before/after. The engine must DECLINE (unverified)
//              rather than execute and produce a false pass/divergence.
// provenance: FIX 1 purity-gate fixture (behaviour-equivalence hardening)

import { readFileSync } from 'node:fs';

export function before(path: string): number {
  const raw = readFileSync(path, 'utf8');
  return raw.length;
}

export function after(path: string): number {
  const raw = readFileSync(path, 'utf8');
  return raw.trim().length;
}
