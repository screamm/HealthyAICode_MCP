import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile } from '@healthy-ai-code/core';
import type { ToolResponse } from '../types';
import { buildNextAction } from './shared';

export function registerCodeHealthScore(server: McpServer): void {
  // @ts-ignore TS2589: MCP SDK tool() overloads exceed TypeScript's type instantiation depth limit
  server.tool(
    'code_health_score',
    'Beräknar en snabb hälsopoäng (1-10) för en fil. Använd detta för snabb screening.',
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
          summary: `${filePath}: ${result.score}/10.0 (${result.category})`,
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
  );
}
