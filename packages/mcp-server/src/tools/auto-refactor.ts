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

export function registerAutoRefactor(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_auto_refactor',
    'Returns structured refactoring instructions for the highest-priority smell in a source file. ' +
      'Output fields (reasoning-first order): followUpInstruction (read first), smell, refactoringStrategy, ' +
      'refactoringInstructions (numbered steps), exampleSkeleton, predictedScoreDelta, ' +
      'remainingSmellTypes (next smells to fix), then currentCode/focusLines context. ' +
      'Follow followUpInstruction exactly — it specifies model, effort level, and stop conditions. ' +
      'Verify with code_health_review after each change. Stop when loopComplete: true (score ≥ 9.5) ' +
      'or stagnating: true or score Δ < 0.1 — do NOT continue past these signals.',
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
      handleAutoRefactor(
        filePath as string,
        language as string | undefined,
        targetSmell as string | undefined
      )
  );
}

async function handleAutoRefactor(
  filePath: string,
  languageOverride?: string,
  targetSmellArg?: string
) {
  try {
    const code = await fs.readFile(filePath, 'utf-8');

    const language: Language = languageOverride
      ? (languageOverride as Language)
      : detectLanguage(filePath);

    const targetSmell = targetSmellArg as SmellType | undefined;

    const refactorResult = analyzeForAutoRefactor(code, language, filePath, targetSmell);

    if (!refactorResult) {
      // File is healthy — no refactoring needed.
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

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(refactorResult, null, 2),
        },
      ],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
}
