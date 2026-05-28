// packages/mcp-server/src/tools/trend-analysis.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeComplexityTrend } from '@healthy-ai-code/core';

// --- Configuration constants ---
const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_SAMPLE_POINTS = 5;
const MIN_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 365;
const MAX_FILE_PATHS = 20;
const MIN_SAMPLE_POINTS = 3;
const MAX_SAMPLE_POINTS = 10;

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

const repoPathSchema = z.string().describe('Absolut sökväg till git-repots rotkatalog');
const filePathsBase = z.array(z.string()).min(1).max(MAX_FILE_PATHS);
const filePathsSchema = filePathsBase.describe('Lista av filsökvägar att analysera (relativt repoPath)');
const lookbackInt = z.number().int();
const lookbackBounded = lookbackInt.min(MIN_LOOKBACK_DAYS).max(MAX_LOOKBACK_DAYS);
const lookbackDaysWithDefault = lookbackBounded.default(DEFAULT_LOOKBACK_DAYS);
const lookbackDaysSchema = lookbackDaysWithDefault.describe('Historik-period i dagar (default 90)');
const sampleInt = z.number().int();
const sampleBounded = sampleInt.min(MIN_SAMPLE_POINTS).max(MAX_SAMPLE_POINTS);
const samplePointsWithDefault = sampleBounded.default(DEFAULT_SAMPLE_POINTS);
const samplePointsSchema = samplePointsWithDefault.describe('Antal samplingspunkter för complexity trend (default 5)');

const TREND_SCHEMA = {
  repoPath: repoPathSchema,
  filePaths: filePathsSchema,
  lookbackDays: lookbackDaysSchema,
  samplePoints: samplePointsSchema,
};

export function registerTrendAnalysis(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_trend_analysis',
    'Analyserar hur en fils kodkvalitet förändras över tid. Returnerar complexity trend (slope, rising/stable/declining) och en övergripande health trajectory per fil. Stödjer analys av upp till 20 filer per anrop.',
    TREND_SCHEMA,
    async (args) => handleTrendAnalysis(args),
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
    const repoPath = args.repoPath as string;
    const filePaths = args.filePaths as string[];
    const samplePoints = args.samplePoints as number;

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
      lookbackDays: args.lookbackDays,
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
