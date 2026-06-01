// TS/JS before/after pairs. `argSpec` declares the shape of each argument so the
// harness can SYNTHESIZE characterization inputs (it does not see hand-written cases).
// argSpec types: 'int' (small int incl negatives/zeros), 'intArr', 'strArr', 'str', 'numKeyMissing'.

export const pairs = {
  'ts-clamp-boundary': {
    // RELABELLED equivalent: > vs >= both return hi at x===hi. Kept as TN.
    fn: 'clamp',
    argSpec: ['int', 'int', 'int'],
    before: (x, lo, hi) => { if (x < lo) return lo; if (x >= hi) return hi; return x; },
    after: (x, lo, hi) => { if (x < lo) return lo; if (x > hi) return hi; return x; },
  },
  'ts-inrange-boundary': {
    // GENUINE boundary break: inclusive vs exclusive upper bound.
    fn: 'inRange',
    argSpec: ['boundaryInt', 'int', 'boundaryInt'],
    before: (x, lo, hi) => x >= lo && x <= hi,
    // BUG: <= becomes < so the exact upper boundary is now excluded
    after: (x, lo, hi) => x >= lo && x < hi,
  },
  'ts-sum-offbyone': {
    fn: 'sumRange',
    argSpec: ['intArr'],
    before: (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; },
    // BUG: drops last element
    after: (a) => { let s = 0; for (let i = 0; i < a.length - 1; i++) s += a[i]; return s; },
  },
  'ts-default-arg': {
    fn: 'greet',
    argSpec: ['strOrUndef'],
    before: (name = 'world') => `hi ${name}`,
    // BUG: drops default
    after: (name) => `hi ${name}`,
  },
  'ts-int-div': {
    fn: 'avg',
    argSpec: ['int', 'int'],
    before: (a, b) => (a + b) / 2,
    // BUG: floor introduces truncation
    after: (a, b) => Math.floor((a + b) / 2),
  },
  'ts-short-circuit': {
    fn: 'pickLabel',
    argSpec: ['intOrZero', 'str'],
    before: (val, fallback) => (val ?? fallback),
    // BUG: || treats 0 as missing
    after: (val, fallback) => (val || fallback),
  },
  'ts-sort-mutate': {
    fn: 'topTwo',
    argSpec: ['intArr'],
    before: (a) => [...a].sort((x, y) => y - x).slice(0, 2),
    // BUG: comparator sign flipped -> ascending, wrong top
    after: (a) => [...a].sort((x, y) => x - y).slice(0, 2),
  },
  'ts-empty-edge': {
    fn: 'firstOr',
    argSpec: ['intArr', 'int'],
    before: (a, d) => (a.length === 0 ? d : a[0]),
    // BUG: drops empty guard -> returns undefined on []
    after: (a, d) => a[0],
  },
  'ts-rename-eq': {
    fn: 'factorial',
    argSpec: ['smallNonNegInt'],
    before: (n) => (n <= 1 ? 1 : n * factorialRef(n - 1)),
    after: (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; },
  },
  'ts-extract-eq': {
    fn: 'normalize',
    argSpec: ['str'],
    before: (s) => s.trim().toLowerCase().replace(/\s+/g, '-'),
    after: (s) => { const t = s.trim().toLowerCase(); return t.replace(/\s+/g, '-'); },
  },
  'ts-guard-eq': {
    fn: 'classify',
    argSpec: ['int'],
    before: (n) => { switch (true) { case n < 0: return 'neg'; case n === 0: return 'zero'; default: return 'pos'; } },
    after: (n) => (n < 0 ? 'neg' : n === 0 ? 'zero' : 'pos'),
  },
};

function factorialRef(n) { return n <= 1 ? 1 : n * factorialRef(n - 1); }
