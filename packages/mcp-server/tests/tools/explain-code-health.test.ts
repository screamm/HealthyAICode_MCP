import { describe, it, expect } from 'vitest';
import { registerExplainCodeHealth, registerExplainProductivity } from '../../src/tools/explain-code-health';

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

describe('explain_code_health tool', () => {
  it('returnerar förklaring av code health-skalan', async () => {
    const server = new MockMcpServer() as any;
    registerExplainCodeHealth(server);

    const result = await server.callTool('explain_code_health', {});
    const text = result.content[0].text;

    expect(text).toContain('Code Health');
    expect(text).toContain('9.5');
    expect(text).toContain('AI-ready');
    expect(text).toContain('1-10');
  });

  it('förklaringen innehåller skala och vad som mäts', async () => {
    const server = new MockMcpServer() as any;
    registerExplainCodeHealth(server);

    const result = await server.callTool('explain_code_health', {});
    const text = result.content[0].text;

    expect(text).toContain('Red');
    expect(text).toContain('Yellow');
    expect(text).toContain('Green');
    expect(text.toLowerCase()).toMatch(/complexity|nesting|length/);
  });

  it('verktyget registreras med rätt namn', () => {
    const registered: string[] = [];
    const server = {
      registerTool: (name: string, _config: any, _h: Function) => { registered.push(name); },
    } as any;
    registerExplainCodeHealth(server);
    expect(registered).toContain('explain_code_health');
  });
});

describe('explain_code_health_productivity tool', () => {
  it('returnerar produktivitetsförklaring med forskningsdata', async () => {
    const server = new MockMcpServer() as any;
    registerExplainProductivity(server);

    const result = await server.callTool('explain_code_health_productivity', {});
    const text = result.content[0].text;

    expect(text).toContain('36%');
    expect(text).toContain('CodeScene');
    expect(text).toContain('AI');
  });

  it('produktivitetsförklaringen innehåller token-kostnader och fix-rate', async () => {
    const server = new MockMcpServer() as any;
    registerExplainProductivity(server);

    const result = await server.callTool('explain_code_health_productivity', {});
    const text = result.content[0].text;

    expect(text).toContain('20%');
    expect(text).toContain('90');
    expect(text).toContain('9.5');
  });

  it('verktyget registreras med rätt namn', () => {
    const registered: string[] = [];
    const server = {
      registerTool: (name: string, _config: any, _h: Function) => { registered.push(name); },
    } as any;
    registerExplainProductivity(server);
    expect(registered).toContain('explain_code_health_productivity');
  });
});
