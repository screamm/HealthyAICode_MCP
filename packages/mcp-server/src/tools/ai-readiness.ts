// packages/mcp-server/src/tools/ai-readiness.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import fg from 'fast-glob';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeFile, analyzeAIReadiness, type AIReadinessFile } from '@healthy-ai-code/core';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: ['ts', 'tsx'],
  javascript: ['js', 'jsx', 'mjs', 'cjs'],
  python: ['py'],
  java: ['java'],
  kotlin: ['kt'],
  csharp: ['cs'],
  rust: ['rs'],
  go: ['go'],
  php: ['php'],
  ruby: ['rb'],
  swift: ['swift'],
};

export function registerAIReadiness(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_ai_readiness',
    'Beräknar AI-Readiness Score (0-10) för en katalog. Composite-metric som mäter hur väl en kodbas lämpar sig för AI-assisterad utveckling: naming clarity, type coverage, context window fit, doc signal och modularity. Returnerar score, per-dimensionsbreakdown, AI-blockers och en kort sammanfattning.',
    {
      directory: z.string().describe('Absolut sökväg till katalogen som ska analyseras'),
      language: z.enum([
        'typescript', 'javascript', 'python', 'java', 'kotlin',
        'csharp', 'rust', 'go', 'php', 'ruby', 'swift',
      ]).optional().describe('Primärt språk att filtrera filer på. Default: typescript.'),
      maxFiles: z.number().int().min(1).max(500).default(200).describe('Maxantal filer att analysera (default 200)'),
    },
    async (args) => handleAIReadiness(
      args.directory as string,
      (args.language as string | undefined) ?? 'typescript',
      (args.maxFiles as number | undefined) ?? 200,
    ),
  );
}

async function handleAIReadiness(
  directory: string,
  language: string,
  maxFiles: number,
): Promise<{ content: { type: string; text: string }[]; isError?: boolean }> {
  try {
    const exts = LANGUAGE_EXTENSIONS[language];
    if (!exts) {
      return errorResponse(`Unsupported language: ${language}`, directory, language);
    }

    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) {
      return errorResponse(`Not a directory: ${directory}`, directory, language);
    }

    // fast-glob requires forward slashes on Windows.
    const normalized = directory.replace(/\\/g, '/');
    const pattern = `${normalized}/**/*.{${exts.join(',')}}`;
    const filePaths = await fg(pattern, {
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
      absolute: true,
      onlyFiles: true,
    });
    const limited = filePaths.slice(0, maxFiles);

    const files: AIReadinessFile[] = [];
    for (const fp of limited) {
      try {
        const content = await fs.readFile(fp, 'utf-8');
        const health = await analyzeFile(fp);
        const avgCC = health.functions.length === 0
          ? 0
          : health.functions.reduce((acc, fn) => acc + fn.cognitiveComplexity, 0) / health.functions.length;
        const functionsForFit = health.functions.map(fn => ({
          name: fn.name,
          startLine: fn.line,
          endLine: fn.line + fn.length,
          content: extractFunctionContent(content, fn.line, fn.length),
        }));
        const docCoverageRatio = estimateDocCoverageRatio(health.smells.length, health.functions.length);
        files.push({
          path: path.relative(directory, fp),
          content,
          language,
          functions: functionsForFit,
          cognitiveComplexity: avgCC,
          docCoverageRatio,
        });
      } catch {
        // Skip unreadable files.
      }
    }

    const result = analyzeAIReadiness(files);
    const body = {
      directory,
      language,
      filesAnalyzed: files.length,
      score: result.score,
      dimensions: result.dimensions,
      aiBlockers: result.aiBlockers,
      summary: result.summary,
    };
    return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(message, directory, language);
  }
}

function extractFunctionContent(content: string, startLine: number, length: number): string {
  const lines = content.split('\n');
  const fromIdx = Math.max(0, startLine - 1);
  const toIdx = Math.min(lines.length, fromIdx + Math.max(1, length));
  return lines.slice(fromIdx, toIdx).join('\n');
}

/** Lacking a direct doc-coverage ratio on HealthResult, infer from LowDocCoverage smells. */
function estimateDocCoverageRatio(smellCount: number, functionCount: number): number {
  if (functionCount === 0) return 1;
  // Conservative heuristic: assume 0.7 ratio absent specific signal.
  // If the file produced any smells at all, drop slightly. Real per-file
  // doc-coverage ratio could be wired through later.
  return smellCount === 0 ? 0.8 : 0.6;
}

function errorResponse(message: string, directory: string, language: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message, directory, language }) }],
    isError: true,
  };
}
