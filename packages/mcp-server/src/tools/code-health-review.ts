import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile, analyzeFileWithHistory } from '@healthy-ai-code/core';
import type { ToolResponse } from '../types';
import { buildNextAction, formatReviewSummary } from './shared';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>
) => void;

export function registerCodeHealthReview(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_review',
    'Djupgranskning av kodhälsa med detaljerade problem och refaktoreringsanvisningar. Kör detta i en loop tills loopComplete är true.',
    {
      filePath: z.string().describe('Absolut eller relativ sökväg till filen'),
      repoPath: z.string().optional().describe('Rot-sökväg till git-repot. Om angivet inkluderas MethodTemporalCoupling-analys baserad på git-historik.'),
    },
    async ({ filePath, repoPath }) => handleCodeHealthReview(filePath as string, repoPath as string | undefined)
  );
}

async function handleCodeHealthReview(filePath: string, repoPath?: string) {
  try {
    const result = repoPath
      ? await analyzeFileWithHistory(filePath, repoPath)
      : await analyzeFile(filePath);
    const loopComplete = result.score >= 9.5;
    const response: ToolResponse = {
      score: result.score,
      category: result.category,
      loopComplete,
      issues: result.smells,
      summary: formatReviewSummary(filePath, result),
      nextAction: buildNextAction(result, loopComplete),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
}
