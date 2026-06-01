/**
 * Step: install the PreToolUse gate hook in Claude Code settings.
 *
 * The hook intercepts Write/Edit tool calls, runs code_health_score on the
 * proposed content, and emits a structured-JSON deny when the edit would drop
 * the file below the configured floor (default 7.0).
 *
 * Hook config format (Claude Code settings.json):
 *   {
 *     "hooks": {
 *       "PreToolUse": [
 *         {
 *           "matcher": "Write|Edit|MultiEdit",
 *           "hooks": [
 *             {
 *               "type": "command",
 *               "command": "npx @healthy-ai-code/gate@latest"
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   }
 *
 * This step writes to ~/.claude/settings.json (user-global).
 * If the project already has a .claude/settings.json it prints a note
 * but does NOT modify the project file — the user should merge manually.
 *
 * The hook emits permissionDecision: "deny" (structured JSON) rather than
 * relying on exit codes, which are ignored by Claude Code (issue #21988).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface InstallHookResult {
  hookConfigPath: string;
  alreadyPresent: boolean;
  projectFileNote: string | null;
  /** Dry-run: serialized new hook block, not written to disk. */
  dryRunDiff?: string;
}

interface HookEntry {
  type: 'command';
  command: string;
}

interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookMatcher[];
    [key: string]: HookMatcher[] | undefined;
  };
  [key: string]: unknown;
}

const HOOK_CONFIG_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const GATE_COMMAND = 'npx @healthy-ai-code/gate@latest';
const HOOK_MATCHER = 'Write|Edit|MultiEdit';

function readSettings(filePath: string): ClaudeSettings {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ClaudeSettings;
  } catch {
    return {};
  }
}

function writeSettings(filePath: string, settings: ClaudeSettings): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
}

function gateCommandAlreadyPresent(settings: ClaudeSettings): boolean {
  const preToolUse = settings.hooks?.PreToolUse ?? [];
  for (const matcher of preToolUse) {
    for (const hook of matcher.hooks) {
      if (hook.command === GATE_COMMAND) return true;
    }
  }
  return false;
}

function mergeHook(settings: ClaudeSettings): ClaudeSettings {
  const existing = settings.hooks?.PreToolUse ?? [];

  // Find if our matcher already exists (even without our command).
  const existingMatcherIndex = existing.findIndex(
    (m) => m.matcher === HOOK_MATCHER,
  );

  const newHookEntry: HookEntry = { type: 'command', command: GATE_COMMAND };

  let updatedMatchers: HookMatcher[];
  if (existingMatcherIndex >= 0) {
    // Add our hook to the existing matcher's hooks list.
    updatedMatchers = existing.map((m, i) =>
      i === existingMatcherIndex
        ? { ...m, hooks: [...m.hooks, newHookEntry] }
        : m,
    );
  } else {
    // Create a new matcher block.
    updatedMatchers = [
      ...existing,
      { matcher: HOOK_MATCHER, hooks: [newHookEntry] },
    ];
  }

  return {
    ...settings,
    hooks: {
      ...settings.hooks,
      PreToolUse: updatedMatchers,
    },
  };
}

export function installHook(opts: { dryRun: boolean }): InstallHookResult {
  const settings = readSettings(HOOK_CONFIG_PATH);
  const alreadyPresent = gateCommandAlreadyPresent(settings);

  // Check if a project-local settings file exists — we won't touch it.
  const projectSettingsPath = path.join(
    process.cwd(),
    '.claude',
    'settings.json',
  );
  const projectFileNote =
    fs.existsSync(projectSettingsPath)
      ? `Note: a project-local ${projectSettingsPath} exists. ` +
        'The gate hook was added to your global ~/.claude/settings.json only. ' +
        'If you want the gate in this project too, add the same hook block there.'
      : null;

  if (alreadyPresent) {
    return {
      hookConfigPath: HOOK_CONFIG_PATH,
      alreadyPresent: true,
      projectFileNote,
    };
  }

  const updated = mergeHook(settings);
  const dryRunDiff = JSON.stringify(
    { hooks: { PreToolUse: updated.hooks?.PreToolUse } },
    null,
    2,
  );

  if (!opts.dryRun) {
    writeSettings(HOOK_CONFIG_PATH, updated);
  }

  return {
    hookConfigPath: HOOK_CONFIG_PATH,
    alreadyPresent: false,
    projectFileNote,
    dryRunDiff,
  };
}
