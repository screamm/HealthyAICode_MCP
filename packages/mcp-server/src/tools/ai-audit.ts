// packages/mcp-server/src/tools/ai-audit.ts
import * as fs from 'fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  analyzeCode,
  detectAiHeuristics,
  detectAbstractionLeakage,
  detectHardcodedAssumptions,
  detectMissingEdgeCases,
  detectStyleInconsistency,
  analyzeGitSignal,
} from '@healthy-ai-code/core';
import type { AiSpecificSmell } from '@healthy-ai-code/core';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

export function registerAiAudit(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_ai_audit',
    'Runs enhanced health check on a file suspected to be AI-generated. '
    + 'Returns AI confidence score, standard smells and AI-specific biomarkers '
    + '(AbstractionLeakage, HardcodedAssumption, MissingEdgeCase, StyleInconsistency).',
    {
      filePath: z.string().describe('Absolute path to the file to analyze'),
      repoPath: z.string().optional()
        .describe('Absolute path to git repo root (enables git-based AI detection)'),
      language: z.enum(['typescript', 'javascript', 'python', 'java'])
        .describe('Programming language'),
      style_convention: z.enum(['camelCase', 'snake_case', 'PascalCase']).optional()
        .describe("Project's naming convention for StyleInconsistency detection"),
      includeNonAI: z.boolean().default(false)
        .describe('If false (default), only return results if AI confidence > 0.3'),
    },
    async (args) => handleAiAudit(args),
  );
}

async function handleAiAudit(
  args: Record<string, unknown>,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  const filePath = args.filePath as string;
  const repoPath = args.repoPath as string | undefined;
  const language = (args.language as string) ?? 'typescript';
  const styleConvention = args.style_convention as 'camelCase' | 'snake_case' | 'PascalCase' | undefined;
  const includeNonAI = (args.includeNonAI as boolean | undefined) ?? false;

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // 1. Heuristic AI detection
    const heuristicResult = detectAiHeuristics(content, filePath, language);

    // 2. Optional git-based AI signal
    let gitSignal;
    if (repoPath) {
      try {
        gitSignal = await analyzeGitSignal(repoPath, filePath);
      } catch {
        gitSignal = undefined;
      }
    }

    // 3. AI-specific smell detection
    const aiSmells: AiSpecificSmell[] = [
      ...detectAbstractionLeakage(content, language),
      ...detectHardcodedAssumptions(content, language),
      ...detectMissingEdgeCases(content, language),
      ...(styleConvention ? detectStyleInconsistency(content, { convention: styleConvention }, language) : []),
    ];

    // 4. Base health score via existing analyzer
    const healthResult = analyzeCode(content, language as 'typescript' | 'javascript' | 'python' | 'java', filePath);

    // 5. Compose enhanced score (penalize AI-specific smells)
    const aiPenalty = aiSmells.filter(s => s.severity === 'high').length * 0.3
      + aiSmells.filter(s => s.severity === 'medium').length * 0.15
      + aiSmells.filter(s => s.severity === 'low').length * 0.05;
    const enhancedHealthScore = Math.max(0, healthResult.score - aiPenalty);

    if (!includeNonAI && heuristicResult.confidence <= 0.3) {
      const body = {
        filePath,
        message: 'File does not appear to be AI-generated (confidence <= 0.3). Use includeNonAI: true to force analysis.',
        aiConfidence: heuristicResult.confidence,
      };
      return { content: [{ type: 'text', text: JSON.stringify(body, null, 2) }] };
    }

    const result = {
      filePath,
      language,
      isLikelyAIGenerated: heuristicResult.isLikelyAIGenerated,
      aiConfidence: heuristicResult.confidence,
      signals: heuristicResult.signals,
      git_signal: gitSignal,
      baseHealthScore: healthResult.score,
      enhancedHealthScore,
      aiSpecificSmells: aiSmells,
      standardSmells: healthResult.smells,
      totalSmells: healthResult.smells.length + aiSmells.length,
      recommendations: buildRecommendations(heuristicResult.confidence, aiSmells),
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message, filePath }) }],
      isError: true,
    };
  }
}

function buildRecommendations(confidence: number, smells: AiSpecificSmell[]): string[] {
  const recs: string[] = [];
  if (confidence > 0.7) {
    recs.push('High AI-generation confidence: review code carefully for correctness and edge cases');
  }
  const leakage = smells.filter(s => s.type === 'AbstractionLeakage');
  if (leakage.length > 0) {
    recs.push(`${leakage.length} abstraction leakage(s): consider extracting inline types to named interfaces`);
  }
  const missing = smells.filter(s => s.type === 'MissingEdgeCase');
  if (missing.length > 0) {
    recs.push(`${missing.length} missing edge case(s): add null checks and error handling`);
  }
  const hardcoded = smells.filter(s => s.type === 'HardcodedAssumption');
  if (hardcoded.length > 0) {
    recs.push(`${hardcoded.length} hardcoded assumption(s): replace magic numbers with named constants`);
  }
  return recs;
}
