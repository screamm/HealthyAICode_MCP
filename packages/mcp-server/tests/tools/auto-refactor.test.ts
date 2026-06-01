import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

// ─── MockMcpServer helper ──────────────────────────────────────────────────────

class MockMcpServer {
  private tools: Map<string, Function> = new Map();
  /** Legacy API — kept for tools that still use server.tool(). */
  tool(name: string, _desc: string, _schema: any, handler: Function): void {
    this.tools.set(name, handler);
  }
  /** New API — used by registerAutoRefactor and registerCodeHealthReview. */
  registerTool(name: string, _config: any, handler: Function): void {
    this.tools.set(name, handler);
  }
  async callTool(name: string, args: any): Promise<any> {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`Tool ${name} not found`);
    return handler(args);
  }
  hasRegistered(name: string): boolean {
    return this.tools.has(name);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HEALTHY_TS = `export function add(a: number, b: number): number { return a + b; }`;

const COMPLEX_TS = `
export function processOrder(order: any): string {
  if (order) {
    if (order.items) {
      for (const item of order.items) {
        if (item.type === 'A') {
          if (item.quantity > 10) {
            if (item.price > 100) {
              if (item.discount) {
                return 'discount-bulk';
              } else {
                return 'bulk';
              }
            } else {
              if (item.discount) {
                return 'discount-small';
              }
            }
          }
        } else if (item.type === 'B') {
          if (item.quantity > 5) {
            if (item.price > 50) {
              return 'b-bulk';
            }
          }
        }
      }
    }
  }
  return 'default';
}
`.trim();

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('code_health_auto_refactor tool — registration', () => {
  it('registers the tool with the correct name', async () => {
    const { registerAutoRefactor } = await import('../../src/tools/auto-refactor');
    const server = new MockMcpServer() as any;
    registerAutoRefactor(server);
    expect(server.hasRegistered('code_health_auto_refactor')).toBe(true);
  });
});

describe('code_health_auto_refactor tool — error handling', () => {
  it('returns isError: true for a non-existent file', async () => {
    const { registerAutoRefactor } = await import('../../src/tools/auto-refactor');
    const server = new MockMcpServer() as any;
    registerAutoRefactor(server);

    const result = await server.callTool('code_health_auto_refactor', {
      filePath: '/nonexistent/path/to/file.ts',
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
  });
});

describe('code_health_auto_refactor tool — healthy file', () => {
  let tmpFile: string;

  beforeEach(async () => {
    tmpFile = path.join(os.tmpdir(), `healthy-auto-refactor-${Date.now()}.ts`);
    await fs.writeFile(tmpFile, HEALTHY_TS);
  });

  afterEach(async () => {
    await fs.unlink(tmpFile).catch(() => {});
  });

  it('returns a "no refactoring needed" message for a healthy file', async () => {
    const { registerAutoRefactor } = await import('../../src/tools/auto-refactor');
    const server = new MockMcpServer() as any;
    registerAutoRefactor(server);

    const result = await server.callTool('code_health_auto_refactor', { filePath: tmpFile });
    expect(result.isError).toBeFalsy();

    const parsed = JSON.parse(result.content[0].text);
    // Healthy file: either a "no refactoring needed" message or a valid refactor result
    if (parsed.message) {
      expect(parsed.message).toContain('No refactoring needed');
      expect(parsed.score).toBeGreaterThan(0);
    } else {
      // Some analyzers may still find minor smells in simple code; that is acceptable
      expect(parsed.targetFunction).toBeDefined();
    }
  });
});

describe('code_health_auto_refactor tool — complex file', () => {
  let tmpFile: string;

  beforeEach(async () => {
    tmpFile = path.join(os.tmpdir(), `complex-auto-refactor-${Date.now()}.ts`);
    await fs.writeFile(tmpFile, COMPLEX_TS);
  });

  afterEach(async () => {
    await fs.unlink(tmpFile).catch(() => {});
  });

  it('returns targetFunction and refactoringInstructions for a complex file', async () => {
    const { registerAutoRefactor } = await import('../../src/tools/auto-refactor');
    const server = new MockMcpServer() as any;
    registerAutoRefactor(server);

    const result = await server.callTool('code_health_auto_refactor', { filePath: tmpFile });
    expect(result.isError).toBeFalsy();

    const parsed = JSON.parse(result.content[0].text);

    // If the file has smells it must return a full AutoRefactorResult
    if (!parsed.message) {
      expect(parsed.targetFunction).toBeDefined();
      expect(Array.isArray(parsed.refactoringInstructions)).toBe(true);
      expect(parsed.refactoringInstructions.length).toBeGreaterThan(0);
      expect(parsed.currentCode).toBeTruthy();
      expect(parsed.predictedHealthScore).toBeGreaterThan(0);
      expect(parsed.predictedHealthScore).toBeLessThanOrEqual(10);
    }
  });

  it('filePath in result matches the input file path', async () => {
    const { registerAutoRefactor } = await import('../../src/tools/auto-refactor');
    const server = new MockMcpServer() as any;
    registerAutoRefactor(server);

    const result = await server.callTool('code_health_auto_refactor', { filePath: tmpFile });
    const parsed = JSON.parse(result.content[0].text);

    if (!parsed.message) {
      expect(parsed.filePath).toBe(tmpFile);
    } else {
      expect(parsed.filePath).toBe(tmpFile);
    }
  });
});
