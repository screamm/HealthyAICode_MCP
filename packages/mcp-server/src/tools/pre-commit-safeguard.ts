import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile, type HealthResult } from '@healthy-ai-code/core';
import { buildNextAction } from './shared';
import { assertSafeReadableFile } from './path-safety';

const SAFE_SCORE_THRESHOLD = 7.0;
const LOOP_COMPLETE_SCORE = 9.5;

interface FileCheckOk {
  file: string; score: number; category: HealthResult['category']; safe: boolean;
  issues: HealthResult['smells']; nextAction: ReturnType<typeof buildNextAction>;
}
interface FileCheckError { file: string; error: string; }
type FileCheckResult = FileCheckOk | FileCheckError;

export function registerPreCommitSafeguard(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'pre_commit_code_health_safeguard',
    {
      title: 'Pre-Commit Code Health Safeguard',
      description:
        'Checks staged/listed files before a commit and blocks if new red (unhealthy) code is introduced. ' +
        'Run this as the final gate before committing — it is mandatory per AGENTS.md §3.2.',
      inputSchema: {
        repoPath: z.string().describe('Absolute path to the git repository root'),
        files: z.array(z.string()).describe('List of file paths to check (relative to repoPath or absolute)'),
      },
      annotations: {
        title: 'Pre-Commit Code Health Safeguard',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) =>
      handlePreCommitCheck(args['repoPath'] as string, args['files'] as string[])
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
    // Validates traversal (relative files must stay inside repoPath) and size cap.
    const resolvedPath = assertSafeReadableFile(file, repoPath);
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
    ? 'All files are safe to commit.'
    : 'STOP: red files detected. Refactor before committing.';
  return { content: [{ type: 'text' as const, text: JSON.stringify({ overallSafe, message, results }, null, 2) }] };
}
