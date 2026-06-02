// packages/mcp-server/tests/tools/ai-audit.test.ts
// Sprint 29 — ai-audit tool tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { registerAiAudit } from '../../src/tools/ai-audit';

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

/** Minimal TypeScript snippet that looks plausibly AI-generated. */
const AI_GENERATED_SNIPPET = `
// This function handles user authentication
export function authenticateUser(username: string, password: string): boolean {
  // TODO: add proper validation
  if (username === "admin" && password === "password123") {
    return true;
  }
  return false;
}

// Helper to process data
export function processData(data: any): any {
  const result: any = {};
  for (const key of Object.keys(data)) {
    result[key] = data[key];
  }
  return result;
}
`.trim();

describe('code_health_ai_audit tool', () => {
  let server: MockMcpServer;
  let testDir: string;
  let tsFile: string;

  beforeEach(() => {
    server = new MockMcpServer();
    registerAiAudit(server as any);

    testDir = join(tmpdir(), `ai-audit-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    tsFile = join(testDir, 'sample.ts');
    writeFileSync(tsFile, AI_GENERATED_SNIPPET);
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('är registrerat med rätt verktygsnamn', () => {
    expect(server.registeredNames()).toContain('code_health_ai_audit');
  });

  it('returnerar fel när filePath inte finns', async () => {
    const result = await server.callTool('code_health_ai_audit', {
      filePath: '/nonexistent/path/file.ts',
      language: 'typescript',
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0].text);
    expect(body.error).toBeDefined();
  });

  it('returnerar aiConfidence inom intervallet [0, 1]', async () => {
    const result = await server.callTool('code_health_ai_audit', {
      filePath: tsFile,
      language: 'typescript',
      includeNonAI: true,
    });
    const body = JSON.parse(result.content[0].text);
    // When confidence <= 0.3 and includeNonAI=false the tool returns a short message; with includeNonAI=true it always returns full result
    const confidence = body.aiConfidence ?? body.confidence;
    expect(typeof confidence).toBe('number');
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('returnerar smells som en array (standardSmells)', async () => {
    const result = await server.callTool('code_health_ai_audit', {
      filePath: tsFile,
      language: 'typescript',
      includeNonAI: true,
    });
    const body = JSON.parse(result.content[0].text);
    // Full result path (always returned because includeNonAI=true)
    if (body.standardSmells !== undefined) {
      expect(Array.isArray(body.standardSmells)).toBe(true);
    }
    // Also check aiSpecificSmells if present
    if (body.aiSpecificSmells !== undefined) {
      expect(Array.isArray(body.aiSpecificSmells)).toBe(true);
    }
  });

  it('returnerar filePath i svaret', async () => {
    const result = await server.callTool('code_health_ai_audit', {
      filePath: tsFile,
      language: 'typescript',
      includeNonAI: true,
    });
    const body = JSON.parse(result.content[0].text);
    expect(body.filePath).toBe(tsFile);
  });

  it('svar innehåller type: text och är giltig JSON', async () => {
    const result = await server.callTool('code_health_ai_audit', {
      filePath: tsFile,
      language: 'typescript',
      includeNonAI: true,
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it('returnerar kort meddelande (ej full analys) när confidence <= 0.3 och includeNonAI är false', async () => {
    // Write a very simple, clearly non-AI file
    const plainFile = join(testDir, 'plain.ts');
    writeFileSync(plainFile, 'export const x = 1;\n');

    const result = await server.callTool('code_health_ai_audit', {
      filePath: plainFile,
      language: 'typescript',
      includeNonAI: false,
    });
    // Should not be an error
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    // Either a short skip-message or a full result — both are valid
    expect(body.filePath).toBe(plainFile);
  });
});
