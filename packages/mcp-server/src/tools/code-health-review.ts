import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile } from '@healthy-ai-code/core';
import type { ToolResponse } from '../types';
import { buildNextAction, formatReviewSummary } from './shared';

export function registerCodeHealthReview(server: McpServer): void {
  server.tool(
    'code_health_review',
    'Djupgranskning av kodhälsa med detaljerade problem och refaktoreringsanvisningar. Kör detta i en loop tills loopComplete är true.',
    { filePath: z.string().describe('Absolut eller relativ sökväg till filen') },
    async ({ filePath }) => {
      try {
        const result = await analyzeFile(filePath);
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
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
          isError: true,
        };
      }
    }
  );
}
