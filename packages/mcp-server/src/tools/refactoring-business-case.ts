import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile } from '@healthy-ai-code/core';

// ROI-modell baserad på CodeScene-forskning:
// Varje poängs förbättring ger ~4% snabbare development och ~4% lägre defekt-rate
const ROI_PER_POINT = 4;
const TARGET_SCORE = 9.5;

export function registerRefactoringBusinessCase(server: McpServer): void {
  server.tool(
    'code_health_refactoring_business_case',
    'Beräknar affärsvärdet av att förbättra kodhälsan. Visar ROI i hastighet och defekter.',
    { filePath: z.string().describe('Sökväg till filen att analysera') },
    async ({ filePath }) => {
      try {
        const result = await analyzeFile(filePath);
        const currentScore = result.score;
        const improvement = Math.max(0, TARGET_SCORE - currentScore);

        const speedGainPct = Math.round(improvement * ROI_PER_POINT);
        const defectReductionPct = Math.round(improvement * ROI_PER_POINT);

        const recommendation =
          improvement > 2
            ? `Hög prioritet: ${improvement.toFixed(1)} poängs förbättring ger ${speedGainPct}% snabbare leverans`
            : improvement > 0.5
            ? `Medium prioritet: ${improvement.toFixed(1)} poängs förbättring ger marginella förbättringar`
            : 'Låg prioritet: Filen är redan i gott skick';

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  filePath,
                  currentScore,
                  targetScore: TARGET_SCORE,
                  improvement: parseFloat(improvement.toFixed(1)),
                  businessCase: {
                    developmentSpeedGain: `+${speedGainPct}%`,
                    defectRateReduction: `-${defectReductionPct}%`,
                    aiReadinessGain:
                      currentScore < TARGET_SCORE
                        ? 'Koden är inte AI-redo. Refaktorering möjliggör säker AI-assistans.'
                        : 'Koden är redan AI-redo.',
                    recommendation,
                  },
                  smellsToFix: result.smells,
                },
                null,
                2
              ),
            },
          ],
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
