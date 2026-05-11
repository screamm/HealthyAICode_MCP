import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeChangeset, type ChangesetResult } from '@healthy-ai-code/core';

export function registerAnalyzeChangeSet(server: McpServer): void {
  // @ts-ignore — TS2589: Zod+MCP SDK deep type inference with .default() chains
  server.tool(
    'analyze_change_set',
    'Analyserar hela diff mot basgrenen. Kör innan PR skapas.',
    {
      repoPath: z.string().describe('Absolut sökväg till git-repositoryt'),
      baseBranch: z
        .string()
        .default('main')
        .describe('Basgren att jämföra mot (default: main)'),
    },
    async ({ repoPath, baseBranch }) => handleChangeset(repoPath, baseBranch)
  );
}

async function handleChangeset(repoPath: string, baseBranch: string) {
  try {
    const result = await analyzeChangeset(repoPath, baseBranch);
    return successResponse(result);
  } catch (error: any) {
    return errorResponse(error.message);
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
