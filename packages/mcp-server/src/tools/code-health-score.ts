import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile } from '@healthy-ai-code/core';
import type { ToolResponse } from '../types';
import { buildNextAction } from './shared';
import { reviewOutputZodShape } from '../schemas/code-health-review-output.schema';
import { assertSafeReadableFile, isPathGuardError } from './path-safety';

const AI_READY_THRESHOLD = 9.5;

export function registerCodeHealthScore(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_score',
    {
      title: 'Code Health Score',
      description:
        'Computes a fast health score (1–10) for a single source file. ' +
        'Use this for quick screening before deciding whether a deeper review is needed. ' +
        'Returns score, category (green/yellow/red), loopComplete flag, and the detected smells.',
      inputSchema: {
        filePath: z.string().describe('Absolute or relative path to the file to score'),
      },
      outputSchema: reviewOutputZodShape,
      annotations: {
        title: 'Code Health Score',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => handleCodeHealthScore(args['filePath'] as string)
  );
}

export async function handleCodeHealthScore(filePath: string) {
  try {
    const safePath = assertSafeReadableFile(filePath);
    const result = await analyzeFile(safePath);
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
      content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
      structuredContent: response,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const errorPayload = isPathGuardError(error) ? { error: message, rejected: true } : { error: message };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(errorPayload) }],
      isError: true as const,
      structuredContent: errorPayload,
    };
  }
}
