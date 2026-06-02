import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeForAutoRefactor } from '@healthy-ai-code/core';
import { analyzeFile } from '@healthy-ai-code/core';
import { detectLanguage } from '@healthy-ai-code/core';
import * as fs from 'fs/promises';
import type { SmellType, Language } from '@healthy-ai-code/core';
import { autoRefactorOutputZodShape } from '../schemas/auto-refactor-output.schema';
import { assertSafeReadableFile } from './path-safety';

interface AutoRefactorOptions {
  filePath: string;
  languageOverride?: string;
  targetSmellArg?: string;
}

/** Returns a healthy-file response with the current score and category. */
async function buildHealthyResponse(filePath: string) {
  const healthResult = await analyzeFile(filePath);
  const payload = {
    refactoringNeeded: false as const,
    message: 'No refactoring needed — file is healthy',
    filePath,
    score: healthResult.score,
    category: healthResult.category,
  };
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

export function registerAutoRefactor(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_auto_refactor',
    {
      description:
        'Refactoring plan for the top code smell in a source file. ' +
        'Read followUpInstruction first — it prescribes model, effort level, and all stop conditions. ' +
        'Loop: apply change → code_health_review → repeat. ' +
        'Stop on loopComplete:true, stagnating:true, score Δ<0.1, or new SecuritySmells.',
      inputSchema: {
        filePath: z.string().describe('Absolute or relative path to the file to refactor'),
        language: z
          .string()
          .optional()
          .describe('Source language override (auto-detected from extension if omitted)'),
        targetSmell: z
          .string()
          .optional()
          .describe(
            'Optional SmellType to filter on (e.g. ComplexMethod, DeepNesting, BumpyRoad)'
          ),
        editMode: z
          .enum(['patch', 'funcRewrite', 'fileRewrite'])
          .optional()
          .describe(
            '"patch" returns a minimal diff for point fixes (TS/JS/PHP). ' +
              '"funcRewrite" returns the full refactored function. ' +
              '"fileRewrite" returns the entire file. ' +
              'Omit for automatic selection based on smell type and function size.'
          ),
      },
      outputSchema: autoRefactorOutputZodShape,
      annotations: {
        title: 'Auto-Refactor Plan',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) =>
      handleAutoRefactor({
        filePath: args['filePath'] as string,
        languageOverride: args['language'] as string | undefined,
        targetSmellArg: args['targetSmell'] as string | undefined,
      })
  );
}

export async function handleAutoRefactor(opts: AutoRefactorOptions) {
  try {
    const { filePath, languageOverride, targetSmellArg } = opts;
    const safePath = assertSafeReadableFile(filePath);
    const code = await fs.readFile(safePath, 'utf-8');
    const language: Language = languageOverride
      ? (languageOverride as Language)
      : detectLanguage(safePath);
    const targetSmell = targetSmellArg as SmellType | undefined;
    const refactorResult = analyzeForAutoRefactor(code, language, safePath, targetSmell);

    if (!refactorResult) {
      return buildHealthyResponse(safePath);
    }

    // Attach discriminator and surface Sprint 52/54 fields in structuredContent
    const structuredPayload = {
      refactoringNeeded: true as const,
      ...refactorResult,
      // Surface editMode / batchedPlan / preActPlanAvailable explicitly
      editMode: refactorResult.editMode,
      batchedPlan: refactorResult.batchedPlan,
      preActPlanAvailable: refactorResult.preActPlanAvailable,
      manualInterventionRequired: refactorResult.manualInterventionRequired,
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(refactorResult, null, 2) }],
      structuredContent: structuredPayload,
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
