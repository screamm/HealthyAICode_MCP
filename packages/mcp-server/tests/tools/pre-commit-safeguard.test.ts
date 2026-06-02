import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { registerPreCommitSafeguard } from '../../src/tools/pre-commit-safeguard';

class MockMcpServer {
  private tools: Map<string, Function> = new Map();
  tool(name: string, _desc: string, _schema: any, handler: Function): void {
    this.tools.set(name, handler);
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

describe('pre_commit_code_health_safeguard tool', () => {
  it('returnerar overallSafe true för en lista med hälsosamma filer', async () => {
    const tmpDir = os.tmpdir();
    const file1 = path.join(tmpDir, 'safe1.ts');
    const file2 = path.join(tmpDir, 'safe2.ts');
    await fs.writeFile(file1, 'export const a = 1;');
    await fs.writeFile(file2, 'export function add(x: number, y: number): number { return x + y; }');

    const server = new MockMcpServer() as any;
    registerPreCommitSafeguard(server);

    const result = await server.callTool('pre_commit_code_health_safeguard', {
      repoPath: tmpDir,
      files: [file1, file2],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.overallSafe).toBe(true);
    expect(parsed.message).toContain('safe to commit');
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].safe).toBe(true);
    expect(parsed.results[1].safe).toBe(true);

    await fs.unlink(file1);
    await fs.unlink(file2);
  });

  it('returnerar overallSafe false om en fil har score < 7.0', async () => {
    const tmpDir = os.tmpdir();
    const goodFile = path.join(tmpDir, 'safe-commit.ts');
    const badFile = path.join(tmpDir, 'bad-commit.ts');

    await fs.writeFile(goodFile, 'export const x = 42;');

    const deepNestCode = Array.from({ length: 8 }, (_, i) =>
      `${'  '.repeat(i)}if (cond${i}) {`
    ).join('\n') + '\n' + '  return true;\n' + Array.from({ length: 8 }, () => '}').join('\n');
    await fs.writeFile(badFile, `export function deep(): boolean {\n${deepNestCode}\n  return false;\n}`);

    const server = new MockMcpServer() as any;
    registerPreCommitSafeguard(server);

    const result = await server.callTool('pre_commit_code_health_safeguard', {
      repoPath: tmpDir,
      files: [goodFile, badFile],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.overallSafe).toBeDefined();
    expect(parsed.results).toHaveLength(2);
    expect(parsed.message).toBeDefined();

    await fs.unlink(goodFile);
    await fs.unlink(badFile);
  });

  it('hanterar filer som inte finns', async () => {
    const server = new MockMcpServer() as any;
    registerPreCommitSafeguard(server);

    const result = await server.callTool('pre_commit_code_health_safeguard', {
      repoPath: os.tmpdir(),
      files: ['/nonexistent/file.ts'],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results[0].error).toBeDefined();
  });

  it('returnerar nextAction för varje fil', async () => {
    const tmpFile = path.join(os.tmpdir(), 'nextaction-check.ts');
    await fs.writeFile(tmpFile, 'export const z = 1;');

    const server = new MockMcpServer() as any;
    registerPreCommitSafeguard(server);

    const result = await server.callTool('pre_commit_code_health_safeguard', {
      repoPath: os.tmpdir(),
      files: [tmpFile],
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.results[0].nextAction).toBeDefined();
    expect(parsed.results[0].nextAction.action).toBeDefined();

    await fs.unlink(tmpFile);
  });

  it('verktyget registreras med rätt namn', () => {
    const registered: string[] = [];
    const server = {
      registerTool: (name: string, _config: any, _h: Function) => { registered.push(name); },
    } as any;
    registerPreCommitSafeguard(server);
    expect(registered).toContain('pre_commit_code_health_safeguard');
  });
});
