// packages/mcp-server/src/tools/method-coupling.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeMethodCoupling } from '@healthy-ai-code/core';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

export function registerMethodCoupling(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_method_coupling',
    'Analyserar metodnivå temporal coupling i en fil — visar par av metoder som tenderar att ändras tillsammans över git-historiken (X-Ray-light).',
    {
      repoPath: z.string().describe('Absolut sökväg till git-repots rotkatalog'),
      filePath: z.string().describe('Sökväg till filen, relativt repoPath'),
      threshold: z.number().min(0).max(1).default(0.5).describe('Minsta co-change-styrka för att rapportera ett par (default 0.5)'),
      maxCommits: z.number().int().min(1).max(2000).default(200).describe('Maxantal commits att analysera (default 200)'),
    },
    async (args) => handleMethodCoupling(
      args.repoPath as string,
      args.filePath as string,
      args.threshold as number,
      args.maxCommits as number,
    ),
  );
}

async function handleMethodCoupling(
  repoPath: string,
  filePath: string,
  threshold: number,
  maxCommits: number,
) {
  try {
    const result = await analyzeMethodCoupling(repoPath, filePath, { threshold, maxCommits });
    const body = {
      filePath: result.filePath,
      commitsAnalyzed: result.commitsAnalyzed,
      threshold: result.threshold,
      pairCount: result.pairs.length,
      pairs: result.pairs.map(p => ({
        methodA: p.methodA,
        methodB: p.methodB,
        coChange: `${(p.couplingStrength * 100).toFixed(0)}%`,
        couplings: `${p.coChangeCount} of ${p.combinedTouches}`,
        severity: p.severity,
      })),
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message, repoPath, filePath }) }],
      isError: true,
    };
  }
}
