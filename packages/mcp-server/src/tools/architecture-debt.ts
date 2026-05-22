// packages/mcp-server/src/tools/architecture-debt.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeArchitectureDebt, readProjectFiles } from '@healthy-ai-code/core';
import type { ModuleDebtProfile, DependencyCycle } from '@healthy-ai-code/core';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

export function registerArchitectureDebt(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_architecture_debt',
    'Analyserar arkitekturella skulder pa modulniva: FAN-IN/OUT, Propagation Cost (transitiv paverkan), cykliska beroenden via Tarjan SCC och Cost-of-Change score per fil.',
    {
      directory: z.string().describe('Absolut sokvaeg till projektets rotkatalog'),
      language: z.enum(['typescript', 'javascript', 'python', 'all']).default('all').describe('Sprak att analysera (default: all)'),
      depth: z.enum(['file', 'module']).default('file').describe('Granularitet (default: file)'),
      maxFiles: z.number().int().min(1).max(10000).default(1000).describe('Maxantal filer att analysera (default: 1000)'),
    },
    async (args) => handleArchitectureDebt(
      args.directory as string,
      args.language as string,
      args.depth as 'file' | 'module',
      args.maxFiles as number,
    ),
  );
}

async function handleArchitectureDebt(
  directory: string,
  language: string,
  _depth: 'file' | 'module',
  maxFiles: number,
) {
  try {
    // Read project files from disk
    const allFiles = await readProjectFiles(directory);
    const fileEntries = Object.entries(allFiles);

    if (fileEntries.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: 'No supported source files found in directory', directory }),
        }],
        isError: true,
      };
    }

    // Filter by language if requested
    const filtered = language === 'all'
      ? fileEntries
      : fileEntries.filter(([, v]) => v.language === language);

    if (filtered.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: `No files found for language: ${language}`, directory }),
        }],
        isError: true,
      };
    }

    // Limit to maxFiles
    const limited = filtered.slice(0, maxFiles);
    const limitedFiles: Record<string, { content: string; language: string }> = {};
    for (const [k, v] of limited) {
      limitedFiles[k] = { content: v.content, language: v.language };
    }

    const result = await analyzeArchitectureDebt(directory, limitedFiles);

    const body = {
      directory: result.directory,
      totalModules: result.totalModules,
      filesAnalyzed: limited.length,
      summary: result.summary,
      topCostlyModules: result.topCostlyModules.map((m: ModuleDebtProfile) => ({
        file: m.filePath,
        costOfChange: parseFloat(m.costOfChange.toFixed(3)),
        severity: m.costOfChangeSeverity,
        fanIn: m.fanIn,
        fanOut: m.fanOut,
        propagationCost: `${(m.propagationCost * 100).toFixed(1)}%`,
        inCycle: m.inCycle,
        changeFrequency: m.changeFrequency,
      })),
      cycles: result.cycles.map((c: DependencyCycle) => ({
        members: c.members,
        size: c.size,
        severity: c.severity,
      })),
      allModules: result.modules.map((m: ModuleDebtProfile) => ({
        file: m.filePath,
        costOfChange: parseFloat(m.costOfChange.toFixed(3)),
        severity: m.costOfChangeSeverity,
        fanIn: m.fanIn,
        fanOut: m.fanOut,
        propagationCost: `${(m.propagationCost * 100).toFixed(1)}%`,
        inCycle: m.inCycle,
        changeFrequency: m.changeFrequency,
      })),
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message, directory }) }],
      isError: true,
    };
  }
}
