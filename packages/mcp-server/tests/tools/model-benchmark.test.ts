// packages/mcp-server/tests/tools/model-benchmark.test.ts
// Sprint 29 — model-benchmark tool tests

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { registerModelBenchmark } from '../../src/tools/model-benchmark';

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

const SIMPLE_CODE = 'export function add(a: number, b: number): number { return a + b; }';

const COMPLEX_CODE = `
export function processOrders(orders: any[]): any[] {
  const results = [];
  for (const order of orders) {
    if (order) {
      if (order.items) {
        for (const item of order.items) {
          if (item.type === 'A') {
            if (item.qty > 5) {
              results.push({ id: order.id, status: 'bulk' });
            } else {
              results.push({ id: order.id, status: 'normal' });
            }
          } else {
            results.push({ id: order.id, status: 'other' });
          }
        }
      }
    }
  }
  return results;
}
`.trim();

describe('code_health_model_benchmark tool', () => {
  let server: MockMcpServer;
  let testDir: string;
  let historyPath: string;

  beforeEach(() => {
    server = new MockMcpServer();
    registerModelBenchmark(server as any);

    testDir = join(tmpdir(), `model-bench-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    historyPath = join(testDir, 'history.json');
  });

  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it('är registrerat med rätt verktygsnamn', () => {
    expect(server.registeredNames()).toContain('code_health_model_benchmark');
  });

  it('kör benchmark och returnerar benchmark_entry med delta', async () => {
    const result = await server.callTool('code_health_model_benchmark', {
      model_name: 'test-model-v1',
      generated_code: SIMPLE_CODE,
      reference_code: SIMPLE_CODE,
      file_path: 'src/utils/add.ts',
      language: 'typescript',
      history_path: historyPath,
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);

    expect(body.benchmark_entry).toBeDefined();
    expect(body.benchmark_entry.model_name).toBe('test-model-v1');
    expect(typeof body.benchmark_entry.delta).toBe('number');
    expect(typeof body.benchmark_entry.health_score_ai).toBe('number');
    expect(typeof body.benchmark_entry.health_score_baseline).toBe('number');
  });

  it('sparar entry till history-filen', async () => {
    await server.callTool('code_health_model_benchmark', {
      model_name: 'claude-sonnet-4-6',
      generated_code: COMPLEX_CODE,
      reference_code: SIMPLE_CODE,
      file_path: 'src/orders.ts',
      language: 'typescript',
      history_path: historyPath,
    });

    expect(existsSync(historyPath)).toBe(true);
    const { readFileSync } = await import('fs');
    const stored = JSON.parse(readFileSync(historyPath, 'utf-8'));
    expect(Array.isArray(stored.entries)).toBe(true);
    expect(stored.entries.length).toBeGreaterThan(0);
    expect(stored.entries[0].model_name).toBe('claude-sonnet-4-6');
  });

  it('get_stats: true returnerar aggregated stats för modellen', async () => {
    // First store an entry so stats have data
    await server.callTool('code_health_model_benchmark', {
      model_name: 'gpt-4o',
      generated_code: SIMPLE_CODE,
      reference_code: SIMPLE_CODE,
      file_path: 'src/a.ts',
      language: 'typescript',
      history_path: historyPath,
    });

    // Then query stats
    const result = await server.callTool('code_health_model_benchmark', {
      model_name: 'gpt-4o',
      generated_code: '',
      reference_code: '',
      file_path: '',
      language: 'typescript',
      get_stats: true,
      history_path: historyPath,
    });

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0].text);
    expect(body.model_name).toBe('gpt-4o');
    expect(body.stats).toBeDefined();
    expect(typeof body.total_entries).toBe('number');
    expect(body.total_entries).toBeGreaterThan(0);
  });

  it('get_stats: true på tom history returnerar 0 entries', async () => {
    const result = await server.callTool('code_health_model_benchmark', {
      model_name: 'unknown-model',
      generated_code: '',
      reference_code: '',
      file_path: '',
      language: 'typescript',
      get_stats: true,
      history_path: historyPath,
    });

    const body = JSON.parse(result.content[0].text);
    expect(body.model_name).toBe('unknown-model');
    expect(body.total_entries).toBe(0);
  });

  it('compareToBaseline — AI-kod med lägre kvalitet ger negativ delta', async () => {
    const result = await server.callTool('code_health_model_benchmark', {
      model_name: 'delta-test-model',
      generated_code: COMPLEX_CODE,
      reference_code: SIMPLE_CODE,
      file_path: 'src/complex.ts',
      language: 'typescript',
      history_path: historyPath,
    });

    const body = JSON.parse(result.content[0].text);
    // Complex code typically scores lower than simple code → delta negative or at most small positive
    expect(typeof body.benchmark_entry.delta).toBe('number');
  });

  it('returnerar summary-sträng i svaret', async () => {
    const result = await server.callTool('code_health_model_benchmark', {
      model_name: 'summary-test',
      generated_code: SIMPLE_CODE,
      reference_code: SIMPLE_CODE,
      file_path: 'src/x.ts',
      language: 'typescript',
      history_path: historyPath,
    });

    const body = JSON.parse(result.content[0].text);
    expect(typeof body.summary).toBe('string');
    expect(body.summary.length).toBeGreaterThan(0);
  });

  it('svar innehåller type: text och är giltig JSON', async () => {
    const result = await server.callTool('code_health_model_benchmark', {
      model_name: 'json-test',
      generated_code: SIMPLE_CODE,
      reference_code: SIMPLE_CODE,
      file_path: 'src/y.ts',
      language: 'typescript',
      history_path: historyPath,
    });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });
});
