import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { setConfig } from '@healthy-ai-code/core';

const CONFIG_DIR = join(homedir(), '.healthy-ai-code'), CONFIG_FILE = join(CONFIG_DIR, 'config.json');
type McpToolRegistrar = (n: string, d: string, s: z.ZodRawShape, h: (a: Record<string, unknown>) => Promise<{ content: { type: string; text: string }[] }>) => void;

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
  const tool = server.tool.bind(server) as unknown as McpToolRegistrar;
  tool('get_config', 'Läser konfigurationsvärden för Healthy AI Code MCP. Utan nyckel returneras hela konfigurationen.',
    { key: z.string().optional().describe('Konfigurationsnyckel att läsa. Utelämna för att få hela konfigurationen.') }, handleGetConfig);
  tool('set_config', 'Sparar eller tar bort ett konfigurationsvärde för Healthy AI Code MCP. Tillgängliga nycklar: healthyThreshold (number 1-10), aiReadyThreshold (number 1-10), defaultBranch (string), projectName (string), useCalibratedThresholds (boolean — Enable empirically calibrated thresholds; requires calibration data in calibration/*.json).',
    { key: z.string().describe('Konfigurationsnyckel att sätta eller ta bort'), value: z.string().optional().describe('Värde att sätta. Utelämna för att ta bort nyckeln.') }, handleSetConfig);
}
