/**
 * Simple token parser — moderately complex, borderline health score.
 */

export type TokenType = 'number' | 'string' | 'boolean' | 'null' | 'identifier' | 'unknown';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

/**
 * Tokenises a string expression into a list of typed tokens.
 * Handles numbers, quoted strings, booleans, null, and identifiers.
 */
export function tokenise(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < input.length) {
    // Skip whitespace
    if (/\s/.test(input[pos])) {
      pos++;
      continue;
    }

    // Number
    if (/\d/.test(input[pos])) {
      let raw = '';
      while (pos < input.length && /[\d.]/.test(input[pos])) {
        raw += input[pos++];
      }
      tokens.push({ type: 'number', value: raw, position: pos - raw.length });
      continue;
    }

    // Quoted string
    if (input[pos] === '"') {
      let raw = '';
      pos++;
      while (pos < input.length && input[pos] !== '"') {
        raw += input[pos++];
      }
      pos++; // closing quote
      tokens.push({ type: 'string', value: raw, position: pos - raw.length - 2 });
      continue;
    }

    // Identifier / keyword
    if (/[a-zA-Z_]/.test(input[pos])) {
      let raw = '';
      while (pos < input.length && /\w/.test(input[pos])) {
        raw += input[pos++];
      }
      const type: TokenType =
        raw === 'true' || raw === 'false'
          ? 'boolean'
          : raw === 'null'
          ? 'null'
          : 'identifier';
      tokens.push({ type, value: raw, position: pos - raw.length });
      continue;
    }

    tokens.push({ type: 'unknown', value: input[pos], position: pos });
    pos++;
  }

  return tokens;
}
