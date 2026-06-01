/**
 * packages/core/src/analyzers/llm-integration.ts
 *
 * SpecDetect4AI — five LLM-integration smells (Sprint 57).
 * Detection is performed as regex call-site matching on the source code string,
 * covering OpenAI, Anthropic, and LangChain SDKs in TypeScript, JavaScript, and Python.
 *
 * References:
 *   arXiv 2512.18020 — SpecDetect4AI (UMM/NMVP/NSM/NSO/TNES)
 *   86.06 % precision, 60.5 % of LLM-integrated repos affected.
 */

import type { Smell } from '../types';

// ─── Supported languages ──────────────────────────────────────────────────────

export type LlmLanguage = 'typescript' | 'javascript' | 'python';

// ─── SDK call-site pattern ────────────────────────────────────────────────────

/**
 * Detect the line at which an LLM API call starts.
 * Returns an array of { line (1-indexed), matchText } for each detected call site.
 */
interface CallSite {
  line: number;
  /** Raw text of the matched call site (used to look up args context). */
  text: string;
  /** Start index in the code string (for argument window extraction). */
  index: number;
}

/**
 * Patterns that identify an LLM *inference* call site (not constructor):
 *   - OpenAI Python / Node:  client.chat.completions.create(
 *   - OpenAI responses API:  openai.responses.create(  / client.responses.create(
 *   - Anthropic:             anthropic.messages.create(  / client.messages.create(
 *   - LangChain TS/JS:       ChatOpenAI(  / new ChatOpenAI(  (constructor, but wraps inference)
 */
const INFERENCE_CALL_RE =
  /(?:client|openai|anthropic)\.(?:chat\.completions|messages|responses)\.create\s*\(|(?:new\s+)?(?:ChatOpenAI|ChatAnthropic)\s*\(/g;

/**
 * Patterns that identify an SDK constructor (for UMM timeout/max_retries checks):
 *   - new OpenAI(  /  new Anthropic(  /  OpenAI(  / Anthropic(
 * These are constructor calls — we check them for timeout / max_retries,
 * but NOT for max_tokens (which belongs on the inference call).
 */
const CONSTRUCTOR_CALL_RE =
  /(?:new\s+)?(?:OpenAI|Anthropic)\s*\(\s*\{/g;

function findCallSites(code: string): CallSite[] {
  const sites: CallSite[] = [];
  let m: RegExpExecArray | null;
  INFERENCE_CALL_RE.lastIndex = 0;
  while ((m = INFERENCE_CALL_RE.exec(code)) !== null) {
    const line = code.slice(0, m.index).split('\n').length;
    sites.push({ line, text: m[0], index: m.index });
  }
  return sites;
}

/**
 * Find constructor call sites for UMM constructor-level checks (timeout / max_retries).
 */
function findConstructorSites(code: string): CallSite[] {
  const sites: CallSite[] = [];
  let m: RegExpExecArray | null;
  CONSTRUCTOR_CALL_RE.lastIndex = 0;
  while ((m = CONSTRUCTOR_CALL_RE.exec(code)) !== null) {
    const line = code.slice(0, m.index).split('\n').length;
    sites.push({ line, text: m[0], index: m.index });
  }
  return sites;
}

// ─── Smell helpers ────────────────────────────────────────────────────────────

function makeSmell(
  type: Smell['type'],
  line: number,
  description: string,
  suggestion: string,
): Smell {
  return { type, severity: 'medium', line, description, suggestion };
}

// ─── UMM — Unbounded Max Metrics (LlmUnboundedCall) ─────────────────────────

/**
 * Detects inference call sites missing max_tokens / max_output_tokens,
 * AND also checks whether timeout / max_retries appear either on the inference
 * call or in a nearby constructor call.
 *
 * Strategy:
 *  - Inference call must have max_tokens OR max_output_tokens.
 *  - Timeout / max_retries may appear on the SDK constructor (new OpenAI({...})) or the call.
 *  - If ALL three categories are absent → emit smell.
 */
const MAX_TOKENS_RE = /\b(?:max_tokens|max_output_tokens|maxTokens|maxOutputTokens)\b/;
const TIMEOUT_RETRIES_RE = /\b(?:timeout|max_retries|maxRetries)\b/;

/**
 * Extract a balanced-paren window from `startIndex` — walks forward until the
 * opening paren's matching close paren is found (or `maxChars` is exhausted).
 * This avoids false positives from comment text further down in the file.
 */
function extractBalancedWindow(code: string, startIndex: number, maxChars = 800): string {
  let depth = 0;
  let found = false;
  for (let i = startIndex; i < Math.min(code.length, startIndex + maxChars); i++) {
    const ch = code[i];
    if (ch === '(') { depth++; found = true; }
    else if (ch === ')') {
      depth--;
      if (found && depth === 0) return code.slice(startIndex, i + 1);
    }
  }
  return code.slice(startIndex, startIndex + maxChars);
}

function hasTimeoutOrRetries(code: string, infSite: CallSite, constructorSites: CallSite[]): boolean {
  // Check on the inference call itself (balanced window)
  if (TIMEOUT_RETRIES_RE.test(extractBalancedWindow(code, infSite.index))) return true;
  // Check constructor calls that appear before this inference call
  for (const ctor of constructorSites) {
    if (ctor.index < infSite.index && TIMEOUT_RETRIES_RE.test(extractBalancedWindow(code, ctor.index))) {
      return true;
    }
  }
  return false;
}

function detectUnboundedCall(code: string, sites: CallSite[], constructorSites: CallSite[]): Smell[] {
  const smells: Smell[] = [];
  for (const site of sites) {
    const window = extractBalancedWindow(code, site.index);
    const hasMaxTokens = MAX_TOKENS_RE.test(window);
    const hasTimeout = hasTimeoutOrRetries(code, site, constructorSites);
    // Emit smell only if BOTH max_tokens and timeout/retries are absent
    if (!hasMaxTokens && !hasTimeout) {
      smells.push(
        makeSmell(
          'LlmUnboundedCall',
          site.line,
          `LlmUnboundedCall — LLM call at line ${site.line} missing max_tokens / timeout / max_retries (UMM smell).`,
          'Set max_tokens (or max_output_tokens), timeout, and max_retries to prevent unbounded API usage and runaway costs.',
        ),
      );
    }
  }
  return smells;
}

// ─── NMVP — No Model Version Pinning (LlmUnpinnedModel) ─────────────────────

/**
 * Model alias strings that are considered unpinned (no date-stamp suffix).
 * A pinned model includes a date stamp like "-2024-11-20" or "-20241120".
 *
 * We match the model value in:
 *   model="gpt-4o"  /  model: 'claude-3-opus'  / model="claude-sonnet"  etc.
 */
const UNPINNED_MODEL_VALUE_RE =
  /model\s*[:=]\s*["']([^"']+)["']/g;

/** Known unpinned alias patterns (no date in the form YYYY-MM-DD or YYYYMMDD). */
const DATESTAMP_RE = /-\d{4}-?\d{2}-?\d{2}/;

/** Model families that require pinning. */
const PINNABLE_PREFIX_RE =
  /^(?:gpt-|claude-|gemini-|text-davinci|text-embedding|o1|o3|o4|mistral|llama)/i;

function detectUnpinnedModel(code: string, sites: CallSite[]): Smell[] {
  const smells: Smell[] = [];

  for (const site of sites) {
    const window = extractBalancedWindow(code, site.index);
    UNPINNED_MODEL_VALUE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = UNPINNED_MODEL_VALUE_RE.exec(window)) !== null) {
      const modelValue = m[1];
      if (PINNABLE_PREFIX_RE.test(modelValue) && !DATESTAMP_RE.test(modelValue)) {
        const modelLine = site.line + window.slice(0, m.index).split('\n').length - 1;
        smells.push(
          makeSmell(
            'LlmUnpinnedModel',
            modelLine,
            `LlmUnpinnedModel — model alias "${modelValue}" is unpinned (no date-stamp suffix). NMVP smell.`,
            `Pin the model to a dated version, e.g. "${modelValue}-2024-11-20", to ensure reproducible behaviour across API updates.`,
          ),
        );
        break; // one smell per call site is sufficient
      }
    }
  }
  return smells;
}

// ─── NSM — No System Message (LlmNoSystemMessage) ────────────────────────────

/**
 * Detects a `messages` array near an LLM call that contains no `"role": "system"` entry.
 *
 * Strategy:
 *  1. Find `messages` key near the call site.
 *  2. Inspect the subsequent content for a `role: "system"` / `role: 'system'` entry.
 *  3. If absent → emit smell.
 *
 * We only fire when a `messages` keyword is found in the argument window
 * (avoids false positives on completions without a messages array).
 */
const MESSAGES_KEY_RE = /\bmessages\s*[:=]/;
// Matches both quoted and unquoted `role` keys:  { role: 'system' }  {"role": "system"}  role="system"
const SYSTEM_ROLE_RE = /["']?role["']?\s*:\s*["']system["']|role\s*=\s*["']system["']|\bsystem\b\s*:/;

function detectNoSystemMessage(code: string, sites: CallSite[]): Smell[] {
  return sites
    .filter(site => {
      const window = extractBalancedWindow(code, site.index);
      return MESSAGES_KEY_RE.test(window) && !SYSTEM_ROLE_RE.test(window);
    })
    .map(site =>
      makeSmell(
        'LlmNoSystemMessage',
        site.line,
        `LlmNoSystemMessage — messages array at line ${site.line} has no system-role entry (NSM smell).`,
        'Add a {"role": "system", "content": "..."} entry to the messages array to control model behaviour and tone explicitly.',
      ),
    );
}

// ─── NSO — No Structured Output (LlmNoStructuredOutput) ──────────────────────

/**
 * Detects LLM calls without `response_format` or a known structured-output key.
 *
 * Structured output signals:
 *   - `response_format`
 *   - `output_schema` / `outputSchema`
 *   - Pydantic model / TypeScript schema as second arg (harder to detect via regex → not attempted)
 */
const STRUCTURED_OUTPUT_RE =
  /\b(?:response_format|output_schema|outputSchema|responseFormat|json_schema|jsonSchema|structuredOutputs)\b/;

function detectNoStructuredOutput(code: string, sites: CallSite[]): Smell[] {
  return sites
    .filter(site => !STRUCTURED_OUTPUT_RE.test(extractBalancedWindow(code, site.index)))
    .map(site =>
      makeSmell(
        'LlmNoStructuredOutput',
        site.line,
        `LlmNoStructuredOutput — LLM call at line ${site.line} lacks response_format / output schema (NSO smell).`,
        'Specify response_format (e.g. { type: "json_schema", json_schema: {...} }) to ensure the model returns parseable structured data.',
      ),
    );
}

// ─── TNES — Temperature Not Explicitly Set (LlmUnsetTemperature) ─────────────

const TEMPERATURE_RE = /\btemperature\b/;

function detectUnsetTemperature(code: string, sites: CallSite[]): Smell[] {
  return sites
    .filter(site => !TEMPERATURE_RE.test(extractBalancedWindow(code, site.index)))
    .map(site =>
      makeSmell(
        'LlmUnsetTemperature',
        site.line,
        `LlmUnsetTemperature — LLM call at line ${site.line} omits temperature (TNES smell). Provider default controls reproducibility.`,
        'Set temperature explicitly (e.g. temperature: 0 for deterministic output, temperature: 0.7 for creative tasks) to ensure reproducible behaviour.',
      ),
    );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyse source code for SpecDetect4AI LLM-integration smells.
 *
 * Returns an array of `Smell` objects covering:
 *   - LlmUnboundedCall   (UMM)
 *   - LlmUnpinnedModel   (NMVP)
 *   - LlmNoSystemMessage (NSM)
 *   - LlmNoStructuredOutput (NSO)
 *   - LlmUnsetTemperature   (TNES)
 *
 * @param code      Source code string (TypeScript, JavaScript, or Python).
 * @param language  Language of the source — used for future AST-based refinements.
 * @param filePath  Optional file path for context (not used in current regex implementation).
 */
export function analyzeLlmIntegration(
  code: string,
  language: LlmLanguage,
  filePath = '<inline>',
): Smell[] {
  // Suppress unused-parameter lint (language may be used for AST refinement in a later sprint).
  void language;
  void filePath;

  const sites = findCallSites(code);
  if (sites.length === 0) return [];

  const constructorSites = findConstructorSites(code);

  return [
    ...detectUnboundedCall(code, sites, constructorSites),
    ...detectUnpinnedModel(code, sites),
    ...detectNoSystemMessage(code, sites),
    ...detectNoStructuredOutput(code, sites),
    ...detectUnsetTemperature(code, sites),
  ];
}
