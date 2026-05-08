import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { registerCodeHealthScore } from '../../src/tools/code-health-score';

class MockMcpServer {
  private tools: Map<string, Function> = new Map();
  tool(name: string, _desc: string, _schema: any, handler: Function): void {
    this.tools.set(name, handler);
  }
  async callTool(name: string, args: any): Promise<any> {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`Tool ${name} not found`);
    return handler(args);
  }
}

describe('code_health_score tool', () => {
  it('returnerar score och nextAction för en giltig TypeScript-fil', async () => {
    const tmpFile = path.join(os.tmpdir(), 'test-score-tool.ts');
    await fs.writeFile(tmpFile, 'export function add(a: number, b: number): number { return a + b; }');

    const server = new MockMcpServer() as any;
    registerCodeHealthScore(server);

    const result = await server.callTool('code_health_score', { filePath: tmpFile });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.score).toBeGreaterThan(8);
    expect(parsed.category).toBe('green');
    expect(parsed.loopComplete).toBe(true);
    expect(parsed.nextAction.action).toBe('commit_safe');
    expect(parsed.summary).toContain(tmpFile);

    await fs.unlink(tmpFile);
  });

  it('returnerar refactor-action för komplex fil', async () => {
    const tmpFile = path.join(os.tmpdir(), 'test-complex-tool.ts');
    const complexCode = `
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
    await fs.writeFile(tmpFile, complexCode);

    const server = new MockMcpServer() as any;
    registerCodeHealthScore(server);

    const result = await server.callTool('code_health_score', { filePath: tmpFile });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.score).toBeLessThan(8.5);
    expect(parsed.loopComplete).toBe(false);
    expect(parsed.nextAction.action).toBe('refactor');

    await fs.unlink(tmpFile);
  });

  it('returnerar fel för fil som inte finns', async () => {
    const server = new MockMcpServer() as any;
    registerCodeHealthScore(server);

    const result = await server.callTool('code_health_score', { filePath: '/nonexistent/file.ts' });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
  });

  it('verktyget registreras med rätt namn', () => {
    const registered: string[] = [];
    const server = {
      tool: (name: string, _d: string, _s: any, _h: Function) => { registered.push(name); },
    } as any;
    registerCodeHealthScore(server);
    expect(registered).toContain('code_health_score');
  });
});
