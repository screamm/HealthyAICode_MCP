import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile } from '@healthy-ai-code/core';
import { readFileSync } from 'fs';
import { buildReadyResponse, buildRefactorResponse, extractCodeContext, getTopTarget } from './auto-refactor-builders';

const AI_READY_THRESHOLD = 9.5;

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>
) => void;

export function registerAutoRefactor(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_auto_refactor',
    'Analyserar en fil och returnerar filinnehållet med specificerade refaktoreringsinstruktioner. Designad för att AI-assistenten ska kunna genomföra konkreta kodändringar baserat på det exakta problemet med hög prioritet.',
    { filePath: z.string().describe('Absolut eller relativ sökväg till filen att refaktorera') },
    async ({ filePath }) => handleAutoRefactor(filePath as string)
  );
}

async function handleAutoRefactor(filePath: string) {
  try {
    const [result, fileContent] = await Promise.all([
      analyzeFile(filePath),
      Promise.resolve(readFileSync(filePath, 'utf-8')),
    ]);
    if (result.score >= AI_READY_THRESHOLD) {
      return buildReadyResponse({ filePath, score: result.score, category: result.category });
    }
    const target = getTopTarget(result.smells);
    return buildRefactorResponse(filePath, result, target, fileContent, extractCodeContext(fileContent, target?.line ?? 1));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
  }
}
