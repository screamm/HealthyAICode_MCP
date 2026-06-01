# @healthy-ai-code/gate

Deterministic delta-gating hook for AI code editors.

Scores a **proposed** file edit before it lands and decides **ALLOW / DENY** on the
**delta**, not the absolute score. Denies only when the edit lowers a file below
the health floor, regresses the score beyond tolerance, or introduces a security
or AI-native (supply-chain) smell.

Implements the Claude Code `PreToolUse` structured-JSON deny contract
([#21988](https://github.com/anthropics/claude-code/issues/21988) — exit codes
are ignored; the "deny" is signalled in the JSON payload).

---

## How it works

The gate evaluates every proposed file write before it lands:

1. **Hard-deny `new_security_smell`** — injection risks, insecure deserialization,
   SSRF, weak crypto, etc. (`CryptographicMisuseRisk`, `SsrfRisk`, etc.). Fires
   even when the numeric score delta is neutral or positive, because a single
   injected security sink can be masked by unrelated improvements elsewhere.

2. **Hard-deny `new_ai_native_smell`** — slopsquatting, hallucinated package
   imports, LLM-integration anti-patterns (unpinned model, unbounded calls, etc.).

3. **Deny `below_floor`** — edit leaves the file below the absolute health floor
   (default 6.0). Fires on new files and edits to existing files.

4. **Deny `score_regression`** — edit lowers the score by more than the allowed
   delta tolerance (default −0.05, a small negative to absorb scoring noise).

5. **Allow** — all other edits, including those that improve the score.

---

## Quick start

```bash
# Install (from the monorepo root)
pnpm add @healthy-ai-code/gate

# Or as a devDependency
pnpm add -D @healthy-ai-code/gate
```

After installation, add the hook to your Claude Code project settings (see below).

---

## Claude Code settings.json hook configuration

Add the following to `.claude/settings.json` (project-level) or
`~/.claude/settings.json` (global):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node node_modules/@healthy-ai-code/gate/dist/cli.js"
          }
        ]
      }
    ]
  }
}
```

### What the hook does

- Claude Code fires the hook **before** the `Write`, `Edit`, or `MultiEdit` tool
  executes.
- The hook reads the proposed edit from stdin (JSON), scores it via
  `@healthy-ai-code/core`'s `analyzeCode`, and writes a structured-JSON
  response to stdout.
- If the verdict is `"deny"`, Claude Code blocks the edit and surfaces the
  `permissionDecisionReason` to the model as a self-correction signal.
- If the verdict is `"allow"`, the edit proceeds normally.
- If the hook throws or receives unexpected input, it **always allows through**
  (fail-open) to prevent a transient analysis failure from blocking the developer.

### Environment variable overrides

| Variable | Default | Meaning |
|---|---|---|
| `GATE_SCORE_FLOOR` | `6.0` | Minimum health score (0–10). Edits that leave the file below this value are denied. |
| `GATE_MIN_DELTA` | `-0.05` | Minimum allowed score change per edit. A small negative tolerance absorbs scoring noise. |

Example — stricter settings (green-field project):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "GATE_SCORE_FLOOR=8.0 GATE_MIN_DELTA=0 node node_modules/@healthy-ai-code/gate/dist/cli.js"
          }
        ]
      }
    ]
  }
}
```

Example — more permissive (legacy codebase):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "GATE_SCORE_FLOOR=4.0 node node_modules/@healthy-ai-code/gate/dist/cli.js"
          }
        ]
      }
    ]
  }
}
```

---

## Install-time self-test

Run after installation to verify the gate actually blocks a known-bad edit on
the installed harness version. This guards against the version-fragility risk:
if a future Claude Code update changes how hook output is interpreted, the
self-test catches it before any real code is gated.

```bash
# After pnpm build:
node node_modules/@healthy-ai-code/gate/dist/run-selftest.js

# Or via the npm bin:
healthy-ai-code-gate-selftest

# Or via the package script (during development):
pnpm --filter @healthy-ai-code/gate selftest
```

**Expected output (PASS):**

```
=== @healthy-ai-code/gate install-time conformance self-test ===

  Harness    : claude-code
  Expected   : verdict="deny"
  Observed   : verdict="deny"
  Result     : PASS

  Known-bad edit (SHA-256 → MD5, CryptographicMisuseRisk) was correctly DENIED.
  Gate is wired correctly on this installed harness version.
```

**What the known-bad fixture is:** a TypeScript file that replaces a secure
`crypto.createHash('sha256')` call with the broken `crypto.createHash('md5')`.
This introduces a `CryptographicMisuseRisk` smell — one that flows through
`analyzeCode`'s smell pipeline and that the gate's `new_security_smell` rule is
designed to catch. The fixture is deterministic and reproducible.

**Exit codes:**

| Code | Meaning |
|---|---|
| 0 | Self-test passed — gate is wired correctly |
| 1 | Self-test FAILED — gate did not block the known-bad fixture |

---

## Gate decision types

```typescript
// The verdict the gate returns for a single proposed edit.
type GateVerdict = 'allow' | 'deny' | 'warn';

type GateReasonCode =
  | 'below_floor'         // File would end up below the absolute health floor
  | 'score_regression'    // Edit lowers the score more than the tolerance allows
  | 'new_security_smell'  // Edit introduces a CWE-class security smell
  | 'new_ai_native_smell' // Edit introduces an AI-native / supply-chain smell
  | 'none';               // Allowed; no blocking reason

interface GateDecision {
  verdict: GateVerdict;
  reasonCode: GateReasonCode;
  reason: string;         // Human-readable self-correction instruction for the agent
  scoreBefore: number | null;
  scoreAfter: number;
  scoreDelta: number;
  newSmells: Smell[];
  floor: number;
}
```

---

## Programmatic use

```typescript
import { evaluateGate } from '@healthy-ai-code/gate';

const decision = evaluateGate({
  filePath: '/project/src/auth.ts',
  before: currentFileContent,
  after: proposedFileContent,
  language: 'typescript',
});

if (decision.verdict === 'deny') {
  console.log(decision.reason); // Self-correction instruction
}
```

---

## Cursor adapter

A Cursor adapter is included at `src/adapters/cursor.ts`. Cursor does not expose
a pre-edit hook that can veto a file write before it lands — the `afterFileEdit`
hook is informational only. The Cursor adapter provides a best-available
post-edit advisory (an `agentMessage` that prompts the agent to revert if the
gate would have denied) plus a Cursor rules file (`.cursor/rules/*.mdc`) that
instructs the agent to call the gate before editing.

**Cursor enforcement is advisory, not enforced.** Only the Claude Code
`PreToolUse` hook provides a deterministic block-before-land.

---

## Scoring formula

This package delegates all scoring to `@healthy-ai-code/core`'s `analyzeCode`.
The gate never re-implements the formula. Full specification:

```
score = 10 − Σ(weight × √count)   per smell type
floor = 1.0
```

Security smell weights (relevant to gate deny rules):

| Smell | Weight |
|---|---|
| `CryptographicMisuseRisk` | 1.0 |
| `SsrfRisk` | 1.3 |
| `UnsafeDeserialization` | 1.2 |
| `SqlInjectionRisk` / `XssRisk` / `CommandInjectionRisk` | 1.5 |
| `HardcodedCredential` / `HardcodedApiKey` | 2.0 |
| `SlopsquattingRisk` / `HallucinatedPackageImport` | 1.5 |

Full weight table: `packages/core/src/scoring/weights.ts`.

---

## License

MIT
