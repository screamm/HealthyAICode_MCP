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
   *  i.e. catches a dropped `await`). Equivalent to `thenDepth > 0`. */
  readonly thenable: boolean;
  /** Promise-nesting depth of the RAW return value: 0 = plain synchronous value,
   *  1 = `Promise<T>`, 2 = `Promise<Promise<T>>`, … A dropped `await` adds a level that the
   *  language does not auto-unwrap, so comparing depth catches an async-semantics change even
   *  when the fully-resolved payloads are identical. */
  readonly thenDepth: number;
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

type ParamKind =
  | 'number'
  | 'string'
  | 'boolean'
  | 'numberArray'
  | 'stringArray'
  | 'object'
  | 'nullable'
  | 'date'
  | 'dateArray'
  | 'interval'
  | 'any';

const BOUNDARY_INTS: readonly number[] = [0, 1, -1, 2, -2, 5, 10, -10, 100, -100];
const BOUNDARY_STRS: readonly string[] = [
  '',
  'x',
  'Hello World',
  '  pad  ',
  'a b c',
  'name',
  'ABC',
  // Structured/delimited strings exercise tokenising parsers (header/query/CSV-style code)
  // where the dominant bugs are off-by-one index advances and missing terminators — e.g. an
  // `index = endIndex` (instead of `endIndex + 1`) infinite loop only surfaces on input that
  // actually contains the `;` / `=` delimiters the loop scans for.
  'text/html;q=0.9',
  'a=1;b=2;c=3',
  'key=value',
  'a;b;c',
  'x=1;',
  ';;',
  'a, b, c',
];

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

// Date / DateArg synthesis. `toDate` accepts Date instances, numeric timestamps, and strings,
// so we draw from all three. Values are boundary-biased toward the calendar edges where the
// dominant date-refactor bugs live: month/year boundaries (clamping bugs), DST transition days,
// epoch, and negative/leap-day timestamps. A second arg in a date function is usually ANOTHER
// date or a small amount; this kind covers the date case, and the engine's numeric kind covers
// the amount case (inferred separately per param).
// Boundary dates are anchored in LOCAL calendar time (via the `Date(y,m,d,…)` constructor) as
// well as a few UTC/epoch points. Local anchoring matters: date-fns functions like addMonths /
// addDays use LOCAL-time accessors (getMonth/getDate/setMonth/setDate), so the month-overflow
// clamping bug (Jan 31 + 1mo → Feb 28 vs Mar 3) and DST-transition bug only surface when the
// input lands on the relevant LOCAL calendar position. UTC-anchored timestamps can miss these.
const BOUNDARY_DATES: readonly number[] = [
  new Date(2021, 0, 31, 12).getTime(), // local Jan 31 — month-overflow clamping edge (addMonths)
  new Date(2021, 2, 31, 12).getTime(), // local Mar 31 → April clamping
  new Date(2020, 1, 29, 12).getTime(), // local Feb 29 leap day
  new Date(2021, 1, 28, 12).getTime(), // local Feb 28
  new Date(2021, 2, 14, 2, 30).getTime(), // ~US spring-forward DST window (local)
  new Date(2021, 10, 7, 1, 30).getTime(), // ~US fall-back DST window (local)
  new Date(2021, 11, 31, 23).getTime(), // local year boundary
  new Date(2021, 5, 15, 0).getTime(), // mid-year
  Date.UTC(1970, 0, 1), // epoch
  Date.UTC(2000, 0, 1), // Y2K
  -86400000, // pre-epoch (negative timestamp)
];

function synthDate(rng: () => number): unknown {
  const ts = pick(rng, BOUNDARY_DATES) + pick(rng, [0, 1, -1, 1000, 86400000, -86400000]);
  // We synthesise numeric timestamps and ISO strings only — NOT live `Date` instances.
  // Rationale: `toDate`/`+new Date(x)` accept all three forms and route through the same
  // coercion logic, so timestamps exercise the identical code paths; meanwhile a host `Date`
  // passed into the `node:vm` realm would (a) confuse cross-realm `instanceof Date` checks and
  // (b) be flattened to `{}` by the structural deep-clone — both of which would inject
  // artefacts. Strings/numbers clone and compare faithfully across the realm boundary.
  return randInt(rng, 0, 1) === 0 ? ts : new Date(ts).toISOString();
}

function synthDateArray(rng: () => number): unknown[] {
  const n = pick(rng, [0, 1, 1, 2, 3, 5]);
  return Array.from({ length: n }, () => synthDate(rng));
}

// date-fns `Interval` = { start: DateArg, end: DateArg }. Synthesise both bounds as dates,
// occasionally inverted (start > end) so interval-validation branches are exercised.
function synthInterval(rng: () => number): object {
  return { start: synthDate(rng), end: synthDate(rng) };
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
    case 'date':
      return synthDate(rng);
    case 'dateArray':
      return synthDateArray(rng);
    case 'interval':
      return synthInterval(rng);
    case 'nullable':
      // nullable slot: over-sample the falsy/nullish edges that drive ?? vs || bugs,
      // mixed with real numbers/strings so the non-null path is exercised too.
      return pick(rng, [null, undefined, 0, '', false, NaN, synthNumber(rng), synthString(rng)]);
    default:
      // 'any' — should not reach here at synthesis time: `inferParamSpecs` resolves every
      // 'any' slot to a CONCRETE, run-stable kind (see resolveAnyKind) precisely so a slot
      // never flips type between draws. Type-flipping is the dominant FALSE-POSITIVE cause:
      // it makes a genuinely-equivalent numeric reformulation (`x*3` vs `x+x+x`) diverge
      // (3 vs 'xxx') on an input it would never receive. Fall back to number defensively.
      return synthNumber(rng);
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
 * Infer a stable {@link ParamSpec} per parameter from the source (FIX 2: type-guided
 * synthesis). Strongest-signal-first:
 *   1. TS type annotation (when present) — the strongest, most honest signal.
 *   2. Structural usage inference from the function body (numeric ops → number,
 *      `.length`/indexing/array methods → array, string methods → string, `??`/`||` →
 *      nullable, property access → object).
 *   3. A run-STABLE concrete default for slots with no signal at all — NEVER the type-
 *      flipping 'any' grab-bag, because flipping a slot's type between draws is the dominant
 *      false-positive cause (it feeds a number-formula function a string on an input it would
 *      never legitimately receive, making two equivalent formulations diverge).
 * The inferred kind is FIXED per slot for the entire run, matching the spike's argSpec.
 */
function inferParamSpecs(source: string, fnName: string, arity: number): ParamSpec[] {
  const sig = extractParamList(source, fnName);
  const specs: ParamSpec[] = [];
  for (let i = 0; i < arity; i++) {
    const p = sig[i];
    if (!p) {
      // A slot beyond the declared signature (rest/over-arity): default to a stable scalar.
      specs.push({ kind: resolveAnyKind(source, undefined), defaulted: false });
      continue;
    }
    const inferred = kindFromAnnotation(p.annotation) ?? kindFromUsage(source, p.name);
    const kind = inferred ?? resolveAnyKind(source, p.name);
    specs.push({ kind, defaulted: p.defaulted });
  }
  return specs;
}

/**
 * Resolve a no-signal ('any') slot to a CONCRETE, run-stable kind so it never flips type
 * across draws. Heuristic, honest, and deterministic from the source:
 *   - if the parameter (or the body) clearly leans on string methods anywhere → 'string';
 *   - otherwise → 'number' (the commonest scalar, and the type on which the dominant LLM
 *     bug classes — off-by-one, boundary, truncation, comparator-swap — manifest).
 * Choosing a single stable scalar (vs a string/number coin-flip per draw) trades a little
 * coverage for a large reduction in false positives, which is the explicit FIX-2 goal:
 * equivalent pairs must not be flagged divergent on inputs they would never receive.
 */
function resolveAnyKind(source: string, name: string | undefined): ParamKind {
  if (name) {
    const id = escapeRe(name);
    const stringLean = new RegExp(
      `\\b${id}\\s*\\.\\s*(?:trim|toLowerCase|toUpperCase|charAt|charCodeAt|split|replace|padStart|padEnd|startsWith|endsWith|substring|substr|concat|repeat|includes)\\b`,
    ).test(source) || new RegExp(`\`[^\`]*\\$\\{[^}]*\\b${id}\\b`).test(source);
    if (stringLean) return 'string';
  }
  return 'number';
}

interface ParamInfo {
  readonly name: string;
  readonly annotation: string | null;
  readonly defaulted: boolean;
}

/**
 * Extract the balanced parameter-list text for a `function NAME <generics?> ( params )`
 * declaration, correctly SKIPPING a TS generic clause (`<…>`) between the name and the
 * param parens and BALANCING nested `()`/`<>`/`{}` inside parameter type annotations
 * (e.g. `DateArg<DateType>`, `(x: number) => void`, `T & {}`). Returns the raw param text,
 * or null when no matching `function NAME` is found at a usable position.
 */
function extractBalancedParamText(source: string, fnName: string): string | null {
  const anchorRe = new RegExp(`function\\s+${escapeRe(fnName)}\\b`, 'g');
  let am: RegExpExecArray | null;
  while ((am = anchorRe.exec(source)) !== null) {
    let i = am.index + am[0].length;
    const n = source.length;
    // Skip an optional generic clause <…> (balance angle brackets).
    while (i < n && /\s/.test(source[i])) i++;
    if (source[i] === '<') {
      let depth = 0;
      for (; i < n; i++) {
        if (source[i] === '<') depth++;
        else if (source[i] === '>') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
      }
    }
    while (i < n && /\s/.test(source[i])) i++;
    if (source[i] !== '(') continue; // not the form we expect; try next anchor
    // Balance the parameter list, capturing its inner text.
    let depth = 0;
    const start = i + 1;
    for (; i < n; i++) {
      const c = source[i];
      if (c === '(' || c === '[' || c === '{' || c === '<') depth++;
      else if (c === ')' || c === ']' || c === '}' || c === '>') {
        depth--;
        if (depth === 0 && c === ')') return source.slice(start, i);
      }
    }
  }
  return null;
}

/** Pull the raw parameter list (names + optional TS annotations) for `fnName`. */
function extractParamList(source: string, fnName: string): ParamInfo[] {
  // `function fnName <generics?> (...)` — handled by the balancing extractor (skips generics).
  const balanced = extractBalancedParamText(source, fnName);
  if (balanced !== null) return parseParams(balanced);

  // Arrow / function-expression / default-export forms.
  const patterns = [
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
  const nullable = /\b(?:null|undefined)\b/.test(a) && /\|/.test(a);
  // Date-typed params first: `Date`, `DateArg<…>`, `DateValue`, `Interval` (date-fns). These are
  // the locus of date-arithmetic refactor bugs (DST, getFullYear vs getUTCFullYear, month
  // clamping). Feeding objects (`{}`) makes `+toDate({})` → NaN on both sides, masking real
  // divergence; feeding actual dates/timestamps exposes it. Arrays of dates → dateArray.
  if (/\binterval\b/.test(a)) return 'interval';
  const isDate = /\bdate(?:arg|value)?\b/.test(a);
  if (isDate && /\[\s*\]|\barray<|readonlyarray</.test(a)) return 'dateArray';
  if (isDate) return 'date';
  // Arrays next (most specific). A nullable array (`number[] | null`) is still synthesised
  // as an array — array params are rarely the locus of ?? vs || nullish bugs, and feeding a
  // bare null/undefined to a function that immediately does `.length` would be a type-
  // confusion artifact (false positive), not a refactoring bug.
  if (/number\s*\[\s*\]|array<\s*number\s*>|readonlyarray<\s*number\s*>/.test(a)) return 'numberArray';
  if (/string\s*\[\s*\]|array<\s*string\s*>|readonlyarray<\s*string\s*>/.test(a)) return 'stringArray';
  if (/\[\s*\]|\barray<|readonlyarray</.test(a)) return 'numberArray';
  // Scalar | null/undefined → nullable so the ?? vs || / falsy-coercion bug class is exercised
  // on the exact nullish edges, regardless of the underlying scalar type.
  if (nullable && /\b(?:number|string)\b/.test(a)) return 'nullable';
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
  // STRING-ONLY methods (unambiguous).
  const stringOnly = has(new RegExp(`\\b${id}\\s*\\.\\s*(trim|toLowerCase|toUpperCase|charAt|charCodeAt|codePointAt|split|replace|replaceAll|padStart|padEnd|startsWith|endsWith|substring|substr|normalize|localeCompare|match|matchAll|search|trimStart|trimEnd)\\b`));
  // Methods SHARED by strings and arrays (slice/indexOf/lastIndexOf/includes/concat). When the
  // argument to indexOf/lastIndexOf/includes is a STRING LITERAL, it is a string (you cannot
  // search an array for a substring); that disambiguates a parser like `str.indexOf(';')`.
  const sharedWithStringLitArg = has(
    new RegExp(`\\b${id}\\s*\\.\\s*(?:indexOf|lastIndexOf|includes)\\s*\\(\\s*['"\`]`),
  );
  // ARRAY-ONLY methods (mutators / iteration that strings lack).
  const arrayOnly = has(new RegExp(`\\b${id}\\s*\\.\\s*(map|filter|reduce|reduceRight|push|pop|shift|unshift|sort|forEach|flat|flatMap|fill|splice|every|some|find|findIndex|entries|keys|values)\\b`))
    || has(new RegExp(`\\[\\s*\\.\\.\\.\\s*${id}\\s*[\\],]`));
  // SEQUENCE signals shared by strings AND arrays but NOT plain objects: `.length` and numeric
  // indexing `x[i]`. These are strong evidence the value is indexable (array/string), so they
  // must outrank the generic `objectUse` (`.length` is a property access that would otherwise be
  // mis-read as an object field — the `sum(xs)` regression). Default such a value to an array.
  const lengthUse = has(new RegExp(`\\b${id}\\s*\\.\\s*length\\b`));
  const indexed = has(new RegExp(`\\b${id}\\s*\\[`));
  const sequenceUse = lengthUse || indexed;
  const numericUse = has(new RegExp(`\\b${id}\\s*(?:[*/%]|[<>]=?|===?\\s*\\d|\\+\\+|--)`))
    || has(new RegExp(`[*/%]\\s*${id}\\b`))
    || has(new RegExp(`Math\\.[a-z]+\\([^)]*\\b${id}\\b`));
  // Object use = a NAMED property access other than `length` (e.g. `x.start`, `x.foo`), with no
  // string/array/sequence evidence.
  const namedProp = has(new RegExp(`\\b${id}\\s*\\.\\s*(?!length\\b)[A-Za-z_$][\\w$]*`));
  const objectUse = namedProp && !stringOnly && !arrayOnly && !sequenceUse;
  const nullableUse = has(new RegExp(`\\b${id}\\s*(\\?\\?|\\|\\|)`)) || has(new RegExp(`${id}\\s*===?\\s*(null|undefined)`));

  // Decide. String evidence (explicit string methods OR a substring search) wins over the
  // shared-method ambiguity; ARRAY-ONLY methods then force an array kind; sequence signals
  // (`.length`/indexing) force an array before the generic object/number fallbacks.
  if (stringOnly || sharedWithStringLitArg) {
    return arrayOnly ? 'stringArray' : 'string';
  }
  if (arrayOnly) return 'numberArray';
  if (sequenceUse && !objectUse) return 'numberArray';
  if (nullableUse) return 'nullable';
  if (objectUse) return 'object';
  if (numericUse) return 'number';
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// PURITY / SELF-CONTAINMENT GATE (FIX 1).
//
// Differential execution is only sound for functions that are PURE enough to be
// deterministically comparable. Running an impure / non-self-contained function under the
// frozen sandbox does NOT yield a trustworthy verdict:
//   - an `fs`/network/process/DOM call either throws inside the sandbox (the builtin is
//     absent) or — worse — succeeds nondeterministically, so a `divergent` or `equivalent`
//     verdict reflects sandbox artefacts, not the refactoring. That is a FALSE result.
//   - module-scope mutable state accumulates across `before` vs `after` calls and fabricates
//     divergence (or hides it).
//   - a nondeterministic source we do NOT freeze (e.g. `crypto.randomUUID`, `process.hrtime`)
//     makes the two sides differ for reasons unrelated to the refactor.
//
// So BEFORE executing, we statically scan the source and, if any impurity is found, return
// `unverified` with a specific named cause. Date/Math.random/performance.now/Date.now and
// timers are NOT flagged — the sandbox already freezes those deterministically (see
// makeFrozenGlobals), so they remain safely comparable.
//
// The scan is intentionally regex/lexical (no full AST) to match the rest of this module and
// stay dependency-free. It first strips comments and string/template literals so that the
// word "fetch" in a comment or a string never trips the gate (avoids false `unverified`).
// ---------------------------------------------------------------------------

/**
 * Remove line/block comments and the CONTENTS of string / template literals, leaving
 * structural delimiters intact. Used so impurity tokens are only matched in real code.
 */
function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];
    // line comment
    if (c === '/' && c2 === '/') {
      i += 2;
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    // block comment
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // string / template literal: keep the quotes, blank the body
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      out += ' ';
      i++;
      while (i < n) {
        if (source[i] === '\\') {
          i += 2;
          continue;
        }
        if (source[i] === quote) break;
        // for templates, do not try to parse ${...}; blanking is enough for token matching
        i++;
      }
      out += ' ';
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Patterns that make a function impure / not self-contained / nondeterministic-in-a-way-the-
 * sandbox-does-not-freeze. Each entry pairs a matcher with the human cause reported in the
 * `unverified` reason. Order matters only for which cause is reported first.
 *
 * NOTE: `Date`, `Date.now`, `Math.random`, `performance.now`, `setTimeout`/`setInterval`
 * are deliberately ABSENT — the sandbox freezes time/RNG and never schedules real timers, so
 * those sources are deterministically comparable and must NOT trigger `unverified`.
 */
interface ImpurityRule {
  readonly re: RegExp;
  readonly cause: string;
  /** When true, match against RAW source (module specifiers survive string-blanking). */
  readonly onRaw?: boolean;
}

const IMPURITY_RULES: readonly ImpurityRule[] = [
  // ── Module imports (matched on RAW source: the specifier lives inside a string literal,
  //    which the comment/string stripper blanks — so these MUST see the raw text) ─────────
  { re: /\b(?:require\s*\(\s*|import\b[^;]*?\bfrom\s*)['"](?:node:)?fs(?:\/promises)?['"]/, cause: 'filesystem IO (fs module)', onRaw: true },
  { re: /\b(?:require\s*\(\s*|import\b[^;]*?\bfrom\s*)['"](?:node:)?(?:http|https|net|dgram|tls)['"]/, cause: 'network IO (http/net module)', onRaw: true },
  { re: /\b(?:require\s*\(\s*|import\b[^;]*?\bfrom\s*)['"](?:node:)?(?:child_process|os|cluster|worker_threads|v8|vm)['"]/, cause: 'process/OS module (child_process/os/…)', onRaw: true },
  { re: /\b(?:require\s*\(\s*|import\b[^;]*?\bfrom\s*)['"](?:axios|node-fetch|got|undici|superagent)['"]/, cause: 'network IO (http client module)', onRaw: true },
  // ── Filesystem / disk IO calls ─────────────────────────────────────────────
  { re: /\bfs\s*\.\s*(?:readFile|readFileSync|writeFile|writeFileSync|appendFile|appendFileSync|existsSync|mkdir|mkdirSync|unlink|unlinkSync|stat|statSync|createReadStream|createWriteStream|readdir|readdirSync)\b/, cause: 'filesystem IO (fs call)' },
  { re: /\b(?:readFileSync|writeFileSync|appendFileSync|existsSync|mkdirSync|readdirSync|statSync|unlinkSync)\s*\(/, cause: 'filesystem IO (fs call)' },
  // ── Network ───────────────────────────────────────────────────────────────
  { re: /\bfetch\s*\(/, cause: 'network IO (fetch)' },
  { re: /\bnew\s+XMLHttpRequest\b/, cause: 'network IO (XMLHttpRequest)' },
  { re: /\b(?:axios|got|superagent)\s*\.\s*(?:get|post|put|patch|delete|request)\b/, cause: 'network IO (http client)' },
  { re: /\baxios\s*\(/, cause: 'network IO (axios)' },
  { re: /\bnew\s+WebSocket\b|\bWebSocket\s*\(/, cause: 'network IO (WebSocket)' },
  // ── Process / OS / environment / subprocess ────────────────────────────────
  { re: /\bprocess\s*\.\s*(?:env|argv|exit|cwd|hrtime|pid|stdout|stderr|stdin|kill|nextTick)\b/, cause: 'process/environment access' },
  { re: /\b(?:execSync|spawnSync|execFileSync)\s*\(/, cause: 'subprocess execution (child_process)' },
  { re: /\bchild_process\s*\.\s*(?:exec|spawn|fork|execFile)\b/, cause: 'subprocess execution (child_process)' },
  // ── DOM / browser globals ──────────────────────────────────────────────────
  { re: /\b(?:window|document|localStorage|sessionStorage|navigator|location|history)\s*\.\s*[A-Za-z_$]/, cause: 'DOM/browser global access' },
  { re: /\b(?:alert|confirm|prompt)\s*\(/, cause: 'DOM/browser global access' },
  // ── Nondeterministic sources the sandbox does NOT freeze ───────────────────
  { re: /\bcrypto\s*\.\s*(?:randomUUID|randomBytes|randomInt|getRandomValues)\b/, cause: 'nondeterministic crypto randomness (crypto.random*)' },
  { re: /\bprocess\s*\.\s*hrtime\b/, cause: 'nondeterministic high-resolution time (process.hrtime)' },
];

/** Walk a function's `( … )` parameter list / body braces to extract its source span. */
function extractFunctionBodies(source: string, fnName: string): string[] {
  const bodies: string[] = [];
  // Anchors for `function NAME`, `NAME = (…) =>`/`function`, default-export function.
  const anchors: RegExp[] = [
    new RegExp(`function\\s+${escapeRe(fnName)}\\b`, 'g'),
    new RegExp(`\\b${escapeRe(fnName)}\\s*=\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*(?::[^={]+)?=>|[A-Za-z_$][\\w$]*\\s*=>)`, 'g'),
  ];
  if (fnName === 'default') {
    anchors.push(/export\s+default\s+(?:async\s+)?function\b/g);
  }
  for (const re of anchors) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const body = sliceBalancedBody(source, m.index);
      if (body) bodies.push(body);
    }
  }
  // If nothing matched (unusual shape), fall back to the whole module so the gate still runs.
  return bodies.length > 0 ? bodies : [source];
}

/** From a declaration start, return the `{ … }` body (or arrow concise body up to `;`). */
function sliceBalancedBody(source: string, from: number): string | null {
  // Find the first `{` (block body) or `=>` concise body after the declaration head.
  let i = from;
  const n = source.length;
  // Skip to the end of the parameter list: find matching ')' for the first '('.
  let firstParen = source.indexOf('(', from);
  // Arrow with single unparenthesised param has no '(' before '=>'
  const arrow = source.indexOf('=>', from);
  if (firstParen >= 0 && (arrow < 0 || firstParen < arrow)) {
    let depth = 0;
    for (i = firstParen; i < n; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
  } else {
    i = from;
  }
  // From here, find the function body: either `{ … }` or an arrow concise body.
  while (i < n && source[i] !== '{' && !(source[i] === '=' && source[i + 1] === '>')) i++;
  if (i >= n) return null;
  if (source[i] === '{') {
    let depth = 0;
    const start = i;
    for (; i < n; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
    return source.slice(start);
  }
  // arrow concise body: take to end of statement (`;` or newline at depth 0) — coarse but
  // sufficient for impurity-token scanning.
  i += 2;
  const start = i;
  let depth = 0;
  for (; i < n; i++) {
    const ch = source[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && (ch === ';' || ch === '\n')) break;
  }
  return source.slice(start, i);
}

/** Detect module-scope mutable state mutated inside the target function. */
function detectModuleScopeMutation(cleanSource: string, fnName: string): string | null {
  // Collect module-level mutable bindings declared with `let`/`var` (NOT `const`, NOT params).
  // We scan only top-level-ish declarations (line-anchored, optionally exported).
  const mutableNames = new Set<string>();
  const declRe = /^\s*(?:export\s+)?(?:let|var)\s+([A-Za-z_$][\w$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(cleanSource)) !== null) mutableNames.add(m[1]);
  if (mutableNames.size === 0) return null;

  const bodies = extractFunctionBodies(cleanSource, fnName);
  for (const body of bodies) {
    for (const name of mutableNames) {
      // skip if the name is re-declared (shadowed) as a local inside the body
      const shadowed = new RegExp(`\\b(?:const|let|var)\\s+${escapeRe(name)}\\b`).test(body);
      if (shadowed) continue;
      const id = escapeRe(name);
      // assignment / compound-assignment / inc-dec to the module binding inside the body
      const mutated =
        new RegExp(`\\b${id}\\s*(?:=(?!=)|\\+=|-=|\\*=|/=|%=|\\*\\*=|\\|\\|=|&&=|\\?\\?=|<<=|>>=|&=|\\|=|\\^=)`).test(body) ||
        new RegExp(`\\b${id}\\s*(?:\\+\\+|--)`).test(body) ||
        new RegExp(`(?:\\+\\+|--)\\s*${id}\\b`).test(body) ||
        // in-place collection mutation on the module binding (push/pop/splice/sort/set/…)
        new RegExp(`\\b${id}\\s*\\.\\s*(?:push|pop|shift|unshift|splice|sort|reverse|fill|set|delete|add|clear)\\s*\\(`).test(body) ||
        // indexed/property assignment to the module binding
        new RegExp(`\\b${id}\\s*(?:\\[[^\\]]*\\]|\\.[A-Za-z_$][\\w$]*)\\s*(?:=(?!=)|\\+\\+|--|\\+=|-=)`).test(body);
      if (mutated) return `module-scope mutation of '${name}'`;
    }
  }
  return null;
}

/**
 * Statically decide whether a function in `source` is pure / self-contained enough for sound
 * differential execution. Returns a specific cause string when impure, or `null` when the
 * function is safe to execute. Operates on comment/string-stripped source so tokens inside
 * comments or string literals never trigger a (false) impurity verdict.
 */
function detectImpurity(source: string, fnName: string): string | null {
  const clean = stripCommentsAndStrings(source);
  // For comment/string-token suppression we scan the stripped source, EXCEPT module-import
  // rules (onRaw) whose specifier lives inside a string literal the stripper blanks — those
  // scan the raw source. Token-based impurity is matched module-wide: a helper the target
  // function calls is part of its observable behaviour, so an `fs` call in a same-module
  // helper still makes the unit non-self-contained.
  for (const rule of IMPURITY_RULES) {
    if (rule.re.test(rule.onRaw ? source : clean)) return rule.cause;
  }
  // Module-scope mutation is checked specifically against the target function's body so that
  // a benign module-level `const` table (read-only) does not get flagged.
  const mut = detectModuleScopeMutation(clean, fnName);
  if (mut) return mut;
  return null;
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
  //
  // ASYNC-AWARE OBSERVATION (catches dropped \`await\`). A dropped \`await\` does not merely
  // change a value — it changes the RETURN TYPE by adding a layer of Promise nesting. A
  // correctly-awaited path yields a settled value/Promise<T>; a path that forgot to await an
  // intermediate Promise that the language does NOT auto-unwrap yields a Promise<Promise<T>>.
  // A single \`Promise.resolve(r).then(...)\` auto-flattens ALL nesting levels (the JS thenable
  // adoption spec), so a one-shot resolve makes \`Promise<Promise<T>>\` and \`Promise<T>\`
  // indistinguishable — the exact reason a value-only differential misses ts-08.
  //
  // We instead unwrap ONE level at a time and COUNT the nesting depth (\`thenDepth\`). The
  // observed depth is part of the observation: two sides that resolve to the same final payload
  // but at different Promise-nesting depths DIVERGE (a dropped/added await is an observable
  // type difference, not noise). Depth 0 = plain synchronous value; depth ≥ 1 = thenable. A
  // hard cap bounds pathological self-resolving thenables. Real async I/O never settles under
  // \`microtaskMode:'afterEvaluate'\` and surfaces as the existing pending-async observation.
  const callSrc = `
    (function () {
      var f = globalThis.__captured__;
      globalThis.__out__ = { state: 'pending', kind: null, value: undefined, thenable: false, thenDepth: 0 };
      var MAX_UNWRAP = 32;
      function isThenable(v) {
        return v != null && (typeof v === 'object' || typeof v === 'function') && typeof v.then === 'function';
      }
      // Recursively unwrap one Promise level at a time, counting depth, so nested promises
      // (the signature of a dropped await) are observable instead of being auto-flattened.
      function settle(v, depth) {
        if (depth < MAX_UNWRAP && isThenable(v)) {
          v.then(
            function (inner) { settle(inner, depth + 1); },
            function (e) { globalThis.__out__ = { state: 'settled', kind: 'throw', value: (e && e.name) || String(e), thenable: depth + 1 > 0, thenDepth: depth + 1 }; }
          );
          return;
        }
        globalThis.__out__ = { state: 'settled', kind: 'value', value: v, thenable: depth > 0, thenDepth: depth };
      }
      try {
        var r = f.apply(null, globalThis.__args__);
        if (isThenable(r)) {
          settle(r, 0);
        } else {
          globalThis.__out__ = { state: 'settled', kind: 'value', value: r, thenable: false, thenDepth: 0 };
        }
      } catch (e) {
        globalThis.__out__ = { state: 'settled', kind: 'throw', value: (e && e.name) || String(e), thenable: false, thenDepth: 0 };
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
      sandbox as {
        __out__?: {
          state: string;
          kind: 'value' | 'throw' | null;
          value: unknown;
          thenable: boolean;
          thenDepth?: number;
        };
      }
    ).__out__;
    const postArgs = argv.map(canonicalize);

    if (!out || out.state !== 'settled' || out.kind === null) {
      // A still-pending promise means the function awaited real async I/O, which this
      // pure-function engine does not model. Treat as an unresolvable observation.
      return {
        obs: { kind: 'throw', snapshot: '__pending_async__', raw: undefined, thenable: true, thenDepth: 1 },
        postArgs,
      };
    }
    const thenDepth = typeof out.thenDepth === 'number' ? out.thenDepth : out.thenable ? 1 : 0;
    if (out.kind === 'throw') {
      return {
        obs: { kind: 'throw', snapshot: String(out.value || 'Error'), raw: out.value, thenable: out.thenable, thenDepth },
        postArgs,
      };
    }
    return {
      obs: { kind: 'value', snapshot: canonicalize(out.value), raw: out.value, thenable: out.thenable, thenDepth },
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

/**
 * Duck-typed Date detection that works ACROSS the `node:vm` realm boundary. A Date returned
 * from the sandbox is a `FrozenDate` (a subclass living in the vm realm), so a host
 * `instanceof Date` would be false. We instead probe for a callable `getTime`. Returns the
 * timestamp (a number, possibly NaN for Invalid Date) or `null` when `v` is not date-like.
 */
function dateTimeOf(v: unknown): number | null {
  if (v && typeof v === 'object' && typeof (v as { getTime?: unknown }).getTime === 'function') {
    try {
      const t = (v as { getTime: () => number }).getTime();
      if (typeof t === 'number') return t;
    } catch {
      /* not a real date-like */
    }
  }
  return null;
}

/** Recursively replace -0 with 0 and sort object keys for order-independent compare. */
function normalize(v: unknown): unknown {
  // Dates canonicalise to a tagged timestamp so Date returns (addDays/clamp/…) compare by value
  // instead of collapsing to `{}` (Dates have no own enumerable keys).
  const ts = dateTimeOf(v);
  if (ts !== null) return Number.isNaN(ts) ? '__InvalidDate__' : `__Date__${ts}`;
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
  // Date-like values compare by timestamp across the realm boundary (NaN==NaN for Invalid Date).
  const ta = dateTimeOf(a);
  const tb = dateTimeOf(b);
  if (ta !== null || tb !== null) {
    if (ta === null || tb === null) return false;
    return (Number.isNaN(ta) && Number.isNaN(tb)) || ta === tb;
  }
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
  // A dropped (or added) `await` changes the Promise-NESTING DEPTH of the return: a plain T
  // (depth 0), a `Promise<T>` (depth 1), and a `Promise<Promise<T>>` (depth 2) are observably
  // distinct return types even when they fully resolve to the same payload. Comparing depth
  // (not just the thenable boolean) is what makes a dropped await detectable — a one-shot
  // resolve would auto-flatten the extra level and hide it.
  if (x.thenDepth !== y.thenDepth) return false;
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

  // ── FIX 1: purity / self-containment gate ──────────────────────────────────
  // Run BEFORE any differential execution. An impure / non-self-contained function cannot be
  // deterministically compared in the frozen sandbox; executing it would yield a FALSE
  // pass/divergence. We decline honestly with a named cause instead. Either side being impure
  // disqualifies the pair (a refactor that ADDS impurity is itself unverifiable here).
  const beforeImpurity = detectImpurity(beforeSource, beforeFnName);
  const afterImpurity = detectImpurity(afterSource, afterFnName);
  if (beforeImpurity || afterImpurity) {
    const cause =
      beforeImpurity && afterImpurity && beforeImpurity !== afterImpurity
        ? `${beforeImpurity} (before), ${afterImpurity} (after)`
        : (beforeImpurity ?? afterImpurity);
    return {
      verdict: 'unverified',
      checked: 0,
      detail:
        `impure: ${cause}. Differential execution is only sound for pure, self-contained ` +
        `functions; this function is not deterministically comparable in the sandbox, so a ` +
        `pass/divergence verdict would be unreliable. Treated as advisory only.`,
    };
  }

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
