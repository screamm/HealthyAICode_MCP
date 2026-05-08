import { describe, it, expect, vi } from 'vitest';
import { registerAnalyzeChangeSet } from '../../src/tools/analyze-change-set';

vi.mock('@healthy-ai-code/core', () => ({
  analyzeChangeset: vi.fn(),
  analyzeFile: vi.fn(),
}));

import { analyzeChangeset } from '@healthy-ai-code/core';

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

describe('analyze_change_set tool', () => {
  it('returnerar overallSafe true och message för säkert changeset', async () => {
    vi.mocked(analyzeChangeset).mockResolvedValueOnce({
      filesAnalyzed: 3,
      regressions: [],
      improvements: [{ filePath: 'src/a.ts', scoreBefore: 7.0, scoreAfter: 9.0 }],
      newUnhealthyFiles: [],
      overallSafe: true,
    });

    const server = new MockMcpServer() as any;
    registerAnalyzeChangeSet(server);

    const result = await server.callTool('analyze_change_set', {
      repoPath: '/tmp/repo',
      baseBranch: 'main',
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.overallSafe).toBe(true);
    expect(parsed.message).toContain('säkert');
    expect(parsed.improvements).toHaveLength(1);
    expect(parsed.regressions).toHaveLength(0);
  });

  it('returnerar varning för changeset med regressioner', async () => {
    vi.mocked(analyzeChangeset).mockResolvedValueOnce({
      filesAnalyzed: 2,
      regressions: [{ filePath: 'src/b.ts', scoreBefore: 8.0, scoreAfter: 4.5, newSmells: [] }],
      improvements: [],
      newUnhealthyFiles: [],
      overallSafe: false,
    });

    const server = new MockMcpServer() as any;
    registerAnalyzeChangeSet(server);

    const result = await server.callTool('analyze_change_set', {
      repoPath: '/tmp/repo',
      baseBranch: 'main',
    });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.overallSafe).toBe(false);
    expect(parsed.message).toContain('VARNING');
    expect(parsed.regressions).toHaveLength(1);
  });

  it('hanterar fel från analyzeChangeset', async () => {
    vi.mocked(analyzeChangeset).mockRejectedValueOnce(new Error('Git repo not found'));

    const server = new MockMcpServer() as any;
    registerAnalyzeChangeSet(server);

    const result = await server.callTool('analyze_change_set', {
      repoPath: '/no/repo',
      baseBranch: 'main',
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Git repo not found');
  });

  it('använder default baseBranch main', async () => {
    vi.mocked(analyzeChangeset).mockResolvedValueOnce({
      filesAnalyzed: 0,
      regressions: [],
      improvements: [],
      newUnhealthyFiles: [],
      overallSafe: true,
    });

    const server = new MockMcpServer() as any;
    registerAnalyzeChangeSet(server);

    await server.callTool('analyze_change_set', { repoPath: '/tmp/repo', baseBranch: 'main' });

    expect(analyzeChangeset).toHaveBeenCalledWith('/tmp/repo', 'main');
  });

  it('verktyget registreras med rätt namn', () => {
    const registered: string[] = [];
    const server = {
      tool: (name: string, _d: string, _s: any, _h: Function) => { registered.push(name); },
    } as any;
    registerAnalyzeChangeSet(server);
    expect(registered).toContain('analyze_change_set');
  });
});
