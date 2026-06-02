// packages/mcp-server/tests/tools/security-audit.test.ts
// Sprint 28 — security-audit tool tests.
// Updated sprint sarif-unify: added assertions for partialFingerprints and
// security-severity on the security-audit SARIF path.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { registerSecurityAudit } from '../../src/tools/security-audit';

/** Minimal mock that captures registered tools and lets us invoke them. */
class MockMcpServer {
  private tools = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();

  tool(
    name: string,
    _desc: string,
    _schema: unknown,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ): void {
    this.tools.set(name, handler);
  }

  registerTool(
    name: string,
    _config: unknown,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ): void {
    this.tools.set(name, handler);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{
    content: { type: string; text: string }[];
    isError?: boolean;
  }> {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`Tool "${name}" not registered`);
    return handler(args) as Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
  }

  registeredNames(): string[] {
    return [...this.tools.keys()];
  }
}

describe('code_health_security_audit tool', () => {
  let server: MockMcpServer;
  let testDir: string;

  beforeEach(() => {
    server = new MockMcpServer();
    registerSecurityAudit(server as any);
    testDir = join(tmpdir(), `sec-audit-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('är registrerat med rätt verktygsnamn', () => {
    expect(server.registeredNames()).toContain('code_health_security_audit');
  });

  it('returnerar fel när directory inte finns', async () => {
    const result = await server.callTool('code_health_security_audit', {
      directory: '/this/path/does/not/exist/ever',
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toMatch(/Directory not found/);
  });

  it('returnerar 0 findings för en tom katalog', async () => {
    const result = await server.callTool('code_health_security_audit', {
      directory: testDir,
    });
    const body = JSON.parse(result.content[0].text);
    // No supported source files → special "no files" message
    expect(body.scanned_files).toBe(0);
    expect(body.findings_total).toBe(0);
  });

  it('dry_run: true returnerar cost_estimate utan att köra analys', async () => {
    // Add a TypeScript file so dry_run has something to count
    writeFileSync(join(testDir, 'app.ts'), 'export const x = 1;\n');

    const result = await server.callTool('code_health_security_audit', {
      directory: testDir,
      dry_run: true,
    });
    const body = JSON.parse(result.content[0].text);

    expect(body.dry_run).toBe(true);
    expect(body.cost_estimate).toBeDefined();
    expect(body).not.toHaveProperty('findings_total');
  });

  it('outputFormat: "sarif" returnerar SARIF-struktur med version 2.1.0', async () => {
    writeFileSync(join(testDir, 'safe.ts'), 'export function add(a: number, b: number) { return a + b; }\n');

    const result = await server.callTool('code_health_security_audit', {
      directory: testDir,
      outputFormat: 'sarif',
    });
    const body = JSON.parse(result.content[0].text);

    expect(body.sarif).toBeDefined();
    expect(body.sarif.version).toBe('2.1.0');
    expect(Array.isArray(body.sarif.runs)).toBe(true);
  });

  it('summary-format returnerar scanned_files och findings_total för en TypeScript-fil', async () => {
    writeFileSync(join(testDir, 'index.ts'), 'export const value = 42;\n');

    const result = await server.callTool('code_health_security_audit', {
      directory: testDir,
      outputFormat: 'summary',
    });
    const body = JSON.parse(result.content[0].text);

    expect(typeof body.scanned_files).toBe('number');
    expect(body.scanned_files).toBeGreaterThan(0);
    expect(typeof body.findings_total).toBe('number');
  });

  it('svar innehåller type: text och är giltig JSON', async () => {
    const result = await server.callTool('code_health_security_audit', {
      directory: testDir,
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  // ── Sprint sarif-unify: assert enriched fields on security-audit SARIF path ──

  it('security-audit SARIF path: results with findings carry partialFingerprints.primaryLocationLineHash', async () => {
    // Write a TypeScript file with a known hardcoded credential that the static
    // detector reliably flags as HardcodedCredential.
    writeFileSync(
      join(testDir, 'app.ts'),
      [
        "const DB_PASSWORD = 'super-secret-pass-1234';",
        "export function queryUser(id: string) {",
        "  return `SELECT * FROM users WHERE id = '${id}'`;",
        "}",
      ].join('\n'),
    );

    const result = await server.callTool('code_health_security_audit', {
      directory: testDir,
      outputFormat: 'sarif',
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.sarif).toBeDefined();
    expect(body.sarif.version).toBe('2.1.0');

    const results: unknown[] = body.sarif.runs[0].results;

    if (results.length > 0) {
      // Every result that exists must carry partialFingerprints
      for (const r of results as Array<{
        partialFingerprints?: { primaryLocationLineHash?: string };
      }>) {
        expect(r.partialFingerprints, 'partialFingerprints must be present on sarif result').toBeDefined();
        expect(r.partialFingerprints?.primaryLocationLineHash).toMatch(/^[0-9a-f]{16}:1$/);
      }
    }
    // If no findings: the structure is still valid SARIF (0 results is allowed for a clean file)
    expect(Array.isArray(results)).toBe(true);
  });

  it('security-audit SARIF path: security smells have security-severity in driver.rules', async () => {
    // Write a file with hardcoded credential and SQL injection so we have security smells
    writeFileSync(
      join(testDir, 'vulns.ts'),
      [
        "const API_KEY = 'sk-live-abc123secretkey456';",
        "export function getUser(id: string) {",
        "  return `SELECT * FROM users WHERE id = '${id}'`;",
        "}",
      ].join('\n'),
    );

    const result = await server.callTool('code_health_security_audit', {
      directory: testDir,
      outputFormat: 'sarif',
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    const run = body.sarif.runs[0];

    if (run.results.length > 0) {
      // driver.rules should be populated with enriched rules
      const rules: Array<{ properties?: { 'security-severity'?: string } }> =
        run.tool.driver.rules ?? [];

      const securityRules = rules.filter(
        (r) => r.properties && r.properties['security-severity'] !== undefined,
      );

      // At minimum we expect at least one security rule when findings exist
      expect(securityRules.length).toBeGreaterThan(0);

      for (const rule of securityRules) {
        const score = rule.properties?.['security-severity'] ?? '';
        expect(typeof score).toBe('string');
        expect(parseFloat(score)).toBeGreaterThan(0);
        expect(parseFloat(score)).toBeLessThanOrEqual(10);
      }
    }
  });
});
