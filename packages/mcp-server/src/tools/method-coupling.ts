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

// --- Configuration constants ---
const DEFAULT_COUPLING_THRESHOLD = 0.5;
const DEFAULT_MAX_COMMITS = 200;
const MAX_COMMITS_LIMIT = 2000;
const PERCENT_MULTIPLIER = 100;

interface HandleMethodCouplingOptions {
  repoPath: string;
  filePath: string;
  threshold: number;
  maxCommits: number;
}

const repoPathSchema = z.string().describe('Absolut sökväg till git-repots rotkatalog');
const filePathSchema = z.string().describe('Sökväg till filen, relativt repoPath');
const thresholdNum = z.number().min(0).max(1);
const thresholdWithDefault = thresholdNum.default(DEFAULT_COUPLING_THRESHOLD);
const thresholdSchema = thresholdWithDefault.describe('Minsta co-change-styrka för att rapportera ett par (default 0.5)');
const maxCommitsNum = z.number().int().min(1).max(MAX_COMMITS_LIMIT);
const maxCommitsWithDefault = maxCommitsNum.default(DEFAULT_MAX_COMMITS);
const maxCommitsSchema = maxCommitsWithDefault.describe('Maxantal commits att analysera (default 200)');

export function registerMethodCoupling(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_method_coupling',
    'Analyserar metodnivå temporal coupling i en fil — visar par av metoder som tenderar att ändras tillsammans över git-historiken (X-Ray-light).',
    {
      repoPath: repoPathSchema,
      filePath: filePathSchema,
      threshold: thresholdSchema,
      maxCommits: maxCommitsSchema,
    },
    async (args) => handleMethodCoupling({
      repoPath: args.repoPath as string,
      filePath: args.filePath as string,
      threshold: args.threshold as number,
      maxCommits: args.maxCommits as number,
    }),
  );
}

async function handleMethodCoupling(options: HandleMethodCouplingOptions) {
  const { repoPath, filePath, threshold, maxCommits } = options;
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
        coChange: `${(p.couplingStrength * PERCENT_MULTIPLIER).toFixed(0)}%`,
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
