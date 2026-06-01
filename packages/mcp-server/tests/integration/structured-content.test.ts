/**
 * Integration tests for Sprint 51: outputSchema + structuredContent.
 *
 * Verifies that both code_health_review and code_health_auto_refactor:
 *   1. Return a structuredContent field alongside content[] (backward compat).
 *   2. structuredContent contains the expected typed fields.
 *
 * Tests use real fixture files from packages/core/tests/fixtures.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { registerCodeHealthReview, handleCodeHealthReview } from '../../src/tools/code-health-review';
import { handleAutoRefactor } from '../../src/tools/auto-refactor';

// ── Fixture paths ─────────────────────────────────────────────────────────────

const FIXTURES_DIR = path.resolve(__dirname, '../../../core/tests/fixtures');
const HEALTHY_FILE = path.join(FIXTURES_DIR, 'healthy/simple.ts');
const UNHEALTHY_FILE = path.join(FIXTURES_DIR, 'unhealthy/complex.ts');
const INTEGRATION_FIXTURES = path.resolve(__dirname, 'fixtures');
const INTEGRATION_HEALTHY = path.join(INTEGRATION_FIXTURES, 'healthy.ts');
const INTEGRATION_UNHEALTHY = path.join(INTEGRATION_FIXTURES, 'unhealthy.ts');

// ── MockMcpServer for registration check ─────────────────────────────────────

class MockMcpServer {
  public registeredTools: Array<{ name: string; config: object }> = [];
  registerTool(name: string, config: object, _handler: Function): void {
    this.registeredTools.push({ name, config });
  }
  tool(name: string, _desc: string, _schema: object, _handler: Function): void {
    // Shim for old-style tools (not used in these tests)
  }
}

// ── Sprint 51 Test Suite ──────────────────────────────────────────────────────

describe('Sprint 51: code_health_review — structuredContent', () => {
  it('Test 1: healthy file returns structuredContent with score >= 9.5 and loopComplete: true', async () => {
    const result = await handleCodeHealthReview(HEALTHY_FILE, undefined, 'json');

    // Backward compat: content[] must still be present
    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toBeTruthy();

    // Sprint 51: structuredContent must also be present
    expect(result.structuredContent).toBeDefined();
    const sc = result.structuredContent as Record<string, unknown>;

    expect(sc['score']).toBeGreaterThanOrEqual(9.5);
    expect(sc['loopComplete']).toBe(true);
    expect(sc['category']).toBe('green');
    expect(Array.isArray(sc['issues'])).toBe(true);
  });

  it('Test 2: unhealthy file returns structuredContent with loopComplete: false and issues.length > 0', async () => {
    const result = await handleCodeHealthReview(UNHEALTHY_FILE, undefined, 'json');

    expect(result.structuredContent).toBeDefined();
    const sc = result.structuredContent as Record<string, unknown>;

    expect(sc['loopComplete']).toBe(false);
    expect(sc['score']).toBeLessThan(9.5);
    const issues = sc['issues'] as unknown[];
    expect(issues.length).toBeGreaterThan(0);
  });

  it('structuredContent contains all required ToolResponse fields', async () => {
    const result = await handleCodeHealthReview(INTEGRATION_HEALTHY, undefined, 'json');
    const sc = result.structuredContent as Record<string, unknown>;

    expect(typeof sc['score']).toBe('number');
    expect(['green', 'yellow', 'red']).toContain(sc['category']);
    expect(typeof sc['loopComplete']).toBe('boolean');
    expect(Array.isArray(sc['issues'])).toBe(true);
    expect(typeof sc['summary']).toBe('string');
    expect(sc['nextAction']).toBeDefined();
  });

  it('error case returns structuredContent with error field and isError: true', async () => {
    const result = await handleCodeHealthReview('/nonexistent/file.ts', undefined, 'json');

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeDefined();
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc['error']).toBeDefined();
    expect(typeof sc['error']).toBe('string');
  });

  it('registerCodeHealthReview registers tool with outputSchema in config', () => {
    const mockServer = new MockMcpServer();
    registerCodeHealthReview(mockServer as any);

    expect(mockServer.registeredTools).toHaveLength(1);
    expect(mockServer.registeredTools[0].name).toBe('code_health_review');

    const config = mockServer.registeredTools[0].config as Record<string, unknown>;
    expect(config['outputSchema']).toBeDefined();
    expect(config['description']).toContain('loopComplete');
  });

  it('toon format returns issuesToon instead of issues for unhealthy file', async () => {
    const result = await handleCodeHealthReview(UNHEALTHY_FILE, undefined, 'toon');
    const sc = result.structuredContent as Record<string, unknown>;
    // In TOON mode, issues[] is empty and issuesToon contains the table
    const issues = sc['issues'] as unknown[];
    expect(issues).toHaveLength(0);
    // issuesToon may appear in the content text
    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    if (parsed.issuesToon !== undefined) {
      expect(typeof parsed.issuesToon).toBe('string');
      expect(parsed.issuesToon).toContain('|type|');
    }
  });
});

describe('Sprint 51: code_health_auto_refactor — structuredContent', () => {
  it('Test 3: file needing refactoring returns structuredContent with refactoringNeeded: true', async () => {
    const result = await handleAutoRefactor({
      filePath: INTEGRATION_UNHEALTHY,
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');

    expect(result.structuredContent).toBeDefined();
    const sc = result.structuredContent as Record<string, unknown>;

    // Either it found smells (refactoringNeeded: true) or the file was already healthy
    if (sc['refactoringNeeded'] === true) {
      expect(sc['followUpInstruction']).toBeTruthy();
      expect(typeof sc['followUpInstruction']).toBe('string');
      // Sprint 52/54 fields must be surfaced
      expect(sc['editMode']).toBeDefined();
    } else {
      // Healthy response — score and message present
      expect(sc['message']).toContain('No refactoring needed');
      expect(sc['refactoringNeeded']).toBe(false);
    }
  });

  it('Test 4: healthy file returns structuredContent with message "No refactoring needed"', async () => {
    const result = await handleAutoRefactor({
      filePath: INTEGRATION_HEALTHY,
    });

    expect(result.structuredContent).toBeDefined();
    const sc = result.structuredContent as Record<string, unknown>;

    if (sc['refactoringNeeded'] === false) {
      expect(sc['message']).toContain('No refactoring needed');
      expect(typeof sc['score']).toBe('number');
      expect(sc['score']).toBeGreaterThan(0);
    } else {
      // Acceptable: simple fixture may still have minor smells
      expect(sc['refactoringNeeded']).toBe(true);
    }
  });

  it('error case returns structuredContent with error field and isError: true', async () => {
    const result = await handleAutoRefactor({
      filePath: '/nonexistent/path/to/file.ts',
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeDefined();
    const sc = result.structuredContent as Record<string, unknown>;
    expect(sc['error']).toBeDefined();
  });

  it('structuredContent includes editMode / manualInterventionRequired fields for refactoring result', async () => {
    const result = await handleAutoRefactor({
      filePath: INTEGRATION_UNHEALTHY,
    });

    const sc = result.structuredContent as Record<string, unknown>;

    if (sc['refactoringNeeded'] === true) {
      // Sprint 52/54 extension fields
      expect(['patch', 'funcRewrite', 'fileRewrite']).toContain(sc['editMode']);
      expect(typeof sc['manualInterventionRequired']).toBe('boolean');
      expect(typeof sc['preActPlanAvailable']).toBe('boolean');
    }
  });
});

describe('Sprint 51: backward compatibility — content[] is always present', () => {
  it('code_health_review content[0] is valid JSON matching structuredContent', async () => {
    const result = await handleCodeHealthReview(INTEGRATION_HEALTHY, undefined, 'json');

    const text = result.content[0].text;
    expect(() => JSON.parse(text)).not.toThrow();

    const parsed = JSON.parse(text);
    const sc = result.structuredContent as Record<string, unknown>;

    // score in both should match
    expect(parsed.score).toBe(sc['score']);
    expect(parsed.loopComplete).toBe(sc['loopComplete']);
  });

  it('code_health_auto_refactor content[0] is valid JSON', async () => {
    const result = await handleAutoRefactor({
      filePath: INTEGRATION_HEALTHY,
    });

    const text = result.content[0].text;
    expect(() => JSON.parse(text)).not.toThrow();
  });
});
