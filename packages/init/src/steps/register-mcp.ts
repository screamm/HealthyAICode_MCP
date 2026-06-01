/**
 * Step: register the MCP server with the detected harness.
 *
 * Supported harnesses:
 *   - Claude Code  → ~/.claude/claude_desktop_config.json  (also .claude/settings.json)
 *   - Cursor       → ~/.cursor/mcp.json
 *   - VS Code MCP  → ~/.vscode/mcp.json (future-proofing)
 *   - Fallback     → prints manual instruction
 *
 * The installer adds (or merges) the "healthy-ai-code" server entry under
 * `mcpServers`.  It never removes or modifies existing entries.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export type HarnessSlug = 'claude-code' | 'cursor' | 'vscode' | 'unknown';

export interface RegisterMcpResult {
  harnessSlug: HarnessSlug;
  configPath: string | null;
  alreadyPresent: boolean;
  /** Dry-run: what would have been written, without touching the filesystem. */
  dryRunDiff?: string;
}

interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>;
  [key: string]: unknown;
}

const MCP_SERVER_ENTRY: McpServerConfig = {
  command: 'npx',
  args: ['-y', '@healthy-ai-code/mcp-server@latest'],
};

const HARNESS_CONFIG_PATHS: Array<{ slug: HarnessSlug; configPath: string }> =
  [
    {
      slug: 'claude-code',
      configPath: path.join(os.homedir(), '.claude', 'claude_desktop_config.json'),
    },
    {
      slug: 'cursor',
      configPath: path.join(os.homedir(), '.cursor', 'mcp.json'),
    },
    {
      slug: 'vscode',
      configPath: path.join(os.homedir(), '.vscode', 'mcp.json'),
    },
  ];

function detectHarness(): { slug: HarnessSlug; configPath: string } | null {
  for (const candidate of HARNESS_CONFIG_PATHS) {
    const dir = path.dirname(candidate.configPath);
    if (fs.existsSync(dir)) {
      return candidate;
    }
  }
  return null;
}

function readConfig(configPath: string): McpConfigFile {
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as McpConfigFile;
  } catch {
    return {};
  }
}

function writeConfig(configPath: string, config: McpConfigFile): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function registerMcp(opts: { dryRun: boolean }): RegisterMcpResult {
  const detected = detectHarness();

  if (!detected) {
    // No known harness found — print manual instruction and carry on.
    return {
      harnessSlug: 'unknown',
      configPath: null,
      alreadyPresent: false,
      dryRunDiff: buildManualInstruction(),
    };
  }

  const { slug, configPath } = detected;
  const existing = readConfig(configPath);

  const servers = existing.mcpServers ?? {};
  const alreadyPresent =
    'healthy-ai-code' in servers &&
    servers['healthy-ai-code']?.command === MCP_SERVER_ENTRY.command;

  if (alreadyPresent) {
    return { harnessSlug: slug, configPath, alreadyPresent: true };
  }

  const updated: McpConfigFile = {
    ...existing,
    mcpServers: {
      ...servers,
      'healthy-ai-code': MCP_SERVER_ENTRY,
    },
  };

  const diff = buildDiff(existing, updated);

  if (!opts.dryRun) {
    writeConfig(configPath, updated);
  }

  return { harnessSlug: slug, configPath, alreadyPresent: false, dryRunDiff: diff };
}

function buildDiff(before: McpConfigFile, after: McpConfigFile): string {
  const beforeStr = JSON.stringify(before, null, 2);
  const afterStr = JSON.stringify(after, null, 2);
  return `--- before\n+++ after\n${lineDiff(beforeStr, afterStr)}`;
}

function lineDiff(a: string, b: string): string {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const result: string[] = [];
  const maxLen = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < maxLen; i++) {
    const aLine = aLines[i];
    const bLine = bLines[i];
    if (aLine === undefined) {
      result.push(`+${bLine}`);
    } else if (bLine === undefined) {
      result.push(`-${aLine}`);
    } else if (aLine !== bLine) {
      result.push(`-${aLine}`);
      result.push(`+${bLine}`);
    } else {
      result.push(` ${aLine}`);
    }
  }
  return result.join('\n');
}

function buildManualInstruction(): string {
  return [
    'No supported harness config directory detected (looked for ~/.claude, ~/.cursor, ~/.vscode).',
    '',
    'Manual registration — add to your MCP host config:',
    '',
    JSON.stringify({ 'healthy-ai-code': MCP_SERVER_ENTRY }, null, 2),
    '',
    'Claude Code: ~/.claude/claude_desktop_config.json → mcpServers key',
    'Cursor:      ~/.cursor/mcp.json → mcpServers key',
  ].join('\n');
}
