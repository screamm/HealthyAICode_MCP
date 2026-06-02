// packages/mcp-server/src/tools/trend-analysis.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeComplexityTrend } from '@healthy-ai-code/core';
import { resolveSafePath } from './path-safety';

// --- Configuration constants ---
const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_SAMPLE_POINTS = 5;
const MIN_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 365;
const MAX_FILE_PATHS = 20;
const MIN_SAMPLE_POINTS = 3;
const MAX_SAMPLE_POINTS = 10;

const repoPathSchema = z.string().describe('Absolute path to the git repository root');
const filePathsBase = z.array(z.string()).min(1).max(MAX_FILE_PATHS);
const filePathsSchema = filePathsBase.describe('List of file paths to analyse (relative to repoPath)');
const lookbackInt = z.number().int();
const lookbackBounded = lookbackInt.min(MIN_LOOKBACK_DAYS).max(MAX_LOOKBACK_DAYS);
const lookbackDaysWithDefault = lookbackBounded.default(DEFAULT_LOOKBACK_DAYS);
const lookbackDaysSchema = lookbackDaysWithDefault.describe('History window in days (default 90)');
const sampleInt = z.number().int();
const sampleBounded = sampleInt.min(MIN_SAMPLE_POINTS).max(MAX_SAMPLE_POINTS);
const samplePointsWithDefault = sampleBounded.default(DEFAULT_SAMPLE_POINTS);
const samplePointsSchema = samplePointsWithDefault.describe('Number of sample points for the complexity trend (default 5)');

const TREND_SCHEMA = {
  repoPath: repoPathSchema,
  filePaths: filePathsSchema,
  lookbackDays: lookbackDaysSchema,
  samplePoints: samplePointsSchema,
};

export function registerTrendAnalysis(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_trend_analysis',
    {
      title: 'Code Health Trend Analysis',
      description:
        'Analyses how a file\'s code quality changes over time. Returns a complexity trend ' +
        '(slope, rising/stable/declining) and an overall health trajectory per file. ' +
        'Supports up to 20 files per call.',
      inputSchema: TREND_SCHEMA,
      annotations: {
        title: 'Code Health Trend Analysis',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => handleTrendAnalysis(args),
  );
}

function toHealthTrajectory(trajectory: string): string {
  switch (trajectory) {
    case 'rising': return 'deteriorating';
    case 'declining': return 'improving';
    default: return 'stable';
  }
}

interface TrendFileResult {
  filePath: string;
  slope: number;
  trajectory: string;
  healthTrajectory: string;
  commitsAnalyzed: number;
  sampledPoints: number;
}

function buildFileResults(
  results: Awaited<ReturnType<typeof analyzeComplexityTrend>>[],
): TrendFileResult[] {
  return results.map(r => ({
    filePath: r.filePath,
    slope: r.slope,
    trajectory: r.trajectory,
    healthTrajectory: toHealthTrajectory(r.trajectory),
    commitsAnalyzed: r.commitsAnalyzed,
    sampledPoints: r.sampledPoints.length,
  }));
}

async function handleTrendAnalysis(args: Record<string, unknown>) {
  try {
    const repoPath = resolveSafePath(args['repoPath'] as string);
    const filePaths = args['filePaths'] as string[];
    const samplePoints = args['samplePoints'] as number;

    // Reject any relative file path that escapes the repository root.
    for (const fp of filePaths) resolveSafePath(fp, repoPath);

    const results = await Promise.all(
      filePaths.map(filePath =>
        analyzeComplexityTrend(repoPath, filePath, { samplePoints }),
      ),
    );

    const fileResults = buildFileResults(results);
    const deteriorating = fileResults.filter(r => r.healthTrajectory === 'deteriorating');
    const improving = fileResults.filter(r => r.healthTrajectory === 'improving');
    const stable = fileResults.filter(r => r.healthTrajectory === 'stable');

    const body = {
      repoPath,
      lookbackDays: args['lookbackDays'],
      filesAnalyzed: fileResults.length,
      summary: {
        deteriorating: deteriorating.length,
        stable: stable.length,
        improving: improving.length,
      },
      deterioratingFiles: deteriorating.map(r => r.filePath),
      files: fileResults,
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
