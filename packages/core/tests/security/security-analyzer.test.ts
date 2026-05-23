// packages/core/tests/security/security-analyzer.test.ts
import { describe, it, expect } from 'vitest';
import { auditSecurity } from '../../src/security/security-analyzer';

describe('auditSecurity — integration tests', () => {
  it('returns one result per file', async () => {
    const files = [
      { path: 'src/db.ts', content: `const rows = await db.query('SELECT * FROM users WHERE id = $1', [id]);`, language: 'typescript' },
      { path: 'src/config.ts', content: `const apiKey = 'AKIAIOSFODNN7EXAMPLE';`, language: 'typescript' },
    ];
    const results = await auditSecurity(files);
    expect(results).toHaveLength(2);
  });

  it('flags SQL injection in the correct file', async () => {
    const files = [
      {
        path: 'src/db.ts',
        content: `await db.query('SELECT * FROM users WHERE id = ' + userId);`,
        language: 'typescript',
      },
    ];
    const results = await auditSecurity(files);
    expect(results[0].findings.some(f => f.type === 'SqlInjectionRisk')).toBe(true);
  });

  it('produces a valid SARIF 2.1.0 report', async () => {
    const files = [
      { path: 'src/db.ts', content: `await db.query('SELECT ' + x);`, language: 'typescript' },
    ];
    const results = await auditSecurity(files);
    const sarif = results[0].sarif;
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe('HealthyAICode-SecurityAudit');
  });

  it('riskScore is 0 for a clean file', async () => {
    const files = [
      {
        path: 'src/safe.ts',
        content: `const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);`,
        language: 'typescript',
      },
    ];
    const results = await auditSecurity(files);
    expect(results[0].riskScore).toBe(0);
    expect(results[0].findings).toHaveLength(0);
  });

  it('riskScore is positive when vulnerabilities are found', async () => {
    const files = [
      {
        path: 'src/vuln.ts',
        content: `await db.query('SELECT * FROM users WHERE id = ' + userId);`,
        language: 'typescript',
      },
    ];
    const results = await auditSecurity(files);
    expect(results[0].riskScore).toBeGreaterThan(0);
  });

  it('handles an empty file list', async () => {
    const results = await auditSecurity([]);
    expect(results).toHaveLength(0);
  });

  it('combined_score uses mock LLM confidence=0.5 (static-only phase)', async () => {
    const files = [
      {
        path: 'src/test.ts',
        content: `const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';`,
        language: 'typescript',
      },
    ];
    const results = await auditSecurity(files);
    expect(results[0].findings.length).toBeGreaterThan(0);
    for (const f of results[0].findings) {
      // combined_score = 0.4 * static_score + 0.6 * 0.5 = 0.4*ss + 0.3
      const expected = 0.4 * f.static_score + 0.6 * 0.5;
      expect(f.combined_score).toBeCloseTo(expected, 3);
    }
  });
});
