// packages/core/tests/security/sarif-enrichment.test.ts
// Unit tests for the shared SARIF enrichment helper (sprint sarif-unify).
// Verifies that partialFingerprints + security-severity are emitted correctly
// from BOTH SARIF output paths via formatAsSarif.

import { describe, it, expect } from 'vitest';
import { formatAsSarif } from '../../src/security/sarif-formatter';
import {
  primaryLocationLineHash,
  severityToSarifLevel,
  buildEnrichedRules,
  SECURITY_SEVERITY_MAP,
} from '../../src/security/sarif-enrichment';
import { SARIF_ENRICHMENT_FINDINGS } from '../fixtures/unhealthy/sarif-enrichment-fixture';

// ──────────────────────────────────────────────────────────────────────────────
// primaryLocationLineHash
// ──────────────────────────────────────────────────────────────────────────────

describe('primaryLocationLineHash', () => {
  it('returns a string in format <16 hex chars>:1', () => {
    const hash = primaryLocationLineHash('src/app.ts', 'SqlInjectionRisk', 12);
    expect(hash).toMatch(/^[0-9a-f]{16}:1$/);
  });

  it('is deterministic — same inputs always produce the same hash', () => {
    const a = primaryLocationLineHash('src/app.ts', 'HardcodedCredential', 3);
    const b = primaryLocationLineHash('src/app.ts', 'HardcodedCredential', 3);
    expect(a).toBe(b);
  });

  it('differs when filePath changes', () => {
    const a = primaryLocationLineHash('src/a.ts', 'XssRisk', 10);
    const b = primaryLocationLineHash('src/b.ts', 'XssRisk', 10);
    expect(a).not.toBe(b);
  });

  it('differs when ruleId changes', () => {
    const a = primaryLocationLineHash('src/app.ts', 'SqlInjectionRisk', 10);
    const b = primaryLocationLineHash('src/app.ts', 'XssRisk', 10);
    expect(a).not.toBe(b);
  });

  it('differs when startLine changes', () => {
    const a = primaryLocationLineHash('src/app.ts', 'SqlInjectionRisk', 10);
    const b = primaryLocationLineHash('src/app.ts', 'SqlInjectionRisk', 11);
    expect(a).not.toBe(b);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// severityToSarifLevel
// ──────────────────────────────────────────────────────────────────────────────

describe('severityToSarifLevel', () => {
  it.each([
    ['critical', 'error'],
    ['high', 'error'],
    ['medium', 'warning'],
    ['low', 'note'],
  ])('maps severity %s → level %s', (sev, expected) => {
    expect(severityToSarifLevel(sev)).toBe(expected);
  });

  it('falls back to "warning" for unknown severity', () => {
    expect(severityToSarifLevel('unknown')).toBe('warning');
    expect(severityToSarifLevel(undefined)).toBe('warning');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// SECURITY_SEVERITY_MAP
// ──────────────────────────────────────────────────────────────────────────────

describe('SECURITY_SEVERITY_MAP', () => {
  it('assigns 9.8 to HardcodedCredential and HardcodedApiKey (CVSS critical)', () => {
    expect(SECURITY_SEVERITY_MAP['HardcodedCredential']).toBe('9.8');
    expect(SECURITY_SEVERITY_MAP['HardcodedApiKey']).toBe('9.8');
  });

  it('assigns 8.5 to SqlInjectionRisk, XssRisk, CommandInjectionRisk', () => {
    expect(SECURITY_SEVERITY_MAP['SqlInjectionRisk']).toBe('8.5');
    expect(SECURITY_SEVERITY_MAP['XssRisk']).toBe('8.5');
    expect(SECURITY_SEVERITY_MAP['CommandInjectionRisk']).toBe('8.5');
  });

  it('all values are numeric strings in (0, 10]', () => {
    for (const [type, val] of Object.entries(SECURITY_SEVERITY_MAP)) {
      const n = parseFloat(val as string);
      expect(n, `${type} score`).toBeGreaterThan(0);
      expect(n, `${type} score`).toBeLessThanOrEqual(10);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildEnrichedRules
// ──────────────────────────────────────────────────────────────────────────────

describe('buildEnrichedRules', () => {
  it('de-duplicates items with the same type', () => {
    const items = [
      { type: 'SqlInjectionRisk', description: 'SQL injection' },
      { type: 'SqlInjectionRisk', description: 'SQL injection (dup)' },
      { type: 'XssRisk', description: 'XSS' },
    ];
    const rules = buildEnrichedRules(items);
    expect(rules).toHaveLength(2);
  });

  it('attaches security-severity to security smells', () => {
    const items = [
      { type: 'HardcodedCredential', description: 'Hard-coded credential' },
      { type: 'XssRisk', description: 'XSS risk' },
    ];
    const rules = buildEnrichedRules(items);
    for (const rule of rules) {
      expect(rule.properties?.['security-severity']).toBeDefined();
      expect(parseFloat(rule.properties?.['security-severity'] ?? '')).toBeGreaterThan(0);
    }
  });

  it('does NOT attach security-severity to non-security smells', () => {
    const items = [{ type: 'ComplexMethod', description: 'Too complex' }];
    const rules = buildEnrichedRules(items);
    expect(rules[0].properties).toBeUndefined();
  });

  it('preserves id, name, shortDescription for each rule', () => {
    const items = [{ type: 'SqlInjectionRisk', description: 'SQL injection' }];
    const [rule] = buildEnrichedRules(items);
    expect(rule.id).toBe('SqlInjectionRisk');
    expect(rule.name).toBe('SqlInjectionRisk');
    expect(rule.shortDescription.text).toBe('SQL injection');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// formatAsSarif — security-audit path enrichment assertions
// ──────────────────────────────────────────────────────────────────────────────

describe('formatAsSarif (security-audit path) — sprint sarif-unify enrichment', () => {
  const sarif = formatAsSarif(SARIF_ENRICHMENT_FINDINGS, '1.0.0');

  it('emits SARIF 2.1.0', () => {
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
  });

  it('every result carries partialFingerprints.primaryLocationLineHash', () => {
    const results = sarif.runs[0].results;
    expect(results.length).toBeGreaterThan(0);
    for (const result of results as unknown as Array<{
      partialFingerprints: { primaryLocationLineHash: string };
    }>) {
      expect(result.partialFingerprints, 'partialFingerprints must be defined').toBeDefined();
      expect(result.partialFingerprints.primaryLocationLineHash).toMatch(/^[0-9a-f]{16}:1$/);
    }
  });

  it('partialFingerprints are deterministic across two formatAsSarif calls', () => {
    const sarif2 = formatAsSarif(SARIF_ENRICHMENT_FINDINGS, '1.0.0');
    const r1 = (sarif.runs[0].results as unknown as Array<{
      partialFingerprints: { primaryLocationLineHash: string };
    }>);
    const r2 = (sarif2.runs[0].results as unknown as Array<{
      partialFingerprints: { primaryLocationLineHash: string };
    }>);
    for (let i = 0; i < r1.length; i++) {
      expect(r1[i].partialFingerprints.primaryLocationLineHash).toBe(
        r2[i].partialFingerprints.primaryLocationLineHash,
      );
    }
  });

  it('partialFingerprints differ between findings at different lines', () => {
    const results = sarif.runs[0].results as unknown as Array<{
      partialFingerprints: { primaryLocationLineHash: string };
    }>;
    // Fixture has SqlInjectionRisk@line12 and HardcodedCredential@line3 — must differ
    const hashes = results.map((r) => r.partialFingerprints.primaryLocationLineHash);
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(hashes.length);
  });

  it('at least one rule carries security-severity (fixture has critical security findings)', () => {
    // The tool.driver may or may not include rules depending on implementation;
    // for sprint sarif-unify the security-audit path populates driver.rules.
    const run = sarif.runs[0] as unknown as {
      tool: { driver: { rules?: Array<{ properties?: { 'security-severity'?: string } }> } };
    };
    const rules = run.tool.driver.rules ?? [];
    const secRules = rules.filter(
      (r) => r.properties && r.properties['security-severity'] !== undefined,
    );
    expect(secRules.length).toBeGreaterThan(0);

    // All security-severity values must be numeric strings in (0, 10]
    for (const rule of secRules) {
      const score = rule.properties?.['security-severity'] ?? '';
      expect(typeof score).toBe('string');
      expect(parseFloat(score)).toBeGreaterThan(0);
      expect(parseFloat(score)).toBeLessThanOrEqual(10);
    }
  });

  it('each result level maps correctly to finding severity', () => {
    // SqlInjectionRisk has severity critical → level error
    // HardcodedCredential has severity critical → level error
    // XssRisk has severity high → level error
    const results = sarif.runs[0].results;
    for (const r of results) {
      expect(['error', 'warning', 'note']).toContain(r.level);
    }
    // All three fixture findings are critical/high → all should be 'error'
    const levels = results.map((r) => r.level);
    expect(levels.every((l) => l === 'error')).toBe(true);
  });
});
