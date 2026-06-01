/**
 * Unit tests for the Cursor adapter (packages/gate/src/adapters/cursor.ts).
 *
 * Tests cover:
 *   1. mapDecisionToHookOutput — the core mapping from GateDecision to
 *      CursorHookOutput (always permission: "allow", advisory warning on deny).
 *   2. getCursorAdapterMetadata — verifies honest enforcement-level reporting.
 *   3. writeCursorRulesFile — verifies the .mdc file is generated correctly.
 *   4. buildCursorHooksEntry — verifies the hooks.json snippet targets afterFileEdit.
 *   5. handleAfterFileEditHook — end-to-end: simulate stdin → hook output.
 *
 * Integration note: these tests deliberately do NOT test the full gate scoring
 * pipeline (that is covered by evaluate-gate.test.ts). They test only the
 * Cursor-specific mapping layer. The evaluateGate function is called with real
 * code fixtures to produce realistic GateDecision objects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';

import {
  mapDecisionToHookOutput,
  getCursorAdapterMetadata,
  writeCursorRulesFile,
  buildCursorHooksEntry,
  handleAfterFileEditHook,
  ADAPTER_NAME,
  ENFORCEMENT_LEVEL,
  CURSOR_RULES_RELATIVE_PATH,
} from '../src/adapters/cursor';
import type { CursorAfterFileEditPayload, CursorHookOutput } from '../src/adapters/cursor';
import { evaluateGate } from '../src/evaluate-gate';
import type { GateDecision } from '../src/gate-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A clean, simple TypeScript file that should score well above the floor. */
const HEALTHY_TS = `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`.trimStart();

/**
 * A deeply-nested function appended to the healthy file.
 * Drives the health score below the floor (7.0), triggering score_regression
 * or below_floor denial.
 */
const UNHEALTHY_SUFFIX = `
export function convoluted(items: unknown[]): unknown {
  let result: unknown = null;
  for (let i = 0; i < items.length; i++) {
    if (items[i] !== null) {
      if (typeof items[i] === 'object') {
        for (let j = 0; j < 10; j++) {
          if (j % 2 === 0) {
            if (j > 4) {
              if (i > 5) {
                if (i % 3 === 0) { result = items[i]; }
                else if (i % 3 === 1) { result = null; }
                else { result = items[j]; }
              } else if (i > 2) { result = items[i]; }
              else { result = null; }
            } else { result = items[j]; }
          } else if (j === 7) { result = items[i]; }
          else { result = null; }
        }
      } else if (typeof items[i] === 'string') { result = items[i]; }
      else { result = null; }
    } else { result = null; }
  }
  return result;
}
`;

const UNHEALTHY_TS = HEALTHY_TS + UNHEALTHY_SUFFIX;

/**
 * Security regression that core's analyzeCode pipeline detects: a broken MD5
 * hash → CryptographicMisuseRisk, which triggers a new_security_smell denial.
 * (SQL-injection/credential findings come from the separate auditSecurity API
 * that the delta gate does not call, so they are not used here.)
 */
const SQL_INJECT_TS = HEALTHY_TS + `
import crypto from 'crypto';
export function digest(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex');
}
`;

// ---------------------------------------------------------------------------
// Helper to build a realistic GateDecision using the real evaluator
// ---------------------------------------------------------------------------

function makeAllowDecision(): GateDecision {
  return evaluateGate({
    filePath: '/tmp/gate-cursor-test.ts',
    language: 'typescript',
    before: HEALTHY_TS,
    after: HEALTHY_TS,
  });
}

function makeDenyDecisionScoreRegression(): GateDecision {
  return evaluateGate({
    filePath: '/tmp/gate-cursor-test.ts',
    language: 'typescript',
    before: HEALTHY_TS,
    after: UNHEALTHY_TS,
  });
}

function makeDenyDecisionSecuritySmell(): GateDecision {
  return evaluateGate({
    filePath: '/tmp/gate-cursor-test.ts',
    language: 'typescript',
    before: HEALTHY_TS,
    after: SQL_INJECT_TS,
  });
}

// ---------------------------------------------------------------------------
// 1. mapDecisionToHookOutput
// ---------------------------------------------------------------------------

describe('mapDecisionToHookOutput', () => {
  it('always emits permission: "allow" for an allow decision', () => {
    const decision = makeAllowDecision();
    const output = mapDecisionToHookOutput(decision, '/tmp/gate-cursor-test.ts');
    expect(output.permission).toBe('allow');
  });

  it('emits no agentMessage / userMessage for an allow decision', () => {
    const decision = makeAllowDecision();
    const output = mapDecisionToHookOutput(decision, '/tmp/gate-cursor-test.ts');
    expect(output.agentMessage).toBeUndefined();
    expect(output.userMessage).toBeUndefined();
  });

  it('attaches gateDecision to the output for an allow decision', () => {
    const decision = makeAllowDecision();
    const output = mapDecisionToHookOutput(decision, '/tmp/gate-cursor-test.ts');
    expect(output.gateDecision).toBeDefined();
    expect(output.gateDecision?.verdict).toBe('allow');
  });

  it('always emits permission: "allow" even for a deny decision (afterFileEdit cannot block)', () => {
    const decision = makeDenyDecisionScoreRegression();
    const output = mapDecisionToHookOutput(decision, '/tmp/gate-cursor-test.ts');
    // This is the core enforcement-limit test: even a deny maps to permission: "allow"
    // because Cursor's afterFileEdit hook is informational only.
    expect(output.permission).toBe('allow');
  });

  it('emits an agentMessage warning for a score-regression deny', () => {
    const decision = makeDenyDecisionScoreRegression();
    expect(decision.verdict).toBe('deny'); // Pre-condition: fixture actually triggers denial
    const output = mapDecisionToHookOutput(decision, '/tmp/gate-cursor-test.ts');
    expect(output.agentMessage).toBeDefined();
    expect(output.agentMessage).toContain('POST-EDIT WARNING');
    expect(output.agentMessage).toContain('DENIED');
  });

  it('emits a userMessage for a deny decision', () => {
    const decision = makeDenyDecisionScoreRegression();
    const output = mapDecisionToHookOutput(decision, '/tmp/gate-cursor-test.ts');
    expect(output.userMessage).toBeDefined();
    expect(output.userMessage).toContain('gate-cursor-test.ts');
  });

  it('includes the gate reason in the agentMessage for a deny', () => {
    // Use score-regression fixture which is guaranteed to deny regardless of
    // smell-classification runtime state.
    const decision = makeDenyDecisionScoreRegression();
    expect(decision.verdict).toBe('deny'); // Pre-condition
    const output = mapDecisionToHookOutput(decision, '/tmp/gate-cursor-test.ts');
    expect(output.agentMessage).toContain('DENIED');
    // The agentMessage must include the human-readable reason string
    expect(output.agentMessage).toContain(decision.reason);
  });

  it('attaches the full GateDecision to the output for a deny', () => {
    const decision = makeDenyDecisionScoreRegression();
    const output = mapDecisionToHookOutput(decision, '/tmp/gate-cursor-test.ts');
    expect(output.gateDecision).toBeDefined();
    expect(output.gateDecision?.verdict).toBe('deny');
  });

  it('mentions the afterFileEdit limitation in agentMessage so agents understand scope', () => {
    const decision = makeDenyDecisionScoreRegression();
    const output = mapDecisionToHookOutput(decision, '/tmp/gate-cursor-test.ts');
    // The message must explain why this is advisory-only
    expect(output.agentMessage).toContain("afterFileEdit hook cannot block");
  });
});

// ---------------------------------------------------------------------------
// 2. getCursorAdapterMetadata
// ---------------------------------------------------------------------------

describe('getCursorAdapterMetadata', () => {
  it('reports name as "cursor"', () => {
    const meta = getCursorAdapterMetadata();
    expect(meta.name).toBe('cursor');
    expect(meta.name).toBe(ADAPTER_NAME);
  });

  it('reports enforcement level as "advisory" (not "enforced")', () => {
    const meta = getCursorAdapterMetadata();
    expect(meta.enforcement).toBe('advisory');
    expect(meta.enforcement).toBe(ENFORCEMENT_LEVEL);
  });

  it('reports hookType as "afterFileEdit"', () => {
    const meta = getCursorAdapterMetadata();
    expect(meta.hookType).toBe('afterFileEdit');
  });

  it('includes a non-empty limitationNote that mentions Cursor and 2026', () => {
    const meta = getCursorAdapterMetadata();
    expect(meta.limitationNote.length).toBeGreaterThan(50);
    // Must mention the source and date so the limitation is traceable
    expect(meta.limitationNote).toContain('cursor.com/docs/hooks');
    expect(meta.limitationNote).toContain('2026');
  });

  it('limitationNote explains that afterFileEdit cannot block writes', () => {
    const meta = getCursorAdapterMetadata();
    expect(meta.limitationNote).toContain('afterFileEdit');
    expect(meta.limitationNote).toMatch(/informational|cannot block|pre-edit/i);
  });

  it('limitationNote contrasts with Claude Code PreToolUse', () => {
    const meta = getCursorAdapterMetadata();
    expect(meta.limitationNote).toContain('Claude Code');
    expect(meta.limitationNote).toContain('PreToolUse');
  });
});

// ---------------------------------------------------------------------------
// 3. writeCursorRulesFile
// ---------------------------------------------------------------------------

describe('writeCursorRulesFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-cursor-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the rules file at .cursor/rules/healthy-ai-code-gate.mdc', () => {
    const result = writeCursorRulesFile({ projectRoot: tmpDir, overwrite: true });
    expect(fs.existsSync(result)).toBe(true);
    // Normalize both to use the OS separator for cross-platform comparison
    const normalizedResult = result.replace(/\\/g, '/');
    expect(normalizedResult).toContain(CURSOR_RULES_RELATIVE_PATH);
  });

  it('returns the absolute path of the written file', () => {
    const result = writeCursorRulesFile({ projectRoot: tmpDir, overwrite: true });
    expect(path.isAbsolute(result)).toBe(true);
  });

  it('generates valid .mdc frontmatter', () => {
    writeCursorRulesFile({ projectRoot: tmpDir, overwrite: true });
    const content = fs.readFileSync(
      path.join(tmpDir, '.cursor', 'rules', 'healthy-ai-code-gate.mdc'),
      'utf-8',
    );
    expect(content).toContain('---');
    expect(content).toContain('description:');
    expect(content).toContain('alwaysApply:');
  });

  it('includes the advisory note in the generated rules file', () => {
    writeCursorRulesFile({ projectRoot: tmpDir, overwrite: true });
    const content = fs.readFileSync(
      path.join(tmpDir, '.cursor', 'rules', 'healthy-ai-code-gate.mdc'),
      'utf-8',
    );
    expect(content).toContain('advisory');
    expect(content).toContain('code_health_gate');
  });

  it('embeds the configured floor value in the rules file', () => {
    writeCursorRulesFile({
      projectRoot: tmpDir,
      overwrite: true,
      gateConfig: { floor: 8.5 },
    });
    const content = fs.readFileSync(
      path.join(tmpDir, '.cursor', 'rules', 'healthy-ai-code-gate.mdc'),
      'utf-8',
    );
    expect(content).toContain('8.5');
  });

  it('does not overwrite when overwrite is false and file exists', () => {
    writeCursorRulesFile({ projectRoot: tmpDir, overwrite: true });
    const rulesFile = path.join(tmpDir, '.cursor', 'rules', 'healthy-ai-code-gate.mdc');
    const original = fs.readFileSync(rulesFile, 'utf-8');
    // Write a sentinel
    fs.writeFileSync(rulesFile, 'SENTINEL_CONTENT', 'utf-8');
    writeCursorRulesFile({ projectRoot: tmpDir, overwrite: false });
    const after = fs.readFileSync(rulesFile, 'utf-8');
    expect(after).toBe('SENTINEL_CONTENT'); // should not have been overwritten
  });
});

// ---------------------------------------------------------------------------
// 4. buildCursorHooksEntry
// ---------------------------------------------------------------------------

describe('buildCursorHooksEntry', () => {
  it('returns an object with afterFileEdit key', () => {
    const entry = buildCursorHooksEntry('node .cursor/hooks/gate.js');
    expect(entry).toHaveProperty('afterFileEdit');
  });

  it('embeds the runner path as command', () => {
    const runner = 'node /abs/path/to/hook.js';
    const entry = buildCursorHooksEntry(runner);
    const afterEdit = entry['afterFileEdit'] as { command: string; timeout: number };
    expect(afterEdit.command).toBe(runner);
  });

  it('sets a positive timeout', () => {
    const entry = buildCursorHooksEntry('node hook.js');
    const afterEdit = entry['afterFileEdit'] as { command: string; timeout: number };
    expect(afterEdit.timeout).toBeGreaterThan(0);
  });

  it('does NOT include beforeFileEdit or other pre-edit hooks', () => {
    // Cursor has no pre-edit hook that can veto writes — the entry must NOT
    // claim to use one, which would mislead operators.
    const entry = buildCursorHooksEntry('node hook.js');
    expect(Object.keys(entry)).not.toContain('beforeFileEdit');
    expect(Object.keys(entry)).not.toContain('onPreEdit');
    expect(Object.keys(entry)).not.toContain('preFileWrite');
  });
});

// ---------------------------------------------------------------------------
// 5. handleAfterFileEditHook — end-to-end with simulated stdin
// ---------------------------------------------------------------------------

function makeStdin(payload: CursorAfterFileEditPayload): Readable {
  const r = new Readable();
  r.push(JSON.stringify(payload));
  r.push(null);
  return r;
}

describe('handleAfterFileEditHook', () => {
  it('emits permission: "allow" for a healthy file (allow decision)', async () => {
    const captured: string[] = [];
    const payload: CursorAfterFileEditPayload = {
      hook_event_name: 'afterFileEdit',
      file_path: '/tmp/gate-cursor-e2e.ts',
      edits: [],
      file_content_after: HEALTHY_TS,
    };

    const result = await handleAfterFileEditHook({
      stdin: makeStdin(payload),
      writeOutput: (s) => captured.push(s),
      getBeforeContent: () => HEALTHY_TS,
    });

    expect(result.permission).toBe('allow');
    expect(captured).toHaveLength(1);
    const parsed: CursorHookOutput = JSON.parse(captured[0]);
    expect(parsed.permission).toBe('allow');
  });

  it('emits permission: "allow" even for an unhealthy edit (cannot block)', async () => {
    const captured: string[] = [];
    const payload: CursorAfterFileEditPayload = {
      hook_event_name: 'afterFileEdit',
      file_path: '/tmp/gate-cursor-e2e.ts',
      edits: [],
      file_content_after: UNHEALTHY_TS,
    };

    const result = await handleAfterFileEditHook({
      stdin: makeStdin(payload),
      writeOutput: (s) => captured.push(s),
      getBeforeContent: () => HEALTHY_TS,
    });

    // Enforcement limitation: even a gate-deny produces permission: "allow"
    expect(result.permission).toBe('allow');
    const parsed: CursorHookOutput = JSON.parse(captured[0]);
    expect(parsed.permission).toBe('allow');
  });

  it('includes a warning agentMessage for an unhealthy edit', async () => {
    const captured: string[] = [];
    const payload: CursorAfterFileEditPayload = {
      hook_event_name: 'afterFileEdit',
      file_path: '/tmp/gate-cursor-e2e.ts',
      edits: [],
      file_content_after: UNHEALTHY_TS,
    };

    const result = await handleAfterFileEditHook({
      stdin: makeStdin(payload),
      writeOutput: (s) => captured.push(s),
      getBeforeContent: () => HEALTHY_TS,
    });

    expect(result.agentMessage).toBeDefined();
    expect(result.agentMessage).toContain('POST-EDIT WARNING');
  });

  it('skips unsupported file types silently', async () => {
    const captured: string[] = [];
    const payload: CursorAfterFileEditPayload = {
      hook_event_name: 'afterFileEdit',
      file_path: '/tmp/gate-test.xyz_unknown',
      edits: [],
      file_content_after: 'some content',
    };

    const result = await handleAfterFileEditHook({
      stdin: makeStdin(payload),
      writeOutput: (s) => captured.push(s),
    });

    expect(result.permission).toBe('allow');
    expect(result.agentMessage).toBeUndefined();
  });

  it('handles malformed JSON stdin gracefully (returns allow with error note)', async () => {
    const captured: string[] = [];
    const badStdin = new Readable();
    badStdin.push('NOT_VALID_JSON{{{');
    badStdin.push(null);

    const result = await handleAfterFileEditHook({
      stdin: badStdin,
      writeOutput: (s) => captured.push(s),
    });

    expect(result.permission).toBe('allow');
  });

  it('uses file_content_after from payload when provided (no disk read needed)', async () => {
    const captured: string[] = [];
    const payload: CursorAfterFileEditPayload = {
      hook_event_name: 'afterFileEdit',
      file_path: '/nonexistent/path/file.ts', // would fail a disk read
      edits: [],
      file_content_after: HEALTHY_TS,
    };

    const result = await handleAfterFileEditHook({
      stdin: makeStdin(payload),
      writeOutput: (s) => captured.push(s),
      getBeforeContent: () => HEALTHY_TS,
    });

    // Should succeed using the payload content rather than trying to read disk
    expect(result.permission).toBe('allow');
    expect(captured).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 6. Enforcement contract — documents the structural limitation clearly
// ---------------------------------------------------------------------------

describe('enforcement contract (structural Cursor limitation)', () => {
  it('ADAPTER_NAME constant is "cursor"', () => {
    expect(ADAPTER_NAME).toBe('cursor');
  });

  it('ENFORCEMENT_LEVEL constant is "advisory"', () => {
    expect(ENFORCEMENT_LEVEL).toBe('advisory');
  });

  it('mapDecisionToHookOutput never returns permission: "deny"', () => {
    // Run all three fixture GateDecisions through the mapper and confirm
    // that none of them produce permission: "deny". This test documents
    // and enforces the Cursor structural limitation.
    const decisions: GateDecision[] = [
      makeAllowDecision(),
      makeDenyDecisionScoreRegression(),
      makeDenyDecisionSecuritySmell(),
    ];
    for (const d of decisions) {
      const out = mapDecisionToHookOutput(d, '/tmp/test.ts');
      expect(out.permission).toBe('allow');
      // Type-level guarantee: 'deny' is not in the union
      // (TypeScript would catch this at compile time too)
      expect(out.permission).not.toBe('deny');
    }
  });
});
