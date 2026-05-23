// packages/core/tests/security/secret-detection.test.ts
import { describe, it, expect } from 'vitest';
import { detectSecrets, shannonEntropy } from '../../src/security/secret-detection';

// ─── shannonEntropy unit tests ────────────────────────────────────────────────

describe('shannonEntropy', () => {
  it('returns 0 for a string with all identical characters', () => {
    expect(shannonEntropy('aaaa')).toBe(0);
  });

  it('returns high entropy for a random-looking string', () => {
    expect(shannonEntropy('aB3$kM9xYqW2zLpR')).toBeGreaterThan(3.5);
  });

  it('returns 0 for an empty string', () => {
    expect(shannonEntropy('')).toBe(0);
  });

  it('returns 1 for a two-character alternating string', () => {
    // 'ababab' — 2 distinct chars, each at freq 0.5, H = 1
    expect(shannonEntropy('abab')).toBeCloseTo(1.0, 5);
  });
});

// ─── AWS key detection ────────────────────────────────────────────────────────

describe('detectSecrets — AWS keys', () => {
  it('flags a hardcoded AWS access key', () => {
    const code = `const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';`;
    const findings = detectSecrets(code, 'config.ts');
    expect(findings.some(f => f.type === 'HardcodedApiKey')).toBe(true);
  });

  it('does NOT flag process.env reference', () => {
    const code = `const apiKey = process.env.API_KEY;`;
    const findings = detectSecrets(code, 'config.ts');
    expect(findings.filter(f => f.type === 'HardcodedApiKey')).toHaveLength(0);
  });
});

// ─── JWT detection ────────────────────────────────────────────────────────────

describe('detectSecrets — JWT tokens', () => {
  it('flags a JWT-format token in a string literal', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
      '.eyJzdWIiOiIxMjM0NTY3ODkwIn0' +
      '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const code = `const token = '${jwt}';`;
    const findings = detectSecrets(code, 'auth.ts');
    expect(findings.length).toBeGreaterThan(0);
  });
});

// ─── Hardcoded password detection ────────────────────────────────────────────

describe('detectSecrets — passwords', () => {
  it('flags a hardcoded password assigned to a password variable', () => {
    const code = `const dbPassword = 'SuperSecret123!@#AbcDef';`;
    const findings = detectSecrets(code, 'db.ts');
    expect(findings.some(f => f.type === 'HardcodedCredential')).toBe(true);
  });

  it('does NOT flag a short password-like string (below length threshold)', () => {
    const code = `const pwd = 'short';`;
    const findings = detectSecrets(code, 'db.ts');
    // 'short' is under 16 chars and not high entropy — should not be flagged.
    expect(findings.filter(f => f.type === 'HardcodedCredential')).toHaveLength(0);
  });
});

// ─── PEM private key detection ────────────────────────────────────────────────

describe('detectSecrets — PEM private keys', () => {
  it('flags a PEM RSA private key marker', () => {
    const code = `const key = \`-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----\`;`;
    const findings = detectSecrets(code, 'keys.ts');
    expect(findings.some(f => f.type === 'HardcodedCredential')).toBe(true);
  });
});

// ─── Placeholder suppression ──────────────────────────────────────────────────

describe('detectSecrets — placeholder suppression', () => {
  it('does NOT flag a placeholder value surrounded by angle brackets', () => {
    const code = `const apiKey = '<YOUR_API_KEY_HERE>';`;
    const findings = detectSecrets(code, 'config.ts');
    expect(findings).toHaveLength(0);
  });

  it('does NOT flag a value starting with YOUR_', () => {
    const code = `const token = 'YOUR_TOKEN_HERE_abcdefghij12345';`;
    const findings = detectSecrets(code, 'config.ts');
    expect(findings).toHaveLength(0);
  });
});

// ─── OpenAI-style key detection ───────────────────────────────────────────────

describe('detectSecrets — OpenAI-style keys', () => {
  it('flags an sk- prefixed key with sufficient length', () => {
    const code = `const apiKey = 'sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN01234';`;
    const findings = detectSecrets(code, 'openai.ts');
    expect(findings.some(f => f.type === 'HardcodedApiKey')).toBe(true);
  });
});

// ─── Finding metadata ─────────────────────────────────────────────────────────

describe('detectSecrets — finding metadata', () => {
  it('includes a positive static_score in [0, 1]', () => {
    const code = `const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';`;
    const findings = detectSecrets(code, 'config.ts');
    for (const f of findings) {
      expect(f.static_score).toBeGreaterThan(0);
      expect(f.static_score).toBeLessThanOrEqual(1);
    }
  });

  it('includes a non-empty codeSnippet', () => {
    const code = `const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';`;
    const findings = detectSecrets(code, 'config.ts');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].codeSnippet.length).toBeGreaterThan(0);
  });

  it('sets line number to 1 for single-line code', () => {
    const code = `const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';`;
    const findings = detectSecrets(code, 'config.ts');
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].line).toBe(1);
  });
});
