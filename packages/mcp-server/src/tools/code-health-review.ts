import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile, analyzeFileWithHistory } from '@healthy-ai-code/core';
import * as fs from 'fs/promises';
import type { ToolResponse } from '../types';
import { buildNextAction, formatReviewSummary } from './shared';
import { reviewOutputZodShape } from '../schemas/code-health-review-output.schema';
import { structuralCache } from './structural-cache';
import { encodeToon } from './toon-encoder';

export function registerCodeHealthReview(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_review',
    {
      description:
        'Returns health score (1–10), smell list, and loopComplete flag for a source file. ' +
        'Run after every refactoring to measure progress. ' +
        'When loopComplete is true (score ≥ 9.5) the file is AI-ready — stop looping. ' +
        'Otherwise call code_health_auto_refactor for the next smell to fix.',
      inputSchema: {
        filePath: z.string().describe('Absolute or relative path to the file'),
        repoPath: z
          .string()
          .optional()
          .describe(
            'Root path to the git repo. When provided, MethodTemporalCoupling analysis from git history is included.'
          ),
        responseFormat: z
          .enum(['json', 'toon'])
          .optional()
          .describe(
            'Format for the issues array: "json" (default) returns issues[], "toon" returns issuesToon table (30-60% fewer tokens)'
          ),
      },
      outputSchema: reviewOutputZodShape,
    },
    async (args: Record<string, unknown>) =>
      handleCodeHealthReview(
        args['filePath'] as string,
        args['repoPath'] as string | undefined,
        ((args['responseFormat'] as 'json' | 'toon' | undefined) ?? 'json')
      )
  );
}

export async function handleCodeHealthReview(
  filePath: string,
  repoPath?: string,
  responseFormat: 'json' | 'toon' = 'json'
) {
  try {
    // Check structural cache for re-review optimisation
    let currentMtime: number | undefined;
    try {
      const stat = await fs.stat(filePath);
      currentMtime = stat.mtimeMs;
    } catch {
      // File not stat-able — fall through to full analysis (will error there)
    }

    if (
      currentMtime !== undefined &&
      structuralCache.hasReview(filePath) &&
      !structuralCache.isStale(filePath, currentMtime)
    ) {
      // Re-review cache hit: return compact index instead of full text
      const cachedScore = structuralCache.getCachedScore(filePath)!;
      const smellIndex = structuralCache.getSmellIndex(filePath)!;
      const loopComplete = cachedScore >= 9.5;

      const compactResponse = {
        score: cachedScore,
        category: (cachedScore >= 9.0 ? 'green' : cachedScore >= 6.0 ? 'yellow' : 'red') as
          | 'green'
          | 'yellow'
          | 'red',
        loopComplete,
        issues: [] as ToolResponse['issues'],
        summary: '',
        nextAction: {
          action: 'refactor' as const,
          instruction:
            'Re-review: compact index returned (cache hit). Call with focusLines for specific excerpt.',
          priority: null,
          toolToCallAfter: 'code_health_review' as string | null,
        },
        // Extension fields for re-review
        cacheHit: true,
        smellIndex,
        note: 'Re-review: returnerar byteRange-index, inte full text. Anropa med focusLines för specifikt utdrag.',
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(compactResponse, null, 2) }],
        structuredContent: compactResponse,
      };
    }

    // Full analysis
    const result = repoPath
      ? await analyzeFileWithHistory(filePath, repoPath)
      : await analyzeFile(filePath);

    // Record in structural cache for future re-reviews
    if (currentMtime !== undefined) {
      structuralCache.recordFirstReview(filePath, result.smells, result.score, currentMtime);
    }

    const loopComplete = result.score >= 9.5;

    // Build the response object
    const response: ToolResponse & { issuesToon?: string } = {
      score: result.score,
      category: result.category,
      loopComplete,
      issues: responseFormat === 'toon' ? [] : result.smells,
      summary: formatReviewSummary(filePath, result),
      nextAction: buildNextAction(result, loopComplete),
    };

    // Attach TOON-encoded issues when requested
    if (responseFormat === 'toon' && result.smells.length > 0) {
      response.issuesToon = encodeToon(result.smells);
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
      structuredContent: response,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const errorPayload = { error: message };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(errorPayload) }],
      isError: true as const,
      structuredContent: errorPayload,
    };
  }
}
