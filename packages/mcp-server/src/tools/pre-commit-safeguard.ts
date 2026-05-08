import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile } from '@healthy-ai-code/core';
import { buildNextAction } from './shared';

export function registerPreCommitSafeguard(server: McpServer): void {
  server.tool(
    'pre_commit_code_health_safeguard',
    'Kontrollerar staged/listade filer innan commit. Blockerar om ny röd kod introduceras.',
    {
      repoPath: z.string().describe('Absolut sökväg till git-repositoryt'),
      files: z.array(z.string()).describe('Lista med filsökvägar att kontrollera'),
    },
    async ({ repoPath, files }) => {
      const results = [];
      let overallSafe = true;

      for (const file of files) {
        try {
          const resolvedPath =
            file.startsWith('/') || file.startsWith('\\') || /^[A-Za-z]:/.test(file)
              ? file
              : `${repoPath}/${file}`;
          const result = await analyzeFile(resolvedPath);
          const isSafe = result.score >= 7.0;
          if (!isSafe) overallSafe = false;
          results.push({
            file,
            score: result.score,
            category: result.category,
            safe: isSafe,
            issues: result.smells,
            nextAction: buildNextAction(result, result.score >= 9.5),
          });
        } catch (error: any) {
          results.push({ file, error: error.message });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                overallSafe,
                message: overallSafe
                  ? 'Alla filer är säkra att committa.'
                  : 'STOPPA: Röda filer identifierade. Refaktorera innan commit.',
                results,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
