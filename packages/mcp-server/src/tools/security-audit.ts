// packages/mcp-server/src/tools/security-audit.ts
// MCP tool: code_health_security_audit
// Runs static security analysis + mock LLM aggregation (Sprint 28 static phase).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { auditSecurity, estimateScanCost, formatAsSarif } from '@healthy-ai-code/core';
import type { ScanDepth, SecurityAuditFileResult } from '@healthy-ai-code/core';
import { resolveSafePath } from './path-safety';

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

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build', 'coverage']);

type FileEntry = { path: string; content: string; language: string };

const MODEL_MAP: Record<ScanDepth, string> = {
  quick: 'claude-haiku-4-5',
  standard: 'claude-sonnet-4-5',
  deep: 'claude-opus-4-5',
};

/** Attempt to read a single file entry, returning null if unreadable. */
async function tryReadFile(fullPath: string, detectedLang: string): Promise<FileEntry | null> {
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    return { path: fullPath, content, language: detectedLang };
  } catch {
    return null;
  }
}

/** Detect language for a directory entry, returning null if unsupported. */
function detectEntryLanguage(name: string, filterLanguage?: string): string | null {
  const ext = path.extname(name).toLowerCase();
  const detectedLang = SUPPORTED_EXTENSIONS[ext];
  if (!detectedLang) return null;
  if (filterLanguage && detectedLang !== filterLanguage) return null;
  return detectedLang;
}

interface WalkContext {
  language: string | undefined;
  maxFiles: number;
  result: FileEntry[];
}

/** Process a single directory entry during a walk. */
async function processWalkEntry(
  entry: { name: string; isDirectory: () => boolean },
  current: string,
  ctx: WalkContext,
): Promise<void> {
  const fullPath = path.join(current, entry.name);
  if (entry.isDirectory()) {
    if (!SKIP_DIRS.has(entry.name)) await walkDir(fullPath, ctx);
    return;
  }
  const detectedLang = detectEntryLanguage(entry.name, ctx.language);
  if (!detectedLang) return;
  const fileEntry = await tryReadFile(fullPath, detectedLang);
  if (fileEntry) ctx.result.push(fileEntry);
}

/** Walk one directory level and accumulate entries into result. */
async function walkDir(
  current: string,
  ctx: WalkContext,
): Promise<void> {
  if (ctx.result.length >= ctx.maxFiles) return;
  let entries: { name: string; isDirectory: () => boolean }[];
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (ctx.result.length >= ctx.maxFiles) break;
    await processWalkEntry(entry, current, ctx);
  }
}

/** Recursively collect source files from a directory. */
async function collectFiles(
  dir: string,
  language?: string,
  maxFiles = 200,
): Promise<FileEntry[]> {
  const ctx: WalkContext = { language, maxFiles, result: [] };
  await walkDir(dir, ctx);
  return ctx.result;
}

/** Build a dry-run response with cost estimate. */
function buildDryRunResponse(
  directory: string,
  fileCount: number,
  depth: ScanDepth,
): object {
  const estimatedFindings = fileCount * 2; // conservative estimate
  const estimate = estimateScanCost(estimatedFindings, MODEL_MAP[depth]);
  return {
    dry_run: true,
    directory,
    scanned_files: fileCount,
    cost_estimate: estimate,
    note: 'dry_run=true: no analysis performed. Use dry_run=false to run the full scan.',
  };
}

/** Build the summary format response body. */
function buildSummaryBody(
  directory: string,
  depth: ScanDepth,
  files: FileEntry[],
  results: SecurityAuditFileResult[],
): object {
  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);
  const filesWithFindings = results.filter(r => r.findings.length > 0);
  const maxRiskScore = results.reduce((max, r) => Math.max(max, r.riskScore), 0);

  return {
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
}

const maxFilesInt = z.number().int();
const maxFilesBase = maxFilesInt.min(1).max(500);
const maxFilesSchema = maxFilesBase.default(200).describe('Maximum number of files to scan (default 200)');

/** Schema definitions for the security audit tool parameters. */
const securityAuditSchema = {
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
  maxFiles: maxFilesSchema,
};

export function registerSecurityAudit(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'code_health_security_audit',
    {
      title: 'Security Audit',
      description:
        'Runs a static security analysis against a directory. Detects SQL injection, XSS, command ' +
        'injection, path traversal, hardcoded secrets and API keys. Returns findings with ' +
        'SARIF-compatible JSON output and a risk score per file. In dry_run mode returns only cost ' +
        'estimates without running analysis.',
      inputSchema: securityAuditSchema,
      annotations: {
        title: 'Security Audit',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (args: Record<string, unknown>) => handleSecurityAudit(args),
  );
}

interface AuditArgs {
  directory: string;
  language: string | undefined;
  depth: ScanDepth;
  outputFormat: string;
  dryRun: boolean;
  maxFiles: number;
}

function parseAuditArgs(args: Record<string, unknown>): AuditArgs {
  return {
    directory: args.directory as string,
    language: args.language as string | undefined,
    depth: (args.depth as ScanDepth) ?? 'standard',
    outputFormat: (args.outputFormat as string) ?? 'summary',
    dryRun: (args.dry_run as boolean) ?? false,
    maxFiles: (args.maxFiles as number) ?? 200,
  };
}

async function runAuditAndFormat(
  auditArgs: AuditArgs,
  files: FileEntry[],
): Promise<ReturnType<typeof successResponse>> {
  if (auditArgs.dryRun) {
    return successResponse(buildDryRunResponse(auditArgs.directory, files.length, auditArgs.depth));
  }

  const results = await auditSecurity(files, auditArgs.depth);

  if (auditArgs.outputFormat === 'sarif') {
    const allFindings = results.flatMap(r => r.findings);
    const sarif = formatAsSarif(allFindings);
    const findingsTotal = results.reduce((s, r) => s + r.findings.length, 0);
    return successResponse({ sarif, scanned_files: files.length, findings_total: findingsTotal });
  }

  return successResponse(buildSummaryBody(auditArgs.directory, auditArgs.depth, files, results));
}

async function handleSecurityAudit(args: Record<string, unknown>) {
  try {
    const auditArgs = parseAuditArgs(args);
    auditArgs.directory = resolveSafePath(auditArgs.directory);

    const validationError = await validateDirectory(auditArgs.directory);
    if (validationError) return errorResponse(validationError);

    const files = await collectFiles(auditArgs.directory, auditArgs.language, auditArgs.maxFiles);

    if (files.length === 0) {
      return successResponse({
        message: 'No supported source files found in the specified directory.',
        directory: auditArgs.directory,
        scanned_files: 0,
        findings_total: 0,
      });
    }

    return await runAuditAndFormat(auditArgs, files);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(message);
  }
}

async function validateDirectory(directory: string): Promise<string | null> {
  try {
    const stat = await fs.stat(directory);
    if (!stat.isDirectory()) return `Not a directory: ${directory}`;
    return null;
  } catch {
    return `Directory not found: ${directory}`;
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
