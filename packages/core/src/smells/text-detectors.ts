import type { Smell } from '../types';

const SATD_KEYWORDS = ['TODO', 'FIXME', 'HACK', 'XXX', 'BUG', 'KLUDGE'];
// Matches SATD keywords in comments for: Java/C/JS/TS (//), Python/Shell/Ruby (# ),
// JSDoc/block comments (*/), Lua/Haskell/SQL (--), and Clojure/Lisp (;)
const SATD_LINE_PATTERN = new RegExp(
  `(?:(?:^|\\s)\\*|//|#|--|;)\\s*(${SATD_KEYWORDS.join('|')})\\b(.{0,80})`,
  'i',
);

/**
 * Detects self-admitted technical debt (SATD) comments.
 * Language-agnostic, line-by-line regex — no AST required.
 * All SATD findings are severity "low" for text-based detection.
 */
export function detectSATDFromText(code: string): Smell[] {
  return code.split('\n').flatMap((line, idx) => {
    const match = SATD_LINE_PATTERN.exec(line);
    if (!match) return [];
    const keyword = match[1].toUpperCase();
    const rest = match[2].trim();
    return [
      {
        type: 'SATD' as const,
        severity: 'low' as const,
        line: idx + 1,
        description: `${keyword} kommentar: ${rest || '(ingen text)'}`,
        suggestion: 'Lös den tekniska skulden eller skapa ett issue för att spåra den.',
      },
    ];
  });
}

const SKIP_LINE_PREFIXES = ['import ', 'using ', 'package ', 'require(', 'from '];
const SKIP_EXTENSIONS = ['.json', '.yml', '.yaml', '.xml', '.toml', '.ini', '.cfg'];

/**
 * Matches integers whose absolute value is >= 2 (i.e. not 0 or +-1).
 * Global flag enables matchAll for detecting multiple magic numbers per line.
 * Negative: optional minus not preceded by a word char or digit.
 * Skips float member access by requiring no leading dot.
 */
const MAGIC_PATTERN = /(?<![.\w])(-?)(\b[2-9]\b|\b[1-9]\d+\b)(?!\.\d)/g;

/**
 * ALL_CAPS assignment — Python/Ruby/Go style where constant name starts the line.
 * Also handles Python type-annotated constants: `MAX_SIZE: int = 100`.
 * Examples: `MAX_SIZE = 100`, `_MAX = 5`, `MAX_SIZE: int = 100`
 */
const CONSTANT_ASSIGNMENT = /^[A-Z_][A-Z0-9_]*(?:\s*:\s*[\w<>\[\]|,\s]+)?\s*=(?!=)/;

/**
 * Typed constant declarations — Java, C#, Kotlin, Rust and similar languages
 * where the constant keyword (final/const) precedes a type, then an ALL_CAPS name.
 * Examples:
 *   Java:    `private static final int MAX_SIZE = 100`
 *   C#:      `private const int MAX_RETRY = 3`
 *   Kotlin:  `const val MAX_TIMEOUT_MS = 5000`
 *   Rust:    `const MAX_SIZE: usize = 100`
 */
const TYPED_CONSTANT_DECL = /\b(?:final|const)\b[^=\n]*\b[A-Z_][A-Z0-9_]+\b[^=\n]*=(?!=)/;

/**
 * Detects magic numeric literals in non-TypeScript/JavaScript source files.
 * Skips 0, +-1, ALL_CAPS constant assignments, comment lines, and import lines.
 * Reports all magic numbers per line using matchAll with the global regex.
 * All findings are severity "low" for text-based detection.
 */
/** Returns true when the trimmed line should be excluded from magic number scanning. */
function isMagicNumberSkipLine(trimmed: string): boolean {
  if (!trimmed) return true;
  if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) return true;
  if (SKIP_LINE_PREFIXES.some(p => trimmed.startsWith(p))) return true;
  return CONSTANT_ASSIGNMENT.test(trimmed) || TYPED_CONSTANT_DECL.test(trimmed);
}

export function detectMagicNumbersFromText(code: string, filePath: string): Smell[] {
  if (SKIP_EXTENSIONS.some(ext => filePath.endsWith(ext))) return [];

  return code.split('\n').flatMap((line, idx) => {
    const trimmed = line.trim();
    if (isMagicNumberSkipLine(trimmed)) return [];
    const matches = [...trimmed.matchAll(MAGIC_PATTERN)];
    return matches.map(match => ({
      type: 'MagicNumber' as const,
      severity: 'low' as const,
      line: idx + 1,
      description: `Magiskt tal ${match[0].trim()} — bör ersättas med namngiven konstant`,
      suggestion: 'Extrahera till en namngiven konstant med beskrivande namn.',
    }));
  });
}
