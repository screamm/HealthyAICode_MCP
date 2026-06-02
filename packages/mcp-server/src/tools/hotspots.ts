// packages/mcp-server/src/tools/hotspots.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeHotspots } from '@healthy-ai-code/core';
import { resolveSafePath } from './path-safety';

// --- Configuration constants ---
const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_TOP_N = 10;
const DEFAULT_MIN_CHURN_COMMITS = 3;
const MIN_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 365;
const MAX_TOP_N = 50;

const repoPathSchema = z.string().describe('Absolute path to the git repository root');
const lookbackInt = z.number().int();
const lookbackBounded = lookbackInt.min(MIN_LOOKBACK_DAYS).max(MAX_LOOKBACK_DAYS);
const lookbackDaysWithDefault = lookbackBounded.default(DEFAULT_LOOKBACK_DAYS);
const lookbackDaysSchema = lookbackDaysWithDefault.describe('History window in days (default 90)');
const topNInt = z.number().int();
const topNBounded = topNInt.min(1).max(MAX_TOP_N);
const topNWithDefault = topNBounded.default(DEFAULT_TOP_N);
const topNSchema = topNWithDefault.describe('Number of hotspots to return (default 10)');
const packageRootSchema = z.string().optional().describe('Restrict analysis to a subpath — monorepo support (e.g. "packages/core")');
const minChurnNum = z.number().int().min(1);
const minChurnWithDefault = minChurnNum.default(DEFAULT_MIN_CHURN_COMMITS);
const minChurnCommitsSchema = minChurnWithDefault.describe('Minimum number of commits for a file to be included (default 3)');

const HOTSPOTS_SCHEMA = {
  repoPath: repoPathSchema,
  lookbackDays: lookbackDaysSchema,
  topN: topNSchema,
  packageRoot: packageRootSchema,
  minChurnCommits: minChurnCommitsSchema,
};

export function registerHotspots(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_hotspots',
    {
      title: 'Code Hotspots',
      description:
        'Identifies the hottest parts of a git repo: files with BOTH high complexity AND high change ' +
        'frequency. Combines cyclomatic complexity with churn rate over a configurable time window. ' +
        'Returns the top-N hotspots sorted by score (0–1).',
      inputSchema: HOTSPOTS_SCHEMA,
      annotations: {
        title: 'Code Hotspots',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => handleHotspots(args),
  );
}

async function handleHotspots(args: Record<string, unknown>) {
  try {
    const safeRepoPath = resolveSafePath(args['repoPath'] as string);
    const results = await analyzeHotspots(safeRepoPath, {
      lookbackDays: args['lookbackDays'] as number,
      topN: args['topN'] as number,
      packageRoot: args['packageRoot'] as string | undefined,
      minChurnCommits: args['minChurnCommits'] as number,
    });

    const body = {
      repoPath: safeRepoPath,
      lookbackDays: args['lookbackDays'],
      hotspotCount: results.length,
      hotspots: results.map((h, i) => ({
        rank: i + 1,
        file: h.filePath,
        score: h.score,
        classification: h.classification,
        churn: h.churn,
        commitCount: h.commitCount,
        complexity: h.complexity,
      })),
      summary: results.length === 0
        ? 'No hotspots identified in the given period.'
        : `Top hotspot: ${results[0].filePath} (score=${results[0].score}, ${results[0].classification})`,
    };

    return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
}
