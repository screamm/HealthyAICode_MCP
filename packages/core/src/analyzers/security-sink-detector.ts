// packages/core/src/analyzers/security-sink-detector.ts
// Sprint 58 — OWASP 2025 security sink detection.
// Detects: UnsafeDeserialization (insecure deserialization sinks), SsrfRisk,
//          CryptographicMisuseRisk via call-site pattern matching.
//
// NOTE on SHA-1 usage: the duplicate-code detector in this project uses SHA-1
// for subtree hashing in clone detection (not for security purposes). This file
// does NOT use SHA-1 for any cryptographic purpose — only for detecting misuse
// in user code being audited.

import type { Smell, Language } from '../types';

/** Extract 1-indexed line number for a match offset within content. */
function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

/** Return the text of a line by 1-indexed line number. */
function lineText(lines: string[], lineNum: number): string {
  return lines[lineNum - 1] ?? '';
}

/** Return a window of lines around the given 1-indexed line. */
function windowAround(lines: string[], lineNum: number, radius: number): string {
  const start = Math.max(0, lineNum - 1 - radius);
  const end = Math.min(lines.length, lineNum + radius);
  return lines.slice(start, end).join('\n');
}

// ─── Insecure Deserialization (emits UnsafeDeserialization) ───────────────────

/** Deserialization sink patterns per language. */
const DESERIAL_PATTERNS: Array<{
  languages: Language[];
  regex: RegExp;
  description: string;
  suggestion: string;
}> = [
  // Python: pickle.load / pickle.loads / pickle.Unpickler
  {
    languages: ['python'],
    regex: /\bpickle\.(?:load|loads|Unpickler)\s*\(/g,
    description: 'UnsafeDeserialization — pickle deserialization of untrusted data allows arbitrary code execution (CWE-502)',
    suggestion: 'Use json, msgpack, or a schema-validated format instead of pickle for untrusted data.',
  },
  // Python: yaml.load / yaml.unsafe_load without SafeLoader
  {
    languages: ['python'],
    regex: /\byaml\.(?:load|unsafe_load)\s*\(/g,
    description: 'UnsafeDeserialization — yaml.load() with arbitrary Loader allows code execution; use yaml.safe_load() (CWE-502)',
    suggestion: 'Replace yaml.load() with yaml.safe_load() or pass Loader=yaml.SafeLoader explicitly.',
  },
  // Java: ObjectInputStream.readObject
  {
    languages: ['java', 'kotlin', 'scala'],
    regex: /\bnew\s+ObjectInputStream\s*\(/g,
    description: 'UnsafeDeserialization — Java ObjectInputStream deserialization of untrusted data allows gadget chain RCE (CWE-502)',
    suggestion: 'Use JSON/XML with schema validation, or implement a custom ObjectInputFilter to whitelist safe classes.',
  },
  // PHP: unserialize
  {
    languages: ['php'],
    regex: /\bunserialize\s*\(/g,
    description: 'UnsafeDeserialization — PHP unserialize() with untrusted data allows object injection / RCE (CWE-502)',
    suggestion: 'Use json_decode() instead, or validate and sign serialized data before deserialization.',
  },
  // Ruby: Marshal.load / Marshal.restore
  {
    languages: ['ruby'],
    regex: /\bMarshal\.(?:load|restore)\s*\(/g,
    description: 'UnsafeDeserialization — Ruby Marshal.load() with untrusted data allows arbitrary object instantiation (CWE-502)',
    suggestion: 'Use JSON.parse or MessagePack instead of Marshal for untrusted data.',
  },
  // JS/TS: vm.runInNewContext
  {
    languages: ['typescript', 'javascript'],
    regex: /\bvm\.runInNewContext\s*\(/g,
    description: 'UnsafeDeserialization — vm.runInNewContext() with untrusted code allows sandbox escape and code execution (CWE-502)',
    suggestion: 'Avoid executing untrusted code; use a proper sandboxing solution or validation whitelist.',
  },
  // JS/TS: eval with non-literal argument
  {
    languages: ['typescript', 'javascript'],
    regex: /\beval\s*\(\s*(?!['"``])/g,
    description: 'UnsafeDeserialization — eval() with non-literal argument enables code injection (CWE-502)',
    suggestion: 'Replace eval() with JSON.parse() for data or refactor to avoid dynamic code execution entirely.',
  },
];

/** Detect insecure deserialization sinks. Returns Smell[] with type 'UnsafeDeserialization'. */
function detectInsecureDeserialization(code: string, language: Language): Smell[] {
  const smells: Smell[] = [];
  const applicablePatterns = DESERIAL_PATTERNS.filter(p =>
    (p.languages as string[]).includes(language),
  );

  for (const pattern of applicablePatterns) {
    // Clone regex to reset lastIndex for each call
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      // For yaml.load: skip if SafeLoader is present on the same line
      if (
        language === 'python' &&
        /\byaml\.(?:load|unsafe_load)\s*\(/.test(match[0])
      ) {
        const lineNum = lineOf(code, match.index);
        const line = code.split('\n')[lineNum - 1] ?? '';
        if (/SafeLoader/.test(line)) continue;
      }

      const lineNum = lineOf(code, match.index);
      smells.push({
        type: 'UnsafeDeserialization',
        severity: 'critical',
        line: lineNum,
        description: pattern.description,
        suggestion: pattern.suggestion,
      });
    }
  }

  return smells;
}

// ─── SSRF (Server-Side Request Forgery) ──────────────────────────────────────

/** HTTP sink patterns that can be used to make server-side HTTP requests. */
const HTTP_SINK_RE =
  /\b(?:fetch|axios\.(?:get|post|put|delete|patch|request)|requests\.(?:get|post|put|delete|patch)|http\.(?:get|request)|urllib\.request\.urlopen)\s*\(/g;

/** Request context variable patterns that indicate user-controlled URLs. */
const REQUEST_CONTEXT_RE =
  /\breq\.(?:query|params|body|url)\b|\brequest\.(?:GET|POST|args|form|data|url)\b|\bc\.Query\s*\(|\bc\.Param\s*\(|\br\.URL\.Query\s*\(|\br\.FormValue\s*\(/;

/** Detect SSRF sinks where the URL appears to come from request parameters. */
function detectSsrfRisk(code: string, _language: Language): Smell[] {
  const smells: Smell[] = [];
  const lines = code.split('\n');

  const sinkRe = new RegExp(HTTP_SINK_RE.source, HTTP_SINK_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = sinkRe.exec(code)) !== null) {
    const sinkLine = lineOf(code, match.index);
    // Look at ±3 lines around the sink for request context patterns
    // (the URL argument may be assigned on the line above the sink call)
    const windowLines = windowAround(lines, sinkLine, 3);

    if (REQUEST_CONTEXT_RE.test(windowLines)) {
      smells.push({
        type: 'SsrfRisk',
        severity: 'high',
        line: sinkLine,
        description:
          'SsrfRisk — HTTP request with URL derived from request parameters may allow Server-Side Request Forgery (OWASP A10:2025, CWE-918)',
        suggestion:
          'Validate and allowlist URLs before making server-side HTTP requests. Never pass raw request parameters as URLs.',
      });
    }
  }

  return smells;
}

// ─── Cryptographic Misuse ─────────────────────────────────────────────────────

/** Weak hash algorithm patterns (security contexts). */
const WEAK_HASH_PATTERNS: Array<{
  languages: Language[];
  regex: RegExp;
  description: string;
}> = [
  // JS/TS: crypto.createHash('md5' | 'sha1' | 'des' | 'rc4' | '3des')
  {
    languages: ['typescript', 'javascript'],
    regex: /\bcreateHash\s*\(\s*['"](?:md5|sha1|sha-1|des|rc4|3des)['"]\s*\)/gi,
    description:
      'CryptographicMisuseRisk — Weak hash algorithm for security purposes: md5/sha1/des/rc4 are cryptographically broken (CWE-327)',
  },
  // Python: hashlib.md5() / hashlib.sha1()
  {
    languages: ['python'],
    regex: /\bhashlib\.(?:md5|sha1)\s*\(/g,
    description:
      'CryptographicMisuseRisk — Weak hash algorithm: hashlib.md5/sha1 are unsuitable for password hashing or integrity verification (CWE-327)',
  },
  // Java: MessageDigest.getInstance("MD5" | "SHA-1" | "SHA1")
  {
    languages: ['java', 'kotlin', 'scala'],
    regex: /\bMessageDigest\.getInstance\s*\(\s*["'](?:MD5|SHA-1|SHA1)["']\s*\)/g,
    description:
      'CryptographicMisuseRisk — Weak hash algorithm: MD5/SHA-1 are not collision-resistant (CWE-327)',
  },
  // Ruby: Digest::MD5 / Digest::SHA1
  {
    languages: ['ruby'],
    regex: /\bDigest::(?:MD5|SHA1)\b/g,
    description:
      'CryptographicMisuseRisk — Weak hash algorithm: Digest::MD5/SHA1 are broken for security-critical uses (CWE-327)',
  },
  // Generic: hash('md5' | 'sha1') — PHP style
  {
    languages: ['php'],
    regex: /\bhash\s*\(\s*'(?:md5|sha1)'/gi,
    description:
      'CryptographicMisuseRisk — Weak hash algorithm: md5/sha1 are not suitable for password or integrity use cases (CWE-327)',
  },
  // Go: crypto/md5 or crypto/sha1 import or usage
  {
    languages: ['go'],
    regex: /\b(?:md5\.New\s*\(\)|sha1\.New\s*\(\)|md5\.Sum\s*\(|sha1\.Sum\s*\()/g,
    description:
      'CryptographicMisuseRisk — Weak hash algorithm: md5/sha1 packages are broken for security-critical uses (CWE-327)',
  },
];

/** Short RSA key patterns. */
const SHORT_RSA_RE =
  /(?:generate_private_key|RSA\.generate|generateKeyPair\s*\(\s*['"]rsa['"])\s*\([^)]*(?:1024|512)/g;

/** Hardcoded IV/nonce patterns. */
const HARDCODED_IV_RE =
  /(?:const|let|var|val)\s+(?:iv|IV|nonce|NONCE)\s*=\s*(?:Buffer\.from\s*\(|b'|bytes\.fromhex\s*\()\s*['"][0-9a-fA-F]+['"]/g;

/** Security-sensitive variable name patterns for insecure RNG context detection. */
const SECURITY_VAR_RE =
  /\b(?:token|secret|session|nonce|key|password|passwd|apikey|api_key|csrf|salt)\b/i;

/** Insecure RNG patterns per language. */
const INSECURE_RNG_PATTERNS: Array<{
  languages: Language[];
  regex: RegExp;
  description: string;
}> = [
  {
    languages: ['typescript', 'javascript'],
    regex: /\bMath\.random\s*\(\s*\)/g,
    description:
      'CryptographicMisuseRisk — Math.random() is not cryptographically secure; do not use for tokens, sessions, or cryptographic purposes (CWE-338)',
  },
  {
    languages: ['python'],
    regex: /\brandom\.random\s*\(\s*\)/g,
    description:
      'CryptographicMisuseRisk — random.random() is not cryptographically secure; use secrets.token_hex() or os.urandom() for security tokens (CWE-338)',
  },
];

/** Detect cryptographic misuse patterns. */
function detectCryptographicMisuse(code: string, language: Language): Smell[] {
  const smells: Smell[] = [];
  const lines = code.split('\n');

  // Weak hash algorithms
  for (const pattern of WEAK_HASH_PATTERNS) {
    if (!(pattern.languages as string[]).includes(language)) continue;
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      const lineNum = lineOf(code, match.index);
      smells.push({
        type: 'CryptographicMisuseRisk',
        severity: 'critical',
        line: lineNum,
        description: pattern.description,
        suggestion:
          'Use SHA-256 or SHA-3 for general hashing, bcrypt/argon2/scrypt for passwords, and HMAC-SHA256 for MACs.',
      });
    }
  }

  // Insecure RNG in security-sensitive context
  for (const pattern of INSECURE_RNG_PATTERNS) {
    if (!(pattern.languages as string[]).includes(language)) continue;
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      const lineNum = lineOf(code, match.index);
      // Check window of ±5 lines for security-sensitive variable names
      const window = windowAround(lines, lineNum, 5);
      if (SECURITY_VAR_RE.test(window)) {
        smells.push({
          type: 'CryptographicMisuseRisk',
          severity: 'high',
          line: lineNum,
          description: pattern.description,
          suggestion:
            language === 'python'
              ? 'Use secrets.token_hex(32) or secrets.token_urlsafe(32) for cryptographic randomness.'
              : 'Use crypto.getRandomValues() or the Web Crypto API for cryptographically secure random values.',
        });
      }
    }
  }

  // Short RSA key
  {
    const re = new RegExp(SHORT_RSA_RE.source, SHORT_RSA_RE.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      const lineNum = lineOf(code, match.index);
      smells.push({
        type: 'CryptographicMisuseRisk',
        severity: 'critical',
        line: lineNum,
        description:
          'CryptographicMisuseRisk — RSA key length < 2048 bits is considered insecure (NIST SP 800-57, CWE-326)',
        suggestion: 'Use RSA key length of at least 2048 bits; prefer 4096 bits for long-lived keys.',
      });
    }
  }

  // Hardcoded IV/nonce
  {
    const re = new RegExp(HARDCODED_IV_RE.source, HARDCODED_IV_RE.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      const lineNum = lineOf(code, match.index);
      smells.push({
        type: 'CryptographicMisuseRisk',
        severity: 'critical',
        line: lineNum,
        description:
          'CryptographicMisuseRisk — Hardcoded IV/nonce makes encryption deterministic and breaks semantic security (CWE-329)',
        suggestion:
          'Generate a fresh random IV/nonce for every encryption operation using a CSPRNG.',
      });
    }
  }

  return smells;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect security sink smells in the given source code.
 *
 * Returns Smell[] with types:
 *   - 'UnsafeDeserialization' (insecure deserialization sinks)
 *   - 'SsrfRisk' (HTTP sink with URL from request context)
 *   - 'CryptographicMisuseRisk' (weak hash / insecure RNG / short RSA / hardcoded IV)
 *
 * Called by per-language analyzers (typescript.ts, python.ts, java.ts, etc.).
 * NOT called from analyzeByLanguage dispatch directly.
 */
export function detectSecuritySinks(
  code: string,
  language: Language,
  _filePath?: string,
): Smell[] {
  // Skip Tier C languages (no function-level analysis)
  const tierC: Language[] = [
    'yaml', 'json', 'dockerfile', 'hcl', 'makefile',
    'sql', 'html', 'css', 'markdown', 'toml', 'unsupported',
  ];
  if ((tierC as string[]).includes(language)) return [];

  return [
    ...detectInsecureDeserialization(code, language),
    ...detectSsrfRisk(code, language),
    ...detectCryptographicMisuse(code, language),
  ];
}
