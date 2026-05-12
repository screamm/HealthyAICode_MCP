import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { collectProjectFiles, analyzeAllFiles, filterRisks, buildResponseBody } from './knowledge-map-helpers';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>
) => void;

export function registerKnowledgeMap(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_knowledge_map',
    'Analyserar kunskapsfördelning, bus factor och temporär koppling i ett projekt. Visar vem som äger vilka filer och vilka filer som förändras ihop.',
    { projectPath: z.string().describe('Sökväg till projektets rotkatalog') },
    async ({ projectPath }) => handleKnowledgeMap(projectPath as string)
  );
}

async function handleKnowledgeMap(projectPath: string) {
  try {
    const files = await collectProjectFiles(projectPath);
    const [congestionResults, knowledgeResults, coupledPairs] = await analyzeAllFiles(projectPath, files);
    const { highCongestion, singleOwner, highCoupling } = filterRisks(congestionResults, knowledgeResults, coupledPairs);
    return { content: [{ type: 'text' as const, text: JSON.stringify(buildResponseBody(projectPath, files, { highCongestion, singleOwner, highCoupling }), null, 2) }] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
  }
}
