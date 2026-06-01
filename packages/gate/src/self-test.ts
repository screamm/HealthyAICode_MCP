/**
 * Install-time conformance self-test.
 *
 * Runs the gate against a known-bad fixture edit and asserts the verdict is
 * `deny`. This proves, on the *installed* version, that the deny path actually
 * fires — guarding against the silent-pass failure mode where a hook is wired
 * in but no longer blocks (e.g. after a core scoring change or a packaging
 * regression). It is the package analogue of the Sats 1 acceptance metric
 * "known-bad edit blocked on the installed version".
 */
import { evaluateGate, type ProposedEdit } from './evaluate-gate';
import type {
  GateSchemaConformance,
  GateSelfTestResult,
} from './gate-types';
import {
  toPreToolUseHookOutput,
  toLegacyPreToolUseHookOutput,
  toPostToolUseHookOutput,
} from './claude-code-contract';

/**
 * A deliberately healthy "before" file: a small, well-formed function with no
 * smells. Used as the baseline for the self-test fixture.
 */
export const SELF_TEST_HEALTHY_BEFORE = `import crypto from 'crypto';

export function add(a: number, b: number): number {
  return a + b;
}

export function fingerprint(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
`;

/**
 * A known-bad "after": the same module but the secure SHA-256 hash is swapped
 * for the broken MD5 algorithm. This introduces a `CryptographicMisuseRisk`
 * security smell that core's `analyzeCode` detects, so the gate must always
 * deny it with `reasonCode: "new_security_smell"`.
 *
 * MD5 is chosen because cryptographic-misuse detection flows through the
 * `analyzeCode` smell pipeline (via `runAdditiveDetectors`), whereas classic
 * credential/SQL-injection findings live in the separate `auditSecurity` API
 * that the delta gate does not call. The fixture therefore exercises a smell
 * the gate can actually see.
 */
export const SELF_TEST_BAD_AFTER = `import crypto from 'crypto';

export function add(a: number, b: number): number {
  return a + b;
}

export function fingerprint(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex');
}
`;

/** The canonical known-bad fixture edit used by {@link runGateSelfTest}. */
export const KNOWN_BAD_EDIT: ProposedEdit = {
  filePath: 'self-test/known-bad.ts',
  before: SELF_TEST_HEALTHY_BEFORE,
  after: SELF_TEST_BAD_AFTER,
  language: 'typescript',
};

/**
 * Builds the per-schema-shape conformance checks for a deny decision by
 * serialising the known-bad decision into each supported hook-output shape and
 * inspecting whether the JSON the harness actually reads encodes a block.
 *
 * This is stronger than "the verdict is deny": a verdict is only useful if it
 * survives serialisation into the field the harness parses. Asserting it across
 * THREE shapes (modern PreToolUse `permissionDecision`, legacy PreToolUse
 * `decision`, and the PostToolUse fallback) means a single schema change in
 * Claude Code / Copilot cannot silently turn the gate off — the install-time
 * self-test fails loudly first.
 */
function buildSchemaConformance(decision: ReturnType<typeof evaluateGate>): GateSchemaConformance[] {
  const pre = toPreToolUseHookOutput(decision);
  const legacy = toLegacyPreToolUseHookOutput(decision);
  const post = toPostToolUseHookOutput(decision);

  return [
    {
      shape: 'preToolUse.permissionDecision',
      field: 'hookSpecificOutput.permissionDecision',
      observedValue: pre.hookSpecificOutput.permissionDecision,
      expectedValue: 'deny',
      blocked: pre.hookSpecificOutput.permissionDecision === 'deny',
    },
    {
      shape: 'preToolUse.legacyDecision',
      field: 'decision',
      observedValue: legacy.decision,
      expectedValue: 'block',
      blocked: legacy.decision === 'block',
    },
    {
      shape: 'postToolUse.decision',
      field: 'decision',
      observedValue: post.decision ?? 'undefined',
      expectedValue: 'block',
      blocked: post.decision === 'block',
    },
  ];
}

/**
 * Runs the conformance self-test for a given harness label. Returns a
 * {@link GateSelfTestResult}; `passed` is true only when the known-bad edit is
 * (a) denied by the gate verdict AND (b) encoded as a block in EVERY supported
 * hook-output schema shape (modern PreToolUse `permissionDecision`, legacy
 * PreToolUse `decision`, and the PostToolUse fallback).
 *
 * @param harness         Label of the harness/adapter being verified (default "claude-code").
 * @param harnessVersion  Optional detected harness version, recorded for diagnostics.
 */
export function runGateSelfTest(harness = 'claude-code', harnessVersion?: string): GateSelfTestResult {
  const expectedVerdict = 'deny' as const;

  let decision: ReturnType<typeof evaluateGate>;
  try {
    decision = evaluateGate(KNOWN_BAD_EDIT);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      passed: false,
      harness,
      harnessVersion,
      observedVerdict: 'allow',
      expectedVerdict,
      schemaConformance: [],
      detail: `Gate threw while evaluating the known-bad fixture: ${detail}`,
    };
  }

  const observedVerdict = decision.verdict;
  const schemaConformance = buildSchemaConformance(decision);
  const verdictOk = observedVerdict === expectedVerdict;
  const failedShapes = schemaConformance.filter((c) => !c.blocked);
  const passed = verdictOk && failedShapes.length === 0;

  let detail: string | undefined;
  if (!verdictOk) {
    detail =
      `Known-bad fixture was not blocked (observed verdict "${observedVerdict}", expected "deny"). ` +
      `The gate is installed but not enforcing — do not rely on it.`;
  } else if (failedShapes.length > 0) {
    detail =
      `Known-bad fixture is denied by the gate, but its serialised hook output does NOT encode a ` +
      `block in ${failedShapes.length} schema shape(s): ` +
      failedShapes
        .map((c) => `${c.shape} (${c.field}="${c.observedValue}", expected "${c.expectedValue}")`)
        .join('; ') +
      `. A harness reading that shape would let the edit through.`;
  }

  return {
    passed,
    harness,
    harnessVersion,
    observedVerdict,
    expectedVerdict,
    schemaConformance,
    detail,
  };
}
