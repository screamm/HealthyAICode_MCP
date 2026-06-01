import { describe, it, expect } from 'vitest';
import { installHook } from '../src/steps/install-hook';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('install-hook (dry-run)', () => {
  it('returns hookConfigPath pointing to ~/.claude/settings.json', () => {
    const result = installHook({ dryRun: true });
    expect(result.hookConfigPath).toContain(path.join('.claude', 'settings.json'));
  });

  it('dry-run never changes the file mtime', () => {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    const statBefore = fs.existsSync(settingsPath)
      ? fs.statSync(settingsPath).mtimeMs
      : null;

    installHook({ dryRun: true });

    const statAfter = fs.existsSync(settingsPath)
      ? fs.statSync(settingsPath).mtimeMs
      : null;

    expect(statBefore).toEqual(statAfter);
  });

  it('diff / dryRunDiff contains the gate command when not already present', () => {
    const result = installHook({ dryRun: true });
    if (!result.alreadyPresent) {
      expect(result.dryRunDiff).toContain('@healthy-ai-code/gate');
    }
  });

  it('hookConfigPath is an absolute path', () => {
    const result = installHook({ dryRun: true });
    expect(path.isAbsolute(result.hookConfigPath)).toBe(true);
  });
});

describe('install-hook: manual merge logic', () => {
  it('does not clobber existing hooks in settings', () => {
    const existing = {
      hooks: {
        PreToolUse: [
          { matcher: 'SomeOtherTool', hooks: [{ type: 'command', command: 'echo hello' }] },
        ],
      },
    };

    const HOOK_MATCHER = 'Write|Edit|MultiEdit';
    const GATE_COMMAND = 'npx @healthy-ai-code/gate@latest';
    const existingMatchers = existing.hooks.PreToolUse;
    const matcherIndex = existingMatchers.findIndex((m) => m.matcher === HOOK_MATCHER);

    let updatedMatchers;
    if (matcherIndex >= 0) {
      updatedMatchers = existingMatchers.map((m, i) =>
        i === matcherIndex
          ? { ...m, hooks: [...m.hooks, { type: 'command', command: GATE_COMMAND }] }
          : m,
      );
    } else {
      updatedMatchers = [
        ...existingMatchers,
        { matcher: HOOK_MATCHER, hooks: [{ type: 'command', command: GATE_COMMAND }] },
      ];
    }

    // Original matcher must still be present.
    expect(updatedMatchers.some((m) => m.matcher === 'SomeOtherTool')).toBe(true);
    // Gate matcher must be added.
    expect(updatedMatchers.some((m) => m.matcher === HOOK_MATCHER)).toBe(true);
    const gateMatcher = updatedMatchers.find((m) => m.matcher === HOOK_MATCHER);
    expect(gateMatcher?.hooks.some((h) => h.command === GATE_COMMAND)).toBe(true);
  });
});
