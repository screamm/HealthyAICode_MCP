/**
 * Unhealthy fixture — AiAttributedSATD
 *
 * Contains comments that combine an AI attribution term with a SATD marker.
 * Expected: detectAiAttributedSATD / detectAiAttributedSATDFromText fires >= 2 smells.
 */

// TODO: Claude generated this but I'm not sure it handles edge cases
export function parseUserInput(raw: string): string {
  return raw.trim();
}

// FIXME: GPT suggested this approach, unclear why it uses a regex here
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * HACK: ChatGPT wrote this helper — no clue if it is correct for Unicode strings
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// TODO: Copilot autocompleted this entire function — needs review
export function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}
