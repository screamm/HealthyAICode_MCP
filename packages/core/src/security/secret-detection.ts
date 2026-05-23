// packages/core/src/security/secret-detection.ts
// Regex + entropy-based detection of hardcoded credentials and API keys (Sprint 28).

import type { StaticFinding } from './types';

export const SECRET_KEYWORDS = [
  'password', 'passwd', 'pwd', 'secret', 'token', 'api_key', 'apikey',
  'access_key', 'private_key', 'auth_key', 'credential', 'api_secret',
  'db_pass', 'database_password', 'client_secret',
];

/** Shannon entropy of a string; 0 = all identical characters, ~6 = random printable. */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export const HIGH_ENTROPY_THRESHOLD = 4.5;
export const MIN_SECRET_LENGTH = 16;

// Patterns for well-known secret formats — order matters (more specific first).
// Note: these regexes are pattern-matching strings for DETECTING secrets in user code,
// not calling any shell commands.
const KNOWN_SECRET_PATTERNS: Array<{
  regex: RegExp;
  type: 'HardcodedApiKey' | 'HardcodedCredential';
  label: string;
}> = [
  // AWS access keys: AKIA followed by 16 uppercase alphanumeric chars
  { regex: /\bAKIA[0-9A-Z]{16}\b/g, type: 'HardcodedApiKey', label: 'AWS access key' },
  // JWT tokens (header.payload.signature)
  {
    regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    type: 'HardcodedApiKey',
    label: 'JWT token',
  },
  // OpenAI / Anthropic-style API keys: sk-...
  { regex: /\bsk-[A-Za-z0-9]{32,}\b/g, type: 'HardcodedApiKey', label: 'OpenAI-style key' },
  // Bearer tokens in string literals
  {
    regex: /Bearer\s+[A-Za-z0-9\-._~+/]{20,}/g,
    type: 'HardcodedApiKey',
    label: 'Bearer token',
  },
  // PEM private keys
  {
    regex: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
    type: 'HardcodedCredential',
    label: 'PEM private key',
  },
];

// Pattern to detect: varName = '<literal>' or varName: '<literal>'
// Captures: group 1 = variable name, group 2 = quote char, group 3 = value
const ASSIGNMENT_PATTERN =
  /(?:const|let|var|readonly)?\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*[=:]\s*(["'`])([^"'`\n]{8,})\2/g;

// Detect placeholder values that should NOT be flagged.
// Case-sensitive to avoid matching legitimate values containing 'EXAMPLE' (e.g. AWS test keys).
const PLACEHOLDER_RE = /^<[^>]+>$|^YOUR_|^YOUR-|^\${|^process\.env\.|(?:^|\s)example(?:\s|$)|(?:^|\s)placeholder(?:\s|$)|^changeme$|^xxxxx/;

/** Extract line number (1-indexed) of a regex match index within content. */
function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

/** Column (1-indexed) of a regex match index within its line. */
function columnOf(content: string, index: number): number {
  const lastNl = content.lastIndexOf('\n', index - 1);
  return index - lastNl;
}

/**
 * Detect hardcoded secrets in source code.
 *
 * Two detection strategies run in parallel:
 * 1. Pattern-based — well-known key formats (AWS, JWT, Bearer, PEM).
 * 2. Entropy-based — string literals assigned to secret-keyword variable names.
 *
 * Returns StaticFinding[] with type 'HardcodedApiKey' or 'HardcodedCredential'.
 */
export function detectSecrets(content: string, filePath: string): StaticFinding[] {
  const findings: StaticFinding[] = [];
  const lines = content.split('\n');

  // Strategy 1: known-pattern scan.
  for (const { regex, type } of KNOWN_SECRET_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const matched = m[0];
      // Skip env var references (e.g., within template literals containing process.env).
      if (matched.includes('process.env') || PLACEHOLDER_RE.test(matched)) continue;

      const line = lineOf(content, m.index);
      const col = columnOf(content, m.index);
      const snippet = lines.slice(Math.max(0, line - 2), line + 1).join('\n');
      findings.push({
        type,
        line,
        column: col,
        endLine: line,
        endColumn: col + matched.length,
        filePath,
        codeSnippet: snippet,
        static_score: 0.9,
      });
    }
  }

  // Strategy 2: entropy-based — variable assignments to secret-keyword names.
  ASSIGNMENT_PATTERN.lastIndex = 0;
  let m2: RegExpExecArray | null;
  while ((m2 = ASSIGNMENT_PATTERN.exec(content)) !== null) {
    const varName = m2[1];
    const value = m2[3];

    // Skip if the value is a placeholder, env ref, or too short.
    if (PLACEHOLDER_RE.test(value)) continue;
    if (value.startsWith('process.env')) continue;
    if (value.length < MIN_SECRET_LENGTH) continue;

    const lowerVar = varName.toLowerCase();
    const matchesKeyword = SECRET_KEYWORDS.some(kw => lowerVar.includes(kw));
    if (!matchesKeyword) continue;

    const isPasswordLike = ['password', 'passwd', 'pwd', 'db_pass', 'database_password'].some(
      kw => lowerVar.includes(kw),
    );

    const entropy = shannonEntropy(value);
    // Password-like variables require lower entropy (3.0) because human-chosen
    // passwords have less randomness than API keys, but are still secrets.
    // API key variables require high entropy (4.5) to avoid false positives.
    const entropyThreshold = isPasswordLike ? 3.0 : HIGH_ENTROPY_THRESHOLD;
    if (entropy < entropyThreshold) continue;

    // Avoid duplicating findings already caught by the pattern scan.
    const line = lineOf(content, m2.index);
    const alreadyFound = findings.some(f => f.line === line);
    if (alreadyFound) continue;

    const col = columnOf(content, m2.index);
    const snippet = lines.slice(Math.max(0, line - 2), line + 1).join('\n');
    findings.push({
      type: isPasswordLike ? 'HardcodedCredential' : 'HardcodedApiKey',
      line,
      column: col,
      endLine: line,
      endColumn: col + m2[0].length,
      filePath,
      codeSnippet: snippet,
      static_score: Math.min(0.95, 0.5 + entropy * 0.1),
    });
  }

  return findings;
}
