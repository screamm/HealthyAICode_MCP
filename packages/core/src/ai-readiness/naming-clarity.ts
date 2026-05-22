/**
 * Naming Clarity analyzer — measures the quality of identifier naming
 * via lightweight text/regex heuristics (no AST required).
 *
 * Rationale: LLMs are next-token predictors. Cryptic, single-letter, or
 * inconsistently-cased identifiers reduce prediction confidence and
 * make AI-assisted edits more brittle.
 */

export interface NamingClarityResult {
  /** Composite 0..10 score. Higher is better. */
  score: number;
  /** Number of single-character variables (excluding well-known loop indices). */
  singleCharVars: number;
  /** Names shorter than 3 characters excluding the well-known whitelist. */
  crypticNames: string[];
  /** 1 if the file mixes camelCase and snake_case styles for user identifiers, else 0. */
  inconsistentCasing: number;
}

/** Identifiers we never count as cryptic — common loop indices and ubiquitous short names. */
const WELL_KNOWN_SHORT = new Set([
  'i', 'j', 'k', 'n', 'm', 'id', 'db', 'ui', 'os', 'fs', 'io', 'on', 'no', 'to', 'in', 'is', 'as',
  'of', 'or', 'el', 'fn', 'cb', 'ev', 'ok', 'ip', 'pi', 'pk', 'rx', 'tx',
]);

/**
 * Identifiers excluded because they are language keywords or extremely common
 * constructs that would otherwise produce false positives. The list intentionally
 * covers TypeScript / JavaScript / Python / Java / C# / Go / Rust / Ruby / PHP / Swift
 * so a single regex pass works across all supported languages.
 */
const STOP_WORDS = new Set([
  // declaration/control flow keywords (TS/JS)
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
  'case', 'break', 'continue', 'default', 'new', 'try', 'catch', 'finally', 'throw', 'typeof',
  'instanceof', 'in', 'of', 'class', 'extends', 'implements', 'interface', 'type', 'enum',
  'import', 'from', 'export', 'as', 'async', 'await', 'yield', 'this', 'super', 'true', 'false',
  'null', 'undefined', 'void', 'delete', 'static', 'public', 'private', 'protected', 'readonly',
  'abstract', 'override', 'declare', 'namespace', 'module', 'with',
  // primitive type names
  'string', 'number', 'boolean', 'bigint', 'symbol', 'object', 'any', 'unknown', 'never',
  // Python
  'def', 'lambda', 'pass', 'yield', 'global', 'nonlocal', 'and', 'or', 'not', 'is', 'None', 'True',
  'False', 'self', 'cls', 'elif', 'except', 'raise', 'with', 'assert', 'print',
  // Java / C#
  'public', 'private', 'protected', 'package', 'final', 'volatile', 'transient', 'synchronized',
  'throws', 'native', 'strictfp', 'using', 'sealed', 'virtual', 'override', 'out', 'ref', 'params',
  // Go
  'func', 'go', 'chan', 'select', 'defer', 'fallthrough', 'range', 'struct', 'map', 'interface',
  // Rust
  'fn', 'mut', 'pub', 'crate', 'mod', 'impl', 'trait', 'where', 'unsafe', 'match', 'move', 'ref',
  // PHP
  'array', 'echo', 'isset', 'unset', 'foreach', 'endforeach', 'endif', 'endwhile',
  // Ruby
  'end', 'begin', 'ensure', 'unless', 'until', 'when', 'then', 'redo', 'retry',
  // Swift
  'guard', 'where', 'inout', 'where', 'protocol', 'extension', 'mutating',
]);

/** Returns the casing style of an identifier (or null if unclassifiable). */
function casingOf(name: string): 'camel' | 'snake' | null {
  if (name.length < 2) return null;
  const hasUnderscore = name.includes('_');
  const hasCamelHump = /[a-z][A-Z]/.test(name);
  if (hasUnderscore && !hasCamelHump) return 'snake';
  if (hasCamelHump && !hasUnderscore) return 'camel';
  return null;
}

/** Heuristic check: looks like a sequence of digits or trivially repeated chars. */
function isNumeric(token: string): boolean {
  return /^\d+$/.test(token);
}

/**
 * Analyzes naming clarity in source code via pure regex/text analysis.
 *
 * @param content Full source text of the file.
 * @param _language Language identifier (currently unused — kept for future per-language tuning).
 */
export function analyzeNamingClarity(content: string, _language: string): NamingClarityResult {
  // Strip strings and comments to avoid matching identifiers inside literals.
  const cleaned = stripCommentsAndStrings(content);

  // Identifier extraction: lowercase-starting identifiers (variable names).
  const matches = cleaned.match(/\b([a-z_][a-zA-Z0-9_]*)\b/g) ?? [];

  const singleCharSet = new Set<string>();
  const crypticSet = new Set<string>();
  const camelSet = new Set<string>();
  const snakeSet = new Set<string>();

  for (const raw of matches) {
    if (STOP_WORDS.has(raw)) continue;
    if (isNumeric(raw)) continue;

    if (raw.length === 1) {
      if (!WELL_KNOWN_SHORT.has(raw)) singleCharSet.add(raw);
    } else if (raw.length < 3) {
      if (!WELL_KNOWN_SHORT.has(raw)) crypticSet.add(raw);
    }

    const style = casingOf(raw);
    if (style === 'camel') camelSet.add(raw);
    else if (style === 'snake') snakeSet.add(raw);
  }

  const singleCharVars = singleCharSet.size;
  const crypticNames = Array.from(crypticSet).sort();
  const inconsistentCasing = camelSet.size > 0 && snakeSet.size > 0 ? 1 : 0;

  // Score: start from 10, deduct per finding.
  let score = 10 - singleCharVars * 0.5 - crypticNames.length * 0.3 - inconsistentCasing * 1.5;
  if (score < 0) score = 0;
  if (score > 10) score = 10;
  // Round to one decimal for stable reporting.
  score = Math.round(score * 10) / 10;

  return { score, singleCharVars, crypticNames, inconsistentCasing };
}

/**
 * Best-effort stripping of line comments, block comments, and string literals.
 * Not a perfect lexer — but good enough to avoid the most common false positives.
 */
function stripCommentsAndStrings(src: string): string {
  let s = src;
  // Block comments /* ... */
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ');
  // Line comments // ... and # ...
  s = s.replace(/\/\/[^\n]*/g, ' ');
  s = s.replace(/(^|\s)#[^\n]*/g, '$1');
  // Triple-quoted strings (Python docstrings)
  s = s.replace(/"""[\s\S]*?"""/g, ' ');
  s = s.replace(/'''[\s\S]*?'''/g, ' ');
  // Template / regular strings
  s = s.replace(/`(?:\\.|[^`\\])*`/g, ' ');
  s = s.replace(/"(?:\\.|[^"\\])*"/g, ' ');
  s = s.replace(/'(?:\\.|[^'\\])*'/g, ' ');
  return s;
}
