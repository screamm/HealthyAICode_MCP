// packages/core/src/security/secret-detection.ts
// Regex + entropy-based detection of hardcoded credentials and API keys (Sprint 28).

import type { StaticFinding } from './types';

/** Variable name substrings that suggest a secret value is assigned. Case-insensitive matching. */
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

/** Minimum Shannon entropy score for a string literal to be flagged as a potential API key. */
export const HIGH_ENTROPY_THRESHOLD = 4.5;

/** Minimum character length for a string literal to be considered a candidate secret. */
export const MIN_SECRET_LENGTH = 16;

// Patterns for well-known secret formats - order matters (more specific first).
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

/** Password-like keyword suffixes used to determine entropy thresholds. */
const PASSWORD_KEYWORDS = ['password', 'passwd', 'pwd', 'db_pass', 'database_password'];

/** Entropy threshold for password-like variable names (human-chosen passwords have lower entropy). */
const PASSWORD_ENTROPY_THRESHOLD = 3.0;

/** Confidence score for pattern-matched secrets. */
const PATTERN_MATCH_SCORE = 0.9;

/** Maximum confidence score for entropy-based findings. */
const ENTROPY_MAX_SCORE = 0.95;

/** Base score offset for entropy-based confidence calculation. */
const ENTROPY_SCORE_BASE = 0.5;

/** Per-bit entropy multiplier for confidence score calculation. */
const ENTROPY_SCORE_MULTIPLIER = 0.1;

/** Number of lines before the match to include in the code snippet. */
const SNIPPET_CONTEXT_LINES = 2;

/** Shared context passed to scanning helpers to avoid repeating content/filePath/lines. */
interface ScanContext {
  content: string;
  filePath: string;
  lines: string[];
}

/** Extract line number (1-indexed) of a regex match index within content. */
function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

/** Column (1-indexed) of a regex match index within its line. */
function columnOf(content: string, index: number): number {
  const lastNl = content.lastIndexOf('\n', index - 1);
  return index - lastNl;
}

/** Returns true if the assignment value should be skipped (placeholder, env ref, or too short). */
function isPlaceholderValue(value: string): boolean {
  return PLACEHOLDER_RE.test(value) || value.startsWith('process.env') || value.length < MIN_SECRET_LENGTH;
}

/** Determines whether the variable name is password-like and meets the entropy threshold. */
function resolveEntropyThreshold(lowerVar: string): number {
  const isPasswordLike = PASSWORD_KEYWORDS.some(kw => lowerVar.includes(kw));
  // Password-like variables require lower entropy (3.0) because human-chosen
  // passwords have less randomness than API keys, but are still secrets.
  // API key variables require high entropy (4.5) to avoid false positives.
  return isPasswordLike ? PASSWORD_ENTROPY_THRESHOLD : HIGH_ENTROPY_THRESHOLD;
}

/** Builds a StaticFinding for an entropy-based match. */
function buildEntropyFinding(
  match: RegExpExecArray,
  ctx: ScanContext,
  isPasswordLike: boolean,
  entropy: number,
): StaticFinding {
  const { content, filePath, lines } = ctx;
  const line = lineOf(content, match.index);
  const col = columnOf(content, match.index);
  const snippet = lines.slice(Math.max(0, line - SNIPPET_CONTEXT_LINES), line + 1).join('\n');
  return {
    type: isPasswordLike ? 'HardcodedCredential' : 'HardcodedApiKey',
    line,
    column: col,
    endLine: line,
    endColumn: col + match[0].length,
    filePath,
    codeSnippet: snippet,
    static_score: Math.min(ENTROPY_MAX_SCORE, ENTROPY_SCORE_BASE + entropy * ENTROPY_SCORE_MULTIPLIER),
  };
}

/** Scans content against all known secret patterns and returns pattern-based findings. */
function detectPatternBasedSecrets(ctx: ScanContext): StaticFinding[] {
  const { content, filePath, lines } = ctx;
  const findings: StaticFinding[] = [];
  for (const { regex, type } of KNOWN_SECRET_PATTERNS) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const matched = m[0];
      // Skip env var references and placeholders.
      if (matched.includes('process.env') || PLACEHOLDER_RE.test(matched)) continue;

      const line = lineOf(content, m.index);
      const col = columnOf(content, m.index);
      const snippet = lines.slice(Math.max(0, line - SNIPPET_CONTEXT_LINES), line + 1).join('\n');
      findings.push({
        type,
        line,
        column: col,
        endLine: line,
        endColumn: col + matched.length,
        filePath,
        codeSnippet: snippet,
        static_score: PATTERN_MATCH_SCORE,
      });
    }
  }
  return findings;
}

/** Scans content for entropy-based secrets in variable assignments and returns findings. */
function detectEntropyBasedSecrets(
  ctx: ScanContext,
  existingFindings: StaticFinding[],
): StaticFinding[] {
  const { content } = ctx;
  const findings: StaticFinding[] = [];
  ASSIGNMENT_PATTERN.lastIndex = 0;
  let m2: RegExpExecArray | null;
  while ((m2 = ASSIGNMENT_PATTERN.exec(content)) !== null) {
    const varName = m2[1];
    const value = m2[3];

    if (isPlaceholderValue(value)) continue;

    const lowerVar = varName.toLowerCase();
    if (!SECRET_KEYWORDS.some(kw => lowerVar.includes(kw))) continue;

    const isPasswordLike = PASSWORD_KEYWORDS.some(kw => lowerVar.includes(kw));
    const entropy = shannonEntropy(value);
    if (entropy < resolveEntropyThreshold(lowerVar)) continue;

    // Avoid duplicating findings already caught by the pattern scan.
    const line = lineOf(content, m2.index);
    if (existingFindings.some(f => f.line === line)) continue;

    findings.push(buildEntropyFinding(m2, ctx, isPasswordLike, entropy));
  }
  return findings;
}

/**
 * Detect hardcoded secrets in source code.
 *
 * Two detection strategies run in parallel:
 * 1. Pattern-based - well-known key formats (AWS, JWT, Bearer, PEM).
 * 2. Entropy-based - string literals assigned to secret-keyword variable names.
 *
 * Returns StaticFinding[] with type 'HardcodedApiKey' or 'HardcodedCredential'.
 */
export function detectSecrets(content: string, filePath: string): StaticFinding[] {
  const ctx: ScanContext = { content, filePath, lines: content.split('\n') };
  const patternFindings = detectPatternBasedSecrets(ctx);
  const entropyFindings = detectEntropyBasedSecrets(ctx, patternFindings);
  return [...patternFindings, ...entropyFindings];
}