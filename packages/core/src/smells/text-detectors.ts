import type { Smell } from '../types';

const SATD_KEYWORDS = ['TODO', 'FIXME', 'HACK', 'XXX', 'BUG', 'KLUDGE'];
const SATD_LINE_PATTERN = new RegExp(
  `(?://|#|\\*)\\s*(${SATD_KEYWORDS.join('|')})\\b(.{0,80})`,
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
 * Negative: optional minus not preceded by a word char or digit.
 * Skips float member access by requiring no leading dot.
 */
const MAGIC_PATTERN = /(?<![.\w])(-?)(\b[2-9]\b|\b[1-9]\d+\b)/;

/**
 * ALL_CAPS assignment: line starts (after optional whitespace) with one or more
 * uppercase letters/digits/underscores followed by optional whitespace and `=`
 * but NOT `==` or `===`.
 */
const CONSTANT_ASSIGNMENT = /^[A-Z][A-Z0-9_]*\s*=(?!=)/;

/**
 * Detects magic numeric literals in non-TypeScript/JavaScript source files.
 * Skips 0, +-1, ALL_CAPS constant assignments, comment lines, and import lines.
 * All findings are severity "low" for text-based detection.
 */
export function detectMagicNumbersFromText(code: string, filePath: string): Smell[] {
  if (SKIP_EXTENSIONS.some(ext => filePath.endsWith(ext))) return [];

  return code.split('\n').flatMap((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    // Skip pure comment lines
    if (
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('*')
    ) return [];
    // Skip import / using / package lines
    if (SKIP_LINE_PREFIXES.some(p => trimmed.startsWith(p))) return [];
    // Skip ALL_CAPS constant assignments (e.g. MAX_SIZE = 100)
    if (CONSTANT_ASSIGNMENT.test(trimmed)) return [];

    const match = MAGIC_PATTERN.exec(trimmed);
    if (!match) return [];

    const rawNumber = `${match[1]}${match[2]}`;
    return [
      {
        type: 'MagicNumber' as const,
        severity: 'low' as const,
        line: idx + 1,
        description: `Magiskt tal ${rawNumber} — bör ersättas med namngiven konstant`,
        suggestion: 'Extrahera till en namngiven konstant med beskrivande namn.',
      },
    ];
  });
}
