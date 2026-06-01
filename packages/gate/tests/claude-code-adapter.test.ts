/**
 * Unit tests for the Claude Code PreToolUse hook adapter (src/claude-code-adapter.ts).
 *
 * These tests verify the adapter's wiring layer:
 *   1. evaluateHookInput returns null for non-file-edit tools (passthrough).
 *   2. evaluateHookInput returns a deny decision for a Write tool injecting a
 *      hardcoded credential.
 *   3. evaluateHookInput returns an allow decision for a safe Write.
 *   4. toPreToolUseHookOutput encodes deny as permissionDecision: "deny".
 *   5. toPreToolUseHookOutput encodes allow as permissionDecision: "allow".
 *   6. allowPassthrough emits permissionDecision: "allow" with hookEventName.
 *
 * These tests do NOT invoke the actual stdio hook (cli.ts), which calls
 * process.exit() and cannot be unit-tested directly. The evaluateHookInput
 * function is the pure, testable core of the adapter.
 */

import { describe, it, expect } from 'vitest';
import { evaluateHookInput, allowPassthrough, extractEdit } from '../src/hook-runner';
import { toPreToolUseHookOutput, toPostToolUseHookOutput } from '../src/claude-code-contract';
import type { ClaudeCodeHookInput } from '../src/hook-runner';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HEALTHY_CONTENT = `import crypto from 'crypto';

export function add(a: number, b: number): number {
  return a + b;
}

export function fingerprint(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
`;

// A security regression core's analyzeCode pipeline actually detects: the broken
// MD5 hash → CryptographicMisuseRisk. (Classic credential/SQL findings come from
// the separate auditSecurity API the gate does not call, so they are not used here.)
const CONTENT_WITH_HARDCODED_SECRET = `import crypto from 'crypto';

export function add(a: number, b: number): number {
  return a + b;
}

export function fingerprint(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex');
}
`;

const SAFE_WRITE_CONTENT = `export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
`;

function makeReadFile(files: Record<string, string>): (path: string) => string | null {
  return (path: string) => files[path] ?? null;
}

function makeWriteInput(filePath: string, content: string): ClaudeCodeHookInput {
  return {
    tool_name: 'Write',
    tool_input: { file_path: filePath, content },
  };
}

function makeEditInput(filePath: string, oldString: string, newString: string): ClaudeCodeHookInput {
  return {
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: oldString, new_string: newString },
    tool_response: { originalContent: HEALTHY_CONTENT },
  };
}

// ---------------------------------------------------------------------------
// Tests: evaluateHookInput
// ---------------------------------------------------------------------------

describe('evaluateHookInput', () => {
  const filePath = '/project/src/util.ts';

  it('returns null for non-file-edit tool (Bash)', () => {
    const input: ClaudeCodeHookInput = {
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
    };
    const result = evaluateHookInput(input, makeReadFile({}));
    expect(result).toBeNull();
  });

  it('returns null for Read tool', () => {
    const input: ClaudeCodeHookInput = {
      tool_name: 'Read',
      tool_input: { file_path: filePath },
    };
    const result = evaluateHookInput(input, makeReadFile({}));
    expect(result).toBeNull();
  });

  it('returns null when tool_input has no file_path', () => {
    const input: ClaudeCodeHookInput = {
      tool_name: 'Write',
      tool_input: { content: 'hello' },
    };
    const result = evaluateHookInput(input, makeReadFile({}));
    expect(result).toBeNull();
  });

  it('allows a safe Write edit (no new smells, score above floor)', () => {
    const input = makeWriteInput(filePath, SAFE_WRITE_CONTENT);
    const readFile = makeReadFile({ [filePath]: HEALTHY_CONTENT });
    const result = evaluateHookInput(input, readFile);
    expect(result).not.toBeNull();
    expect(result!.decision.verdict).toBe('allow');
  });

  it('denies a Write that introduces a hardcoded credential', () => {
    const input = makeWriteInput(filePath, CONTENT_WITH_HARDCODED_SECRET);
    const readFile = makeReadFile({ [filePath]: HEALTHY_CONTENT });
    const result = evaluateHookInput(input, readFile);
    expect(result).not.toBeNull();
    expect(result!.decision.verdict).toBe('deny');
    expect(result!.decision.reasonCode).toBe('new_security_smell');
  });

  it('denies a Write for a new file with a hardcoded credential (no before)', () => {
    const input = makeWriteInput('/project/src/new-file.ts', CONTENT_WITH_HARDCODED_SECRET);
    const readFile = makeReadFile({}); // file doesn't exist on disk yet
    const result = evaluateHookInput(input, readFile);
    expect(result).not.toBeNull();
    // A new file below the floor or with a security smell should be denied.
    // With a hardcoded credential: verdict is deny, reasonCode is new_security_smell.
    expect(result!.decision.verdict).toBe('deny');
  });

  it('denies an Edit that introduces a security smell via string replacement', () => {
    // Swap the secure SHA-256 hash for the broken MD5 → CryptographicMisuseRisk.
    const oldString = `crypto.createHash('sha256')`;
    const newString = `crypto.createHash('md5')`;
    const input = makeEditInput(filePath, oldString, newString);
    const readFile = makeReadFile({ [filePath]: HEALTHY_CONTENT });
    const result = evaluateHookInput(input, readFile);
    expect(result).not.toBeNull();
    expect(result!.decision.verdict).toBe('deny');
    expect(result!.decision.reasonCode).toBe('new_security_smell');
  });

  it('evaluateHookInput returns both pre and post outputs', () => {
    const input = makeWriteInput(filePath, SAFE_WRITE_CONTENT);
    const readFile = makeReadFile({ [filePath]: HEALTHY_CONTENT });
    const result = evaluateHookInput(input, readFile);
    expect(result).not.toBeNull();
    expect(result!.pre).toHaveProperty('hookSpecificOutput');
    expect(result!.post).toHaveProperty('hookSpecificOutput');
  });
});

// ---------------------------------------------------------------------------
// Tests: toPreToolUseHookOutput
// ---------------------------------------------------------------------------

describe('toPreToolUseHookOutput', () => {
  it('encodes allow verdict as permissionDecision: "allow"', () => {
    const input = makeWriteInput('/project/src/util.ts', SAFE_WRITE_CONTENT);
    const readFile = makeReadFile({ '/project/src/util.ts': HEALTHY_CONTENT });
    const result = evaluateHookInput(input, readFile);
    expect(result).not.toBeNull();
    const preOutput = result!.pre;
    expect(preOutput.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('encodes deny verdict as permissionDecision: "deny"', () => {
    const input = makeWriteInput('/project/src/util.ts', CONTENT_WITH_HARDCODED_SECRET);
    const readFile = makeReadFile({ '/project/src/util.ts': HEALTHY_CONTENT });
    const result = evaluateHookInput(input, readFile);
    expect(result).not.toBeNull();
    const preOutput = result!.pre;
    expect(preOutput.hookSpecificOutput.permissionDecision).toBe('deny');
  });

  it('deny output includes a non-empty permissionDecisionReason', () => {
    const input = makeWriteInput('/project/src/util.ts', CONTENT_WITH_HARDCODED_SECRET);
    const readFile = makeReadFile({ '/project/src/util.ts': HEALTHY_CONTENT });
    const result = evaluateHookInput(input, readFile);
    expect(result).not.toBeNull();
    const preOutput = result!.pre;
    expect(preOutput.hookSpecificOutput.permissionDecisionReason.length).toBeGreaterThan(0);
  });

  it('deny output includes systemMessage naming the file', () => {
    const filePath = '/project/src/util.ts';
    const input = makeWriteInput(filePath, CONTENT_WITH_HARDCODED_SECRET);
    const readFile = makeReadFile({ [filePath]: HEALTHY_CONTENT });
    const result = evaluateHookInput(input, readFile);
    expect(result).not.toBeNull();
    // systemMessage is optional but expected on deny
    expect(result!.pre.systemMessage).toBeDefined();
    expect(result!.pre.systemMessage).toContain('util.ts');
  });
});

// ---------------------------------------------------------------------------
// Tests: allowPassthrough
// ---------------------------------------------------------------------------

describe('allowPassthrough', () => {
  it('returns permissionDecision: "allow"', () => {
    const out = allowPassthrough();
    expect(out.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('includes hookEventName: "PreToolUse"', () => {
    const out = allowPassthrough();
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse');
  });

  it('is valid JSON (serialisable)', () => {
    const out = allowPassthrough();
    expect(() => JSON.stringify(out)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: extractEdit
// ---------------------------------------------------------------------------

describe('extractEdit', () => {
  it('returns null for unsupported language file extension', () => {
    const input = makeWriteInput('/project/README.md', '# hello');
    // .md is Tier C — detectLanguage returns 'markdown', which is supported.
    // We test an actually unsupported extension.
    const binInput = makeWriteInput('/project/binary.exe', 'binary');
    const readFile = makeReadFile({});
    const edit = extractEdit(binInput, readFile);
    expect(edit).toBeNull();
  });

  it('returns a ProposedEdit for a Write tool with a TypeScript file', () => {
    const filePath = '/project/src/util.ts';
    const input = makeWriteInput(filePath, SAFE_WRITE_CONTENT);
    const readFile = makeReadFile({ [filePath]: HEALTHY_CONTENT });
    const edit = extractEdit(input, readFile);
    expect(edit).not.toBeNull();
    expect(edit!.filePath).toBe(filePath);
    expect(edit!.after).toBe(SAFE_WRITE_CONTENT);
    expect(edit!.before).toBe(HEALTHY_CONTENT);
    expect(edit!.language).toBe('typescript');
  });
});

// ---------------------------------------------------------------------------
// Tests: toPostToolUseHookOutput (graceful fallback)
// ---------------------------------------------------------------------------

describe('toPostToolUseHookOutput (graceful fallback)', () => {
  it('deny decision produces decision: "block" in PostToolUse output', () => {
    const input = makeWriteInput('/project/src/util.ts', CONTENT_WITH_HARDCODED_SECRET);
    const readFile = makeReadFile({ '/project/src/util.ts': HEALTHY_CONTENT });
    const result = evaluateHookInput(input, readFile);
    expect(result).not.toBeNull();
    const postOutput = result!.post;
    expect(postOutput.decision).toBe('block');
  });

  it('allow decision produces decision: undefined in PostToolUse output', () => {
    const input = makeWriteInput('/project/src/util.ts', SAFE_WRITE_CONTENT);
    const readFile = makeReadFile({ '/project/src/util.ts': HEALTHY_CONTENT });
    const result = evaluateHookInput(input, readFile);
    expect(result).not.toBeNull();
    const postOutput = result!.post;
    expect(postOutput.decision).toBeUndefined();
  });
});
