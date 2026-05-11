import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeChangeset, type ChangesetResult } from '@healthy-ai-code/core';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>
) => void;

export function registerAnalyzeChangeSet(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'analyze_change_set',
    'Analyserar hela diff mot basgrenen. Kör innan PR skapas.',
    {
      repoPath: z.string().describe('Absolut sökväg till git-repositoryt'),
      baseBranch: z.string().optional().describe('Basgren att jämföra mot (default: main)'),
    },
    async ({ repoPath, baseBranch }) => handleChangeset(repoPath as string, (baseBranch as string | undefined) ?? 'main')
  );
}

async function handleChangeset(repoPath: string, baseBranch: string) {
  try {
    const result = await analyzeChangeset(repoPath, baseBranch);
    return successResponse(result);
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
}

function successResponse(result: ChangesetResult) {
  const message = result.overallSafe
    ? `Changeset är säkert. ${result.improvements.length} förbättringar, inga regressioner.`
    : `VARNING: ${result.regressions.length} regressioner och ${result.newUnhealthyFiles.length} nya ohälsosamma filer.`;
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
