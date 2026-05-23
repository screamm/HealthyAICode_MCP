// packages/mcp-server/src/tools/security-audit.ts
// MCP tool: code_health_security_audit
// Runs static security analysis + mock LLM aggregation (Sprint 28 static phase).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { auditSecurity } from '@healthy-ai-code/core/dist/security/index.js';
import { estimateScanCost } from '@healthy-ai-code/core/dist/security/cost-estimation.js';
import type { ScanDepth } from '@healthy-ai-code/core/dist/security/types.js';

type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>
) => void;

const SUPPORTED_EXTENSIONS: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.java': 'java',
};

/** Recursively collect source files from a directory. */
async function collectFiles(
  dir: string,
  language?: string,
  maxFiles = 200,
): Promise<Array<{ path: string; content: string; language: string }>> {
  const result: Array<{ path: string; content: string; language: string }> = [];

  async function walk(current: string): Promise<void> {
    if (result.length >= maxFiles) return;
    let entries: { name: string; isDirectory: () => boolean }[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (result.length >= maxFiles) break;
      const fullPath = path.join(current, entry.name);

      // Skip node_modules, dist, .git
      if (entry.isDirectory()) {
        if (['node_modules', 'dist', '.git', 'build', 'coverage'].includes(entry.name)) continue;
        await walk(fullPath);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        const detectedLang = SUPPORTED_EXTENSIONS[ext];
        if (!detectedLang) continue;
        if (language && detectedLang !== language) continue;

        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          result.push({ path: fullPath, content, language: detectedLang });
        } catch {
          // Skip unreadable files silently.
        }
      }
    }
  }

  await walk(dir);
  return result;
}

export function registerSecurityAudit(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_security_audit',
    'Runs a static security analysis against a directory. Detects SQL injection, XSS, command injection, path traversal, hardcoded secrets and API keys. Returns findings with SARIF-compatible JSON output and a risk score per file. In dry_run mode returns only cost estimates without running analysis.',
    {
      directory: z.string().describe('Absolute path to the directory to scan'),
      language: z
        .enum(['typescript', 'javascript', 'python', 'java'])
        .optional()
        .describe('Limit scan to a specific language (optional)'),
      depth: z
        .enum(['quick', 'standard', 'deep'])
        .default('standard')
        .describe('Scan depth: quick | standard | deep (affects mock model label in static-only mode)'),
      outputFormat: z
        .enum(['summary', 'sarif'])
        .default('summary')
        .describe('Output format: summary (human-readable) or sarif (SARIF 2.1.0 JSON)'),
      dry_run: z
        .boolean()
        .default(false)
        .describe('If true: collect files and estimate cost only, no analysis performed'),
      maxFiles: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(200)
        .describe('Maximum number of files to scan (default 200)'),
    },
    async (args) => handleSecurityAudit(args),
  );
}

async function handleSecurityAudit(args: Record<string, unknown>) {
  try {
    const directory = args.directory as string;
    const language = args.language as string | undefined;
    const depth = (args.depth as ScanDepth) ?? 'standard';
    const outputFormat = (args.outputFormat as string) ?? 'summary';
    const dryRun = (args.dry_run as boolean) ?? false;
    const maxFiles = (args.maxFiles as number) ?? 200;

    // Validate directory exists.
    try {
      const stat = await fs.stat(directory);
      if (!stat.isDirectory()) {
        return errorResponse(`Not a directory: ${directory}`);
      }
    } catch {
      return errorResponse(`Directory not found: ${directory}`);
    }

    // Collect source files.
    const files = await collectFiles(directory, language, maxFiles);

    if (files.length === 0) {
      return successResponse({
        message: 'No supported source files found in the specified directory.',
        directory,
        scanned_files: 0,
        findings_total: 0,
      });
    }

    // Dry-run: return cost estimate only.
    if (dryRun) {
      const modelMap: Record<ScanDepth, string> = {
        quick: 'claude-haiku-4-5',
        standard: 'claude-sonnet-4-5',
        deep: 'claude-opus-4-5',
      };
      const estimatedFindings = files.length * 2; // conservative estimate
      const estimate = estimateScanCost(estimatedFindings, modelMap[depth]);
      return successResponse({
        dry_run: true,
        directory,
        scanned_files: files.length,
        cost_estimate: estimate,
        note: 'dry_run=true: no analysis performed. Use dry_run=false to run the full scan.',
      });
    }

    // Run security audit.
    const results = await auditSecurity(files, depth);

    const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);
    const filesWithFindings = results.filter(r => r.findings.length > 0);
    const maxRiskScore = results.reduce((max, r) => Math.max(max, r.riskScore), 0);

    if (outputFormat === 'sarif') {
      // Return merged SARIF report across all files.
      const allFindings = results.flatMap(r => r.findings);
      const { formatAsSarif } = await import('@healthy-ai-code/core/dist/security/sarif-formatter.js');
      const sarif = formatAsSarif(allFindings);
      return successResponse({ sarif, scanned_files: files.length, findings_total: totalFindings });
    }

    // Summary format.
    const body = {
      directory,
      depth,
      scanned_files: files.length,
      findings_total: totalFindings,
      files_with_findings: filesWithFindings.length,
      max_risk_score: maxRiskScore,
      files: results
        .filter(r => r.findings.length > 0)
        .sort((a, b) => b.riskScore - a.riskScore)
        .map(r => ({
          file: r.filePath,
          risk_score: r.riskScore,
          findings: r.findings.map(f => ({
            type: f.type,
            line: f.line,
            static_score: f.static_score,
            combined_score: f.combined_score,
            requires_manual_review: f.requires_manual_review,
            snippet: f.codeSnippet.slice(0, 200),
          })),
        })),
      summary:
        totalFindings === 0
          ? `No security issues found in ${files.length} files.`
          : `Found ${totalFindings} security issue(s) across ${filesWithFindings.length} file(s). Highest risk score: ${maxRiskScore}.`,
    };

    return successResponse(body);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(message);
  }
}

function successResponse(body: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
}

function errorResponse(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}
