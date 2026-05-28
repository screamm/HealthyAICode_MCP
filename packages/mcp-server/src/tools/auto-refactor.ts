import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeForAutoRefactor } from '@healthy-ai-code/core';
import { analyzeFile } from '@healthy-ai-code/core';
import { detectLanguage } from '@healthy-ai-code/core';
import * as fs from 'fs/promises';
import type { SmellType, Language } from '@healthy-ai-code/core';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>
) => void;

interface AutoRefactorOptions {
  filePath: string;
  languageOverride?: string;
  targetSmellArg?: string;
}

/** Returns a healthy-file response with the current score and category. */
async function buildHealthyResponse(filePath: string) {
  const healthResult = await analyzeFile(filePath);
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(
          {
            message: 'No refactoring needed — file is healthy',
            filePath,
            score: healthResult.score,
            category: healthResult.category,
          },
          null,
          2
        ),
      },
    ],
  };
}

export function registerAutoRefactor(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_auto_refactor',
    'Refactoring plan for the top code smell in a source file. ' +
      'Read followUpInstruction first — it prescribes model, effort level, and all stop conditions. ' +
      'Loop: apply change → code_health_review → repeat. ' +
      'Stop on loopComplete:true, stagnating:true, score Δ<0.1, or new SecuritySmells.',
    {
      filePath: z.string().describe('Absolute or relative path to the file to refactor'),
      language: z
        .string()
        .optional()
        .describe('Source language override (auto-detected from extension if omitted)'),
      targetSmell: z
        .string()
        .optional()
        .describe('Optional SmellType to filter on (e.g. ComplexMethod, DeepNesting, BumpyRoad)'),
    },
    async ({ filePath, language, targetSmell }) =>
      handleAutoRefactor({
        filePath: filePath as string,
        languageOverride: language as string | undefined,
        targetSmellArg: targetSmell as string | undefined,
      })
  );
}

async function handleAutoRefactor(opts: AutoRefactorOptions) {
  try {
    const { filePath, languageOverride, targetSmellArg } = opts;
    const code = await fs.readFile(filePath, 'utf-8');
    const language: Language = languageOverride ? (languageOverride as Language) : detectLanguage(filePath);
    const targetSmell = targetSmellArg as SmellType | undefined;
    const refactorResult = analyzeForAutoRefactor(code, language, filePath, targetSmell);

    if (!refactorResult) {
      return buildHealthyResponse(filePath);
    }

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(refactorResult, null, 2) }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
}
