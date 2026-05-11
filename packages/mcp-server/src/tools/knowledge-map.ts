import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeDeveloperCongestion } from '@healthy-ai-code/core';
import { analyzeKnowledgeLoss } from '@healthy-ai-code/core';
import { analyzeTemporalCoupling } from '@healthy-ai-code/core';
import { glob } from 'fast-glob';

type CongestionResult = Awaited<ReturnType<typeof analyzeDeveloperCongestion>>;
type KnowledgeResult = Awaited<ReturnType<typeof analyzeKnowledgeLoss>>;
type CoupledPair = Awaited<ReturnType<typeof analyzeTemporalCoupling>>[number];

export function registerKnowledgeMap(server: McpServer): void {
  server.tool(
    'code_health_knowledge_map',
    'Analyserar kunskapsfördelning, bus factor och temporär koppling i ett projekt. Visar vem som äger vilka filer och vilka filer som förändras ihop.',
    { projectPath: z.string().describe('Sökväg till projektets rotkatalog') },
    async ({ projectPath }) => handleKnowledgeMap(projectPath)
  );
}

async function handleKnowledgeMap(projectPath: string) {
  try {
    const files = await glob('**/*.{ts,js}', {
      cwd: projectPath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*'],
      absolute: true,
    });

    const [congestionResults, knowledgeResults, coupledPairs] = await Promise.all([
      Promise.all(files.map((f: string) => analyzeDeveloperCongestion(projectPath, f))),
      Promise.all(files.map((f: string) => analyzeKnowledgeLoss(projectPath, f))),
      analyzeTemporalCoupling(projectPath, files),
    ]);

    const highCongestion = congestionResults.filter((r: CongestionResult) => r.authorCount >= 5);
    const singleOwner = knowledgeResults.filter((r: KnowledgeResult) => r.primaryOwnershipRatio >= 0.8);
    const highCoupling = coupledPairs.filter((p: CoupledPair) => p.couplingStrength > 0.5);

    const body = {
      projectPath,
      summary: {
        totalFiles: files.length,
        congestionRisk: highCongestion.length,
        singleOwnerRisk: singleOwner.length,
        hiddenCouplingPairs: highCoupling.length,
      },
      developerCongestion: highCongestion.map((r: CongestionResult) => ({
        file: r.filePath,
        authors: r.authorCount,
        severity: r.smell?.severity,
      })),
      knowledgeRisk: singleOwner.map((r: KnowledgeResult) => ({
        file: r.filePath,
        primaryAuthor: r.primaryAuthor,
        ownershipRatio: (r.primaryOwnershipRatio * 100).toFixed(0) + '%',
        busFactorEstimate: r.busFactorEstimate,
      })),
      temporalCoupling: highCoupling.slice(0, 10).map((p: CoupledPair) => ({
        fileA: p.fileA,
        fileB: p.fileB,
        coChanges: p.coChangeCount,
        coupling: (p.couplingStrength * 100).toFixed(0) + '%',
        severity: p.severity,
      })),
    };

    return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
}
