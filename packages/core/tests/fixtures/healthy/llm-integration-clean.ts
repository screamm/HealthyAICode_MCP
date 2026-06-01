/**
 * Healthy fixture — LLM integration (Sprint 57).
 *
 * All five SpecDetect4AI requirements are satisfied:
 *   - Pinned model with date-stamp         (NMVP satisfied)
 *   - System-role message present          (NSM  satisfied)
 *   - response_format specified            (NSO  satisfied)
 *   - temperature explicitly set           (TNES satisfied)
 *   - max_tokens and timeout set           (UMM  satisfied)
 */

import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30_000,
  maxRetries: 3,
});

interface Answer {
  answer: string;
  confidence: number;
}

async function askQuestion(question: string): Promise<Answer> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-2024-11-20',
    temperature: 0,
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant. Respond only with a JSON object matching the schema.',
      },
      { role: 'user', content: question },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'answer',
        schema: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['answer', 'confidence'],
        },
      },
    },
  });

  return JSON.parse(response.choices[0]?.message.content ?? '{}') as Answer;
}

export { askQuestion };
