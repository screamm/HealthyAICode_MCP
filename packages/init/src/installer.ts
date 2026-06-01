/**
 * Core installer orchestrator for @healthy-ai-code/init.
 *
 * Steps performed (in order):
 *   1. Emit install-start telemetry event.
 *   2. Register MCP server in the detected harness config.
 *   3. Install PreToolUse gate hook in ~/.claude/settings.json.
 *   4. Run first health score on up to 5 source files in cwd.
 *   5. Emit first-score telemetry event.
 *   6. Emit install-complete telemetry event.
 *   7. Print summary to stdout.
 *
 * Telemetry is content-free (see telemetry.ts for full field list).
 * Dry-run mode performs no filesystem writes and does not emit real events.
 */

import {
  type TelemetryPrefs,
  type TelemetryPayload,
  emitEvent,
  newSessionId,
  readPrefs,
  writePrefs,
  describeEventShape,
} from './telemetry';
import { registerMcp, type HarnessSlug } from './steps/register-mcp';
import { installHook } from './steps/install-hook';
import { runFirstScore } from './steps/first-score';

const TOOL_VERSION = '0.1.0';

export interface InstallerOptions {
  dryRun: boolean;
  /** If false, skip the opt-in prompt and decline telemetry. */
  telemetryEnabled: boolean;
  /** Override cwd for first-score step (useful in tests). */
  cwd?: string;
  /** Emit progress messages here (default: process.stdout). */
  log?: (msg: string) => void;
}

export interface InstallerResult {
  harnessSlug: HarnessSlug | 'unknown';
  mcpConfigPath: string | null;
  hookConfigPath: string;
  firstScoreAverageBand: 'green' | 'yellow' | 'red';
  elapsedMs: number;
}

function log(fn: ((msg: string) => void) | undefined, msg: string): void {
  if (fn) {
    fn(msg);
  } else {
    process.stdout.write(msg + '\n');
  }
}

/** Emits a banner with the described telemetry event shape (dry-run). */
function printTelemetryShape(fn: ((msg: string) => void) | undefined): void {
  log(fn, '\n[DRY-RUN] Telemetry event shape (what would be sent — no real network call):');
  log(fn, JSON.stringify(describeEventShape('install-start'), null, 2));
  log(fn, '\nNote: "first-score" event adds scoreBucket + scoreBand.');
  log(fn, 'Note: "install-error" event adds errorClass (class name only, never message text).');
  log(fn, 'Note: installId is a random UUID generated at first install, not tied to identity.\n');
}

async function ensurePrefs(opts: InstallerOptions): Promise<TelemetryPrefs> {
  if (!opts.telemetryEnabled || opts.dryRun) {
    return { optedIn: false, installId: newSessionId() };
  }

  const existing = readPrefs();
  if (existing !== null) return existing;

  // First run: ask for opt-in (only when stdout is a TTY).
  if (process.stdout.isTTY) {
    log(opts.log, '\nHealthy AI Code would like to send anonymous, content-free telemetry');
    log(opts.log, '(install events and first-score band only — no code, paths, or PII).');
    log(opts.log, 'Run with --no-telemetry to decline without being asked.');
    log(opts.log, 'Opting in now (you can opt out later by editing ~/.healthy-ai-code/telemetry.json).\n');
  }

  const prefs: TelemetryPrefs = { optedIn: true, installId: newSessionId() };
  writePrefs(prefs);
  return prefs;
}

export async function runInstaller(opts: InstallerOptions): Promise<InstallerResult> {
  const installStart = Date.now();
  const sessionId = newSessionId();

  const logFn = opts.log;

  log(logFn, '\n  Healthy AI Code — installer\n');

  if (opts.dryRun) {
    log(logFn, '  [DRY-RUN] No files will be modified.\n');
    printTelemetryShape(logFn);
  }

  const prefs = await ensurePrefs(opts);

  function emit(event: TelemetryPayload['event'], extras: Partial<TelemetryPayload> = {}): void {
    emitEvent(
      {
        sessionId,
        event,
        toolVersion: TOOL_VERSION,
        nodeVersion: process.version,
        platform: process.platform,
        harnessSlug: 'unknown',
        elapsedMs: Date.now() - installStart,
        ...extras,
      },
      prefs,
    );
  }

  emit('install-start');

  // ── Step 1: Register MCP server ───────────────────────────────────────────
  log(logFn, '  [1/3] Registering MCP server...');
  let harnessSlug: HarnessSlug | 'unknown' = 'unknown';
  let mcpConfigPath: string | null = null;

  try {
    const mcpResult = registerMcp({ dryRun: opts.dryRun });
    harnessSlug = mcpResult.harnessSlug;
    mcpConfigPath = mcpResult.configPath;

    if (mcpResult.harnessSlug === 'unknown') {
      log(logFn, '      No supported harness detected. Manual setup required:');
      log(logFn, '      ' + (mcpResult.dryRunDiff ?? ''));
    } else if (mcpResult.alreadyPresent) {
      log(logFn, `      Already registered in ${mcpResult.configPath} (no change).`);
    } else if (opts.dryRun) {
      log(logFn, `      [DRY-RUN] Would write to ${mcpResult.configPath}:`);
      log(logFn, mcpResult.dryRunDiff ?? '');
    } else {
      log(logFn, `      Registered in ${mcpResult.configPath}`);
    }
    emit('mcp-registered', { harnessSlug: mcpResult.harnessSlug });
  } catch (err) {
    const errorClass = err instanceof Error ? err.constructor.name : 'UnknownError';
    emit('install-error', { errorClass });
    log(logFn, `      Failed to register MCP server: ${errorClass}`);
  }

  // ── Step 2: Install PreToolUse gate hook ──────────────────────────────────
  log(logFn, '  [2/3] Installing PreToolUse gate hook...');
  let hookConfigPath = '';

  try {
    const hookResult = installHook({ dryRun: opts.dryRun });
    hookConfigPath = hookResult.hookConfigPath;

    if (hookResult.alreadyPresent) {
      log(logFn, `      Gate hook already present in ${hookResult.hookConfigPath} (no change).`);
    } else if (opts.dryRun) {
      log(logFn, `      [DRY-RUN] Would add hook block to ${hookResult.hookConfigPath}:`);
      log(logFn, hookResult.dryRunDiff ?? '');
    } else {
      log(logFn, `      Gate hook installed in ${hookResult.hookConfigPath}`);
    }

    if (hookResult.projectFileNote) {
      log(logFn, '      ' + hookResult.projectFileNote);
    }

    emit('hook-installed', { harnessSlug });
  } catch (err) {
    const errorClass = err instanceof Error ? err.constructor.name : 'UnknownError';
    emit('install-error', { errorClass, harnessSlug });
    log(logFn, `      Failed to install hook: ${errorClass}`);
  }

  // ── Step 3: First health score ────────────────────────────────────────────
  log(logFn, '  [3/3] Running first health score...');

  const scoreResult = await runFirstScore({ cwd: opts.cwd });

  if (scoreResult.files.length === 0) {
    log(logFn, '      No source files found in current directory. Skipping score.');
  } else {
    for (const f of scoreResult.files) {
      const icon = f.category === 'green' ? 'v' : f.category === 'yellow' ? '~' : 'x';
      log(
        logFn,
        `      [${icon}] ${f.relativePath}  score=${f.score.toFixed(1)}  smells=${f.smellCount}`,
      );
    }
    log(
      logFn,
      `\n      Average score: ${scoreResult.averageScore.toFixed(1)} (${scoreResult.overallBand})` +
        `  — ${scoreResult.files.length}/${scoreResult.totalFound} files scored` +
        `  [${scoreResult.elapsedMs} ms]`,
    );
  }

  emit('first-score', {
    harnessSlug,
    scoreBucket: Math.floor(scoreResult.averageScore),
    scoreBand: scoreResult.overallBand,
  });

  // ── Done ─────────────────────────────────────────────────────────────────
  const totalMs = Date.now() - installStart;
  emit('install-complete', { harnessSlug, elapsedMs: totalMs });

  log(logFn, `\n  Done in ${totalMs} ms.\n`);

  if (!opts.dryRun) {
    log(logFn, '  Next steps:');
    log(logFn, '    1. Restart your AI coding assistant to pick up the new MCP server.');
    log(logFn, '    2. Ask Claude: "Run code_health_review on this file."');
    log(logFn, '    3. The gate hook will block edits that worsen health below 7.0.\n');
  }

  return {
    harnessSlug,
    mcpConfigPath,
    hookConfigPath,
    firstScoreAverageBand: scoreResult.overallBand,
    elapsedMs: totalMs,
  };
}
