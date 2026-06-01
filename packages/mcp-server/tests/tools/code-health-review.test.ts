import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { registerCodeHealthReview } from '../../src/tools/code-health-review';

class MockMcpServer {
  private tools: Map<string, Function> = new Map();
  /** Legacy API — kept for tools that still use server.tool(). */
  tool(name: string, _desc: string, _schema: any, handler: Function): void {
    this.tools.set(name, handler);
  }
  /** New API — used by registerCodeHealthReview and registerAutoRefactor. */
  registerTool(name: string, _config: any, handler: Function): void {
    this.tools.set(name, handler);
  }
  async callTool(name: string, args: any): Promise<any> {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`Tool ${name} not found`);
    return handler(args);
  }
}

describe('code_health_review tool', () => {
  it('returnerar detaljerad summary med problem för komplex fil', async () => {
    const tmpFile = path.join(os.tmpdir(), 'test-review-complex.ts');
    const complexCode = `
export function validate(data: any): boolean {
  if (data) {
    if (data.user) {
      if (data.user.age > 18) {
        if (data.user.verified) {
          if (data.user.country === 'SE') {
            if (data.user.plan === 'premium') {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}
`.trim();
    await fs.writeFile(tmpFile, complexCode);

    const server = new MockMcpServer() as any;
    registerCodeHealthReview(server);

    const result = await server.callTool('code_health_review', { filePath: tmpFile });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.score).toBeDefined();
    expect(parsed.summary).toContain('Hälsopoäng');
    expect(parsed.summary).toContain(tmpFile);
    expect(parsed.nextAction).toBeDefined();
    expect(['refactor', 'commit_safe']).toContain(parsed.nextAction.action);

    await fs.unlink(tmpFile);
  });

  it('returnerar loopComplete true och commit_safe för hälsosam fil', async () => {
    const tmpFile = path.join(os.tmpdir(), 'test-review-healthy.ts');
    await fs.writeFile(tmpFile, [
      'export function multiply(a: number, b: number): number {',
      '  return a * b;',
      '}',
    ].join('\n'));

    const server = new MockMcpServer() as any;
    registerCodeHealthReview(server);

    const result = await server.callTool('code_health_review', { filePath: tmpFile });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.loopComplete).toBe(true);
    expect(parsed.nextAction.action).toBe('commit_safe');
    expect(parsed.summary).toContain('Inga problem identifierade');

    await fs.unlink(tmpFile);
  });

  it('returnerar fel för fil som inte finns', async () => {
    const server = new MockMcpServer() as any;
    registerCodeHealthReview(server);

    const result = await server.callTool('code_health_review', { filePath: '/no/such/file.ts' });

    expect(result.isError).toBe(true);
  });

  it('summary innehåller identifierade problem med severitet-märkning', async () => {
    const tmpFile = path.join(os.tmpdir(), 'test-review-smells.ts');
    const smellCode = `
export function process(a: any, b: any, c: any, d: any, e: any, f: any): any {
  if (a && b) {
    if (c || d) {
      if (e && f) {
        if (a.value > b.value) {
          if (c.active) {
            return { a, b, c, d, e, f };
          }
        }
      }
    }
  }
  return null;
}
`.trim();
    await fs.writeFile(tmpFile, smellCode);

    const server = new MockMcpServer() as any;
    registerCodeHealthReview(server);

    const result = await server.callTool('code_health_review', { filePath: tmpFile });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.issues.length).toBeGreaterThan(0);
    if (parsed.issues.some((i: any) => i.severity === 'critical')) {
      expect(parsed.summary).toContain('[KRITISK]');
    }

    await fs.unlink(tmpFile);
  });

  it('verktyget registreras med rätt namn', () => {
    const registered: string[] = [];
    const server = {
      tool: (name: string, _d: string, _s: any, _h: Function) => { registered.push(name); },
      registerTool: (name: string, _config: any, _h: Function) => { registered.push(name); },
    } as any;
    registerCodeHealthReview(server);
    expect(registered).toContain('code_health_review');
  });
});
