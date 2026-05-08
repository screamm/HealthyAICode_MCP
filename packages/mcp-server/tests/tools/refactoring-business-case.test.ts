import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { registerRefactoringBusinessCase } from '../../src/tools/refactoring-business-case';

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

describe('code_health_refactoring_business_case tool', () => {
  it('returnerar businessCase för en fil med låg score', async () => {
    const tmpFile = path.join(os.tmpdir(), 'business-case-low.ts');
    const complexCode = `
export function analyzeData(data: any, config: any, opts: any, ctx: any, log: any, flags: any): any {
  if (data) {
    if (config) {
      if (opts) {
        if (ctx) {
          if (log) {
            if (flags.debug) {
              if (flags.verbose) {
                return { data, config, opts, ctx, log, flags };
              }
            }
          }
        }
      }
    }
  }
  return null;
}
`.trim();
    await fs.writeFile(tmpFile, complexCode);

    const server = new MockMcpServer() as any;
    registerRefactoringBusinessCase(server);

    const result = await server.callTool('code_health_refactoring_business_case', { filePath: tmpFile });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.currentScore).toBeDefined();
    expect(parsed.targetScore).toBe(9.5);
    expect(parsed.improvement).toBeGreaterThanOrEqual(0);
    expect(parsed.businessCase.developmentSpeedGain).toMatch(/^\+\d+%$/);
    expect(parsed.businessCase.defectRateReduction).toMatch(/^-\d+%$/);
    expect(parsed.businessCase.recommendation).toBeDefined();

    await fs.unlink(tmpFile);
  });

  it('returnerar låg prioritet för fil nära målpoängen', async () => {
    const tmpFile = path.join(os.tmpdir(), 'business-case-high.ts');
    await fs.writeFile(tmpFile, 'export function id<T>(x: T): T { return x; }');

    const server = new MockMcpServer() as any;
    registerRefactoringBusinessCase(server);

    const result = await server.callTool('code_health_refactoring_business_case', { filePath: tmpFile });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.improvement).toBeLessThan(1.0);
    expect(parsed.businessCase.recommendation).toContain('gott skick');

    await fs.unlink(tmpFile);
  });

  it('ROI-beräkning är korrekt (4% per poäng)', async () => {
    const tmpFile = path.join(os.tmpdir(), 'roi-calc.ts');
    await fs.writeFile(tmpFile, 'export const x = 1;');

    const server = new MockMcpServer() as any;
    registerRefactoringBusinessCase(server);

    const result = await server.callTool('code_health_refactoring_business_case', { filePath: tmpFile });
    const parsed = JSON.parse(result.content[0].text);

    const expectedSpeedGain = Math.round(parsed.improvement * 4);
    expect(parsed.businessCase.developmentSpeedGain).toBe(`+${expectedSpeedGain}%`);
    expect(parsed.businessCase.defectRateReduction).toBe(`-${expectedSpeedGain}%`);

    await fs.unlink(tmpFile);
  });

  it('returnerar smells att fixa', async () => {
    const tmpFile = path.join(os.tmpdir(), 'biz-smells.ts');
    const complexCode = `
export function big(a: any, b: any, c: any, d: any, e: any, f: any): void {
  if (a) { if (b) { if (c) { if (d) { if (e) { console.log(f); } } } } }
}
`.trim();
    await fs.writeFile(tmpFile, complexCode);

    const server = new MockMcpServer() as any;
    registerRefactoringBusinessCase(server);

    const result = await server.callTool('code_health_refactoring_business_case', { filePath: tmpFile });
    const parsed = JSON.parse(result.content[0].text);

    expect(Array.isArray(parsed.smellsToFix)).toBe(true);

    await fs.unlink(tmpFile);
  });

  it('returnerar fel för fil som inte finns', async () => {
    const server = new MockMcpServer() as any;
    registerRefactoringBusinessCase(server);

    const result = await server.callTool('code_health_refactoring_business_case', { filePath: '/ghost.ts' });

    expect(result.isError).toBe(true);
  });

  it('verktyget registreras med rätt namn', () => {
    const registered: string[] = [];
    const server = {
      tool: (name: string, _d: string, _s: any, _h: Function) => { registered.push(name); },
    } as any;
    registerRefactoringBusinessCase(server);
    expect(registered).toContain('code_health_refactoring_business_case');
  });
});
