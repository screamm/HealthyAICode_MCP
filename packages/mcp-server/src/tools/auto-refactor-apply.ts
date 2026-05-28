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

interface HandleAutoRefactorApplyOptions {
  filePath: string;
  languageOverride?: string;
  targetSmellArg?: string;
  _strategyOverride?: string;
  preserveBackup?: boolean;
}

interface RefactorContext {
  resolvedPath: string;
  originalCode: string;
  transformedCode: string;
  language: Language;
  preserveBackup?: boolean;
  refactorResult: AutoRefactorResult;
  applyResult: ReturnType<typeof applyAutoRefactor>;
}

const filePathSchema = z.string().describe('Absolute or relative path to the file to refactor');
const languageSchema = z.string().optional().describe('Source language override (auto-detected from extension if omitted)');
const targetSmellSchema = z.string().optional().describe('Optional SmellType to target (e.g. ComplexMethod, DeepNesting, BumpyRoad)');
const strategySchema = z.string().optional().describe('Optional strategy override (e.g. early_return, simplify_conditional)');
const backupBase = z.boolean().optional().default(true);
const preserveBackupSchema = backupBase.describe('If true (default), preserve the original as a .bak file');

const AUTO_REFACTOR_SCHEMA = {
  filePath: filePathSchema,
  language: languageSchema,
  targetSmell: targetSmellSchema,
  strategy: strategySchema,
  preserveBackup: preserveBackupSchema,
};

export function registerAutoRefactorApply(server: McpServer): void {
  const registerTool = server.tool.bind(server) as unknown as McpToolRegistrar;
  registerTool(
    'code_health_auto_refactor_apply',
    'Analyzes a source file, applies an automatic mechanical refactoring for the worst smell, ' +
      'and writes the transformed code back to disk. Returns original score, new score, ' +
      'what was changed, and a diff. Optionally preserves a .bak backup.',
    AUTO_REFACTOR_SCHEMA,
    async ({ filePath, language, targetSmell, strategy, preserveBackup }) =>
      handleAutoRefactorApply({
        filePath: filePath as string,
        languageOverride: language as string | undefined,
        targetSmellArg: targetSmell as string | undefined,
        _strategyOverride: strategy as string | undefined,
        preserveBackup: preserveBackup as boolean | undefined,
      })
  );
}

async function resolveRefactorAnalysis(
  resolvedPath: string,
  code: string,
  language: Language,
  targetSmell: SmellType | undefined,
): Promise<AutoRefactorResult | null> {
  return analyzeForAutoRefactor(code, language, resolvedPath, targetSmell);
}

async function handleNoRefactorNeeded(resolvedPath: string) {
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

function handleNoTransformation(resolvedPath: string, refactorResult: AutoRefactorResult) {
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

async function writeRefactoredFile(ctx: RefactorContext): Promise<void> {
  const { resolvedPath, originalCode, transformedCode, preserveBackup } = ctx;
  if (preserveBackup !== false) {
    await fs.writeFile(resolvedPath + '.bak', originalCode, 'utf-8');
  }
  await fs.writeFile(resolvedPath, transformedCode, 'utf-8');
}

async function buildRefactorSuccessResponse(ctx: RefactorContext) {
  const { resolvedPath, originalCode, language, refactorResult, applyResult } = ctx;
  const originalHealth = analyzeCode(originalCode, language, resolvedPath);
  const newHealth = await analyzeFile(resolvedPath);
  const scoreDelta = parseFloat((newHealth.score - originalHealth.score).toFixed(1));
  const diff = computeSimpleDiff(originalCode, applyResult.transformedCode);

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
}

async function handleAutoRefactorApply(options: HandleAutoRefactorApplyOptions) {
  const { filePath, languageOverride, targetSmellArg, preserveBackup } = options;
  try {
    const resolvedPath = path.resolve(filePath);
    const code = await fs.readFile(resolvedPath, 'utf-8');

    const language: Language = languageOverride
      ? (languageOverride as Language)
      : detectLanguage(resolvedPath);

    const targetSmell = targetSmellArg as SmellType | undefined;
    const refactorResult = await resolveRefactorAnalysis(resolvedPath, code, language, targetSmell);

    if (!refactorResult) {
      return handleNoRefactorNeeded(resolvedPath);
    }

    const applyResult = applyAutoRefactor(code, refactorResult);

    if (applyResult.changes.length === 0 || code === applyResult.transformedCode) {
      return handleNoTransformation(resolvedPath, refactorResult);
    }

    const ctx: RefactorContext = {
      resolvedPath,
      originalCode: code,
      transformedCode: applyResult.transformedCode,
      language,
      preserveBackup,
      refactorResult,
      applyResult,
    };
    await writeRefactoredFile(ctx);
    return buildRefactorSuccessResponse(ctx);
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
