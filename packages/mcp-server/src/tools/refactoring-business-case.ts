import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile, type HealthResult } from '@healthy-ai-code/core';
import { assertSafeReadableFile } from './path-safety';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_refactoring_business_case',
    {
      title: 'Refactoring Business Case',
      description:
        'Estimates the business value of improving a file\'s code health. ' +
        'Reports ROI in delivery speed and defect reduction, plus the smells worth fixing.',
      inputSchema: {
        filePath: z.string().describe('Path to the file to analyse'),
      },
      annotations: {
        title: 'Refactoring Business Case',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => handleBusinessCase(args['filePath'] as string)
  );
}

async function handleBusinessCase(filePath: string) {
  try {
    const safePath = assertSafeReadableFile(filePath);
    const result = await analyzeFile(safePath);
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
    ? 'Code is not AI-ready. Refactoring enables safe AI assistance.'
    : 'Code is already AI-ready.';
  let recommendation = 'Low priority: file is already in good shape';
  if (improvement > HIGH_PRIORITY_GAIN)
    recommendation = `High priority: a ${improvement.toFixed(1)}-point improvement yields ${speedGainPct}% faster delivery`;
  else if (improvement > MEDIUM_PRIORITY_GAIN)
    recommendation = `Medium priority: a ${improvement.toFixed(1)}-point improvement yields marginal gains`;
  return { developmentSpeedGain: `+${speedGainPct}%`, defectRateReduction: `-${speedGainPct}%`,
    aiReadinessGain, recommendation };
}
