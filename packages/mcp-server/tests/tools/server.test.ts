import { describe, it, expect, vi } from 'vitest';

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    tool: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

// Prevent tree-sitter native addon from loading in the Vitest bundler context
// (same pre-existing issue as all other mcp-server tool tests)
vi.mock('@healthy-ai-code/core', () => ({
  analyzeFile: vi.fn(),
  analyzeChangeset: vi.fn(),
  analyzeTemporalCoupling: vi.fn(),
  analyzeKnowledgeLoss: vi.fn(),
  analyzeDeveloperCongestion: vi.fn(),
  analyzeMethodCoupling: vi.fn(),
}));

import { createServer } from '../../src/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('createServer', () => {
  it('skapar en McpServer-instans', async () => {
    const server = await createServer();
    expect(server).toBeDefined();
    expect(McpServer).toHaveBeenCalledWith({
      name: 'healthy-ai-code',
      version: '0.1.0',
    });
  });

  it('registrerar alla verktyg inklusive code_health_method_coupling', async () => {
    const toolNames: string[] = [];
    vi.mocked(McpServer).mockImplementationOnce(() => ({
      tool: (name: string) => { toolNames.push(name); },
      connect: vi.fn(),
    }) as any);

    await createServer();

    expect(toolNames).toContain('code_health_score');
    expect(toolNames).toContain('code_health_review');
    expect(toolNames).toContain('pre_commit_code_health_safeguard');
    expect(toolNames).toContain('analyze_change_set');
    expect(toolNames).toContain('code_health_refactoring_business_case');
    expect(toolNames).toContain('explain_code_health');
    expect(toolNames).toContain('explain_code_health_productivity');
    expect(toolNames).toContain('code_health_knowledge_map');
    expect(toolNames).toContain('code_health_method_coupling');
    expect(toolNames).toContain('get_config');
    expect(toolNames).toContain('set_config');
    expect(toolNames).toContain('code_health_auto_refactor');
    expect(toolNames).toHaveLength(12);
  });
});
