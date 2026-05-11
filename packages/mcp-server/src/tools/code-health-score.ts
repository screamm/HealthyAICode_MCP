import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile } from '@healthy-ai-code/core';
import type { ToolResponse } from '../types';
import { buildNextAction } from './shared';

const AI_READY_THRESHOLD = 9.5;

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>
) => void;

export function registerCodeHealthScore(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_score',
    'Beräknar en snabb hälsopoäng (1-10) för en fil. Använd detta för snabb screening.',
    { filePath: z.string().describe('Absolut eller relativ sökväg till filen') },
    async ({ filePath }) => handleCodeHealthScore(filePath as string)
  );
}

async function handleCodeHealthScore(filePath: string) {
  try {
    const result = await analyzeFile(filePath);
    const loopComplete = result.score >= AI_READY_THRESHOLD;
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
