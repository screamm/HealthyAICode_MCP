/**
 * Type Coverage analyzer — measures the share of parameters and return values
 * that carry explicit type annotations.
 *
 * Implementation notes:
 *  - TypeScript: regex for `name: Type` parameters and `): ReturnType` returns.
 *  - Python: regex for `name: type` parameters and `-> type` returns (PEP 484).
 *  - Java / Kotlin / C# / Go / Rust / Swift: every signature is typed by
 *    definition, so we return a perfect score (10).
 *  - JavaScript / Ruby / PHP: no native annotations — fall back to JSDoc /
 *    docblock counts via `@param` and `@returns` / `@return`.
 *
 * This is a deliberately coarse approximation. Generics, destructuring, and
 * default-typed parameters are tolerated with +/- 10 % expected error.
 */

export interface TypeCoverageResult {
  /** Composite 0..10 score (round(coverageRatio * 10)). */
  score: number;
  /** Parameters with an explicit type annotation. */
  annotatedParams: number;
  /** Total parameters seen in the file. */
  totalParams: number;
  /** Functions with an explicit return-type annotation. */
  annotatedReturns: number;
  /** Total functions detected in the file. */
  totalFunctions: number;
  /** annotated / total, clamped to [0,1]. 1.0 when both totals are 0. */
  coverageRatio: number;
}

const STATIC_TYPED = new Set(['java', 'kotlin', 'csharp', 'go', 'rust', 'swift']);

/**
 * Analyze type coverage for a source file.
 *
 * @param content Full source text.
 * @param language Lowercase language identifier (e.g. "typescript").
 */
export function analyzeTypeCoverage(content: string, language: string): TypeCoverageResult {
  const lang = language.toLowerCase();
  if (STATIC_TYPED.has(lang)) return perfectScore();
  if (lang === 'typescript') return analyzeTypeScriptSource(content);
  if (lang === 'python') return analyzePythonSource(content);
  if (lang === 'javascript' || lang === 'ruby' || lang === 'php') return analyzeViaJsDoc(content);
  // Unknown language — neutral coverage.
  return { score: 5, annotatedParams: 0, totalParams: 0, annotatedReturns: 0, totalFunctions: 0, coverageRatio: 0.5 };
}

function perfectScore(): TypeCoverageResult {
  return { score: 10, annotatedParams: 0, totalParams: 0, annotatedReturns: 0, totalFunctions: 0, coverageRatio: 1 };
}

/** Strip block / line / string content so subsequent regexes do not match inside them. */
function sanitize(src: string): string {
  let s = src;
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s.replace(/\/\/[^\n]*/g, ' ');
  s = s.replace(/"""[\s\S]*?"""/g, ' ');
  s = s.replace(/'''[\s\S]*?'''/g, ' ');
  s = s.replace(/`(?:\\.|[^`\\])*`/g, ' ');
  s = s.replace(/"(?:\\.|[^"\\])*"/g, ' ');
  s = s.replace(/'(?:\\.|[^'\\])*'/g, ' ');
  return s;
}

interface RawSig {
  paramsBlock: string;
  hasReturn: boolean;
}

function analyzeTypeScriptSource(rawContent: string): TypeCoverageResult {
  const content = sanitize(rawContent);
  const sigs = extractTsSignatures(content);
  let annotatedParams = 0;
  let totalParams = 0;
  let annotatedReturns = 0;
  const totalFunctions = sigs.length;

  for (const s of sigs) {
    const params = splitParams(s.paramsBlock);
    for (const p of params) {
      if (!p.trim()) continue;
      totalParams++;
      if (containsAnnotationColon(p)) annotatedParams++;
    }
    if (s.hasReturn) annotatedReturns++;
  }

  return buildResult(annotatedParams, totalParams, annotatedReturns, totalFunctions);
}

function extractTsSignatures(content: string): RawSig[] {
  const sigs: RawSig[] = [];
  const fnRe = /\bfunction\s+[A-Za-z_$][\w$]*\s*(?:<[^>]*>\s*)?\(/g;
  pushSignatures(content, fnRe, sigs);
  const arrowRe = /(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::\s*[^=]+)?=\s*(?:async\s*)?(?:<[^>]*>\s*)?\(/g;
  pushSignatures(content, arrowRe, sigs);
  const methodRe = /^[ \t]*(?:public\s+|private\s+|protected\s+|static\s+|async\s+|override\s+|readonly\s+)*[A-Za-z_$][\w$]*\s*(?:<[^>]*>\s*)?\(/gm;
  pushSignatures(content, methodRe, sigs);
  return sigs;
}

/** Walks each regex match, balances parentheses to extract the param list, then reads the trailer for `: Type`. */
function pushSignatures(content: string, re: RegExp, sigs: RawSig[]): void {
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const openIdx = content.indexOf('(', m.index);
    if (openIdx === -1) continue;
    const closeIdx = matchParen(content, openIdx);
    if (closeIdx === -1) continue;
    const paramsBlock = content.slice(openIdx + 1, closeIdx);
    const trailer = content.slice(closeIdx + 1, closeIdx + 200);
    const hasReturn = /^\s*:\s*[^=;{]+(?:=>|[{;])/.test(trailer) || /^\s*:\s*[^=;{]+$/m.test(trailer.split('\n')[0] ?? '');
    sigs.push({ paramsBlock, hasReturn });
  }
}

/** Finds the index of the closing paren matching the opening paren at `openIdx`. */
function matchParen(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Splits a parameter list on commas at depth 0 (ignores commas inside generics, tuples, objects). */
function splitParams(block: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < block.length; i++) {
    const ch = block[i];
    if (ch === '<' || ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === '>' || ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') out.push(current);
  return out;
}

/** True if the parameter snippet contains a top-level `:` (i.e. is annotated). */
function containsAnnotationColon(param: string): boolean {
  let depth = 0;
  for (let i = 0; i < param.length; i++) {
    const ch = param[i];
    if (ch === '<' || ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === '>' || ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ':' && depth === 0) return true;
  }
  return false;
}

function analyzePythonSource(rawContent: string): TypeCoverageResult {
  const content = sanitize(rawContent);
  const defRe = /\bdef\s+[A-Za-z_][\w]*\s*\(/g;
  let annotatedParams = 0;
  let totalParams = 0;
  let annotatedReturns = 0;
  let totalFunctions = 0;

  let m: RegExpExecArray | null;
  while ((m = defRe.exec(content)) !== null) {
    const openIdx = content.indexOf('(', m.index);
    if (openIdx === -1) continue;
    const closeIdx = matchParen(content, openIdx);
    if (closeIdx === -1) continue;
    totalFunctions++;
    const block = content.slice(openIdx + 1, closeIdx);
    const params = splitParams(block);
    for (const p of params) {
      const trimmed = p.trim();
      if (!trimmed) continue;
      if (trimmed === 'self' || trimmed === 'cls') continue;
      totalParams++;
      if (containsAnnotationColon(trimmed)) annotatedParams++;
    }
    const trailer = content.slice(closeIdx + 1, closeIdx + 200);
    if (/^\s*->\s*[^:]+:/.test(trailer)) annotatedReturns++;
  }

  return buildResult(annotatedParams, totalParams, annotatedReturns, totalFunctions);
}

function analyzeViaJsDoc(rawContent: string): TypeCoverageResult {
  const content = sanitize(rawContent);
  const fnMatches = content.match(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(/g) ?? [];
  const arrowMatches = content.match(/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\(/g) ?? [];
  const totalFunctions = fnMatches.length + arrowMatches.length;
  const paramTagCount = (rawContent.match(/@param\b/g) ?? []).length;
  const returnsTagCount = (rawContent.match(/@returns?\b/g) ?? []).length;
  const totalParams = totalFunctions * 2;
  const annotatedParams = Math.min(paramTagCount, totalParams);
  const annotatedReturns = Math.min(returnsTagCount, totalFunctions);
  return buildResult(annotatedParams, totalParams, annotatedReturns, totalFunctions);
}

function buildResult(annotatedParams: number, totalParams: number, annotatedReturns: number, totalFunctions: number): TypeCoverageResult {
  const denom = totalParams + totalFunctions;
  const coverageRatio = denom === 0 ? 1 : (annotatedParams + annotatedReturns) / denom;
  const clamped = Math.max(0, Math.min(1, coverageRatio));
  const score = Math.round(clamped * 10);
  return { score, annotatedParams, totalParams, annotatedReturns, totalFunctions, coverageRatio: clamped };
}
