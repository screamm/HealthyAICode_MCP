import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeForAutoRefactor, detectLanguage, analyzeFile, analyzeCode } from '@healthy-ai-code/core';
import { applyAutoRefactor } from '@healthy-ai-code/core';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { SmellType, Language, AutoRefactorResult } from '@healthy-ai-code/core';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>
) => void;

export function registerAutoRefactorApply(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_auto_refactor_apply',
    'Analyzes a source file, applies an automatic mechanical refactoring for the worst smell, ' +
      'and writes the transformed code back to disk. Returns original score, new score, ' +
      'what was changed, and a diff. Optionally preserves a .bak backup.',
    {
      filePath: z.string().describe('Absolute or relative path to the file to refactor'),
      language: z
        .string()
        .optional()
        .describe('Source language override (auto-detected from extension if omitted)'),
      targetSmell: z
        .string()
        .optional()
        .describe('Optional SmellType to target (e.g. ComplexMethod, DeepNesting, BumpyRoad)'),
      strategy: z
        .string()
        .optional()
        .describe('Optional strategy override (e.g. early_return, simplify_conditional)'),
      preserveBackup: z
        .boolean()
        .optional()
        .default(true)
        .describe('If true (default), preserve the original as a .bak file'),
    },
    async ({ filePath, language, targetSmell, strategy, preserveBackup }) =>
      handleAutoRefactorApply(
        filePath as string,
        language as string | undefined,
        targetSmell as string | undefined,
        strategy as string | undefined,
        preserveBackup as boolean | undefined
      )
  );
}

async function handleAutoRefactorApply(
  filePath: string,
  languageOverride?: string,
  targetSmellArg?: string,
  _strategyOverride?: string,
  preserveBackup?: boolean
) {
  try {
    const resolvedPath = path.resolve(filePath);
    const code = await fs.readFile(resolvedPath, 'utf-8');

    const language: Language = languageOverride
      ? (languageOverride as Language)
      : detectLanguage(resolvedPath);

    const targetSmell = targetSmellArg as SmellType | undefined;

    // 1. Run the auto-refactor analysis
    const refactorResult: AutoRefactorResult | null = analyzeForAutoRefactor(
      code,
      language,
      resolvedPath,
      targetSmell
    );

    if (!refactorResult) {
      const healthResult = await analyzeFile(resolvedPath);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                message: 'No refactoring needed — file is healthy',
                filePath: resolvedPath,
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

    // 2. Apply the mechanical refactoring
    const applyResult = applyAutoRefactor(code, refactorResult);

    if (applyResult.changes.length === 0 || code === applyResult.transformedCode) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                message: 'No mechanical transformation could be applied',
                filePath: resolvedPath,
                strategy: refactorResult.refactoringStrategy,
                smell: {
                  type: refactorResult.smell.type,
                  severity: refactorResult.smell.severity,
                  description: refactorResult.smell.description,
                },
                refactoringInstructions: refactorResult.refactoringInstructions,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // 3. Preserve backup if requested
    if (preserveBackup !== false) {
      const backupPath = resolvedPath + '.bak';
      await fs.writeFile(backupPath, code, 'utf-8');
    }

    // 4. Write the transformed code back to disk
    await fs.writeFile(resolvedPath, applyResult.transformedCode, 'utf-8');

    // 5. Re-run code health review to verify improvement
    const originalHealth = analyzeCode(code, language, resolvedPath);
    const newHealth = await analyzeFile(resolvedPath);

    const scoreDelta = parseFloat((newHealth.score - originalHealth.score).toFixed(1));

    // 6. Compute diff
    const diff = computeSimpleDiff(code, applyResult.transformedCode);

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              filePath: resolvedPath,
              strategy: applyResult.strategy,
              originalScore: originalHealth.score,
              newScore: newHealth.score,
              scoreDelta,
              category: newHealth.category,
              changes: applyResult.changes,
              diff,
              targetFunction: refactorResult.targetFunction,
              smell: {
                type: refactorResult.smell.type,
                severity: refactorResult.smell.severity,
                description: refactorResult.smell.description,
              },
              predictedScoreDelta: refactorResult.predictedScoreDelta,
              followUpInstruction:
                'Run code_health_review on the file to verify the improvement and check for any new smells.',
            },
            null,
            2
          ),
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

/** Simple line-by-line diff showing -/+ for changed lines. */
function computeSimpleDiff(original: string, transformed: string): string {
  const origLines = original.split('\n');
  const newLines = transformed.split('\n');
  const result: string[] = [];
  const maxLen = Math.max(origLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    const origLine = i < origLines.length ? origLines[i] : null;
    const newLine = i < newLines.length ? newLines[i] : null;

    if (origLine === null) {
      result.push(`+ ${newLine}`);
    } else if (newLine === null) {
      result.push(`- ${origLine}`);
    } else if (origLine !== newLine) {
      result.push(`- ${origLine}`);
      result.push(`+ ${newLine}`);
    }
  }

  return result.join('\n');
}
