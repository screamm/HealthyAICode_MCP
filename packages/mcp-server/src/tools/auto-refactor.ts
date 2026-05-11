import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile } from '@healthy-ai-code/core';
import { readFileSync } from 'fs';
import type { Smell } from '@healthy-ai-code/core';

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function registerAutoRefactor(server: McpServer): void {
  server.tool(
    'code_health_auto_refactor',
    'Analyserar en fil och returnerar filinnehållet med specificerade refaktoreringsinstruktioner. Designad för att AI-assistenten ska kunna genomföra konkreta kodändringar baserat på det exakta problemet med hög prioritet.',
    { filePath: z.string().describe('Absolut eller relativ sökväg till filen att refaktorera') },
    async ({ filePath }) => {
      try {
        const [result, fileContent] = await Promise.all([
          analyzeFile(filePath),
          Promise.resolve(readFileSync(filePath, 'utf-8')),
        ]);

        if (result.score >= 9.5) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                filePath,
                score: result.score,
                category: result.category,
                refactoringNeeded: false,
                message: 'Filen är redan AI-redo (score >= 9.5). Ingen refaktorering krävs.',
              }, null, 2),
            }],
          };
        }

        const target = getTopTarget(result.smells);
        const lines = fileContent.split('\n');
        const contextStart = Math.max(0, (target?.line ?? 1) - 3);
        const contextEnd = Math.min(lines.length - 1, (target?.line ?? 1) + 10);
        const codeContext = lines.slice(contextStart, contextEnd + 1).join('\n');

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              filePath,
              score: result.score,
              category: result.category,
              refactoringNeeded: true,
              allSmells: result.smells,
              primaryTarget: target,
              refactoringInstructions: buildInstructions(target, result.score),
              codeContext: {
                startLine: contextStart + 1,
                endLine: contextEnd + 1,
                content: codeContext,
              },
              fullFileContent: fileContent,
              nextStep: 'Genomför refaktoreringen ovan och kör sedan code_health_review för att mäta förbättringen.',
            }, null, 2),
          }],
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          isError: true,
        };
      }
    }
  );
}

function getTopTarget(smells: Smell[]): Smell | null {
  if (smells.length === 0) return null;
  return [...smells].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4))[0];
}

function buildInstructions(target: Smell | null, currentScore: number): string {
  if (!target) return 'Inga specifika problem identifierade. Förbättra den generella kodstrukturen.';
  return [
    `PRIMÄRT MÅL: ${target.type} (${target.severity}) på rad ${target.line}`,
    `Problem: ${target.description}`,
    `Åtgärd: ${target.suggestion}`,
    '',
    `Nuvarande score: ${currentScore}/10.0`,
    'Genomför ENBART denna ändring, undvik att ändra annan logik.',
    'Kör code_health_review efter ändringen för att verifiera förbättringen.',
  ].join('\n');
}
