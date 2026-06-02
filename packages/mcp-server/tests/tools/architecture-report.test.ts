import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { registerArchitectureReport } from '../../src/tools/architecture-report';

// Minimal mock of McpServer
class MockMcpServer {
  private tools: Map<string, Function> = new Map();

  tool(name: string, _desc: string, _schema: unknown, handler: Function): void {
    this.tools.set(name, handler);
  }

  registerTool(name: string, _config: unknown, handler: Function): void {
    this.tools.set(name, handler);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`Tool ${name} not found`);
    return handler(args);
  }
}

// Helper to create a minimal TypeScript project in a temp dir
async function createTmpProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arch-report-test-'));

  // Create a simple set of TypeScript files with import relationships
  await fs.writeFile(path.join(dir, 'a.ts'), [
    "import { b } from './b';",
    'export const a = () => b();',
  ].join('\n'));

  await fs.writeFile(path.join(dir, 'b.ts'), [
    "import { c } from './c';",
    'export const b = () => c();',
  ].join('\n'));

  await fs.writeFile(path.join(dir, 'c.ts'), [
    "export const c = () => 'hello';",
  ].join('\n'));

  return dir;
}

const cleanupDirs: string[] = [];

afterEach(async () => {
  // Clean up all temp directories created during tests
  for (const dir of cleanupDirs) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
  cleanupDirs.length = 0;
});

// Tests that invoke analyzeArchitectureDebt can be slow due to git calls
// on temp directories (which are not real git repos). Allow 30s.
const TOOL_TIMEOUT = 30_000;

describe('code_health_architecture_report tool', () => {
  it('registreras med rätt verktygsnamn', () => {
    const registered: string[] = [];
    const server = {
      registerTool: (name: string) => { registered.push(name); },
    } as unknown as any;
    registerArchitectureReport(server);
    expect(registered).toContain('code_health_architecture_report');
  });

  it('genererar en HTML-fil på angiven sökväg', async () => {
    const dir = await createTmpProject();
    cleanupDirs.push(dir);

    const outputPath = path.join(dir, 'test-report.html');
    const server = new MockMcpServer() as unknown as any;
    registerArchitectureReport(server);

    const result = await server.callTool('code_health_architecture_report', {
      directory: dir,
      output: outputPath,
      maxFiles: 300,
      minCostOfChange: 'all',
    });

    const parsed = JSON.parse((result as any).content[0].text);
    expect(parsed.outputFile).toBe(outputPath);

    // File should exist
    const stat = await fs.stat(outputPath);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(0);
  }, TOOL_TIMEOUT);

  it('genererar HTML-fil med korrekt DOCTYPE', async () => {
    const dir = await createTmpProject();
    cleanupDirs.push(dir);

    const outputPath = path.join(dir, 'doctype-report.html');
    const server = new MockMcpServer() as unknown as any;
    registerArchitectureReport(server);

    await server.callTool('code_health_architecture_report', {
      directory: dir,
      output: outputPath,
      maxFiles: 300,
      minCostOfChange: 'all',
    });

    const html = await fs.readFile(outputPath, 'utf-8');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
  }, TOOL_TIMEOUT);

  it('HTML-filen innehåller GRAPH_DATA med korrekt struktur', async () => {
    const dir = await createTmpProject();
    cleanupDirs.push(dir);

    const outputPath = path.join(dir, 'graphdata-report.html');
    const server = new MockMcpServer() as unknown as any;
    registerArchitectureReport(server);

    await server.callTool('code_health_architecture_report', {
      directory: dir,
      output: outputPath,
      maxFiles: 300,
      minCostOfChange: 'all',
    });

    const html = await fs.readFile(outputPath, 'utf-8');

    // GRAPH_DATA constant must be present
    expect(html).toContain('const GRAPH_DATA =');

    // Extract the JSON embedded in the HTML
    const match = html.match(/const GRAPH_DATA = (\{[\s\S]*?\});\n/);
    expect(match).not.toBeNull();

    const graphData = JSON.parse(match![1]);

    // Validate top-level structure
    expect(graphData).toHaveProperty('nodes');
    expect(graphData).toHaveProperty('links');
    expect(graphData).toHaveProperty('cycles');
    expect(graphData).toHaveProperty('summary');

    expect(Array.isArray(graphData.nodes)).toBe(true);
    expect(Array.isArray(graphData.links)).toBe(true);
    expect(Array.isArray(graphData.cycles)).toBe(true);

    expect(graphData.summary).toHaveProperty('totalModules');
    expect(graphData.summary).toHaveProperty('cycleCount');
    expect(graphData.summary).toHaveProperty('avgCostOfChange');
    expect(graphData.summary).toHaveProperty('highSeverityCount');
    expect(graphData.summary).toHaveProperty('mediumSeverityCount');
    expect(graphData.summary).toHaveProperty('lowSeverityCount');

    // Validate node structure (if nodes exist)
    if (graphData.nodes.length > 0) {
      const node = graphData.nodes[0];
      expect(node).toHaveProperty('id');
      expect(node).toHaveProperty('fanIn');
      expect(node).toHaveProperty('fanOut');
      expect(node).toHaveProperty('severity');
      expect(node).toHaveProperty('churn');
      expect(node).toHaveProperty('inCycle');
      expect(node).toHaveProperty('propagationCost');
      expect(node).toHaveProperty('costOfChange');
      expect(['high', 'medium', 'low']).toContain(node.severity);
    }
  }, TOOL_TIMEOUT);

  it('minCostOfChange: high filtrerar bort low/medium noder', async () => {
    const dir = await createTmpProject();
    cleanupDirs.push(dir);

    const outputAll = path.join(dir, 'all-report.html');
    const outputHigh = path.join(dir, 'high-report.html');

    const server = new MockMcpServer() as unknown as any;
    registerArchitectureReport(server);

    // Generate report with all severities
    await server.callTool('code_health_architecture_report', {
      directory: dir,
      output: outputAll,
      maxFiles: 300,
      minCostOfChange: 'all',
    });

    // Generate report with high only
    await server.callTool('code_health_architecture_report', {
      directory: dir,
      output: outputHigh,
      maxFiles: 300,
      minCostOfChange: 'high',
    });

    const htmlAll = await fs.readFile(outputAll, 'utf-8');
    const htmlHigh = await fs.readFile(outputHigh, 'utf-8');

    const matchAll = htmlAll.match(/const GRAPH_DATA = (\{[\s\S]*?\});\n/);
    const matchHigh = htmlHigh.match(/const GRAPH_DATA = (\{[\s\S]*?\});\n/);

    expect(matchAll).not.toBeNull();
    expect(matchHigh).not.toBeNull();

    const dataAll = JSON.parse(matchAll![1]);
    const dataHigh = JSON.parse(matchHigh![1]);

    // High-filter should have fewer or equal nodes than all-filter
    expect(dataHigh.nodes.length).toBeLessThanOrEqual(dataAll.nodes.length);

    // All nodes in high-filter must be high severity
    for (const node of dataHigh.nodes) {
      expect(node.severity).toBe('high');
    }
  }, TOOL_TIMEOUT * 2); // Two sequential tool calls

  it('returnerar sammanfattningsstatistik i svaret', async () => {
    const dir = await createTmpProject();
    cleanupDirs.push(dir);

    const outputPath = path.join(dir, 'stats-report.html');
    const server = new MockMcpServer() as unknown as any;
    registerArchitectureReport(server);

    const result = await server.callTool('code_health_architecture_report', {
      directory: dir,
      output: outputPath,
      maxFiles: 300,
      minCostOfChange: 'all',
    });

    const parsed = JSON.parse((result as any).content[0].text);

    expect(parsed).toHaveProperty('outputFile');
    expect(parsed).toHaveProperty('totalModules');
    expect(parsed).toHaveProperty('nodesInGraph');
    expect(parsed).toHaveProperty('linksInGraph');
    expect(parsed).toHaveProperty('cycleCount');
    expect(parsed).toHaveProperty('highSeverityModules');
    expect(parsed).toHaveProperty('avgCostOfChange');
    expect(parsed).toHaveProperty('filterApplied');
    expect(parsed).toHaveProperty('filesAnalyzed');

    expect(typeof parsed.totalModules).toBe('number');
    expect(typeof parsed.nodesInGraph).toBe('number');
    expect(typeof parsed.cycleCount).toBe('number');
    expect(parsed.filterApplied).toBe('all');
  }, TOOL_TIMEOUT);

  it('använder default output-sökväg när output inte anges', async () => {
    const dir = await createTmpProject();
    cleanupDirs.push(dir);

    const server = new MockMcpServer() as unknown as any;
    registerArchitectureReport(server);

    const result = await server.callTool('code_health_architecture_report', {
      directory: dir,
      maxFiles: 300,
      minCostOfChange: 'all',
    });

    const parsed = JSON.parse((result as any).content[0].text);
    const expectedDefault = path.join(dir, 'architecture-report.html');
    expect(parsed.outputFile).toBe(expectedDefault);

    // File should exist at default path
    const stat = await fs.stat(expectedDefault);
    expect(stat.isFile()).toBe(true);
  }, TOOL_TIMEOUT);

  it('returnerar fel för katalog som inte finns', async () => {
    const server = new MockMcpServer() as unknown as any;
    registerArchitectureReport(server);

    const result = await server.callTool('code_health_architecture_report', {
      directory: path.join(os.tmpdir(), 'nonexistent-arch-test-xyz-abc'),
      maxFiles: 300,
      minCostOfChange: 'all',
    });

    const parsed = JSON.parse((result as any).content[0].text);
    // Either isError or an error message about no files found
    const hasError = (result as any).isError === true || parsed.error !== undefined;
    expect(hasError).toBe(true);
  });
});
