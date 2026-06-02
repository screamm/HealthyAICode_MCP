// packages/mcp-server/src/tools/method-coupling.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeMethodCoupling } from '@healthy-ai-code/core';
import { resolveSafePath } from './path-safety';

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

const repoPathSchema = z.string().describe('Absolute path to the git repository root');
const filePathSchema = z.string().describe('Path to the file, relative to repoPath');
const thresholdNum = z.number().min(0).max(1);
const thresholdWithDefault = thresholdNum.default(DEFAULT_COUPLING_THRESHOLD);
const thresholdSchema = thresholdWithDefault.describe('Minimum co-change strength to report a pair (default 0.5)');
const maxCommitsNum = z.number().int().min(1).max(MAX_COMMITS_LIMIT);
const maxCommitsWithDefault = maxCommitsNum.default(DEFAULT_MAX_COMMITS);
const maxCommitsSchema = maxCommitsWithDefault.describe('Maximum number of commits to analyse (default 200)');

export function registerMethodCoupling(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_method_coupling',
    {
      title: 'Method Temporal Coupling',
      description:
        'Analyses method-level temporal coupling in a single file — pairs of methods that tend to ' +
        'change together across git history (X-Ray-light). Useful for spotting hidden dependencies.',
      inputSchema: {
        repoPath: repoPathSchema,
        filePath: filePathSchema,
        threshold: thresholdSchema,
        maxCommits: maxCommitsSchema,
      },
      annotations: {
        title: 'Method Temporal Coupling',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => handleMethodCoupling({
      repoPath: args['repoPath'] as string,
      filePath: args['filePath'] as string,
      threshold: args['threshold'] as number,
      maxCommits: args['maxCommits'] as number,
    }),
  );
}

async function handleMethodCoupling(options: HandleMethodCouplingOptions) {
  const { repoPath, filePath, threshold, maxCommits } = options;
  try {
    // Validate repoPath and ensure the relative filePath does not escape it.
    const safeRepoPath = resolveSafePath(repoPath);
    resolveSafePath(filePath, safeRepoPath);
    const result = await analyzeMethodCoupling(safeRepoPath, filePath, { threshold, maxCommits });
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
