/**
 * Claude Code hook output contract for the delta gate.
 *
 * Claude Code hooks communicate a blocking decision through **structured JSON on
 * stdout**, not via exit codes — exit codes from `PreToolUse` hooks are ignored
 * for the purpose of denying a tool call (ref claude-code#21988). The
 * authoritative field is `hookSpecificOutput.permissionDecision`:
 *
 *   - `"deny"`  — the tool call (the edit) is blocked; `permissionDecisionReason`
 *                 is surfaced back to the model as a self-correction signal.
 *   - `"allow"` — the tool call proceeds.
 *   - `"ask"`   — defer to the user (used here for the WARN verdict).
 *
 * When a harness/version cannot enforce a `PreToolUse` block, the gate degrades
 * gracefully to a `PostToolUse` coaching payload (`decision: "block"` +
 * `reason`) which feeds the model corrective context *after* the edit landed,
 * so an unenforceable block still produces a self-correction loop rather than
 * silently passing.
 */
import type { GateDecision } from './gate-types';

/** Claude Code `PreToolUse` hook output (structured-JSON deny path). */
export interface PreToolUseHookOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    /** "deny" blocks the edit; "allow" lets it through; "ask" defers to the user. */
    permissionDecision: 'allow' | 'deny' | 'ask';
    /** Self-correction reason shown to the model when denied (or asked). */
    permissionDecisionReason: string;
  };
  /** Optional top-level message surfaced in the Claude Code UI. */
  systemMessage?: string;
}

/** Claude Code `PostToolUse` coaching output (graceful fallback when a block can't be enforced). */
export interface PostToolUseHookOutput {
  /** "block" feeds `reason` back to the model as corrective context after the edit. */
  decision: 'block' | undefined;
  /** Coaching/self-correction text. */
  reason: string;
  hookSpecificOutput: {
    hookEventName: 'PostToolUse';
    additionalContext: string;
  };
}

/** Maps a {@link GateDecision} verdict to a Claude Code `permissionDecision`. */
function toPermissionDecision(decision: GateDecision): 'allow' | 'deny' | 'ask' {
  switch (decision.verdict) {
    case 'deny':
      return 'deny';
    case 'warn':
      return 'ask';
    case 'allow':
    default:
      return 'allow';
  }
}

/**
 * Builds the `PreToolUse` structured-JSON payload for a gate decision. This is
 * the primary, enforced deny path: emit `JSON.stringify(...)` of this object on
 * the hook's stdout.
 */
export function toPreToolUseHookOutput(decision: GateDecision): PreToolUseHookOutput {
  const permissionDecision = toPermissionDecision(decision);
  const output: PreToolUseHookOutput = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision,
      permissionDecisionReason: decision.reason,
    },
  };
  if (permissionDecision !== 'allow') {
    output.systemMessage = `Code-health gate ${decision.verdict.toUpperCase()} (${decision.reasonCode}): ${decision.filePath}`;
  }
  return output;
}

/**
 * Builds the `PostToolUse` coaching payload — the graceful fallback for when a
 * `PreToolUse` block could not be enforced on the running harness version. An
 * allowed decision yields no block (`decision: undefined`); a deny/warn yields a
 * `block` that returns the self-correction reason to the model.
 */
export function toPostToolUseHookOutput(decision: GateDecision): PostToolUseHookOutput {
  const shouldBlock = decision.verdict === 'deny';
  return {
    decision: shouldBlock ? 'block' : undefined,
    reason: shouldBlock
      ? `${decision.reason} (Note: this edit already landed because the PreToolUse block could not be enforced on this harness version — please correct it now.)`
      : decision.reason,
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: decision.reason,
    },
  };
}
