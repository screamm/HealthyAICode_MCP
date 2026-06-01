/**
 * Integration tests for Sprint 59: code_health_format_output tool.
 *
 * Verifies that the tool correctly formats HealthResult into:
 *   - SARIF 2.1.0 with partialFingerprints and security-severity
 *   - GitLab Code Quality JSON (Code Climate format)
 *   - ISO/IEC 5055 four-dimension report
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { registerFormatOutput } from '../../src/tools/format-output';

// ── MockMcpServer ─────────────────────────────────────────────────────────────

class MockMcpServer {
  private tools: Map<string, Function> = new Map();

  tool(_name: string, _desc: string, _schema: any, handler: Function): void {
    /* old API, unused here */
  }

  registerTool(name: string, _config: any, handler: Function): void {
    this.tools.set(name, handler);
  }

  async callTool(name: string, args: any): Promise<any> {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`Tool ${name} not found`);
    return handler(args);
  }
}

// ── Fixture paths ─────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.resolve(__dirname, '../../../core/tests/fixtures');
const HEALTHY_FILE = path.join(FIXTURES_DIR, 'healthy/simple.ts');
const UNHEALTHY_FILE = path.join(FIXTURES_DIR, 'unhealthy/complex.ts');

// ── Security fixture: insecure-deserialization produces UnsafeDeserialization smells ──────────────
//
// ARCHITECTURE NOTE on security-severity coverage:
// The format-output tool's SECURITY_SEVERITY_MAP covers:
//   HardcodedCredential (9.8), HardcodedApiKey (9.8), SqlInjectionRisk (8.5), XssRisk (8.5),
//   CommandInjectionRisk (8.5), UnsafeDeserialization (7.5), PathTraversalRisk (7.5),
//   DependencyVulnerability (6.0).
//
// Of these, only UnsafeDeserialization is emitted by the additive health analysis pipeline
// (via detectSecuritySinks in security-sink-detector.ts). HardcodedCredential and SqlInjectionRisk
// are emitted by the auditSecurity() path (security-analyzer.ts), NOT by analyzeFile().
// The format-output tool calls analyzeFile(), so a fixture must trigger UnsafeDeserialization
// (or another additive-detector security smell) to produce security-severity SARIF rules.
//
// We use the existing insecure-deserialization.py fixture which reliably triggers UnsafeDeserialization.

const SECURITY_FIXTURE_PATH = path.resolve(
  __dirname,
  '../../../core/tests/fixtures/unhealthy/insecure-deserialization.py',
);

// Keep beforeAll/afterAll for potential future use
beforeAll(async () => {
  // Verify the fixture exists
  const exists = await fs.access(SECURITY_FIXTURE_PATH).then(() => true).catch(() => false);
  if (!exists) throw new Error(`Security fixture not found: ${SECURITY_FIXTURE_PATH}`);
});

afterAll(async () => {
  // no temp files to clean up
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Sprint 59: format-output tool — registration', () => {
  it('registers code_health_format_output with correct name', () => {
    const server = new MockMcpServer();
    registerFormatOutput(server as any);
    // Since MockMcpServer uses registerTool, call it directly
    const names: string[] = [];
    const captureServer = {
      registerTool: (name: string, _cfg: any, _h: Function) => { names.push(name); },
      tool: () => {},
    };
    registerFormatOutput(captureServer as any);
    expect(names).toContain('code_health_format_output');
  });
});

describe('Sprint 59: format-output tool — gitlab-json format', () => {
  it('returns a JSON array with correct structure for unhealthy file', async () => {
    const server = new MockMcpServer();
    registerFormatOutput(server as any);

    const result = await server.callTool('code_health_format_output', {
      filePath: UNHEALTHY_FILE,
      format: 'gitlab-json',
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);

    // GitLab format is an array
    expect(Array.isArray(parsed)).toBe(true);

    if (parsed.length > 0) {
      const entry = parsed[0];
      expect(entry).toHaveProperty('description');
      expect(entry).toHaveProperty('check_name');
      expect(entry).toHaveProperty('fingerprint');
      expect(entry).toHaveProperty('severity');
      expect(entry).toHaveProperty('location');
      expect(entry.location).toHaveProperty('path');
      expect(entry.location).toHaveProperty('lines');
      expect(entry.location.lines).toHaveProperty('begin');

      // Fingerprint must be 32-char hex (MD5)
      expect(entry.fingerprint).toMatch(/^[0-9a-f]{32}$/);

      // Severity must be one of the valid GitLab values
      expect(['info', 'minor', 'major', 'critical', 'blocker']).toContain(entry.severity);

      // Location path must not start with './'
      expect(entry.location.path).not.toMatch(/^\.\//);
    }
  });

  it('returns an empty array for a healthy file with no smells', async () => {
    const server = new MockMcpServer();
    registerFormatOutput(server as any);

    const result = await server.callTool('code_health_format_output', {
      filePath: HEALTHY_FILE,
      format: 'gitlab-json',
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(0);
  });

  it('fingerprint is deterministic across calls', async () => {
    const server = new MockMcpServer();
    registerFormatOutput(server as any);

    const result1 = await server.callTool('code_health_format_output', {
      filePath: UNHEALTHY_FILE,
      format: 'gitlab-json',
    });
    const result2 = await server.callTool('code_health_format_output', {
      filePath: UNHEALTHY_FILE,
      format: 'gitlab-json',
    });

    const parsed1 = JSON.parse(result1.content[0].text);
    const parsed2 = JSON.parse(result2.content[0].text);

    if (parsed1.length > 0 && parsed2.length > 0) {
      expect(parsed1[0].fingerprint).toBe(parsed2[0].fingerprint);
    }
  });
});

describe('Sprint 59: format-output tool — sarif format', () => {
  it('returns valid SARIF 2.1.0 structure', async () => {
    const server = new MockMcpServer();
    registerFormatOutput(server as any);

    const result = await server.callTool('code_health_format_output', {
      filePath: UNHEALTHY_FILE,
      format: 'sarif',
    });

    expect(result.isError).toBeFalsy();
    const sarif = JSON.parse(result.content[0].text);

    expect(sarif.version).toBe('2.1.0');
    expect(Array.isArray(sarif.runs)).toBe(true);
    expect(sarif.runs).toHaveLength(1);

    const run = sarif.runs[0];
    expect(run.tool).toBeDefined();
    expect(run.tool.driver).toBeDefined();
    expect(run.tool.driver.name).toBe('HealthyAICode');
    expect(Array.isArray(run.results)).toBe(true);
  });

  it('SARIF results include partialFingerprints.primaryLocationLineHash (unconditional on known-unhealthy fixture)', async () => {
    // sprint sarif-unify: both SARIF paths (format-output + security-audit) now emit
    // partialFingerprints. This test covers the format-output (analyzeFile) path.
    // See packages/mcp-server/tests/tools/security-audit.test.ts for the security-audit path.
    const server = new MockMcpServer();
    registerFormatOutput(server as any);

    const result = await server.callTool('code_health_format_output', {
      filePath: UNHEALTHY_FILE,
      format: 'sarif',
    });

    const sarif = JSON.parse(result.content[0].text);
    const results = sarif.runs[0].results;

    // The fixture is known-unhealthy; it must have at least one smell result
    expect(results.length).toBeGreaterThan(0);

    // Every result must carry partialFingerprints with the GitHub dedup field
    for (const r of results) {
      expect(r.partialFingerprints).toBeDefined();
      expect(r.partialFingerprints.primaryLocationLineHash).toBeDefined();
      // Format: <16 hex chars>:1
      expect(r.partialFingerprints.primaryLocationLineHash).toMatch(/^[0-9a-f]{16}:1$/);
    }
  });

  it('SARIF run.properties.healthScore is set', async () => {
    const server = new MockMcpServer();
    registerFormatOutput(server as any);

    const result = await server.callTool('code_health_format_output', {
      filePath: UNHEALTHY_FILE,
      format: 'sarif',
    });

    const sarif = JSON.parse(result.content[0].text);
    expect(sarif.runs[0].properties).toBeDefined();
    expect(typeof sarif.runs[0].properties.healthScore).toBe('number');
  });

  it('healthScore override is embedded when provided', async () => {
    const server = new MockMcpServer();
    registerFormatOutput(server as any);

    const result = await server.callTool('code_health_format_output', {
      filePath: UNHEALTHY_FILE,
      format: 'sarif',
      healthScore: 7.5,
    });

    const sarif = JSON.parse(result.content[0].text);
    expect(sarif.runs[0].properties.healthScore).toBe(7.5);
  });

  it('security smells have security-severity in SARIF rules (asserted unconditionally on security fixture)', async () => {
    // Uses insecure-deserialization.py which reliably triggers UnsafeDeserialization smells
    // via the additive health analysis pipeline (detectSecuritySinks). UnsafeDeserialization
    // is mapped to security-severity: '7.5' in SECURITY_SEVERITY_MAP (shared via sarif-enrichment.ts).
    //
    // sprint sarif-unify: both SARIF paths now emit security-severity. This test covers
    // the format-output (analyzeFile) path; the security-audit path is tested in
    // packages/mcp-server/tests/tools/security-audit.test.ts.
    //
    // WHY this fixture: HardcodedCredential and SqlInjectionRisk are emitted by the
    // auditSecurity() path (not analyzeFile()), so a temp TS file with those patterns
    // would NOT trigger security-severity in format-output's SARIF. UnsafeDeserialization
    // IS emitted by analyzeFile() via the additive detector.
    const server = new MockMcpServer();
    registerFormatOutput(server as any);

    const result = await server.callTool('code_health_format_output', {
      filePath: SECURITY_FIXTURE_PATH,
      format: 'sarif',
    });

    expect(result.isError).toBeFalsy();
    const sarif = JSON.parse(result.content[0].text);
    const rules: any[] = sarif.runs[0].tool.driver.rules ?? [];

    // Rule structure invariant: every rule has id, name, shortDescription
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('name');
      expect(rule).toHaveProperty('shortDescription');
    }

    // The security fixture must produce at least one rule with security-severity
    const securityRules = rules.filter(
      (r: any) => r.properties && r.properties['security-severity'] !== undefined,
    );
    expect(securityRules.length).toBeGreaterThan(0);

    // security-severity must be a numeric string (CVSS score convention)
    for (const rule of securityRules) {
      const score = rule.properties['security-severity'];
      expect(typeof score).toBe('string');
      expect(parseFloat(score)).toBeGreaterThan(0);
      expect(parseFloat(score)).toBeLessThanOrEqual(10);
    }
  });
});

describe('Sprint 59: format-output tool — iso5055 format', () => {
  it('returns ISO 5055 report with all four dimensions', async () => {
    const server = new MockMcpServer();
    registerFormatOutput(server as any);

    const result = await server.callTool('code_health_format_output', {
      filePath: UNHEALTHY_FILE,
      format: 'iso5055',
    });

    expect(result.isError).toBeFalsy();
    const report = JSON.parse(result.content[0].text);

    expect(report).toHaveProperty('security');
    expect(report).toHaveProperty('reliability');
    expect(report).toHaveProperty('performanceEfficiency');
    expect(report).toHaveProperty('maintainability');
    expect(report).toHaveProperty('overallScore');

    // Each dimension has name, score, smells
    for (const dim of ['security', 'reliability', 'performanceEfficiency', 'maintainability']) {
      expect(report[dim]).toHaveProperty('name');
      expect(report[dim]).toHaveProperty('score');
      expect(Array.isArray(report[dim].smells)).toBe(true);
      expect(report[dim].score).toBeGreaterThanOrEqual(1.0);
      expect(report[dim].score).toBeLessThanOrEqual(10.0);
    }
  });

  it('healthy file yields overallScore at or near 10', async () => {
    const server = new MockMcpServer();
    registerFormatOutput(server as any);

    const result = await server.callTool('code_health_format_output', {
      filePath: HEALTHY_FILE,
      format: 'iso5055',
    });

    const report = JSON.parse(result.content[0].text);
    expect(report.overallScore).toBeGreaterThanOrEqual(9.0);
    // All dimensions for a healthy file should also score well
    expect(report.security.score).toBe(10.0);
  });
});

describe('Sprint 59: format-output tool — error handling', () => {
  it('returns isError: true for non-existent file', async () => {
    const server = new MockMcpServer();
    registerFormatOutput(server as any);

    const result = await server.callTool('code_health_format_output', {
      filePath: '/nonexistent/path/to/file.ts',
      format: 'gitlab-json',
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
  });
});
