#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook CLI entry point.
 *
 * Wire this in .claude/settings.json as a PreToolUse hook — see README.md
 * for the complete settings.json snippet.
 *
 * Environment variables
 * ----------------------
 * GATE_SCORE_FLOOR  (number 0–10, default 6.0 = DEFAULT_FLOOR)
 *   Override the absolute health score floor below which an edit is denied.
 *   Lower values are more permissive (useful for legacy codebases).
 *   Higher values enforce stricter quality (e.g. 8.0 for green-field projects).
 *
 * GATE_MIN_DELTA  (number, default -0.05)
 *   Override the minimum allowed score change per edit.  More negative = more
 *   permissive (allows larger regressions); less negative or 0 = stricter.
 */

import { runClaudeCodeHook } from './claude-code-adapter';
import { DEFAULT_FLOOR, DEFAULT_MIN_DELTA } from './gate-types';
import type { GateConfig } from './gate-types';

function parseFloatEnv(name: string, defaultVal: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultVal;
  const val = Number(raw);
  if (Number.isNaN(val)) {
    process.stderr.write(`[gate] ERROR: ${name} must be a number, got: ${JSON.stringify(raw)}\n`);
    process.exit(1);
  }
  return val;
}

const floor = parseFloatEnv('GATE_SCORE_FLOOR', DEFAULT_FLOOR);
const minDelta = parseFloatEnv('GATE_MIN_DELTA', DEFAULT_MIN_DELTA);

if (floor < 0 || floor > 10) {
  process.stderr.write(`[gate] ERROR: GATE_SCORE_FLOOR must be between 0 and 10, got: ${floor}\n`);
  process.exit(1);
}

const config: GateConfig = { floor, minDelta };

// runClaudeCodeHook reads stdin, evaluates the edit, writes the structured-JSON
// hook output to stdout, and calls process.exit(0) on completion (including
// all error paths — a failure must never block the developer).
runClaudeCodeHook(config).catch((err: unknown) => {
  process.stderr.write(`[gate] FATAL: ${String(err)}\n`);
  // Allow through on fatal error.
  process.exit(0);
});
