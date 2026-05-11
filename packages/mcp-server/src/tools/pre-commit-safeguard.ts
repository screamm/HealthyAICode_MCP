import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile, type HealthResult } from '@healthy-ai-code/core';
import { buildNextAction } from './shared';

const SAFE_SCORE_THRESHOLD = 7.0;
const LOOP_COMPLETE_SCORE = 9.5;

interface FileCheckOk {
  file: string; score: number; category: HealthResult['category']; safe: boolean;
  issues: HealthResult['smells']; nextAction: ReturnType<typeof buildNextAction>;
}
interface FileCheckError { file: string; error: string; }
type FileCheckResult = FileCheckOk | FileCheckError;

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>
) => void;

export function registerPreCommitSafeguard(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'pre_commit_code_health_safeguard',
    'Kontrollerar staged/listade filer innan commit. Blockerar om ny röd kod introduceras.',
    {
      repoPath: z.string().describe('Absolut sökväg till git-repositoryt'),
      files: z.array(z.string()).describe('Lista med filsökvägar att kontrollera'),
    },
    async ({ repoPath, files }) => handlePreCommitCheck(repoPath as string, files as string[])
  );
}

async function handlePreCommitCheck(repoPath: string, files: string[]) {
  const results: FileCheckResult[] = [];
  for (const file of files) results.push(await checkSingleFile(repoPath, file));
  const overallSafe = results.every(r => 'safe' in r && r.safe);
  return wrapResponse(overallSafe, results);
}

async function checkSingleFile(repoPath: string, file: string): Promise<FileCheckResult> {
  try {
    const isAbsolute = file.startsWith('/') || file.startsWith('\\') || /^[A-Za-z]:/.test(file);
    const resolvedPath = isAbsolute ? file : `${repoPath}/${file}`;
    const result = await analyzeFile(resolvedPath);
    const safe = result.score >= SAFE_SCORE_THRESHOLD;
    return { file, score: result.score, category: result.category, safe,
      issues: result.smells, nextAction: buildNextAction(result, result.score >= LOOP_COMPLETE_SCORE) };
  } catch (error: unknown) {
    return { file, error: error instanceof Error ? error.message : String(error) };
  }
}

function wrapResponse(overallSafe: boolean, results: FileCheckResult[]) {
  const message = overallSafe
    ? 'Alla filer är säkra att committa.'
    : 'STOPPA: Röda filer identifierade. Refaktorera innan commit.';
  return { content: [{ type: 'text' as const, text: JSON.stringify({ overallSafe, message, results }, null, 2) }] };
}
