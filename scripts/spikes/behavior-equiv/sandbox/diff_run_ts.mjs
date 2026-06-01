// Differential-execution sandbox for TS/JS before/after pairs.
//
// Honest design (mirrors the Python runner):
//   * Input synthesis is driven ONLY by argSpec (shape inferred from `before`).
//     The runner never inspects the bug or expected outputs.
//   * Nondeterminism neutralized: a single seeded PRNG drives input synthesis;
//     Date.now / Math.random are frozen identically for both sides.
//   * Observable behavior = return value OR thrown error name. Divergence on
//     either => DIVERGENCE.
//
// Output: JSON to stdout keyed by pair id.

import { pairs } from '../corpus/ts/pairs.mjs';

const SEED = 1337;
const N_INPUTS = 2000;

// Deterministic PRNG (mulberry32) so input synthesis is reproducible.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }

function synthValue(tok, rng) {
  switch (tok) {
    case 'int': return randInt(rng, -50, 50);
    // boundary-aware synthesis: small domain so exact edges (x===lo, x===hi) recur,
    // exercising inclusive/exclusive boundary bugs the way the arXiv paper highlights.
    case 'boundaryInt': return randInt(rng, 0, 5);
    case 'intOrZero': return [0, 0, randInt(rng, -5, 5), randInt(rng, 1, 30)][randInt(rng, 0, 3)];
    case 'smallNonNegInt': return randInt(rng, 0, 8);
    case 'intArr': { const n = randInt(rng, 0, 8); return Array.from({ length: n }, () => randInt(rng, -20, 20)); }
    case 'strArr': { const n = randInt(rng, 0, 5); const c = ['a', 'b', 'c', '']; return Array.from({ length: n }, () => c[randInt(rng, 0, 3)]); }
    case 'str': return ['', 'x', 'Hello World', '  pad  ', 'a b c'][randInt(rng, 0, 4)];
    case 'strOrUndef': return [undefined, '', 'name'][randInt(rng, 0, 2)];
    default: throw new Error(`unknown spec token ${tok}`);
  }
}

function synthArgs(argSpec, rng) { return argSpec.map((tok) => synthValue(tok, rng)); }

// Freeze nondeterminism: identical environment for both sides.
function freeze() {
  Date.now = () => 1_700_000_000_000;
  let s = 99;
  Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}

function observe(fn, args) {
  try {
    const r = fn(...structuredClone(args));
    return { kind: 'value', v: r };
  } catch (e) {
    return { kind: 'error', v: e && e.name ? e.name : String(e) };
  }
}

function eq(a, b) {
  if (a.kind !== b.kind) return false;
  return JSON.stringify(a.v) === JSON.stringify(b.v);
}

function diffPair(pair) {
  const rng = mulberry32(SEED);
  let checked = 0;
  for (let i = 0; i < N_INPUTS; i++) {
    const args = synthArgs(pair.argSpec, rng);
    freeze();
    const ob = observe(pair.before, args);
    freeze();
    const oa = observe(pair.after, args);
    checked++;
    if (!eq(ob, oa)) {
      return { verdict: 'DIVERGENCE', checked, firstCounterexample: { args, before: ob, after: oa } };
    }
  }
  return { verdict: 'EQUIVALENT', checked, firstCounterexample: null };
}

const out = {};
for (const [pid, pair] of Object.entries(pairs)) {
  try {
    out[pid] = diffPair(pair);
  } catch (e) {
    out[pid] = { verdict: 'UNVERIFIED', checked: 0, error: String(e) };
  }
}
process.stdout.write(JSON.stringify(out));
