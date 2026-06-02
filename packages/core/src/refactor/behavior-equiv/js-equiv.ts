/**
 * js-equiv.ts — TS/JS golden-master + property differential behaviour-equivalence engine.
 *
 * Part of the behaviour-equivalence verification layer (win-by-margin strategy,
 * `claudedocs/2026-06-01-win-by-margin.md`). This module answers ONE narrow question
 * for a single self-contained TS/JS function pair:
 *
 *   "Given a `before` function and an `after` (refactored) function with the same
 *    signature, do they produce the same observable behaviour across many synthesized
 *    inputs — or did the refactor silently change semantics?"
 *
 * It is the dynamic counterpart to the (advisory) static-equivalence check. Motivation:
 * arXiv:2602.15761 reports LLM refactorings are 19–35% functionally non-equivalent and
 * ~21% of those breaks are missed by existing test suites. A differential-fuzzing golden
 * master catches breaks that an absent/weak test suite would miss.
 *
 * ## Method (mirrors the proven spike at scripts/spikes/behavior-equiv/, GO verdict
 * 2026-06-01: 100% detection / 0% false-positive on the labelled corpus)
 *
 *   1. Both `before` and `after` source are transpiled (TS → JS, type annotations and
 *      modern syntax lowered) and evaluated inside a sandboxed `node:vm` context with a
 *      frozen, deterministic global environment.
 *   2. Inputs are SYNTHESIZED from a single seeded PRNG (mulberry32), never from the
 *      refactor's expected output. Generation is boundary-biased (0, ±1, min/max,
 *      empty/singleton arrays, '', null/undefined) because uniform random under-samples
 *      the exact edges where boundary/off-by-one bugs live — a lesson the spike learned
 *      the hard way (its first run missed an inclusive/exclusive boundary bug).
 *   3. Nondeterminism is neutralized identically for both sides: `Date.now`, `Date`,
 *      `Math.random`, `performance.now` are pinned to the same frozen values, so a
 *      divergence is a genuine semantic difference and never clock/RNG noise.
 *   4. Observable behaviour = the deep-cloned return value OR the thrown error's name.
 *      A value-vs-throw mismatch is a divergence. Floats are compared with a small
 *      relative+absolute tolerance; NaN===NaN and ±0 are normalized; functions/symbols
 *      and other non-JSON values are canonicalized so structural equality is meaningful.
 *
 * ## Honest scope (do NOT overclaim)
 *
 *   - Scope is PURE, self-contained TS/JS functions whose arguments are primitives /
 *     arrays / plain objects. It does not synthesize closures, class instances, network,
 *     DB, or filesystem effects. For those, fall back to "static-equivalence only
 *     (advisory)".
 *   - A verdict of `equivalent` means "no divergence found within `runs` synthesized
 *     inputs" — it is differential evidence, NOT a proof of equivalence.
 *   - This module covers TS/JS only. The other ~44 languages are NOT proven safe by it.
 *
 * Generators here are a self-contained seeded PRNG rather than `fast-check`, to keep the
 * production `@healthy-ai-code/core` package free of an extra runtime dependency. A
 * fast-check-backed generator (with shrinking of the diverging input) is a clean future
 * enhancement and can be swapped in behind {@link CheckJsEquivalenceOptions}.
 */

import vm from 'node:vm';

/** Final verdict for a before/after pair. */
export type EquivVerdict =
  | 'equivalent' // no divergence found within the synthesized input budget
  | 'divergent' // at least one synthesized input produced differing observable behaviour
  | 'unverified'; // the pair could not be evaluated (compile/load error, unsupported shape)

/** One observed outcome of running a function on a single input vector. */
interface Observation {
  readonly kind: 'value' | 'throw';
  /** Canonicalized JSON-ish snapshot of the return value, or the thrown error's name. */
  readonly snapshot: string;
  /** Raw value retained for float-tolerant comparison and reporting. */
  readonly raw: unknown;
  /** True when the RAW return value was a thenable (distinguishes T from Promise<T>,
   *  i.e. catches a dropped `await`). */
  readonly thenable: boolean;
}

/** A diverging input together with both sides' outcomes. */
export interface DivergingInput {
  /** The synthesized argument vector that triggered divergence (raw values; note that
   *  `NaN`/`undefined` survive here but collapse to `null` under JSON.stringify — see
   *  `argsText` for a faithful rendering). */
  readonly args: readonly unknown[];
  /** Faithful, NaN/undefined/Infinity-preserving textual rendering of `args`. */
  readonly argsText: string;
  readonly before: { kind: 'value' | 'throw'; value: unknown; text: string };
  readonly after: { kind: 'value' | 'throw'; value: unknown; text: string };
}

/** Result of {@link checkJsEquivalence}. */
export interface JsEquivResult {
  readonly verdict: EquivVerdict;
  /** Number of synthesized inputs actually executed against both sides. */
  readonly checked: number;
  /** Present iff verdict === 'divergent'. */
  readonly divergingInput?: DivergingInput;
  /** Human-readable explanation of the verdict. */
  readonly detail: string;
}

/** Tuning knobs. All optional; defaults match the spike's proven configuration. */
export interface CheckJsEquivalenceOptions {
  /** Name of the exported function to compare in each source. Default 'before'/'after'. */
  readonly beforeFnName?: string;
  readonly afterFnName?: string;
  /** Number of synthesized inputs to try before declaring equivalence. Default 2000. */
  readonly runs?: number;
  /** Seed for the deterministic input PRNG. Default 1337. */
  readonly seed?: number;
  /** Arity (argument count) to synthesize. Default: inferred from the before function. */
  readonly arity?: number;
  /** Per-call execution timeout in milliseconds inside the vm. Default 1000. */
  readonly timeoutMs?: number;
}

const DEFAULT_RUNS = 2000;
const DEFAULT_SEED = 1337;
const DEFAULT_TIMEOUT_MS = 1000;
const FLOAT_ABS_TOL = 1e-9;
const FLOAT_REL_TOL = 1e-9;

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — identical to the proven spike sandbox.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[randInt(rng, 0, items.length - 1)];
}

// ---------------------------------------------------------------------------
// Type-directed, boundary-biased input synthesis.
//
// The engine receives raw source with no external argSpec, so it INFERS a stable kind
// per parameter (numbers / strings / number-arrays / string-arrays / objects / nullable)
// from (a) TS type annotations when present — the strongest signal — and (b) how the
// parameter is used in the `before` body (numeric ops → number, `.length`/indexing →
// array/string, property access → object). The inferred kind is FIXED for the whole run
// per parameter slot, exactly like the spike's argSpec.
//
// Why type-directed and not a random-kind grab-bag: feeding a string into a function
// written for numbers makes two genuinely-equivalent number formulations diverge
// (`x*3` → NaN vs `x+x+x` → 'xxx'). That is a type-confusion artifact, not a refactoring
// bug, and would produce dishonest false positives. Type-directed synthesis keeps the
// detector honest while still over-sampling boundary values (0, ±1, '', empty/singleton
// arrays, null/undefined) where the dominant LLM-refactor failure classes live.
// ---------------------------------------------------------------------------

type ParamKind = 'number' | 'string' | 'boolean' | 'numberArray' | 'stringArray' | 'object' | 'nullable' | 'any';

const BOUNDARY_INTS: readonly number[] = [0, 1, -1, 2, -2, 5, 10, -10, 100, -100];
const BOUNDARY_STRS: readonly string[] = ['', 'x', 'Hello World', '  pad  ', 'a b c', 'name', 'ABC'];

// Numeric synthesis is INTEGER-DOMAIN by default. Rationale: the dominant LLM-refactor
// bug classes (off-by-one, boundary, truncation, falsy-coercion, comparator-swap,
// dropped-default/guard) all manifest on integers — e.g. `(a+b)/2` vs `Math.floor(...)`
// already diverges on the integer pair [5,4] (4.5 vs 4). Conversely, many genuinely
// equivalent refactorings are only equivalent on their integer domain (recursive vs
// iterative factorial diverges at n=28.75 but is equivalent for all integers). Feeding
// floats to an integer algorithm is a type-domain artifact, not a refactoring bug — the
// same dishonesty as feeding strings to arithmetic. We therefore keep numbers integral by
// default. Float-sensitive functions can be exercised explicitly via options.arity/kinds
// in a future enhancement; this is an honest limitation, not a silent gap.
function synthNumber(rng: () => number): number {
  const r = randInt(rng, 0, 9);
  if (r <= 5) return pick(rng, BOUNDARY_INTS); // 60% boundary-biased small ints
  return randInt(rng, -50, 50); // wider uniform ints
}

function synthString(rng: () => number): string {
  return pick(rng, BOUNDARY_STRS);
}

function synthNumberArray(rng: () => number): number[] {
  const n = pick(rng, [0, 0, 1, 1, 2, 3, 5, 8]); // bias toward empty/singleton edges
  return Array.from({ length: n }, () => synthNumber(rng));
}

function synthStringArray(rng: () => number): string[] {
  const n = pick(rng, [0, 1, 2, 4]);
  return Array.from({ length: n }, () => pick(rng, ['a', 'b', 'c', '']));
}

function synthObject(rng: () => number): object {
  return pick(rng, [{}, { a: 1 }, { a: 0, b: 2 }, { x: null }, { value: 0, name: '' }]);
}

function synthByKind(kind: ParamKind, rng: () => number): unknown {
  switch (kind) {
    case 'number':
      return synthNumber(rng);
    case 'string':
      return synthString(rng);
    case 'boolean':
      return pick(rng, [true, false]);
    case 'numberArray':
      return synthNumberArray(rng);
    case 'stringArray':
      return synthStringArray(rng);
    case 'object':
      return synthObject(rng);
    case 'nullable':
      // nullable slot: over-sample the falsy/nullish edges that drive ?? vs || bugs,
      // mixed with real numbers/strings so the non-null path is exercised too.
      return pick(rng, [null, undefined, 0, '', false, NaN, synthNumber(rng), synthString(rng)]);
    default:
      // 'any' — unknown slot: mixed but type-stable across THIS draw only. Used when no
      // usage signal exists; numbers dominate because they are the commonest scalar.
      return randInt(rng, 0, 3) === 0 ? synthString(rng) : synthNumber(rng);
  }
}

/** A synthesis slot: the inferred value kind plus whether the param had a default value. */
interface ParamSpec {
  readonly kind: ParamKind;
  /** True when the source declared a default (`name = ...`); such slots over-sample
   *  `undefined` so the dropped-default-arg bug class is exercised. */
  readonly defaulted: boolean;
}

function synthArgs(specs: readonly ParamSpec[], rng: () => number): unknown[] {
  return specs.map((s) => {
    // ~40% of draws on a defaulted slot are `undefined` — the input that distinguishes
    // a kept default (`name='world'`) from a dropped one (`name`).
    if (s.defaulted && randInt(rng, 0, 9) < 4) return undefined;
    return synthByKind(s.kind, rng);
  });
}

/**
 * Infer a stable {@link ParamSpec} per parameter from the source. Annotation-driven when
 * a TS type is present; otherwise usage-driven from the function body.
 */
function inferParamSpecs(source: string, fnName: string, arity: number): ParamSpec[] {
  const sig = extractParamList(source, fnName);
  const specs: ParamSpec[] = [];
  for (let i = 0; i < arity; i++) {
    const p = sig[i];
    if (!p) {
      specs.push({ kind: 'any', defaulted: false });
      continue;
    }
    const kind = kindFromAnnotation(p.annotation) ?? kindFromUsage(source, p.name) ?? 'any';
    specs.push({ kind, defaulted: p.defaulted });
  }
  return specs;
}

interface ParamInfo {
  readonly name: string;
  readonly annotation: string | null;
  readonly defaulted: boolean;
}

/** Pull the raw parameter list (names + optional TS annotations) for `fnName`. */
function extractParamList(source: string, fnName: string): ParamInfo[] {
  // Match `function fnName(...)`, `const fnName = (...) =>`, or default-export function.
  const patterns = [
    new RegExp(`function\\s+${escapeRe(fnName)}\\s*\\(([^)]*)\\)`),
    new RegExp(`${escapeRe(fnName)}\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>`),
    new RegExp(`${escapeRe(fnName)}\\s*=\\s*(?:async\\s*)?function\\s*\\(([^)]*)\\)`),
  ];
  if (fnName === 'default') {
    patterns.push(/export\s+default\s+(?:async\s+)?function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/);
  }
  for (const re of patterns) {
    const m = re.exec(source);
    if (m) return parseParams(m[1]);
  }
  return [];
}

function parseParams(raw: string): ParamInfo[] {
  if (!raw.trim()) return [];
  return raw.split(',').map((part) => {
    const trimmed = part.trim();
    const defaulted = /=/.test(trimmed) || /\?\s*:/.test(trimmed) || /\?$/.test(trimmed.replace(/:.*$/, ''));
    const seg = trimmed.replace(/=.*$/, ''); // drop default value
    const colon = seg.indexOf(':');
    if (colon >= 0) {
      return {
        name: seg.slice(0, colon).trim().replace(/[?]/g, ''),
        annotation: seg.slice(colon + 1).trim(),
        defaulted,
      };
    }
    return { name: seg.replace(/[?.]/g, '').trim(), annotation: null, defaulted };
  });
}

function kindFromAnnotation(annotation: string | null): ParamKind | null {
  if (!annotation) return null;
  const a = annotation.toLowerCase();
  const nullable = /null|undefined/.test(a) && /\|/.test(a);
  if (/number\s*\[\s*\]|array<\s*number\s*>/.test(a)) return 'numberArray';
  if (/string\s*\[\s*\]|array<\s*string\s*>/.test(a)) return 'stringArray';
  if (/\[\s*\]|array</.test(a)) return 'numberArray';
  if (nullable && /number/.test(a)) return 'nullable';
  if (/\bnumber\b/.test(a)) return 'number';
  if (/\bstring\b/.test(a)) return 'string';
  if (/\bboolean\b/.test(a)) return 'boolean';
  if (/record<|\{.*\}|object/.test(a)) return 'object';
  return null;
}

/** Heuristic kind inference from how a parameter is used in the source body. */
function kindFromUsage(source: string, name: string): ParamKind | null {
  if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) return null;
  const id = escapeRe(name);
  const has = (re: RegExp): boolean => re.test(source);
  const arrayUse = has(new RegExp(`\\b${id}\\s*\\.\\s*(length|map|filter|reduce|slice|push|sort|forEach|join|indexOf|includes)\\b`))
    || has(new RegExp(`\\b${id}\\s*\\[`))
    || has(new RegExp(`\\[\\s*\\.\\.\\.\\s*${id}\\s*[\\],]`));
  const stringUse = has(new RegExp(`\\b${id}\\s*\\.\\s*(trim|toLowerCase|toUpperCase|charAt|charCodeAt|split|replace|padStart|padEnd|startsWith|endsWith|substring|substr)\\b`));
  const numericUse = has(new RegExp(`\\b${id}\\s*(?:[*/%+\\-]|[<>]=?|===?\\s*\\d|\\+\\+|--)`))
    || has(new RegExp(`[*/%\\-]\\s*${id}\\b`))
    || has(new RegExp(`Math\\.[a-z]+\\([^)]*\\b${id}\\b`));
  const objectUse = has(new RegExp(`\\b${id}\\s*\\.\\s*[A-Za-z_$][\\w$]*`)) && !stringUse && !arrayUse;
  const nullableUse = has(new RegExp(`\\b${id}\\s*(\\?\\?|\\|\\|)`)) || has(new RegExp(`${id}\\s*===?\\s*(null|undefined)`));

  if (arrayUse) {
    // distinguish string vs number element use is hard; default to number array (most common)
    return stringUse ? 'stringArray' : 'numberArray';
  }
  if (stringUse) return 'string';
  if (nullableUse) return 'nullable';
  if (numericUse) return 'number';
  if (objectUse) return 'object';
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// TS → JS lowering. Lazy-loads `typescript` (a build/test dependency) when present so
// the production package carries no hard runtime dep on it; falls back to a minimal
// type-annotation stripper for plain JS / lightly-typed source when it is absent.
// ---------------------------------------------------------------------------

function transpile(source: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ts = require('typescript') as typeof import('typescript');
    const out = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        // keep it permissive: we are transpiling, not type-checking
        noEmitOnError: false,
        isolatedModules: true,
      },
    });
    return out.outputText;
  } catch {
    // Fallback: strip the most common inline type annotations so plain-ish source still
    // loads. This is best-effort; genuinely TS-only syntax will surface as 'unverified'.
    return stripTypesBestEffort(source);
  }
}

function stripTypesBestEffort(source: string): string {
  return (
    source
      // `export ` keyword (we collect exports via the sandboxed `exports` object)
      .replace(/\bexport\s+/g, '')
      // return type annotations: `): T {` → `) {`
      .replace(/\)\s*:\s*[A-Za-z0-9_<>,.\[\]| &]+(\s*\{)/g, ')$1')
      // param type annotations: `name: number` → `name` (conservative, identifiers only)
      .replace(/([(,]\s*[A-Za-z0-9_]+)\s*:\s*[A-Za-z0-9_<>,.\[\]| &]+/g, '$1')
  );
}

// ---------------------------------------------------------------------------
// Sandbox: evaluate transpiled source in a frozen vm context and pull out the function.
// ---------------------------------------------------------------------------

/** Build the deterministic, side-effect-frozen sandbox globals. */
function makeFrozenGlobals(): Record<string, unknown> {
  const FIXED_NOW = 1_700_000_000_000;
  // Seeded LCG for Math.random so both sides observe the identical sequence.
  let s = 0x2545f491;
  const seededRandom = (): number => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  // A Date subclass whose "now" and no-arg construction are pinned.
  class FrozenDate extends Date {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(FIXED_NOW);
      else super(...(args as ConstructorParameters<typeof Date>));
    }
    static now(): number {
      return FIXED_NOW;
    }
  }

  const frozenMath: Math = Object.create(Math) as Math;
  (frozenMath as { random: () => number }).random = seededRandom;

  return {
    Math: frozenMath,
    Date: FrozenDate,
    performance: { now: () => 0 },
    // Common builtins the source might reference. JSON/Array/Object/etc. come from the
    // host realm via vm context globals automatically, but we expose console as a no-op
    // so stray logging in source cannot crash or leak.
    console: { log() {}, error() {}, warn() {}, info() {}, debug() {} },
    module: { exports: {} as Record<string, unknown> },
    exports: {} as Record<string, unknown>,
  };
}

/** Outcome of a single call: the observed result PLUS the post-call argument state. */
interface CallOutcome {
  readonly obs: Observation;
  /** Snapshot of each argument AFTER the call, to surface in-place mutation side effects. */
  readonly postArgs: readonly string[];
}

interface LoadedModule {
  readonly fn: (...args: unknown[]) => unknown;
  /**
   * Re-evaluator: rebuilds a fresh frozen sandbox each call so cross-call state leakage
   * (module-level mutable defaults / accumulators) manifests as divergence. Synchronously
   * SETTLES thenable results (see {@link callInSandbox}) so async/await semantic changes
   * are observable even though this API is synchronous.
   */
  readonly callFresh: (args: unknown[], timeoutMs: number) => CallOutcome;
}

function loadFunction(source: string, fnName: string, timeoutMs: number): LoadedModule {
  const code = transpile(source);
  // The call is performed INSIDE the vm by a generated harness so that async functions can
  // be settled synchronously via `microtaskMode: 'afterEvaluate'`. The harness invokes the
  // captured function; if the result is a thenable it attaches handlers that store the
  // settled value/error into a slot. With `afterEvaluate` microtask draining, a promise
  // that resolves WITHOUT real I/O (the only kind this pure-function engine targets) is
  // settled by the time `runInContext` returns — letting us observe `await`-dropped values
  // without making the whole engine async (the dispatcher consumes a SYNC checkJsEquivalence).
  const bareLookup =
    fnName === 'default'
      ? 'undefined'
      : `(typeof ${fnName} !== 'undefined' ? ${fnName} : undefined)`;
  const captureExpr = `${bareLookup} ?? (exports && exports[${JSON.stringify(fnName)}]) ?? (module && module.exports && module.exports[${JSON.stringify(fnName)}])`;

  // Load script: defines the function and captures it.
  const loadSrc = `${code}\n;globalThis.__captured__ = ${captureExpr};`;
  // Call harness: invokes __captured__ with __args__ and settles the result into __out__.
  const callSrc = `
    (function () {
      var f = globalThis.__captured__;
      globalThis.__out__ = { state: 'pending', kind: null, value: undefined, thenable: false };
      try {
        var r = f.apply(null, globalThis.__args__);
        var isThen = r != null && (typeof r === 'object' || typeof r === 'function') && typeof r.then === 'function';
        if (isThen) {
          // Record that the RAW return was a thenable: a dropped \`await\` changes the
          // return type from T to Promise<T>, an observable behavioural difference. We
          // still resolve it so the resolved payload can also be compared.
          Promise.resolve(r).then(
            function (v) { globalThis.__out__ = { state: 'settled', kind: 'value', value: v, thenable: true }; },
            function (e) { globalThis.__out__ = { state: 'settled', kind: 'throw', value: (e && e.name) || String(e), thenable: true }; }
          );
        } else {
          globalThis.__out__ = { state: 'settled', kind: 'value', value: r, thenable: false };
        }
      } catch (e) {
        globalThis.__out__ = { state: 'settled', kind: 'throw', value: (e && e.name) || String(e), thenable: false };
      }
    })();`;

  let loadScript: vm.Script;
  let callScript: vm.Script;
  try {
    loadScript = new vm.Script(loadSrc, { filename: `${fnName}.load.js` });
    callScript = new vm.Script(callSrc, { filename: `${fnName}.call.js` });
  } catch (e) {
    throw new Error(`compile failed for "${fnName}": ${(e as Error).message}`);
  }

  // Probe once to validate the export resolves to a function.
  const probe = makeFrozenGlobals();
  try {
    loadScript.runInContext(vm.createContext(probe), { timeout: timeoutMs });
  } catch (e) {
    throw new Error(`load failed for "${fnName}": ${(e as Error).message}`);
  }
  const captured = (probe as { __captured__?: unknown }).__captured__;
  if (typeof captured !== 'function') {
    throw new Error(`exported "${fnName}" is not a function (got ${typeof captured})`);
  }

  const callFresh = (args: unknown[], tmo: number): CallOutcome => {
    const sandbox = makeFrozenGlobals();
    // `microtaskMode: 'afterEvaluate'` drains the microtask queue after each script run, so
    // I/O-free promises settle synchronously within runInContext.
    const callCtx = vm.createContext(sandbox, { microtaskMode: 'afterEvaluate' });
    loadScript.runInContext(callCtx, { timeout: tmo });
    // Deep-clone args so neither side observes the other's mutations, yet we still snapshot
    // THIS side's post-call state to detect in-place mutation (immutable→mutating bugs).
    const argv = args.map((a) => deepClone(a));
    (sandbox as { __args__?: unknown[] }).__args__ = argv;
    callScript.runInContext(callCtx, { timeout: tmo });

    const out = (
      sandbox as { __out__?: { state: string; kind: 'value' | 'throw' | null; value: unknown; thenable: boolean } }
    ).__out__;
    const postArgs = argv.map(canonicalize);

    if (!out || out.state !== 'settled' || out.kind === null) {
      // A still-pending promise means the function awaited real async I/O, which this
      // pure-function engine does not model. Treat as an unresolvable observation.
      return { obs: { kind: 'throw', snapshot: '__pending_async__', raw: undefined, thenable: true }, postArgs };
    }
    if (out.kind === 'throw') {
      return {
        obs: { kind: 'throw', snapshot: String(out.value || 'Error'), raw: out.value, thenable: out.thenable },
        postArgs,
      };
    }
    return {
      obs: { kind: 'value', snapshot: canonicalize(out.value), raw: out.value, thenable: out.thenable },
      postArgs,
    };
  };

  return { fn: captured as (...a: unknown[]) => unknown, callFresh };
}

function errorName(err: unknown): string {
  if (err instanceof Error) return err.name || 'Error';
  return `Throw:${typeof err}`;
}

// ---------------------------------------------------------------------------
// Value handling: deep clone, canonicalization, float-tolerant equality.
// ---------------------------------------------------------------------------

function deepClone<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => deepClone(x)) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as Record<string, unknown>)) {
    out[k] = deepClone((v as Record<string, unknown>)[k]);
  }
  return out as T;
}

/** Stable, structural string snapshot used for fast inequality screening. */
function canonicalize(v: unknown): string {
  return JSON.stringify(normalize(v), (_k, val) => {
    if (typeof val === 'number') {
      if (Number.isNaN(val)) return '__NaN__';
      if (val === Infinity) return '__Inf__';
      if (val === -Infinity) return '__-Inf__';
      if (val === 0) return 0; // normalize -0 to 0
    }
    if (typeof val === 'function') return `__fn__`;
    if (typeof val === 'undefined') return '__undef__';
    if (typeof val === 'bigint') return `__bigint__${val.toString()}`;
    return val;
  });
}

/** Recursively replace -0 with 0 and sort object keys for order-independent compare. */
function normalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = normalize((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  if (v === 0) return 0;
  return v;
}

/** Float-tolerant structural equality between two observed values. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return numbersEqual(a, b);
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return Object.is(a, b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => valuesEqual(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).sort();
  const bk = Object.keys(bo).sort();
  if (ak.length !== bk.length || !ak.every((k, i) => k === bk[i])) return false;
  return ak.every((k) => valuesEqual(ao[k], bo[k]));
}

function numbersEqual(a: number, b: number): boolean {
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === b) return true; // handles ±0 and exact equality / Infinity
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= FLOAT_ABS_TOL) return true;
  return diff <= FLOAT_REL_TOL * Math.max(Math.abs(a), Math.abs(b));
}

/** True when two observations represent the same observable behaviour. */
function observationsEqual(x: Observation, y: Observation): boolean {
  if (x.kind !== y.kind) return false;
  // A dropped `await` makes one side return a thenable (Promise<T>) and the other a plain
  // T — an observable type difference even when the resolved payloads match.
  if (x.thenable !== y.thenable) return false;
  if (x.kind === 'throw') return x.snapshot === y.snapshot;
  // Fast path: identical canonical snapshot. Slow path: float-tolerant deep compare.
  if (x.snapshot === y.snapshot) return true;
  return valuesEqual(x.raw, y.raw);
}

// ---------------------------------------------------------------------------
// Arity inference.
// ---------------------------------------------------------------------------

function inferArity(fn: (...a: unknown[]) => unknown): number {
  // Function.length excludes rest/defaulted params, so use it as a lower bound but
  // ensure at least 1 so a zero-arity-looking (defaulted) fn still gets exercised.
  const declared = fn.length;
  return Math.max(declared, 1);
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------

/**
 * Differentially compares two TS/JS function sources for observable behavioural
 * equivalence by synthesizing inputs and running both under a frozen sandbox.
 *
 * @param beforeSource Source of the original function (must export `beforeFnName`).
 * @param afterSource  Source of the refactored function (must export `afterFnName`).
 * @returns A {@link JsEquivResult}. `divergent` carries the first diverging input;
 *          `unverified` carries the reason in `detail`.
 */
export function checkJsEquivalence(
  beforeSource: string,
  afterSource: string,
  options: CheckJsEquivalenceOptions = {},
): JsEquivResult {
  const beforeFnName = options.beforeFnName ?? 'before';
  const afterFnName = options.afterFnName ?? 'after';
  const runs = options.runs ?? DEFAULT_RUNS;
  const seed = options.seed ?? DEFAULT_SEED;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let beforeMod: LoadedModule;
  let afterMod: LoadedModule;
  try {
    beforeMod = loadFunction(beforeSource, beforeFnName, timeoutMs);
  } catch (e) {
    return { verdict: 'unverified', checked: 0, detail: `before: ${(e as Error).message}` };
  }
  try {
    afterMod = loadFunction(afterSource, afterFnName, timeoutMs);
  } catch (e) {
    return { verdict: 'unverified', checked: 0, detail: `after: ${(e as Error).message}` };
  }

  // Arity from the SOURCE param list (counts defaulted params, which Function.length
  // omits — important for the dropped-default-arg bug class), with fn.length as a floor.
  const srcArity = Math.max(
    extractParamList(beforeSource, beforeFnName).length,
    extractParamList(afterSource, afterFnName).length,
  );
  const arity =
    options.arity ?? Math.max(srcArity, inferArity(beforeMod.fn), inferArity(afterMod.fn));

  // Infer a stable kind per parameter from the BEFORE source (the original is the oracle).
  const paramSpecs = inferParamSpecs(beforeSource, beforeFnName, arity);
  const rng = mulberry32(seed);

  let checked = 0;
  for (let i = 0; i < runs; i++) {
    const args = synthArgs(paramSpecs, rng);
    let cb: CallOutcome;
    let ca: CallOutcome;
    try {
      cb = beforeMod.callFresh(args, timeoutMs);
    } catch (e) {
      return {
        verdict: 'unverified',
        checked,
        detail: `before threw a non-recoverable sandbox error (likely timeout/vm): ${(e as Error).message}`,
      };
    }
    try {
      ca = afterMod.callFresh(args, timeoutMs);
    } catch (e) {
      return {
        verdict: 'unverified',
        checked,
        detail: `after threw a non-recoverable sandbox error (likely timeout/vm): ${(e as Error).message}`,
      };
    }
    checked++;

    const ob = cb.obs;
    const oa = ca.obs;
    // Divergence = differing return/throw OR differing in-place mutation of the arguments
    // (catches immutable→mutating refactorings whose return value looks identical).
    const returnDiverged = !observationsEqual(ob, oa);
    const mutationDiverged =
      cb.postArgs.length === ca.postArgs.length &&
      cb.postArgs.some((s, idx) => s !== ca.postArgs[idx]);

    if (returnDiverged || mutationDiverged) {
      const reason = returnDiverged
        ? `before=${describe(ob)} after=${describe(oa)}`
        : `identical return value but the arguments were mutated differently ` +
          `(before post-args=${cb.postArgs.join(',')} after post-args=${ca.postArgs.join(',')}) ` +
          `— an immutable operation became an in-place mutation`;
      return {
        verdict: 'divergent',
        checked,
        divergingInput: {
          args,
          argsText: `[${args.map((a) => canonicalize(a)).join(', ')}]`,
          before: { kind: ob.kind, value: ob.kind === 'throw' ? ob.snapshot : ob.raw, text: describe(ob) },
          after: { kind: oa.kind, value: oa.kind === 'throw' ? oa.snapshot : oa.raw, text: describe(oa) },
        },
        detail:
          `Observable behaviour diverged on input #${checked}: ${reason}. ` +
          `The refactoring is NOT behaviour-preserving for this input.`,
      };
    }
  }

  return {
    verdict: 'equivalent',
    checked,
    detail:
      `No divergence found across ${checked} synthesized inputs (seed=${seed}). ` +
      `This is differential evidence of equivalence, not a proof.`,
  };
}

function describe(o: Observation): string {
  if (o.kind === 'throw') return `throw ${o.snapshot}`;
  // Use the canonical snapshot, which faithfully renders NaN/±Infinity/undefined that raw
  // JSON.stringify would otherwise collapse to `null` (e.g. NaN distinguishes ?? from ||).
  const s = o.snapshot;
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}

// ---------------------------------------------------------------------------
// Dispatcher adapter — conforms to the behavior-equiv/index.ts contract.
//
// The unified dispatcher (`verifyRefactor`) calls:
//     verifyJsEquiv(before, after, targetFunction?): Promise<VerifyResult>
// where VerifyResult = { verdict: 'equivalent'|'divergence'|'unverified',
//                        mode: 'dynamic', inputsTested?, divergingInput?, reason }.
// Note the dispatcher's verdict word is 'divergence' (vs the engine's internal
// 'divergent'); this adapter performs the mapping.
// ---------------------------------------------------------------------------

/** Result shape required by `behavior-equiv/index.ts` (kept structurally compatible). */
export interface VerifyJsResult {
  verdict: 'equivalent' | 'divergence' | 'unverified';
  mode: 'dynamic' | 'static-only-advisory';
  inputsTested?: number;
  divergingInput?: string;
  reason: string;
}

/**
 * Resolve the function name to compare in a single source module.
 *
 * Preference order:
 *   1. An explicit `targetFunction` if it is actually present in the source.
 *   2. A function literally named `before` / `after` (the fixture convention).
 *   3. The sole top-level exported / declared function, if exactly one exists.
 *
 * Returns `null` when no unambiguous candidate can be found.
 */
function resolveFunctionName(source: string, prefer?: string): string | null {
  const names = collectFunctionNames(source);
  if (prefer && names.includes(prefer)) return prefer;
  if (names.includes('before')) return 'before';
  if (names.includes('after')) return 'after';
  if (names.length === 1) return names[0];
  // `default` export of a function expression
  if (/export\s+default\s+(?:async\s+)?function/.test(source)) return '__default__';
  return null;
}

/** Best-effort extraction of top-level function/const-arrow names from source. */
function collectFunctionNames(source: string): string[] {
  const names = new Set<string>();
  const declRe = /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g;
  const constFnRe =
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(source)) !== null) names.add(m[1]);
  while ((m = constFnRe.exec(source)) !== null) names.add(m[1]);
  return [...names];
}

/** Wrap a `__default__` request so the captured binding is the default-exported fn. */
function nameForLoad(name: string): { source?: string; fnName: string } {
  if (name === '__default__') return { fnName: 'default' };
  return { fnName: name };
}

/**
 * Adapter consumed by the unified dispatcher (`behavior-equiv/index.ts`).
 * Async to match the dispatcher's `EngineVerifier` signature, although the
 * underlying differential execution is synchronous.
 *
 * @param before         Source of the original TS/JS function (a module).
 * @param after          Source of the refactored TS/JS function (a module).
 * @param targetFunction Optional name of the function to compare in both sources.
 */
export async function verifyJsEquiv(
  before: string,
  after: string,
  targetFunction?: string,
): Promise<VerifyJsResult> {
  const beforeName = resolveFunctionName(before, targetFunction);
  const afterName = resolveFunctionName(after, targetFunction);

  if (!beforeName || !afterName) {
    return {
      verdict: 'unverified',
      mode: 'static-only-advisory',
      reason:
        `Could not unambiguously resolve the function to compare ` +
        `(before=${beforeName ?? 'none'}, after=${afterName ?? 'none'}). ` +
        `Pass an explicit targetFunction, or use the before/after export convention. ` +
        `Dynamic verification skipped — treat as advisory only.`,
    };
  }

  const result = checkJsEquivalence(before, after, {
    beforeFnName: nameForLoad(beforeName).fnName,
    afterFnName: nameForLoad(afterName).fnName,
  });

  if (result.verdict === 'unverified') {
    return {
      verdict: 'unverified',
      mode: 'static-only-advisory',
      reason: `${result.detail} Dynamic verification could not run — treat as advisory only.`,
    };
  }

  if (result.verdict === 'divergent') {
    return {
      verdict: 'divergence',
      mode: 'dynamic',
      inputsTested: result.checked,
      divergingInput: safeStringify(result.divergingInput?.args),
      reason: result.detail,
    };
  }

  return {
    verdict: 'equivalent',
    mode: 'dynamic',
    inputsTested: result.checked,
    reason: result.detail,
  };
}

function safeStringify(v: unknown): string {
  try {
    const s = JSON.stringify(v, (_k, val) => {
      if (typeof val === 'number' && Number.isNaN(val)) return '__NaN__';
      if (val === undefined) return '__undefined__';
      if (typeof val === 'bigint') return `__bigint__${val.toString()}`;
      return val;
    });
    return s ?? String(v);
  } catch {
    return String(v);
  }
}
