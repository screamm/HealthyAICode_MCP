import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeChangeset } from '@healthy-ai-code/core';

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
    async ({ repoPath, baseBranch }) => {
      try {
        const result = await analyzeChangeset(repoPath, baseBranch);
        const message = result.overallSafe
          ? `Changeset är säkert. ${result.improvements.length} förbättringar, inga regressioner.`
          : `VARNING: ${result.regressions.length} regressioner och ${result.newUnhealthyFiles.length} nya ohälsosamma filer.`;

        return {
          content: [{ type: 'text', text: JSON.stringify({ ...result, message }, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
          isError: true,
        };
      }
    }
  );
}
