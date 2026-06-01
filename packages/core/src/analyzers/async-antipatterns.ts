// packages/core/src/analyzers/async-antipatterns.ts
// Sprint 58: AsyncAntiPattern detector — DrAsync P1/P3/P7/P8 for TypeScript/JavaScript only.
//
// References:
//   DrAsync (ICSE 2022) — https://franktip.org/pubs/icse2022-drasync.pdf
//   Four statically-detectable anti-patterns without dataflow analysis.

import type { Smell } from '../types';

/**
 * Detects async/Promise anti-patterns in TypeScript or JavaScript source code.
 *
 * This function MUST be called only for language === 'typescript' | 'javascript'.
 * The caller is responsible for language-gating.
 *
 * Detected patterns (DrAsync catalogue):
 *   P1 — asyncFunctionNoAwait:      async function that never uses await
 *   P3 — asyncFunctionAwaitedReturn: redundant `return await` in non-try context
 *   P7 — reactionReturnsPromise:    .then() callback that returns a new .then()
 *   P8 — executorOneArgUsed:        new Promise((resolve) => ...) missing reject
 */
export function detectAsyncAntiPatterns(code: string): Smell[] {
  const smells: Smell[] = [];

  smells.push(
    ...detectP1AsyncNoAwait(code),
    ...detectP3RedundantAwaitReturn(code),
    ...detectP7ReactionReturnsPromise(code),
    ...detectP8ExecutorOneArg(code),
  );

  return smells;
}

// ---------------------------------------------------------------------------
// P1 — asyncFunctionNoAwait
// ---------------------------------------------------------------------------

/**
 * DrAsync P1: async function body contains no await expression.
 * Uses a bracket-balancing approach to extract function bodies, then checks
 * for absence of `await` within them.
 *
 * Exceptions:
 *   - Functions containing `return new Promise(` are excluded (explicit Promise
 *     constructor, DrAsync P4 — intentional async boundary).
 */
function detectP1AsyncNoAwait(code: string): Smell[] {
  const smells: Smell[] = [];

  // Find all positions of async function declarations / expressions
  // Patterns: async function name(...), async (...) =>, const x = async (...)
  const asyncFnRe = /\basync\s+function\s*\*?\s*(\w*)/g;

  let m: RegExpExecArray | null;
  while ((m = asyncFnRe.exec(code)) !== null) {
    const bodyStart = findFunctionBodyBrace(code, m.index + m[0].length);
    if (bodyStart === -1) continue;

    const body = extractBracketedBody(code, bodyStart);
    if (body === null) continue;

    // Skip functions containing explicit Promise constructor (DrAsync P4 exclusion)
    if (/\bnew\s+Promise\s*\(/.test(body)) continue;

    // Check for await in the body
    if (!/\bawait\b/.test(body)) {
      const lineNum = code.slice(0, m.index).split('\n').length;
      const functionName = m[1] || undefined;
      smells.push({
        type: 'AsyncAntiPattern',
        severity: 'medium',
        line: lineNum,
        functionName: functionName || undefined,
        description: 'asyncFunctionNoAwait — async function declares no await expression; the async keyword is superfluous',
        suggestion:
          'Remove the async keyword if no await is needed, or add await to the async operation inside.',
      });
    }
  }

  return smells;
}

/**
 * Find the position of the actual function body opening brace `{`.
 * Skips past parameter list `(...)` and TypeScript return type annotation `): ReturnType {`.
 * Returns the index of `{` in `code`, or -1 if not found.
 */
function findFunctionBodyBrace(code: string, startAfterName: number): number {
  // Skip past the parameter list: find the '(' and its matching ')'
  let i = startAfterName;
  // Skip whitespace
  while (i < code.length && /\s/.test(code[i])) i++;
  if (i >= code.length) return -1;

  if (code[i] !== '(') {
    // Could be a named function where we started right at the paren
    // Search for the next '(' within 100 chars
    const nextParen = code.indexOf('(', i);
    if (nextParen === -1 || nextParen - i > 100) return -1;
    i = nextParen;
  }

  // Balance parens to skip the parameter list
  let depth = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) { i++; break; } }
    else if (ch === '`' || ch === '"' || ch === "'") { i = skipString(code, i); continue; }
    i++;
  }

  // Now skip TypeScript return type annotation (if any) to find the `{`
  // The return type follows `:` and ends at `{`. Skip balanced `<>` and `()` in type.
  const limit = Math.min(code.length, i + 300);
  while (i < limit) {
    const ch = code[i];
    if (ch === '{') return i; // found the function body
    if (ch === ';' || ch === '\n\n') return -1; // interface/overload declaration
    if (ch === '<') {
      // Skip generic type arguments
      i = skipAngleBrackets(code, i);
      continue;
    }
    if (ch === '(') {
      // Skip nested parens in type (e.g. function type)
      i = skipBalancedChar(code, i, '(', ')');
      continue;
    }
    i++;
  }
  return -1;
}

function skipAngleBrackets(code: string, start: number): number {
  let depth = 0, i = start;
  const limit = Math.min(code.length, start + 500);
  while (i < limit) {
    const ch = code[i];
    if (ch === '<') depth++;
    else if (ch === '>') { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return i;
}

function skipBalancedChar(code: string, start: number, open: string, close: string): number {
  let depth = 0, i = start;
  const limit = Math.min(code.length, start + 1000);
  while (i < limit) {
    const ch = code[i];
    if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return i + 1; }
    i++;
  }
  return i;
}

/**
 * Extracts the balanced braced body starting at `startIndex` (which points to the '{').
 * Returns the content between the outermost braces (exclusive), or null on parse failure.
 */
function extractBracketedBody(code: string, startIndex: number): string | null {
  if (code[startIndex] !== '{') return null;
  let depth = 0;
  let i = startIndex;
  const limit = Math.min(code.length, startIndex + 20_000); // safety cap for very large files
  while (i < limit) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return code.slice(startIndex + 1, i);
    } else if (ch === '`' || ch === '"' || ch === "'") {
      // Skip string literals to avoid counting braces inside them
      i = skipString(code, i);
      continue;
    } else if (ch === '/' && code[i + 1] === '/') {
      // Skip line comment
      const nl = code.indexOf('\n', i);
      i = nl === -1 ? limit : nl;
      continue;
    } else if (ch === '/' && code[i + 1] === '*') {
      // Skip block comment
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? limit : end + 2;
      continue;
    }
    i++;
  }
  return null; // unbalanced — give up
}

function skipString(code: string, start: number): number {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === quote) return i + 1;
    i++;
  }
  return i;
}

// ---------------------------------------------------------------------------
// P3 — asyncFunctionAwaitedReturn (redundant await in return position)
// ---------------------------------------------------------------------------

/**
 * DrAsync P3: `return await expr` where the await is redundant.
 * Redundant except inside a try/catch block where the await is needed to
 * convert a rejected promise to a thrown exception.
 *
 * Strategy: strip comments from code, then find all `return await` occurrences
 * and check whether they appear within a try block.
 *
 * Exclusions: `return await Promise.all/race/allSettled/any(...)` — these
 * are sometimes intentional for error-propagation semantics.
 */
function detectP3RedundantAwaitReturn(code: string): Smell[] {
  const smells: Smell[] = [];

  // Strip single-line and block comments to avoid false positives from comment text
  const strippedCode = stripComments(code);

  // Simple regex scan — we intentionally exclude Promise combinators
  const returnAwaitRe = /\breturn\s+await\s+(?!Promise\.(?:all|race|allSettled|any)\b)(\w)/g;

  let m: RegExpExecArray | null;
  while ((m = returnAwaitRe.exec(strippedCode)) !== null) {
    // Check if inside a try block: scan backwards for try { without matching }
    const before = strippedCode.slice(0, m.index);
    if (isInsideTryBlock(before)) continue;

    const lineNum = strippedCode.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'AsyncAntiPattern',
      severity: 'low',
      line: lineNum,
      description:
        'asyncFunctionAwaitedReturn — redundant "return await" outside a try/catch: the outer async function will propagate the promise automatically',
      suggestion:
        'Change "return await expr" to "return expr" unless inside a try/catch where the await is needed to convert rejection to exception.',
    });
  }

  return smells;
}

/** Strip single-line and block comments from code, preserving line numbers. */
function stripComments(code: string): string {
  let result = '';
  let i = 0;
  while (i < code.length) {
    if (code[i] === '/' && code[i + 1] === '/') {
      // Line comment: replace with spaces until newline
      const nl = code.indexOf('\n', i);
      const end = nl === -1 ? code.length : nl;
      result += ' '.repeat(end - i);
      i = end;
    } else if (code[i] === '/' && code[i + 1] === '*') {
      // Block comment: replace with spaces (preserve newlines for line counting)
      const endComment = code.indexOf('*/', i + 2);
      const end = endComment === -1 ? code.length : endComment + 2;
      const snippet = code.slice(i, end);
      // Preserve newlines, replace other chars with spaces
      result += snippet.replace(/[^\n]/g, ' ');
      i = end;
    } else if (code[i] === '`' || code[i] === '"' || code[i] === "'") {
      // String literal: copy verbatim
      const start = i;
      i = skipString(code, i);
      result += code.slice(start, i);
    } else {
      result += code[i];
      i++;
    }
  }
  return result;
}

/**
 * Heuristic: check whether the code (up to a point) leaves us inside an open
 * try block. We count unclosed `try {` patterns backwards.
 */
function isInsideTryBlock(codeBefore: string): boolean {
  // Count `try {` occurrences and matching `}` blocks — approximation
  // We look for the last `try` keyword before our position without a matching close
  const tryRe = /\btry\s*\{/g;
  const tryPositions: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = tryRe.exec(codeBefore)) !== null) {
    tryPositions.push(m.index);
  }
  if (tryPositions.length === 0) return false;

  // For the last try, count braces after it
  const lastTry = tryPositions[tryPositions.length - 1];
  const afterTry = codeBefore.slice(lastTry);
  let depth = 0;
  for (const ch of afterTry) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  // If depth > 0, we are still inside the try block
  return depth > 0;
}

// ---------------------------------------------------------------------------
// P7 — reactionReturnsPromise (.then callback returns another .then)
// ---------------------------------------------------------------------------

/**
 * DrAsync P7: a .then() callback that returns a new .then() call instead of
 * returning the promise and chaining from outside.
 *
 * Strategy: find all `.then(` positions, extract the callback body using
 * bracket balancing (handles multiline and nested braces), then check for
 * `return <expr>.then(` inside.
 */
function detectP7ReactionReturnsPromise(code: string): Smell[] {
  const smells: Smell[] = [];

  // Find all .then( positions
  const thenRe = /\.then\s*\(/g;
  let m: RegExpExecArray | null;

  while ((m = thenRe.exec(code)) !== null) {
    // Find the opening paren of the .then( call
    const afterThen = code.slice(m.index + m[0].length - 1); // starts at '('
    const argsContent = extractParenContent(afterThen);
    if (argsContent === null) continue;

    // Check if the callback body (which may contain a brace block) contains
    // "return <expr>.then(" — look for a line with both 'return' and '.then(' on it
    if (containsReturnThen(argsContent)) {
      const lineNum = code.slice(0, m.index).split('\n').length;
      smells.push({
        type: 'AsyncAntiPattern',
        severity: 'low',
        line: lineNum,
        description:
          'reactionReturnsPromise — .then() callback returns a nested .then() instead of chaining; leads to promise nesting anti-pattern',
        suggestion:
          'Return the inner promise and chain: promise.then(a).then(b) instead of promise.then(() => inner.then(b))',
      });
    }
  }

  return smells;
}

/**
 * Checks whether the given string contains a `return` statement where the
 * returned expression chains `.then(`. Splits into lines and checks each line
 * as well as multi-line continuations.
 */
function containsReturnThen(body: string): boolean {
  // Simple approach: check if there is a 'return' keyword on a line that also
  // contains '.then(' OR if a 'return' line is followed by a '.then(' continuation
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\breturn\b/.test(line)) continue;
    // Check current line and next 2 lines for .then(
    const window = lines.slice(i, i + 3).join('\n');
    if (/\.then\s*\(/.test(window)) return true;
  }
  return false;
}

/**
 * Extracts the content between balanced parentheses starting at index 0 of `code`
 * (which must start with '('). Returns the content (exclusive of outer parens).
 */
function extractParenContent(code: string): string | null {
  if (code[0] !== '(') return null;
  let depth = 0;
  let i = 0;
  const limit = Math.min(code.length, 10_000);
  while (i < limit) {
    const ch = code[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return code.slice(1, i);
    } else if (ch === '`' || ch === '"' || ch === "'") {
      i = skipString(code, i);
      continue;
    } else if (ch === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i);
      i = nl === -1 ? limit : nl;
      continue;
    } else if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? limit : end + 2;
      continue;
    }
    i++;
  }
  return null;
}

// ---------------------------------------------------------------------------
// P8 — executorOneArgUsed (Promise constructor missing reject parameter)
// ---------------------------------------------------------------------------

/**
 * DrAsync P8: Promise constructor callback uses only resolve, not reject.
 * This prevents proper error propagation from the executor.
 *
 * Pattern: new Promise((resolve) => ...) or new Promise(function(resolve) ...)
 * where reject is absent.
 */
function detectP8ExecutorOneArg(code: string): Smell[] {
  const smells: Smell[] = [];

  // Match Promise constructors where the callback has exactly one parameter
  // i.e. new Promise((resolve) => or new Promise(function(resolve)
  // Exclude patterns with two parameters like (resolve, reject)
  const singleArgRe = /\bnew\s+Promise\s*\(\s*(?:function\s*)?\(\s*(\w+)\s*\)/g;

  let m: RegExpExecArray | null;
  while ((m = singleArgRe.exec(code)) !== null) {
    const param = m[1];
    // Make sure it's not the reject parameter — check if param looks like "reject"
    // (unlikely but defensive)
    if (param === 'reject') continue;
    const lineNum = code.slice(0, m.index).split('\n').length;
    smells.push({
      type: 'AsyncAntiPattern',
      severity: 'low',
      line: lineNum,
      description:
        'executorOneArgUsed — Promise executor callback only uses resolve, not reject; errors inside the executor cannot be propagated',
      suggestion:
        'Add a reject parameter: new Promise((resolve, reject) => { ... }) and call reject(error) on failure.',
    });
  }

  return smells;
}
