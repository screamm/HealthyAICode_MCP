/**
 * Unhealthy fixture — LLM integration smells (Sprint 57).
 *
 * This file intentionally omits:
 *   - version pinning on the model (NMVP → LlmUnpinnedModel)
 *   - a system-role message (NSM  → LlmNoSystemMessage)
 *   - response_format / output schema (NSO  → LlmNoStructuredOutput)
 *   - temperature setting (TNES → LlmUnsetTemperature)
 *   - max_tokens / timeout / max_retries (UMM  → LlmUnboundedCall)
 */

import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function askQuestion(question: string): Promise<string> {
  // All five SpecDetect4AI smells present: unpinned model alias, no system message,
  // no response_format, no temperature, no max_tokens/timeout/max_retries.
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'user', content: question },
    ],
  });
  return response.choices[0]?.message.content ?? '';
}

export { askQuestion };
