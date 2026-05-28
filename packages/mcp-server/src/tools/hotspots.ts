// packages/mcp-server/src/tools/hotspots.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeHotspots } from '@healthy-ai-code/core';

// --- Configuration constants ---
const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_TOP_N = 10;
const DEFAULT_MIN_CHURN_COMMITS = 3;
const MIN_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 365;
const MAX_TOP_N = 50;

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

const repoPathSchema = z.string().describe('Absolut sökväg till git-repots rotkatalog');
const lookbackInt = z.number().int();
const lookbackBounded = lookbackInt.min(MIN_LOOKBACK_DAYS).max(MAX_LOOKBACK_DAYS);
const lookbackDaysWithDefault = lookbackBounded.default(DEFAULT_LOOKBACK_DAYS);
const lookbackDaysSchema = lookbackDaysWithDefault.describe('Historik-period i dagar (default 90)');
const topNInt = z.number().int();
const topNBounded = topNInt.min(1).max(MAX_TOP_N);
const topNWithDefault = topNBounded.default(DEFAULT_TOP_N);
const topNSchema = topNWithDefault.describe('Antal hotspots att returnera (default 10)');
const packageRootSchema = z.string().optional().describe('Begränsa analys till delsökväg — monorepo-stöd (t.ex. "packages/core")');
const minChurnNum = z.number().int().min(1);
const minChurnWithDefault = minChurnNum.default(DEFAULT_MIN_CHURN_COMMITS);
const minChurnCommitsSchema = minChurnWithDefault.describe('Minsta antal commits för att inkludera en fil (default 3)');

const HOTSPOTS_SCHEMA = {
  repoPath: repoPathSchema,
  lookbackDays: lookbackDaysSchema,
  topN: topNSchema,
  packageRoot: packageRootSchema,
  minChurnCommits: minChurnCommitsSchema,
};

export function registerHotspots(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_hotspots',
    'Identifierar de hetaste koddelarna (hotspots) i ett git-repo: filer med hög komplexitet OCH hög ändringsfrekvens. Kombinerar cyclomatic complexity med churn rate under en konfigurerbar tidsperiod. Top-N hotspots returneras sorterade efter score (0–1).',
    HOTSPOTS_SCHEMA,
    async (args) => handleHotspots(args),
  );
}

async function handleHotspots(args: Record<string, unknown>) {
  try {
    const results = await analyzeHotspots(args.repoPath as string, {
      lookbackDays: args.lookbackDays as number,
      topN: args.topN as number,
      packageRoot: args.packageRoot as string | undefined,
      minChurnCommits: args.minChurnCommits as number,
    });

    const body = {
      repoPath: args.repoPath,
      lookbackDays: args.lookbackDays,
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
