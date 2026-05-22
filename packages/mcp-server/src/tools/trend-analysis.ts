// packages/mcp-server/src/tools/trend-analysis.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeComplexityTrend } from '@healthy-ai-code/core';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

export function registerTrendAnalysis(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_trend_analysis',
    'Analyserar hur en fils kodkvalitet förändras över tid. Returnerar complexity trend (slope, rising/stable/declining) och en övergripande health trajectory per fil. Stödjer analys av upp till 20 filer per anrop.',
    {
      repoPath: z.string().describe('Absolut sökväg till git-repots rotkatalog'),
      filePaths: z.array(z.string()).min(1).max(20).describe('Lista av filsökvägar att analysera (relativt repoPath)'),
      lookbackDays: z.number().int().min(7).max(365).default(90).describe('Historik-period i dagar (default 90)'),
      samplePoints: z.number().int().min(3).max(10).default(5).describe('Antal samplingspunkter för complexity trend (default 5)'),
    },
    async (args) => handleTrendAnalysis(args),
  );
}

async function handleTrendAnalysis(args: Record<string, unknown>) {
  try {
    const repoPath = args.repoPath as string;
    const filePaths = args.filePaths as string[];
    const samplePoints = args.samplePoints as number;

    // Analyze each file's complexity trend
    const results = await Promise.all(
      filePaths.map(filePath =>
        analyzeComplexityTrend(repoPath, filePath, { samplePoints }),
      ),
    );

    // Map trajectory to health trajectory classification
    function toHealthTrajectory(trajectory: string): string {
      switch (trajectory) {
        case 'rising': return 'deteriorating';
        case 'declining': return 'improving';
        default: return 'stable';
      }
    }

    const fileResults = results.map(r => ({
      filePath: r.filePath,
      slope: r.slope,
      trajectory: r.trajectory,
      healthTrajectory: toHealthTrajectory(r.trajectory),
      commitsAnalyzed: r.commitsAnalyzed,
      sampledPoints: r.sampledPoints.length,
    }));

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
