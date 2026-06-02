import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { setConfig } from '@healthy-ai-code/core';

const CONFIG_DIR = join(homedir(), '.healthy-ai-code'), CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function readConfig(): Record<string, unknown> {
  if (!existsSync(CONFIG_FILE)) return {};
  try { return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as Record<string, unknown>; } catch { return {}; }
}

function writeConfig(cfg: Record<string, unknown>): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
}

function coerceConfigValue(v: string): unknown {
  if (v === 'true') return true;
  if (v === 'false') return false;
  const n = Number(v);
  return !isNaN(n) && v !== '' ? n : v;
}

async function handleGetConfig({ key }: Record<string, unknown>) {
  const cfg = readConfig();
  return { content: [{ type: 'text', text: JSON.stringify({ key: (key as string) ?? 'all', value: key ? cfg[key as string] : cfg }, null, 2) }] };
}

async function handleSetConfig({ key, value }: Record<string, unknown>) {
  const k = key as string, v = value as string | undefined, cfg = readConfig();
  if (v === undefined) { delete cfg[k]; writeConfig(cfg); return { content: [{ type: 'text', text: JSON.stringify({ deleted: k, cfg }, null, 2) }] }; }
  cfg[k] = coerceConfigValue(v); writeConfig(cfg);
  // Wire supported keys into the core runtime config.
  if (k === 'useCalibratedThresholds') {
    setConfig({ useCalibratedThresholds: cfg[k] === true });
  }
  return { content: [{ type: 'text', text: JSON.stringify({ set: k, value: cfg[k], cfg }, null, 2) }] };
}

export function registerConfigTools(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const register = server.registerTool.bind(server) as any;
  register(
    'get_config',
    {
      title: 'Get Config',
      description: 'Reads configuration values for Healthy AI Code MCP. Without a key, the entire configuration is returned.',
      inputSchema: {
        key: z.string().optional().describe('Configuration key to read. Omit to get the entire configuration.'),
      },
      annotations: {
        title: 'Get Config',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    handleGetConfig
  );
  register(
    'set_config',
    {
      title: 'Set Config',
      description:
        'Saves or removes a configuration value for Healthy AI Code MCP. Available keys: ' +
        'healthyThreshold (number 1-10), aiReadyThreshold (number 1-10), defaultBranch (string), ' +
        'projectName (string), useCalibratedThresholds (boolean — enable empirically calibrated ' +
        'thresholds; requires calibration data in calibration/*.json).',
      inputSchema: {
        key: z.string().describe('Configuration key to set or remove'),
        value: z.string().optional().describe('Value to set. Omit to remove the key.'),
      },
      annotations: {
        title: 'Set Config',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    handleSetConfig
  );
}
