/**
 * js-slice.ts — function-slice extraction for TS/JS behaviour-equivalence on REAL files.
 *
 * The differential engine in `js-equiv.ts` can only execute a SELF-CONTAINED module: the
 * `node:vm` sandbox has no module resolver, so a real source file whose target function
 * pulls in `import { toDate } from "../toDate/index.ts"` (transpiled to `require(...)`)
 * fails to load — the engine then honestly degrades to `unverified`.
 *
 * This module bridges that gap by extracting the TARGET function PLUS the transitive
 * closure of the local helpers / constants / sibling-module exports it actually needs,
 * inlining them into one self-contained module that the existing engine can run. Imports
 * are handled per an HONEST three-case rule:
 *
 *   (a) RELATIVE import of a pure, resolvable sibling export  → resolve the file on disk,
 *       recursively slice the needed export, and inline it.
 *   (b) BARE/stdlib import the slice does NOT actually use     → drop it (irrelevant).
 *   (c) BARE/stdlib or relative import the slice DOES use but  → DECLINE with
 *       cannot be isolated (third-party, node built-in we do      {ok:false, reason}.
 *       not shim, un-resolvable path)                              The caller surfaces this
 *                                                                  as `unverified` honestly.
 *
 * The result is a `{ ok: true, source }` carrying a module that defines the target function
 * under its ORIGINAL name (the engine resolves it by name), or `{ ok: false, reason }` when
 * the target genuinely depends on un-isolatable external state — in which case NO fabricated
 * pass is produced.
 *
 * Design constraints (match the rest of behavior-equiv/):
 *   - Lexical/regex + brace-balancing, no extra AST dependency.
 *   - Pure functions, deterministic, never throws (failures become {ok:false}).
 *   - Filesystem reads are confined to resolving RELATIVE imports beneath the source file's
 *     directory tree; absolute/parent-escape resolution is allowed only within the repo so a
 *     date-fns `../toDate/index.ts` resolves, but no network/remote fetch ever happens.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve as resolvePath, extname } from 'node:path';

/** Outcome of a slice attempt. */
export type SliceResult =
  | { readonly ok: true; readonly source: string; readonly inlined: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/** Node built-in / stdlib modules we are willing to expose unchanged in the sandbox. */
const SAFE_STDLIB = new Set<string>([
  // deterministic, side-effect-free enough for differential comparison when frozen
  // (the engine freezes Date/Math already). querystring/url/buffer are pure transforms.
]);

/** A parsed import statement. */
interface ParsedImport {
  /** Raw statement text (for removal). */
  readonly raw: string;
  /** Module specifier, e.g. "../toDate/index.ts" or "node:http" or "qs". */
  readonly spec: string;
  /** true when the specifier is a relative path (./ or ../). */
  readonly relative: boolean;
  /** true when this is a TS type-only import (`import type ...`) — erased, never needed. */
  readonly typeOnly: boolean;
  /** Named bindings imported: localName → exportedName (default ⇒ exportedName 'default'). */
  readonly names: ReadonlyArray<{ local: string; exported: string }>;
  /** Namespace binding (`import * as ns from ...`) local name, or null. */
  readonly namespace: string | null;
}

/** A top-level declaration found in a module, with its source span and declared names. */
interface Decl {
  /** All top-level names this declaration binds (functions usually one; const can destructure). */
  readonly names: readonly string[];
  /** Full source text of the declaration (with `export` stripped). */
  readonly text: string;
  /** Free identifiers referenced by this declaration's body (best-effort). */
  readonly refs: readonly string[];
}

// ── Import parsing ──────────────────────────────────────────────────────────────

/** Parse all top-level ES/CJS imports. Best-effort, line-oriented for common shapes. */
function parseImports(source: string): ParsedImport[] {
  const imports: ParsedImport[] = [];

  // ES module imports: `import ... from '...'`  (incl. `import type`, default, namespace, named)
  const esRe =
    /import\s+(type\s+)?([^;'"]*?)\s+from\s+['"]([^'"]+)['"]\s*;?|import\s+['"]([^'"]+)['"]\s*;?/g;
  let m: RegExpExecArray | null;
  while ((m = esRe.exec(source)) !== null) {
    const typeOnly = Boolean(m[1]);
    const clause = (m[2] ?? '').trim();
    const spec = m[3] ?? m[4] ?? '';
    imports.push(buildImport(m[0], spec, typeOnly, clause));
  }

  // CJS requires: `const { a, b } = require('x')`, `const x = require('y')`,
  // `var x = require('z')`. Destructuring + default capture.
  const cjsRe =
    /(?:const|let|var)\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)\s*;?/g;
  while ((m = cjsRe.exec(source)) !== null) {
    const binding = m[1].trim();
    const spec = m[2];
    if (binding.startsWith('{')) {
      const names = binding
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [exported, local] = s.split(':').map((x) => x.trim());
          return { local: local || exported, exported };
        });
      imports.push({
        raw: m[0],
        spec,
        relative: isRelative(spec),
        typeOnly: false,
        names,
        namespace: null,
      });
    } else {
      imports.push({
        raw: m[0],
        spec,
        relative: isRelative(spec),
        typeOnly: false,
        names: [{ local: binding, exported: '*' }],
        namespace: binding,
      });
    }
  }

  return imports;
}

function buildImport(raw: string, spec: string, typeOnly: boolean, clause: string): ParsedImport {
  // clause shapes: ``(side-effect), `Default`, `* as ns`, `{ a, b as c }`, `Default, { a }`
  let namespace: string | null = null;
  const names: { local: string; exported: string }[] = [];
  if (clause) {
    // namespace
    const nsM = /\*\s+as\s+([A-Za-z_$][\w$]*)/.exec(clause);
    if (nsM) namespace = nsM[1];
    // named group { ... }
    const braceM = /\{([^}]*)\}/.exec(clause);
    if (braceM) {
      for (const part of braceM[1].split(',')) {
        const t = part.trim();
        if (!t) continue;
        const asM = /^(?:type\s+)?([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(t);
        if (asM) names.push({ exported: asM[1], local: asM[2] });
        else {
          const id = t.replace(/^type\s+/, '').trim();
          if (/^[A-Za-z_$][\w$]*$/.test(id)) names.push({ exported: id, local: id });
        }
      }
    }
    // default import (leading bareword before a comma or end, not `* as` / `{`)
    const defM = /^([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause.replace(/\{[^}]*\}/, '').trim());
    if (defM && !nsM) names.push({ exported: 'default', local: defM[1] });
  }
  return { raw, spec, relative: isRelative(spec), typeOnly, names, namespace };
}

function isRelative(spec: string): boolean {
  return spec.startsWith('./') || spec.startsWith('../');
}

// ── Declaration extraction ────────────────────────────────────────────────────

/**
 * Extract a top-level declaration that binds `name`, returning its full source text (with a
 * leading `export` stripped) and the identifiers it references. Handles:
 *   - `function name(...) { ... }` (and `async`)
 *   - `const/let/var name = ...;` (arrow, function expr, or value)
 *   - `class name { ... }`
 *   - TS overload signatures: multiple `function name(...)` declaration lines with NO body are
 *     merged in front of the single implementation (only the impl is executable).
 */
function extractDecl(source: string, name: string): Decl | null {
  const id = escapeRe(name);
  // 1. function declarations (collect ALL — overloads + implementation), TOP-LEVEL ONLY.
  const fnRe = new RegExp(
    `(?:^|\\n)[ \\t]*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s+${id}\\b`,
    'g',
  );
  const fnSpans: string[] = [];
  let fm: RegExpExecArray | null;
  while ((fm = fnRe.exec(source)) !== null) {
    const start = fm.index + (fm[0].startsWith('\n') ? 1 : 0);
    // Only treat a declaration as top-level when it sits at brace-depth 0. A `function`/`const`
    // matched INSIDE another function's body is a LOCAL — extracting it would hoist a fragment
    // of someone else's body to module scope (the `const diff = …` bug). Skip those.
    if (braceDepthAt(source, start) !== 0) continue;
    const span = sliceDeclSpan(source, start);
    if (span) fnSpans.push(stripExport(span));
  }
  if (fnSpans.length > 0) {
    const text = fnSpans.join('\n');
    return { names: [name], text, refs: collectRefs(text) };
  }

  // 1b. CommonJS export-assignment of a function expression, TOP-LEVEL ONLY:
  //     `exports.NAME = function [NAME](…) {…}`  /  `module.exports.NAME = …`  /
  //     `NAME = function (…) {…}`. We rewrite it to a top-level `function NAME(…){…}` so the
  //     engine can capture it by name (its sandbox looks up a bare `NAME` and `exports[NAME]`).
  const assignRe = new RegExp(
    `(?:^|\\n)[ \\t]*(?:(?:module\\.)?exports\\.${id}|${id})\\s*=\\s*(?:async\\s+)?function\\b`,
    'g',
  );
  let asm: RegExpExecArray | null;
  while ((asm = assignRe.exec(source)) !== null) {
    const start = asm.index + (asm[0].startsWith('\n') ? 1 : 0);
    if (braceDepthAt(source, start) !== 0) continue;
    // Span from the `function` keyword to the end of its balanced body.
    const fnKw = source.indexOf('function', start);
    const fnSpan = sliceDeclSpan(source, fnKw);
    if (fnSpan) {
      // Normalise to a named declaration so the engine can capture it: ensure the function
      // carries `name` (anonymous `function (…)` → `function NAME (…)`).
      let text = fnSpan.trim();
      if (/^function\s*\(/.test(text)) {
        text = text.replace(/^function\s*\(/, `function ${name}(`);
      } else if (/^function\s+[A-Za-z_$][\w$]*/.test(text)) {
        // already named; keep its own name but the engine captures by `name`, which may differ.
        // Rename the declared identifier to `name` so capture-by-name works.
        text = text.replace(/^function\s+[A-Za-z_$][\w$]*/, `function ${name}`);
      } else if (/^async\s+function/.test(text)) {
        text = text.replace(/^async\s+function\s*(?:[A-Za-z_$][\w$]*)?\s*\(/, `async function ${name}(`);
      }
      return { names: [name], text, refs: collectRefs(text) };
    }
  }

  // 2. const/let/var/class declarations, TOP-LEVEL ONLY.
  const varRe = new RegExp(
    `(?:^|\\n)[ \\t]*(?:export\\s+)?(?:default\\s+)?(?:const|let|var|class)\\s+${id}\\b`,
    'g',
  );
  let vmm: RegExpExecArray | null;
  while ((vmm = varRe.exec(source)) !== null) {
    const start = vmm.index + (vmm[0].startsWith('\n') ? 1 : 0);
    if (braceDepthAt(source, start) !== 0) continue;
    const span = sliceDeclSpan(source, start);
    if (span) {
      const text = stripExport(span);
      // A `const/let/var NAME = require(...)` is an IMPORT binding, not a local value to inline.
      // Treat it as not-a-decl so the import-resolution path in `collectInto` decides whether
      // it can be isolated (relative sibling) or must be declined (bare/stdlib module).
      if (/=\s*require\s*\(/.test(text)) return null;
      return { names: [name], text, refs: collectRefs(text) };
    }
  }
  return null;
}

/**
 * Brace-nesting depth at character offset `at`, ignoring braces inside comments and
 * string/template literals. Depth 0 means top (module) level. Used so {@link extractDecl}
 * never lifts a declaration that lives inside another function's body to module scope.
 */
function braceDepthAt(source: string, at: number): number {
  const clean = stripCommentsAndStrings(source.slice(0, at));
  let depth = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
  }
  return depth;
}

/** Strip a single leading `export ` (and `export default `) keyword from a declaration. */
function stripExport(decl: string): string {
  return decl.replace(/^\s*export\s+(?:default\s+)?/, (mm) =>
    mm.replace(/export\s+(?:default\s+)?/, ''),
  );
}

/**
 * From the start of a top-level declaration, return its full source span:
 *   - for `function`/`class`: head + balanced `{ … }` body.
 *   - for `const/let/var name = …`: up to the statement-terminating `;` (or newline at depth 0).
 */
function sliceDeclSpan(source: string, from: number): string | null {
  const n = source.length;
  // function / class → find the body brace and balance it.
  const headSlice = source.slice(from, Math.min(n, from + 200));
  const isFnOrClass = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class)\b/.test(
    headSlice,
  );
  const isFunction = /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b/.test(headSlice);
  if (isFunction) {
    // A `function` head is:  function NAME <generics?> ( params ) : retType? { body }
    // The param `(...)` and the `<...>` generic clause can themselves contain `{}` (TS type
    // literals like `& {}`), so we must NOT naively grab the first `{`. Walk: skip past the
    // balanced parameter list `(...)`, then the first depth-0 `{` after it opens the body.
    let i = source.indexOf('(', from);
    const firstBrace = source.indexOf('{', from);
    const semi = source.indexOf(';', from);
    // Overload signature: a `;` (or `{` belonging to a return-type literal we can't have) before
    // any param paren is unusual; the canonical overload case is `function f(...): T;` — i.e. a
    // `;` after the param list with no body brace. Detect "no body brace before the next
    // function/decl" by checking the paren-then-semicolon shape below.
    if (i < 0) {
      // No params — treat first '{' as body, or ';' as an overload-less declaration.
      if (semi >= 0 && (firstBrace < 0 || semi < firstBrace)) return source.slice(from, semi + 1);
      if (firstBrace < 0) return null;
      i = firstBrace;
    } else {
      // Balance the parameter list parens (handles nested () and {} inside type annotations).
      let pdepth = 0;
      let j = i;
      for (; j < n; j++) {
        const c = source[j];
        if (c === '(') pdepth++;
        else if (c === ')') {
          pdepth--;
          if (pdepth === 0) {
            j++;
            break;
          }
        }
      }
      // After the param list: optional `: ReturnType` then either `{` (body) or `;` (overload).
      let k = j;
      while (k < n && source[k] !== '{' && source[k] !== ';') k++;
      if (k >= n) return source.slice(from);
      if (source[k] === ';') return source.slice(from, k + 1); // overload signature, no body
      i = k; // points at the body '{'
    }
    // Balance the body braces.
    let depth = 0;
    for (; i < n; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) return source.slice(from, i + 1);
      }
    }
    return source.slice(from);
  }
  if (isFnOrClass) {
    // class NAME <generics?> (extends X<...>)? { body } — no param parens; the heritage clause
    // may contain `<>` but the body is the first depth-0 `{`. Lexical brace-balance from there.
    const i0 = source.indexOf('{', from);
    if (i0 < 0) return null;
    let i = i0;
    let depth = 0;
    for (; i < n; i++) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) return source.slice(from, i + 1);
      }
    }
    return source.slice(from);
  }
  // const/let/var → balance (), [], {} and stop at a depth-0 ';'.
  let i = from;
  let depth = 0;
  let sawEq = false;
  for (; i < n; i++) {
    const c = source[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === '=' && source[i + 1] !== '=' && source[i - 1] !== '=' && source[i - 1] !== '!' && source[i - 1] !== '<' && source[i - 1] !== '>') sawEq = true;
    else if (c === ';' && depth === 0) return source.slice(from, i + 1);
    else if (c === '\n' && depth === 0 && sawEq) {
      // arrow/value spanning to newline with no ';' — accept up to here.
      return source.slice(from, i);
    }
  }
  return source.slice(from);
}

/**
 * Collect candidate FREE identifiers referenced in a declaration's text (best-effort), EXCLUDING
 * names that are locally bound within that same text (parameters, `const/let/var`, nested
 * function/class names, catch bindings, arrow params). This keeps locals like `const diff = …`
 * from being mis-resolved to a top-level declaration and hoisted out of the body.
 */
function collectRefs(text: string): string[] {
  // Strip comments + string/template bodies so identifiers inside them don't count.
  const clean = stripCommentsAndStrings(text);
  const local = collectLocalBindings(clean);
  const ids = new Set<string>();
  const idRe = /\b([A-Za-z_$][\w$]*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(clean)) !== null) {
    const word = m[1];
    // skip property accesses (`.foo`) and labelled-property names (`{ foo: ... }` key)
    const prev = clean[m.index - 1];
    if (prev === '.') continue;
    if (local.has(word)) continue;
    ids.add(word);
  }
  return [...ids];
}

/** Names bound locally within a (comment/string-stripped) declaration text. */
function collectLocalBindings(clean: string): Set<string> {
  const local = new Set<string>();
  // const/let/var bindings (incl. simple destructuring names)
  const declRe = /\b(?:const|let|var)\s+(\{[^}]*\}|\[[^\]]*\]|[A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(clean)) !== null) {
    for (const nm of m[1].match(/[A-Za-z_$][\w$]*/g) ?? []) local.add(nm);
  }
  // nested function / class names
  const fnRe = /\b(?:function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = fnRe.exec(clean)) !== null) local.add(m[1]);
  // catch (e) bindings
  const catchRe = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g;
  while ((m = catchRe.exec(clean)) !== null) local.add(m[1]);
  // parameter lists of any `(...)  =>` arrow or `function (...)` — collect param identifiers.
  const paramListRe = /(?:function[^(]*|=>\s*|\b[A-Za-z_$][\w$]*\s*)?\(([^()]*)\)\s*(?::[^={;]+)?(?:=>|\{)/g;
  while ((m = paramListRe.exec(clean)) !== null) {
    for (const part of m[1].split(',')) {
      const id = part.trim().replace(/[?:].*$/, '').replace(/=.*$/, '').replace(/^\.\.\./, '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(id)) local.add(id);
    }
  }
  return local;
}

/** Identifiers that are JS keywords / globals available in the sandbox — never need slicing. */
const SANDBOX_GLOBALS = new Set<string>([
  // language keywords / literals
  'function', 'return', 'const', 'let', 'var', 'if', 'else', 'for', 'while', 'do', 'switch',
  'case', 'default', 'break', 'continue', 'new', 'typeof', 'instanceof', 'in', 'of', 'class',
  'extends', 'super', 'this', 'void', 'delete', 'throw', 'try', 'catch', 'finally', 'yield',
  'await', 'async', 'true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'export', 'import',
  'from', 'as', 'static', 'get', 'set',
  // builtin globals present in the vm realm
  'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp', 'Map',
  'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Promise', 'Error', 'TypeError', 'RangeError',
  'SyntaxError', 'ReferenceError', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'BigInt',
  'Reflect', 'Proxy', 'console', 'URLSearchParams', 'encodeURIComponent', 'decodeURIComponent',
  'encodeURI', 'decodeURI', 'globalThis', 'structuredClone',
]);

// ── Comment/string stripper (shared shape with js-equiv.ts) ──────────────────────

function stripCommentsAndStrings(source: string): string {
  let out = '';
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];
    if (c === '/' && c2 === '/') {
      i += 2;
      while (i < n && source[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && c2 === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
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

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Relative-import resolution ────────────────────────────────────────────────

/** Candidate on-disk paths for a relative module specifier. */
function resolveRelative(fromFile: string, spec: string): string | null {
  const base = resolvePath(dirname(fromFile), spec);
  const candidates = [
    base,
    base.replace(/\.ts$/, '.js'),
    base.replace(/\.js$/, '.ts'),
    `${base}.ts`,
    `${base}.js`,
    `${base}.mjs`,
    resolvePath(base, 'index.ts'),
    resolvePath(base, 'index.js'),
  ];
  // If spec already ends with an extension that doesn't exist, also try swapping ts/js.
  for (const c of candidates) {
    if (existsSync(c) && extname(c)) {
      try {
        const stat = readFileSync(c, 'utf8');
        if (typeof stat === 'string') return c;
      } catch {
        /* fallthrough */
      }
    }
  }
  return null;
}

// ── Top-level slice driver ────────────────────────────────────────────────────

interface SliceContext {
  /** Names already emitted (avoid duplicates / cycles). */
  readonly emitted: Set<string>;
  /** Inlined-symbol provenance, for transparency. */
  readonly inlined: string[];
  /** Recursion budget (defends against pathological graphs). */
  budget: { n: number };
}

/**
 * Recursively collect the declarations needed for `name` from `source` (a module whose path is
 * `file`), following same-file declarations and relative-import sibling modules. Appends emitted
 * declaration texts to `acc` in dependency order. Returns `null` on success, or a reason string
 * when an un-isolatable dependency is hit (caller turns that into an honest `unverified`).
 */
function collectInto(
  acc: string[],
  source: string,
  file: string | null,
  name: string,
  ctx: SliceContext,
): string | null {
  if (ctx.emitted.has(name)) return null;
  if (--ctx.budget.n < 0) return 'dependency graph too large to isolate safely';

  const imports = parseImports(source);
  // Resolve where `name` comes from in THIS module.
  // 1. Is it a local declaration?
  const decl = extractDecl(source, name);
  if (decl) {
    ctx.emitted.add(name);
    // First, resolve this decl's references (so deps are emitted BEFORE the decl).
    const reason = resolveRefs(acc, source, file, decl.refs, imports, ctx);
    if (reason) return reason;
    acc.push(decl.text);
    return null;
  }

  // 2. Is it imported? Find which import binds `name` locally.
  for (const imp of imports) {
    if (imp.typeOnly) continue;
    const binding = imp.names.find((b) => b.local === name);
    const isNs = imp.namespace === name;
    if (!binding && !isNs) continue;

    if (imp.relative) {
      if (!file) return `relative import "${imp.spec}" cannot be resolved (source path unknown)`;
      const target = resolveRelative(file, imp.spec);
      if (!target) return `relative import "${imp.spec}" could not be resolved on disk`;
      let depSource: string;
      try {
        depSource = readFileSync(target, 'utf8');
      } catch (e) {
        return `relative import "${imp.spec}" could not be read: ${(e as Error).message}`;
      }
      if (isNs) {
        // namespace import — would need to inline the whole module's API; decline honestly
        // unless trivially small. Conservative: decline.
        return `namespace import "* as ${name}" from "${imp.spec}" cannot be isolated`;
      }
      // Recurse for the EXPORTED name in the sibling module, then alias to the LOCAL name.
      const exportedName = binding!.exported === 'default' ? findDefaultExportName(depSource) : binding!.exported;
      if (!exportedName) return `default import from "${imp.spec}" has no resolvable name`;
      const before = acc.length;
      const reason = collectInto(acc, depSource, target, exportedName, ctx);
      if (reason) return reason;
      // If the local alias differs from the exported name, add an alias binding.
      if (binding!.local !== exportedName && acc.length > before) {
        acc.push(`const ${binding!.local} = ${exportedName};`);
        ctx.emitted.add(binding!.local);
      }
      ctx.inlined.push(`${name} ← ${imp.spec}`);
      return null;
    }

    // bare / stdlib import that the slice actually uses → cannot isolate honestly.
    return `target depends on external module "${imp.spec}" (binding "${name}") which cannot be isolated in the sandbox`;
  }

  // 3. Not found anywhere — could be a sandbox global (ok) or a genuinely missing name.
  // We do NOT fail here; resolveRefs filters globals. If it's truly missing the engine's
  // load step will surface a precise ReferenceError, which is honest.
  return null;
}

/** Resolve each free reference of a declaration, emitting dependencies. */
function resolveRefs(
  acc: string[],
  source: string,
  file: string | null,
  refs: readonly string[],
  imports: readonly ParsedImport[],
  ctx: SliceContext,
): string | null {
  for (const ref of refs) {
    if (SANDBOX_GLOBALS.has(ref)) continue;
    if (ctx.emitted.has(ref)) continue;
    // Only follow refs that are either local decls or imported bindings; ignore params/locals
    // (collectInto's extractDecl returns null for them → treated as harmless).
    const isLocalDecl = extractDecl(source, ref) !== null;
    const importBinding = imports.find(
      (imp) => !imp.typeOnly && (imp.names.some((b) => b.local === ref) || imp.namespace === ref),
    );
    if (!isLocalDecl && !importBinding) continue;
    const reason = collectInto(acc, source, file, ref, ctx);
    if (reason) return reason;
  }
  return null;
}

/** Best-effort: find the name of the default-exported function/class in a module. */
function findDefaultExportName(source: string): string | null {
  const m =
    /export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(source) ||
    /export\s+default\s+class\s+([A-Za-z_$][\w$]*)/.exec(source);
  if (m) return m[1];
  // `export default expr;` with a named local — fall back to a synthetic name.
  return null;
}

/**
 * Build a self-contained TS/JS module exporting `targetName` by slicing it (and its transitive
 * pure dependencies) out of `source`. `file` is the on-disk path of `source` (needed to resolve
 * relative imports); pass `null` if unknown (relative imports then cause an honest decline).
 *
 * Returns `{ ok:true, source }` when the slice is fully self-contained, or `{ ok:false, reason }`
 * when the target genuinely depends on un-isolatable external state — NEVER a fabricated pass.
 */
export function sliceJsFunction(
  source: string,
  targetName: string,
  file: string | null,
): SliceResult {
  // Fast path: if the module has no relative/bare value-imports at all, it's already
  // self-contained — return as-is (the engine handles it directly).
  const imports = parseImports(source).filter((i) => !i.typeOnly);
  if (imports.length === 0) {
    return { ok: true, source, inlined: [] };
  }

  const acc: string[] = [];
  const ctx: SliceContext = { emitted: new Set(), inlined: [], budget: { n: 200 } };
  const reason = collectInto(acc, source, file, targetName, ctx);
  if (reason) return { ok: false, reason };
  if (!ctx.emitted.has(targetName)) {
    return {
      ok: false,
      reason: `target function "${targetName}" not found as a top-level declaration in the source`,
    };
  }
  // Emit dependencies first (acc is in dependency order), target last is already in acc.
  const sliced = acc.join('\n\n');
  return { ok: true, source: sliced, inlined: ctx.inlined };
}
