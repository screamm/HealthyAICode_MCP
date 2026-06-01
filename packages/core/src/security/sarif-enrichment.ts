// packages/core/src/security/sarif-enrichment.ts
// Shared SARIF 2.1.0 enrichment utilities used by both the security-audit path
// (sarif-formatter.ts) and the format-output MCP tool path.
//
// Enrichment fields produced here:
//   partialFingerprints.primaryLocationLineHash  — GitHub Code Quality dedup key
//   rule.properties['security-severity']         — CVSS-style score for GitHub Advanced Security
//
// Sprint sarif-unify.

import { createHash } from 'node:crypto';
import type { SmellType } from '../types';

// ──────────────────────────────────────────────────────────────────────────────
// Security-severity map (CVSS approximations for GitHub Advanced Security)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * CVSS-approximation scores for security-sensitive smell types.
 * GitHub Advanced Security uses the `security-severity` property on a SARIF rule
 * to route findings to the Security tab and apply vulnerability triage logic.
 * Values are numeric strings per the SARIF spec.
 *
 * Only smell types that are part of the current SmellType union (types.ts) are
 * listed here. Future smell types (SsrfRisk, CryptographicMisuseRisk, etc.) will
 * be added once they are added to the SmellType union in types.ts.
 */
export const SECURITY_SEVERITY_MAP: Partial<Record<SmellType, string>> = {
  HardcodedCredential: '9.8',
  HardcodedApiKey: '9.8',
  SqlInjectionRisk: '8.5',
  XssRisk: '8.5',
  CommandInjectionRisk: '8.5',
  UnsafeDeserialization: '7.5',
  PathTraversalRisk: '7.5',
  DependencyVulnerability: '6.0',
};

// ──────────────────────────────────────────────────────────────────────────────
// Fingerprint helper
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256-derived fingerprint for a SARIF result.
 *
 * The resulting string matches the format expected by GitHub Code Quality:
 *   `<16 hex chars>:1`
 *
 * The `:1` suffix is the algorithm version, allowing future rotation.
 *
 * @param filePath  File URI or path as it appears in the SARIF `artifactLocation`
 * @param ruleId    Rule / smell type identifier (e.g. `"SqlInjectionRisk"`)
 * @param startLine 1-based line number of the primary location
 */
export function primaryLocationLineHash(
  filePath: string,
  ruleId: string,
  startLine: number,
): string {
  return (
    createHash('sha256')
      .update(filePath + ruleId + String(startLine))
      .digest('hex')
      .slice(0, 16) + ':1'
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Severity-level mapping
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Map a free-form severity string to one of the three SARIF `level` values.
 * Falls back to `"warning"` for unknown or missing input.
 */
export function severityToSarifLevel(severity: string | undefined): 'error' | 'warning' | 'note' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'note';
    default:
      return 'warning';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Rule builder
// ──────────────────────────────────────────────────────────────────────────────

export interface EnrichedSarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  properties?: { 'security-severity': string };
}

/**
 * Build a de-duplicated list of SARIF rules from a set of (type, description) pairs.
 * Each rule for a security-sensitive smell type will carry a `security-severity`
 * property so that GitHub Advanced Security routes it to the Security tab.
 */
export function buildEnrichedRules(
  items: ReadonlyArray<{ type: string; description: string }>,
): EnrichedSarifRule[] {
  const seen = new Set<string>();
  const rules: EnrichedSarifRule[] = [];

  for (const item of items) {
    if (seen.has(item.type)) continue;
    seen.add(item.type);

    const rule: EnrichedSarifRule = {
      id: item.type,
      name: item.type,
      shortDescription: { text: item.description },
    };

    const secSeverity = SECURITY_SEVERITY_MAP[item.type as SmellType];
    if (secSeverity !== undefined) {
      rule.properties = { 'security-severity': secSeverity };
    }

    rules.push(rule);
  }

  return rules;
}
