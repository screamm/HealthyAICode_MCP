/**
 * Claude Code PreToolUse hook adapter (stdin → hook-runner → stdout).
 *
 * This is the CLAUDE CODE–SPECIFIC wiring layer.  It sits on top of the
 * gate-core modules (evaluate-gate, hook-runner, claude-code-contract) and
 * handles the stdio plumbing that Claude Code's PreToolUse hook contract
 * requires.  It does NOT re-implement gate logic.
 *
 * Protocol (Claude Code PreToolUse hooks)
 * ----------------------------------------
 * Claude Code sends the tool-use event as JSON on stdin.  The hook must:
 *   - write a JSON object to stdout → structured response (permissionDecision)
 *   - exit 0 regardless of verdict (the "deny" is signalled in the JSON, not
 *     via exit code — exit codes are ignored per claude-code#21988)
 *
 * Graceful degradation
 * --------------------
 * If stdin is empty, not JSON, or the analysis throws, the hook emits an
 * "allow" passthrough and warns on stderr. A transient analysis failure must
 * NEVER block the developer.
 *
 * Hook stdin shape (Claude Code)
 * --------------------------------
 * The hook receives a JSON object with `tool_name` and `tool_input`.
 * Claude Code's file-edit tools are:
 *   Write      — `file_path` + `content` (full new content)
 *   Edit       — `file_path` + `old_string` + `new_string`
 *   MultiEdit  — same as Edit
 *
 * These map directly to the `ClaudeCodeHookInput` shape in hook-runner.ts.
 */

import * as fs from 'fs';
import {
  evaluateHookInput,
  allowPassthrough,
  type ClaudeCodeHookInput,
} from './hook-runner';
import { toPreToolUseHookOutput } from './claude-code-contract';
import type { GateConfig } from './gate-types';

// ---------------------------------------------------------------------------
// I/O helpers (shared across run functions below)
// ---------------------------------------------------------------------------

function readFileSafe(absPath: string): string | null {
  try {
    return fs.readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
}

function readStdin(): Promise<string> {
  return new Promise(resolve => {
    if ((process.stdin as NodeJS.ReadStream).isTTY) { resolve(''); return; }
    const chunks: Buffer[] = [];
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', () => resolve(''));
  });
}

// ---------------------------------------------------------------------------
// Main entry point called by cli.ts
// ---------------------------------------------------------------------------

/**
 * Reads the PreToolUse JSON event from stdin, delegates to the gate-core
 * hook-runner, and writes the structured-JSON hook output to stdout.
 *
 * The `config` object is built from environment variables by cli.ts and
 * forwarded here so that GATE_SCORE_FLOOR and similar env overrides work
 * without this module depending on process.env.
 */
export async function runClaudeCodeHook(config?: GateConfig): Promise<void> {
  const raw = await readStdin();

  if (!raw.trim()) {
    // Empty stdin → no tool event to evaluate; emit allow and exit.
    process.stdout.write(JSON.stringify(allowPassthrough()) + '\n');
    process.exit(0);
  }

  let hookInput: ClaudeCodeHookInput;
  try {
    hookInput = JSON.parse(raw) as ClaudeCodeHookInput;
  } catch {
    process.stderr.write('[gate] WARNING: could not parse PreToolUse JSON from stdin — allowing through\n');
    process.stdout.write(JSON.stringify(allowPassthrough()) + '\n');
    process.exit(0);
  }

  try {
    const evaluation = evaluateHookInput(hookInput, readFileSafe, config);
    if (evaluation === null) {
      // Not an analysable file-edit tool — allow silently.
      process.stdout.write(JSON.stringify(allowPassthrough()) + '\n');
    } else {
      process.stdout.write(JSON.stringify(evaluation.pre) + '\n');
    }
    process.exit(0);
  } catch (err) {
    // Analysis threw — always allow through; a transient failure must not block work.
    process.stderr.write(
      `[gate] WARNING: health analysis threw, allowing edit through. Error: ${String(err)}\n`,
    );
    process.stdout.write(JSON.stringify(allowPassthrough()) + '\n');
    process.exit(0);
  }
}

/** @deprecated Use runClaudeCodeHook. Left for backward-compat with older cli.ts wiring. */
export async function runHook(config?: GateConfig): Promise<void> {
  return runClaudeCodeHook(config);
}
