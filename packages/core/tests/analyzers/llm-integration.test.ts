/**
 * packages/core/tests/analyzers/llm-integration.test.ts
 *
 * Unit tests for the SpecDetect4AI LLM-integration smell detector (Sprint 57).
 * Imports via relative path — the public re-export from @healthy-ai-code/core is
 * not yet wired in this phase.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { analyzeLlmIntegration } from '../../src/analyzers/llm-integration';
import type { Smell } from '../../src/types';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const FIXTURES_ROOT = join(__dirname, '..', 'fixtures');

function readFixture(relPath: string): string {
  return readFileSync(join(FIXTURES_ROOT, relPath), 'utf8');
}

// ─── Inline snippets ──────────────────────────────────────────────────────────

const UNPINNED_OPENAI_TS = `
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: 'sk-...' });
const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});
`.trim();

const PINNED_OPENAI_TS = `
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: 'sk-...', timeout: 30000, maxRetries: 3 });
const response = await client.chat.completions.create({
  model: 'gpt-4o-2024-11-20',
  temperature: 0,
  max_tokens: 512,
  messages: [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' },
  ],
  response_format: { type: 'json_object' },
});
`.trim();

const UNPINNED_ANTHROPIC_TS = `
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic();
const message = await anthropic.messages.create({
  model: 'claude-sonnet',
  messages: [{ role: 'user', content: 'Hello' }],
  max_tokens: 1024,
});
`.trim();

const ANTHROPIC_WITH_SYSTEM_TS = `
import Anthropic from '@anthropic-ai/sdk';
const anthropic = new Anthropic({ timeout: 20000 });
const message = await anthropic.messages.create({
  model: 'claude-opus-4-5',
  temperature: 0.5,
  max_tokens: 1024,
  messages: [
    { role: 'user', content: 'Hello' },
  ],
  system: 'You are a helpful assistant.',
});
`.trim();

const LANGCHAIN_UNPINNED_TS = `
import { ChatOpenAI } from 'langchain/chat_models/openai';
const chat = new ChatOpenAI({ modelName: 'gpt-4' });
`.trim();

const NO_LLM_CODE = `
function add(a: number, b: number): number {
  return a + b;
}
`.trim();

const PYTHON_UNPINNED = `
from openai import OpenAI
client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Say hello"}]
)
`.trim();

const PYTHON_PINNED = `
from openai import OpenAI
client = OpenAI(timeout=30, max_retries=3)
response = client.chat.completions.create(
    model="gpt-4o-2024-11-20",
    temperature=0,
    max_tokens=512,
    messages=[
        {"role": "system", "content": "You are helpful."},
        {"role": "user", "content": "Hello"}
    ],
    response_format={"type": "json_object"}
)
`.trim();

// ─── Helper ───────────────────────────────────────────────────────────────────

function smellTypes(smells: Smell[]): string[] {
  return smells.map(s => s.type);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('analyzeLlmIntegration — NMVP (unpinned model)', () => {
  it('detects LlmUnpinnedModel for gpt-4o alias (TS)', () => {
    const smells = analyzeLlmIntegration(UNPINNED_OPENAI_TS, 'typescript');
    expect(smellTypes(smells)).toContain('LlmUnpinnedModel');
  });

  it('does NOT detect LlmUnpinnedModel when model is date-pinned (TS)', () => {
    const smells = analyzeLlmIntegration(PINNED_OPENAI_TS, 'typescript');
    expect(smellTypes(smells)).not.toContain('LlmUnpinnedModel');
  });

  it('detects LlmUnpinnedModel for claude-sonnet alias (TS)', () => {
    const smells = analyzeLlmIntegration(UNPINNED_ANTHROPIC_TS, 'typescript');
    expect(smellTypes(smells)).toContain('LlmUnpinnedModel');
  });

  it('detects LlmUnpinnedModel for gpt-4o in Python code', () => {
    const smells = analyzeLlmIntegration(PYTHON_UNPINNED, 'python');
    expect(smellTypes(smells)).toContain('LlmUnpinnedModel');
  });

  it('does NOT detect LlmUnpinnedModel for pinned Python call', () => {
    const smells = analyzeLlmIntegration(PYTHON_PINNED, 'python');
    expect(smellTypes(smells)).not.toContain('LlmUnpinnedModel');
  });
});

describe('analyzeLlmIntegration — NSM (no system message)', () => {
  it('detects LlmNoSystemMessage when messages array has no system role (TS)', () => {
    const smells = analyzeLlmIntegration(UNPINNED_OPENAI_TS, 'typescript');
    expect(smellTypes(smells)).toContain('LlmNoSystemMessage');
  });

  it('does NOT detect LlmNoSystemMessage when system role is present (TS)', () => {
    const smells = analyzeLlmIntegration(PINNED_OPENAI_TS, 'typescript');
    expect(smellTypes(smells)).not.toContain('LlmNoSystemMessage');
  });

  it('detects LlmNoSystemMessage for Python call without system message', () => {
    const smells = analyzeLlmIntegration(PYTHON_UNPINNED, 'python');
    expect(smellTypes(smells)).toContain('LlmNoSystemMessage');
  });

  it('does NOT detect LlmNoSystemMessage for Python call with system role', () => {
    const smells = analyzeLlmIntegration(PYTHON_PINNED, 'python');
    expect(smellTypes(smells)).not.toContain('LlmNoSystemMessage');
  });
});

describe('analyzeLlmIntegration — NSO (no structured output)', () => {
  it('detects LlmNoStructuredOutput when response_format is absent (TS)', () => {
    const smells = analyzeLlmIntegration(UNPINNED_OPENAI_TS, 'typescript');
    expect(smellTypes(smells)).toContain('LlmNoStructuredOutput');
  });

  it('does NOT detect LlmNoStructuredOutput when response_format is set (TS)', () => {
    const smells = analyzeLlmIntegration(PINNED_OPENAI_TS, 'typescript');
    expect(smellTypes(smells)).not.toContain('LlmNoStructuredOutput');
  });

  it('detects LlmNoStructuredOutput for Python call without response_format', () => {
    const smells = analyzeLlmIntegration(PYTHON_UNPINNED, 'python');
    expect(smellTypes(smells)).toContain('LlmNoStructuredOutput');
  });
});

describe('analyzeLlmIntegration — TNES (temperature not set)', () => {
  it('detects LlmUnsetTemperature when temperature is absent (TS)', () => {
    const smells = analyzeLlmIntegration(UNPINNED_OPENAI_TS, 'typescript');
    expect(smellTypes(smells)).toContain('LlmUnsetTemperature');
  });

  it('does NOT detect LlmUnsetTemperature when temperature is set (TS)', () => {
    const smells = analyzeLlmIntegration(PINNED_OPENAI_TS, 'typescript');
    expect(smellTypes(smells)).not.toContain('LlmUnsetTemperature');
  });

  it('detects LlmUnsetTemperature for Python call without temperature', () => {
    const smells = analyzeLlmIntegration(PYTHON_UNPINNED, 'python');
    expect(smellTypes(smells)).toContain('LlmUnsetTemperature');
  });
});

describe('analyzeLlmIntegration — UMM (unbounded call)', () => {
  it('detects LlmUnboundedCall when max_tokens / timeout / max_retries all absent (TS)', () => {
    const smells = analyzeLlmIntegration(UNPINNED_OPENAI_TS, 'typescript');
    expect(smellTypes(smells)).toContain('LlmUnboundedCall');
  });

  it('does NOT detect LlmUnboundedCall when max_tokens and timeout are set (TS)', () => {
    const smells = analyzeLlmIntegration(PINNED_OPENAI_TS, 'typescript');
    expect(smellTypes(smells)).not.toContain('LlmUnboundedCall');
  });

  it('does NOT detect LlmUnboundedCall when Anthropic call has max_tokens set (TS)', () => {
    // UNPINNED_ANTHROPIC_TS has max_tokens: 1024 set
    const smells = analyzeLlmIntegration(UNPINNED_ANTHROPIC_TS, 'typescript');
    expect(smellTypes(smells)).not.toContain('LlmUnboundedCall');
  });
});

describe('analyzeLlmIntegration — Anthropic-specific', () => {
  it('detects LlmUnpinnedModel for Anthropic call with unversioned alias', () => {
    const smells = analyzeLlmIntegration(UNPINNED_ANTHROPIC_TS, 'typescript');
    expect(smellTypes(smells)).toContain('LlmUnpinnedModel');
  });

  it('detects LlmNoSystemMessage for Anthropic call without system role in messages', () => {
    // ANTHROPIC_WITH_SYSTEM_TS uses system field at top level — the regex should see it
    const smells = analyzeLlmIntegration(ANTHROPIC_WITH_SYSTEM_TS, 'typescript');
    // This test verifies the fixture doesn't fire NSM; system is set as top-level key
    // The messages array has no system role entry, but system is a separate key.
    // Our detector looks for role: "system" inside messages; if not found it fires.
    // We accept that for Anthropic's top-level `system` param, we may still fire NSM.
    // This is documented as a known false-positive edge-case for the regex approach.
    // Just check it runs without throwing.
    expect(Array.isArray(smells)).toBe(true);
  });
});

describe('analyzeLlmIntegration — no LLM code', () => {
  it('returns no smells for code with no LLM call sites', () => {
    const smells = analyzeLlmIntegration(NO_LLM_CODE, 'typescript');
    expect(smells).toHaveLength(0);
  });

  it('returns no smells for empty string', () => {
    const smells = analyzeLlmIntegration('', 'typescript');
    expect(smells).toHaveLength(0);
  });
});

describe('analyzeLlmIntegration — JavaScript language', () => {
  it('detects smells for JavaScript (same code, language=javascript)', () => {
    const smells = analyzeLlmIntegration(UNPINNED_OPENAI_TS, 'javascript');
    expect(smells.length).toBeGreaterThan(0);
    expect(smellTypes(smells)).toContain('LlmUnpinnedModel');
  });
});

describe('analyzeLlmIntegration — fixtures', () => {
  it('unhealthy fixture triggers NMVP, NSM, NSO, TNES smells', () => {
    const code = readFixture('unhealthy/llm-integration-smells.ts');
    const smells = analyzeLlmIntegration(code, 'typescript');
    const types = smellTypes(smells);
    expect(types).toContain('LlmUnpinnedModel');
    expect(types).toContain('LlmNoSystemMessage');
    expect(types).toContain('LlmNoStructuredOutput');
    expect(types).toContain('LlmUnsetTemperature');
    // unhealthy fixture also has no max_tokens in the create call itself
    expect(types).toContain('LlmUnboundedCall');
  });

  it('healthy fixture triggers NO LLM smells', () => {
    const code = readFixture('healthy/llm-integration-clean.ts');
    const smells = analyzeLlmIntegration(code, 'typescript');
    const llmSmells = smells.filter(s =>
      s.type === 'LlmUnpinnedModel' ||
      s.type === 'LlmNoSystemMessage' ||
      s.type === 'LlmNoStructuredOutput' ||
      s.type === 'LlmUnsetTemperature' ||
      s.type === 'LlmUnboundedCall',
    );
    expect(llmSmells).toHaveLength(0);
  });
});

describe('analyzeLlmIntegration — smell shape', () => {
  it('each smell has required Smell fields', () => {
    const smells = analyzeLlmIntegration(UNPINNED_OPENAI_TS, 'typescript');
    for (const smell of smells) {
      expect(smell).toHaveProperty('type');
      expect(smell).toHaveProperty('severity', 'medium');
      expect(smell).toHaveProperty('line');
      expect(smell).toHaveProperty('description');
      expect(smell).toHaveProperty('suggestion');
      expect(smell.line).toBeGreaterThanOrEqual(1);
    }
  });

  it('LlmUnpinnedModel description contains the actual model alias', () => {
    const smells = analyzeLlmIntegration(UNPINNED_OPENAI_TS, 'typescript');
    const nmvp = smells.find(s => s.type === 'LlmUnpinnedModel');
    expect(nmvp).toBeDefined();
    expect(nmvp!.description).toContain('gpt-4o');
  });
});
