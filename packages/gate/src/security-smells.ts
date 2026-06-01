/**
 * Security-smell collection for the delta gate.
 *
 * Why this module exists
 * ----------------------
 * The gate decides DENY/ALLOW on the *delta* of a file's smell set. For the
 * structural/maintainability biomarkers (`ComplexMethod`, `DeepNesting`, …) the
 * gate gets everything it needs from `analyzeCode`. **But `analyzeCode` does not
 * run the security / supply-chain detectors.** Those detectors live in core but
 * are dispatched from `runAdditiveDetectors`, which `analyzeCode` does not call —
 * so a hardcoded credential, a SQL-injection concat, or a `crypto.createHash('md5')`
 * misuse produces a perfect 10/10 with an empty `smells` array.
 *
 * That is exactly the false-`allow` that made the gate's headline claim a lie: an
 * edit that *adds* a security smell looked identical to a no-op edit, so it was
 * allowed. The gate must therefore run the security detectors itself and merge
 * their findings into the smell set it diffs.
 *
 * What it collects (all from `@healthy-ai-code/core`):
 *   - `detectSecrets`         → HardcodedApiKey / HardcodedCredential (regex + entropy)
 *   - `detectInjectionRisks`  → SqlInjectionRisk / XssRisk / CommandInjectionRisk / PathTraversalRisk
 *   - `detectSecuritySinks`   → CryptographicMisuseRisk / SsrfRisk / UnsafeDeserialization
 *
 * The first two are part of core's published API surface. The sink detector is
 * not re-exported from core's index yet, so the gate reaches it through the
 * package's compiled subpath (`@healthy-ai-code/core/dist/analyzers/…`). In the
 * test runner the same specifier is aliased to core's source (see vitest.config).
 *
 * Every finding is normalised to a core `Smell` so the rest of the gate
 * (`newlyIntroducedSmells`, the classification sets) treats security findings
 * exactly like any other smell.
 */
import { detectSecrets, detectInjectionRisks } from '@healthy-ai-code/core';
import type { Language, Smell, SmellType } from '@healthy-ai-code/core';
// Deep import: not part of core's public index (yet). Resolves to the compiled
// module at runtime and to core's source under vitest (aliased).
import { detectSecuritySinks } from '@healthy-ai-code/core/dist/analyzers/security-sink-detector';

/** Map a security finding's severity string to the core `Smell` severity. */
function toSmellSeverity(sev: string | undefined): Smell['severity'] {
  switch (sev) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'low':
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * Collects every security / supply-chain smell in `code` and returns them as
 * core `Smell[]`. Deterministic and synchronous: no I/O, no network, no LLM.
 *
 * Findings are de-duplicated by `(type, line)` so that the same issue reported by
 * two detectors (or by both the regex and entropy passes of `detectSecrets`)
 * does not inflate the count the gate diffs on.
 */
export function collectSecuritySmells(code: string, language: Language, filePath: string): Smell[] {
  const smells: Smell[] = [];

  // 1. Hardcoded secrets — HardcodedApiKey / HardcodedCredential.
  for (const f of detectSecrets(code, filePath)) {
    smells.push({
      type: f.type as SmellType,
      severity: 'critical',
      line: f.line,
      description: `${f.type} — hardcoded secret detected (CWE-798).`,
      suggestion:
        'Remove the secret from source. Load it from an environment variable or a secrets manager and rotate the exposed value.',
    });
  }

  // 2. Injection sinks — SQL / XSS / command / path traversal.
  for (const f of detectInjectionRisks(code, language)) {
    smells.push({
      type: f.type as SmellType,
      severity: toSmellSeverity(f.severity),
      line: f.line,
      description: `${f.type} — untrusted input reaches a dangerous sink (${f.evidence}).`,
      suggestion:
        'Parameterise the query / escape the output / avoid passing untrusted input to the shell or filesystem.',
    });
  }

  // 3. Security sinks — crypto misuse, SSRF, unsafe deserialization.
  //    detectSecuritySinks already returns core `Smell` objects.
  for (const s of detectSecuritySinks(code, language, filePath)) {
    smells.push(s);
  }

  return dedupeByTypeAndLine(smells);
}

/** Remove duplicate findings that share both a smell type and a line number. */
function dedupeByTypeAndLine(smells: Smell[]): Smell[] {
  const seen = new Set<string>();
  const out: Smell[] = [];
  for (const s of smells) {
    const key = `${s.type}:${s.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}
