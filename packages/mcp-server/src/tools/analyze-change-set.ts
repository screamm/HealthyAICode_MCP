import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeChangeset, type ChangesetResult } from '@healthy-ai-code/core';
import { resolveSafePath } from './path-safety';

export function registerAnalyzeChangeSet(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'analyze_change_set',
    {
      title: 'Analyze Change Set',
      description:
        'Analyses the entire diff against a base branch and reports per-file health regressions, ' +
        'improvements, and newly unhealthy files. Run this before opening a pull request.',
      inputSchema: {
        repoPath: z.string().describe('Absolute path to the git repository root'),
        baseBranch: z.string().optional().describe('Base branch to compare against (default: main)'),
      },
      annotations: {
        title: 'Analyze Change Set',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) =>
      handleChangeset(args['repoPath'] as string, ((args['baseBranch'] as string | undefined) ?? 'main'))
  );
}

async function handleChangeset(repoPath: string, baseBranch: string) {
  try {
    const safeRepoPath = resolveSafePath(repoPath);
    const result = await analyzeChangeset(safeRepoPath, baseBranch);
    return successResponse(result);
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
}

function successResponse(result: ChangesetResult) {
  const message = result.overallSafe
    ? `Changeset is safe. ${result.improvements.length} improvement(s), no regressions.`
    : `WARNING: ${result.regressions.length} regression(s) and ${result.newUnhealthyFiles.length} new unhealthy file(s).`;
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ ...result, message }, null, 2) }],
  };
}

function errorResponse(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
