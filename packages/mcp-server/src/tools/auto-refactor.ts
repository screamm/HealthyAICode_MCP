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
      'Output fields (reasoning-first order): followUpInstruction, smell, refactoringStrategy, ' +
      'refactoringInstructions (numbered steps), exampleSkeleton, predictedScoreDelta, ' +
      'remainingSmellTypes (next smells to fix), then currentCode block. ' +
      'Apply using model claude-opus-4-7. Verify with code_health_review. ' +
      'Repeat until loopComplete: true (score ≥ 9.5) — minimum 3 iterations, typically 3–5.',
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
