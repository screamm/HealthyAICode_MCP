import type { FunctionResult, Smell } from '../types';

/**
 * Anti-gaming guards for the additive `score = 10 − Σ(weight × √count)` formula (Sprint 56).
 *
 * Two failure modes are detected:
 *
 *  - `SplitResidue` — "extract-to-evade" (Goodhart's Law). A `ComplexMethod` (CC≥15) is
 *    mechanically split into several private helper methods each below the threshold. The
 *    smells disappear and the score rises, but the complexity was *relocated*, not removed.
 *    We detect this by counting private, single-caller helper methods with CC>2.
 *
 *  - `FragmentedCode` — over-fragmentation. The loop drives toward micro-method sprawl: a
 *    file accumulates many trivial (CC=1, <4 LLOC) single-caller methods. Extremely low CC
 *    hurts cross-file LLM reasoning, so an advisory guard fires when ≥8 such methods appear.
 *
 * Both detectors operate on the `FunctionResult[]` already extracted by the language
 * analyzer plus the raw file `code` (used as a cheap call-graph proxy: counting `name(`
 * occurrences). They are language-neutral; the privacy heuristic covers the conventions of
 * the Tier A languages (`_`/`#` prefix in TS/JS/Python, `private` keyword in Java/Kotlin/C#).
 */

/** A method with CC strictly greater than this is "non-trivial" for SplitResidue. */
const SPLIT_RESIDUE_MIN_CC = 2;
/** SplitResidue fires when more than this many qualifying private single-caller methods exist. */
const SPLIT_RESIDUE_MIN_METHODS = 3;

/** A method with CC equal to this is "trivial" for FragmentedCode. */
const FRAGMENTED_TRIVIAL_CC = 1;
/** A method shorter than this many logical lines is "tiny" for FragmentedCode. */
const FRAGMENTED_MAX_LLOC = 4;
/** FragmentedCode fires when at least this many trivial single-caller methods exist. */
const FRAGMENTED_MIN_METHODS = 8;

/**
 * Counts how many *other* functions in the file call `name`.
 *
 * Heuristic: count `name(` occurrences in `code`, then subtract the function's own
 * declaration site(s). A call is any `name(` not immediately preceded by an identifier
 * character (so `doFoo(` does not count as a call to `Foo`) and not part of the declaration.
 * This intentionally over-counts in rare cases (e.g. a same-named method on another object),
 * which is the conservative direction — it makes a method look multi-caller and *avoids*
 * a false-positive SplitResidue.
 */
function countCallers(name: string, declarationLines: number, code: string): number {
  if (!name || name === '<anonymous>') return 0;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match `name(` where `name` is not preceded by an identifier char.
  const callRegex = new RegExp(`(?<![A-Za-z0-9_$])${escaped}\\s*\\(`, 'g');
  const total = (code.match(callRegex) ?? []).length;
  // Each declaration site of this name also matches `name(` — discount them.
  return Math.max(0, total - declarationLines);
}

/** Returns true when a function name follows a private-method naming convention. */
function isPrivateName(name: string): boolean {
  return name.startsWith('_') || name.startsWith('#');
}

/**
 * Returns true when a function appears to be declared `private` (Java/Kotlin/C#/TS keyword)
 * by inspecting the raw declaration line. Used in addition to the name-prefix heuristic.
 */
function isPrivateByKeyword(fn: FunctionResult, lines: string[]): boolean {
  const lineIdx = fn.line - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) return false;
  return /\bprivate\b/.test(lines[lineIdx]);
}

/** Counts how many function declarations in the set share `name` (overloads / clauses). */
function declarationCount(name: string, functions: FunctionResult[]): number {
  return functions.filter(f => f.name === name).length;
}

/**
 * Approximates each function's line span as [line, nextFunctionLine) using the sorted set of
 * declaration lines. Used to attribute a call site to the enclosing function (a cheap proxy for
 * "which method calls this helper") without a full AST/call-graph.
 */
function functionSpans(functions: FunctionResult[]): Array<{ name: string; start: number; end: number }> {
  const sorted = [...functions].sort((a, b) => a.line - b.line);
  return sorted.map((f, i) => ({
    name: f.name,
    start: f.line,
    end: i + 1 < sorted.length ? sorted[i + 1].line : Number.MAX_SAFE_INTEGER,
  }));
}

/**
 * Returns the name of the function whose span encloses 1-indexed `lineNo`, or null if none.
 * Iterates from the last-starting span backwards so the innermost (latest-starting) match wins.
 */
function enclosingFunction(
  lineNo: number,
  spans: Array<{ name: string; start: number; end: number }>,
): string | null {
  for (let i = spans.length - 1; i >= 0; i--) {
    if (lineNo >= spans[i].start && lineNo < spans[i].end) return spans[i].name;
  }
  return null;
}

/**
 * Finds the single function that calls `name`, or null if the call count is not exactly one or the
 * caller cannot be attributed to an enclosing function. The line of the call is located by scanning
 * for the first `name(` occurrence that is not the declaration line itself.
 */
function singleCallerOf(
  name: string,
  declLines: Set<number>,
  spans: Array<{ name: string; start: number; end: number }>,
  codeLines: string[],
): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const callRegex = new RegExp(`(?<![A-Za-z0-9_$])${escaped}\\s*\\(`);
  let caller: string | null = null;
  for (let i = 0; i < codeLines.length; i++) {
    const lineNo = i + 1;
    if (declLines.has(lineNo)) continue;
    if (!callRegex.test(codeLines[i])) continue;
    const enc = enclosingFunction(lineNo, spans);
    if (enc === null || enc === name) continue; // ignore recursion / unattributable
    if (caller !== null && caller !== enc) return null; // more than one distinct caller
    caller = enc;
  }
  return caller;
}

/**
 * Detects `SplitResidue`: a file with more than 3 private, non-trivial (CC>2) methods that
 * are each called by exactly one caller in the file — the signature of an "extract-to-evade"
 * refactor where one complex method was mechanically split into below-threshold helpers.
 *
 * Legitimate extractions (a private helper called from multiple sites) and genuinely trivial
 * helpers (CC≤2) are excluded, so the guard targets the gaming pattern specifically.
 *
 * Produces at most one `SplitResidue` smell, located at the line of the most-referenced
 * qualifying helper (a stable, deterministic anchor).
 *
 * @param functions  Functions extracted by the language analyzer.
 * @param code       Raw source of the file (call-graph proxy).
 */
export function detectSplitResidue(functions: FunctionResult[], code: string): Smell[] {
  if (functions.length === 0) return [];
  const lines = code.split('\n');
  const spans = functionSpans(functions);

  // Candidate helpers: private, non-trivial (CC>2), with exactly one caller in the file.
  // For each, attribute the single caller to its enclosing function. The "extract-to-evade"
  // signal is that MANY such helpers share the SAME caller (one method split into N helpers).
  // Helpers distributed across distinct callers are legitimate decomposition and are NOT flagged.
  const callerOf = new Map<string, string>(); // helper name → its single caller's name

  for (const fn of functions) {
    if (fn.name === '<anonymous>') continue;
    const isPrivate = isPrivateName(fn.name) || isPrivateByKeyword(fn, lines);
    if (!isPrivate) continue;
    if (fn.cyclomaticComplexity <= SPLIT_RESIDUE_MIN_CC) continue;
    const decls = declarationCount(fn.name, functions);
    if (countCallers(fn.name, decls, code) !== 1) continue;

    const declLines = new Set(functions.filter(f => f.name === fn.name).map(f => f.line));
    const caller = singleCallerOf(fn.name, declLines, spans, lines);
    if (caller !== null) callerOf.set(fn.name, caller);
  }

  if (callerOf.size <= SPLIT_RESIDUE_MIN_METHODS) return [];

  // Group qualifying helpers by their common caller; the gaming pattern is a single caller
  // accumulating > SPLIT_RESIDUE_MIN_METHODS below-threshold helpers.
  const byCaller = new Map<string, string[]>();
  for (const [helper, caller] of callerOf) {
    const arr = byCaller.get(caller) ?? [];
    arr.push(helper);
    byCaller.set(caller, arr);
  }

  let dominant: { caller: string; helpers: string[] } | null = null;
  for (const [caller, helpers] of byCaller) {
    if (dominant === null || helpers.length > dominant.helpers.length) {
      dominant = { caller, helpers };
    }
  }

  if (dominant === null || dominant.helpers.length <= SPLIT_RESIDUE_MIN_METHODS) return [];

  const flagged = dominant.helpers;
  const helperFns = functions.filter(f => flagged.includes(f.name));
  // Anchor the smell at the helper appearing earliest in the file for determinism.
  const anchor = helperFns.reduce((a, b) => (b.line < a.line ? b : a));
  const names = flagged.join(', ');

  return [
    {
      type: 'SplitResidue',
      severity: 'medium',
      functionName: anchor.name,
      line: anchor.line,
      description: `SplitResidue — ${flagged.length} private single-caller methods with CC>2 all extracted from '${dominant.caller}' (${names}). Complexity appears relocated into helpers rather than eliminated (extract-to-evade).`,
      suggestion: `Inline or consolidate the single-caller private helpers and address the underlying complexity in '${dominant.caller}', rather than splitting a complex method into below-threshold fragments.`,
      metricValue: flagged.length,
    },
  ];
}

/**
 * Detects `FragmentedCode`: over-fragmentation into ≥8 trivial methods. Each qualifying
 * method has CC=1, fewer than 4 logical lines, and exactly one caller in the file. This is
 * the inverse failure mode of SplitResidue — the loop driving toward micro-method sprawl.
 *
 * Advisory only (low weight): genuine utility modules whose functions are called from many
 * sites are excluded by the single-caller requirement, and the high count threshold avoids
 * false positives on small files.
 *
 * @param functions  Functions extracted by the language analyzer.
 * @param code       Raw source of the file (call-graph proxy).
 */
export function detectFragmentedCode(functions: FunctionResult[], code: string): Smell[] {
  if (functions.length === 0) return [];

  const qualifying = functions.filter(fn => {
    if (fn.name === '<anonymous>') return false;
    if (fn.cyclomaticComplexity !== FRAGMENTED_TRIVIAL_CC) return false;
    if (fn.length >= FRAGMENTED_MAX_LLOC) return false;
    const decls = declarationCount(fn.name, functions);
    const callers = countCallers(fn.name, decls, code);
    return callers === 1;
  });

  if (qualifying.length < FRAGMENTED_MIN_METHODS) return [];

  const anchor = qualifying.reduce((a, b) => (b.line < a.line ? b : a));

  return [
    {
      type: 'FragmentedCode',
      severity: 'low',
      functionName: anchor.name,
      line: anchor.line,
      description: `FragmentedCode — ${qualifying.length} trivial (CC=1, <${FRAGMENTED_MAX_LLOC} LLOC) single-caller methods. Over-fragmentation reduces cross-file readability for AI reasoning.`,
      suggestion: `Consider inlining the trivial single-caller helpers back into their orchestrator; aim for a CC≈10 sweet spot rather than micro-method sprawl.`,
      metricValue: qualifying.length,
    },
  ];
}
