import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile, type HealthResult } from '@healthy-ai-code/core';

const ROI_PER_POINT = 4;
const TARGET_SCORE = 9.5;
const HIGH_PRIORITY_GAIN = 2;
const MEDIUM_PRIORITY_GAIN = 0.5;

interface BusinessCase {
  developmentSpeedGain: string;
  defectRateReduction: string;
  aiReadinessGain: string;
  recommendation: string;
}

export function registerRefactoringBusinessCase(server: McpServer): void {
  server.tool(
    'code_health_refactoring_business_case',
    'Beräknar affärsvärdet av att förbättra kodhälsan. Visar ROI i hastighet och defekter.',
    { filePath: z.string().describe('Sökväg till filen att analysera') },
    async ({ filePath }) => handleBusinessCase(filePath)
  );
}

async function handleBusinessCase(filePath: string) {
  try {
    const result = await analyzeFile(filePath);
    return successResponse(filePath, result);
  } catch (error: unknown) {
    return errorResponse(error instanceof Error ? error.message : String(error));
  }
}

function successResponse(filePath: string, result: HealthResult) {
  const improvement = Math.max(0, TARGET_SCORE - result.score);
  const body = { filePath, currentScore: result.score, targetScore: TARGET_SCORE,
    improvement: parseFloat(improvement.toFixed(1)),
    businessCase: buildBusinessCase(result.score, improvement),
    smellsToFix: result.smells };
  return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
}

function errorResponse(message: string) {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
}

function buildBusinessCase(currentScore: number, improvement: number): BusinessCase {
  const speedGainPct = Math.round(improvement * ROI_PER_POINT);
  const aiReadinessGain = currentScore < TARGET_SCORE
    ? 'Koden är inte AI-redo. Refaktorering möjliggör säker AI-assistans.'
    : 'Koden är redan AI-redo.';
  let recommendation = 'Låg prioritet: Filen är redan i gott skick';
  if (improvement > HIGH_PRIORITY_GAIN)
    recommendation = `Hög prioritet: ${improvement.toFixed(1)} poängs förbättring ger ${speedGainPct}% snabbare leverans`;
  else if (improvement > MEDIUM_PRIORITY_GAIN)
    recommendation = `Medium prioritet: ${improvement.toFixed(1)} poängs förbättring ger marginella förbättringar`;
  return { developmentSpeedGain: `+${speedGainPct}%`, defectRateReduction: `-${speedGainPct}%`,
    aiReadinessGain, recommendation };
}
