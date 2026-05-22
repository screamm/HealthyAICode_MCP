import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { collectProjectFiles, analyzeAllFiles, filterRisks, buildResponseBody } from './knowledge-map-helpers';
import { analyzeDocDebt, analyzeIntentClarity } from '@healthy-ai-code/core';
import * as path from 'path';
import * as fsp from 'fs/promises';

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

    // Sprint 23: Documentation Debt and Intent Clarity analyses
    const analysisFiles = files.slice(0, 100);
    const fileContents = await Promise.all(
      analysisFiles.map(async (f) => {
        try { return await fsp.readFile(f, 'utf-8'); }
        catch { return ''; }
      }),
    );
    const ext = (f: string) => path.extname(f).slice(1);
    const langFor = (f: string): string => {
      const e = ext(f);
      if (['ts', 'tsx'].includes(e)) return 'typescript';
      if (['js', 'jsx', 'mjs', 'cjs'].includes(e)) return 'javascript';
      if (e === 'py') return 'python';
      return 'unsupported';
    };

    const docDebtResults = analysisFiles.map((f, i) => analyzeDocDebt(fileContents[i], f));
    const intentResults = analysisFiles.map((f, i) => analyzeIntentClarity(fileContents[i], f, langFor(f)));

    const criticalDocDebt = docDebtResults.filter(r => r.docDebtIndex >= 0.60);
    const avgDocDebtIndex = docDebtResults.length > 0
      ? docDebtResults.reduce((s, r) => s + r.docDebtIndex, 0) / docDebtResults.length
      : 0;

    const lowClarityFiles = intentResults.filter(r => r.intentClarityScore < 0.40);
    const avgClarityScore = intentResults.length > 0
      ? intentResults.reduce((s, r) => s + r.intentClarityScore, 0) / intentResults.length
      : 0;

    const base = buildResponseBody(projectPath, files, { highCongestion, singleOwner, highCoupling });
    const extended = {
      ...base,
      documentationDebt: {
        criticalFiles: criticalDocDebt.map(r => ({ file: r.filePath, docDebtIndex: r.docDebtIndex, severity: r.severity })),
        avgDocDebtIndex: parseFloat(avgDocDebtIndex.toFixed(3)),
      },
      intentClarity: {
        lowClarityFiles: lowClarityFiles.map(r => ({ file: r.filePath, intentClarityScore: r.intentClarityScore, poorlyNamed: r.poorlyNamedFunctions.slice(0, 5) })),
        avgClarityScore: parseFloat(avgClarityScore.toFixed(3)),
      },
    };

    return { content: [{ type: 'text' as const, text: JSON.stringify(extended, null, 2) }] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
  }
}
