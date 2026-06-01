/**
 * Pure adapter from a Claude Code hook stdin payload to a gate decision +
 * serialised hook output. Kept separate from the `cli.ts` entry point so it is
 * unit-testable without spawning a process or touching stdio.
 */
import { detectLanguage } from '@healthy-ai-code/core';
import type { Language } from '@healthy-ai-code/core';
import { evaluateGate, type ProposedEdit } from './evaluate-gate';
import type { GateConfig, GateDecision } from './gate-types';
import {
  toPostToolUseHookOutput,
  toPreToolUseHookOutput,
  type PostToolUseHookOutput,
  type PreToolUseHookOutput,
} from './claude-code-contract';

/**
 * Minimal shape of the Claude Code hook stdin payload that the gate consumes.
 * Only the fields the gate needs are typed; the full payload carries more.
 */
export interface ClaudeCodeHookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    /** For the Write tool: the full new file content. */
    content?: string;
    /** For the Edit tool: the replacement string (after). */
    new_string?: string;
    /** For the Edit tool: the matched string (before-fragment). */
    old_string?: string;
  };
  /** For Edit-style tools, the original on-disk content if the harness supplies it. */
  tool_response?: { originalContent?: string };
}

/** Tools whose `tool_input` represents a file mutation the gate should evaluate. */
const FILE_EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

export interface HookEvaluation {
  decision: GateDecision;
  pre: PreToolUseHookOutput;
  post: PostToolUseHookOutput;
}

/**
 * Extracts the proposed `before`/`after` content from a hook input. Returns
 * `null` when the payload is not a file edit the gate can reason about
 * (non-edit tool, missing path, or an unsupported language) — the caller then
 * allows by default (the gate never blocks what it cannot analyse).
 */
export function extractEdit(
  input: ClaudeCodeHookInput,
  readFile: (path: string) => string | null,
): ProposedEdit | null {
  const toolName = input.tool_name ?? '';
  if (!FILE_EDIT_TOOLS.has(toolName)) return null;

  const filePath = input.tool_input?.file_path;
  if (!filePath) return null;

  const language: Language = detectLanguage(filePath);
  if (language === 'unsupported') return null;

  const ti = input.tool_input ?? {};

  // Write tool: full-file replacement.
  if (toolName === 'Write' && typeof ti.content === 'string') {
    const before = readFile(filePath);
    return { filePath, before, after: ti.content, language };
  }

  // Edit tool: reconstruct after from on-disk content + the requested replacement.
  if (toolName === 'Edit' || toolName === 'MultiEdit') {
    const onDisk = input.tool_response?.originalContent ?? readFile(filePath);
    if (onDisk == null) return null;
    if (typeof ti.old_string === 'string' && typeof ti.new_string === 'string') {
      const after = onDisk.includes(ti.old_string)
        ? onDisk.replace(ti.old_string, ti.new_string)
        : onDisk; // edit fragment not found in current content; analyse on-disk as-is
      return { filePath, before: onDisk, after, language };
    }
  }

  return null;
}

/**
 * Evaluates a parsed hook input and returns the gate decision plus both the
 * `PreToolUse` and `PostToolUse` serialisable hook outputs. When the input is
 * not an analysable file edit, returns `null` (caller emits an allow).
 */
export function evaluateHookInput(
  input: ClaudeCodeHookInput,
  readFile: (path: string) => string | null,
  config?: GateConfig,
): HookEvaluation | null {
  const edit = extractEdit(input, readFile);
  if (!edit) return null;
  const decision = evaluateGate(edit, config);
  return {
    decision,
    pre: toPreToolUseHookOutput(decision),
    post: toPostToolUseHookOutput(decision),
  };
}

/** The PreToolUse "allow" payload emitted for inputs the gate does not evaluate. */
export function allowPassthrough(): PreToolUseHookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: 'Gate did not evaluate this tool call (not an analysable file edit).',
    },
  };
}
