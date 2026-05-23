import { describe, it, expect } from 'vitest';
import { registerValidateDataset } from '../../src/tools/validate-dataset';

// ─── MockMcpServer helper ──────────────────────────────────────────────────────

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
  hasRegistered(name: string): boolean {
    return this.tools.has(name);
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('code_health_validate_against_dataset — registration', () => {
  it('registers the tool with the correct name', () => {
    const server = new MockMcpServer() as any;
    registerValidateDataset(server);
    expect(server.hasRegistered('code_health_validate_against_dataset')).toBe(true);
  });
});

describe('code_health_validate_against_dataset — synthetic benchmark', () => {
  it('useSyntheticBenchmark: true returns auroc in [0, 1]', async () => {
    const server = new MockMcpServer() as any;
    registerValidateDataset(server);

    const result = await server.callTool('code_health_validate_against_dataset', {
      useSyntheticBenchmark: true,
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.metrics).toBeDefined();
    expect(typeof parsed.metrics.auroc).toBe('number');
    expect(parsed.metrics.auroc).toBeGreaterThanOrEqual(0);
    expect(parsed.metrics.auroc).toBeLessThanOrEqual(1);
    expect(parsed.summary.totalFiles).toBeGreaterThan(0);
    expect(parsed.interpretation).toBeDefined();
  });

  it('returns buggyFiles and cleanFiles counts', async () => {
    const server = new MockMcpServer() as any;
    registerValidateDataset(server);

    const result = await server.callTool('code_health_validate_against_dataset', {
      useSyntheticBenchmark: true,
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.summary.buggyFiles).toBeGreaterThan(0);
    expect(parsed.summary.cleanFiles).toBeGreaterThan(0);
    expect(parsed.summary.totalFiles).toBe(
      parsed.summary.buggyFiles + parsed.summary.cleanFiles,
    );
  });
});

describe('code_health_validate_against_dataset — error handling', () => {
  it('missing directory and missing datasetPath returns an error', async () => {
    const server = new MockMcpServer() as any;
    registerValidateDataset(server);

    const result = await server.callTool('code_health_validate_against_dataset', {
      useSyntheticBenchmark: false,
    });

    // Should return an error (either isError flag or an error in the payload)
    const parsed = JSON.parse(result.content[0].text);
    const hasError = result.isError === true || parsed.error !== undefined;
    expect(hasError).toBe(true);
  });

  it('nonexistent datasetPath returns isError: true', async () => {
    const server = new MockMcpServer() as any;
    registerValidateDataset(server);

    const result = await server.callTool('code_health_validate_against_dataset', {
      datasetPath: '/nonexistent/path/dataset.json',
    });

    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
  });
});
