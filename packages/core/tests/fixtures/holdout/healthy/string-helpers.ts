/**
 * String utility helpers — clean, well-typed functions.
 */

/** Capitalises the first character of each word. */
export function titleCase(text: string): string {
  return text
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Truncates text to maxLength, appending suffix if needed. */
export function truncate(text: string, maxLength: number, suffix = '...'): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/** Returns true when the string is null, undefined, or contains only whitespace. */
export function isBlank(text: string | null | undefined): boolean {
  return text == null || text.trim() === '';
}

/** Converts camelCase to kebab-case (e.g. 'myComponent' → 'my-component'). */
export function toKebabCase(text: string): string {
  return text.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

/** Counts occurrences of a substring within a string. */
export function countOccurrences(text: string, search: string): number {
  if (search.length === 0) return 0;
  let count = 0;
  let pos = text.indexOf(search);
  while (pos !== -1) {
    count++;
    pos = text.indexOf(search, pos + search.length);
  }
  return count;
}
