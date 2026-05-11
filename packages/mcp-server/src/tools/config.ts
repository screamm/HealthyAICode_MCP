import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.healthy-ai-code');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

function readConfig(): Record<string, unknown> {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeConfig(config: Record<string, unknown>): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function registerConfigTools(server: McpServer): void {
  server.tool(
    'get_config',
    'Läser konfigurationsvärden för Healthy AI Code MCP. Utan nyckel returneras hela konfigurationen.',
    { key: z.string().optional().describe('Konfigurationsnyckel att läsa. Utelämna för att få hela konfigurationen.') },
    async ({ key }) => {
      const config = readConfig();
      const value = key ? config[key] : config;
      return { content: [{ type: 'text', text: JSON.stringify({ key: key ?? 'all', value }, null, 2) }] };
    }
  );

  server.tool(
    'set_config',
    'Sparar eller tar bort ett konfigurationsvärde för Healthy AI Code MCP. Tillgängliga nycklar: healthyThreshold (number 1-10), aiReadyThreshold (number 1-10), defaultBranch (string), projectName (string).',
    {
      key: z.string().describe('Konfigurationsnyckel att sätta eller ta bort'),
      value: z.string().optional().describe('Värde att sätta. Utelämna för att ta bort nyckeln.'),
    },
    async ({ key, value }) => {
      const config = readConfig();
      if (value === undefined) {
        delete config[key];
        writeConfig(config);
        return { content: [{ type: 'text', text: JSON.stringify({ deleted: key, config }, null, 2) }] };
      }
      // Försök parsa som tal eller boolean, annars behåll som sträng
      let parsed: unknown = value;
      if (value === 'true') parsed = true;
      else if (value === 'false') parsed = false;
      else if (!isNaN(Number(value)) && value !== '') parsed = Number(value);
      config[key] = parsed;
      writeConfig(config);
      return { content: [{ type: 'text', text: JSON.stringify({ set: key, value: parsed, config }, null, 2) }] };
    }
  );
}
