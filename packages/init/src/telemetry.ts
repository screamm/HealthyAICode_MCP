/**
 * Content-free funnel telemetry for @healthy-ai-code/init.
 *
 * What is captured:
 *   - event name (e.g. "install", "first-score")
 *   - tool version
 *   - node version
 *   - platform (win32 / linux / darwin)
 *   - anonymous install ID (random UUID, not tied to user/machine identity)
 *   - elapsed time in milliseconds (step timing only)
 *   - detected harness slug (e.g. "claude-code", "cursor", "unknown") — no path
 *   - first-score band (e.g. "green", "yellow", "red") and score integer bucket
 *     (floor to nearest integer, so never the exact score — no code structure)
 *
 * What is NEVER captured:
 *   - file paths, file names, or directory layouts
 *   - source code, file contents, or any code structure
 *   - repository URL or project name
 *   - OS username, hostname, or any PII
 *   - environment variables
 *   - actual health smells or biomarker details
 *
 * Default: opt-in on first run (user is asked; choice is persisted in
 *   ~/.healthy-ai-code/telemetry.json). Pass --no-telemetry to decline
 *   without being asked. Existing opt-out is always respected.
 *
 * Endpoint: https://telemetry.healthy-ai-code.dev/v1/events (POST JSON, fire-and-forget).
 * If the endpoint is unreachable the error is silently swallowed — telemetry
 * must never block or slow down the installer.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const TELEMETRY_ENDPOINT = 'https://telemetry.healthy-ai-code.dev/v1/events';
const PREFS_FILE = path.join(os.homedir(), '.healthy-ai-code', 'telemetry.json');

export type TelemetryEvent =
  | 'install-start'
  | 'mcp-registered'
  | 'hook-installed'
  | 'first-score'
  | 'install-complete'
  | 'install-error';

export interface TelemetryPayload {
  /** Always the same across calls for one install session, changes each run. */
  sessionId: string;
  event: TelemetryEvent;
  toolVersion: string;
  nodeVersion: string;
  platform: string;
  /** e.g. "claude-code" | "cursor" | "unknown" */
  harnessSlug: string;
  /** Milliseconds elapsed since install-start */
  elapsedMs: number;
  /** Only present on "first-score" event. Floor of score, never exact float. */
  scoreBucket?: number;
  /** Only present on "first-score" event. "green" | "yellow" | "red" */
  scoreBand?: string;
  /** Only present on "install-error" event. Error class name, no message. */
  errorClass?: string;
}

export interface TelemetryPrefs {
  optedIn: boolean;
  installId: string;
}

/** Reads persisted telemetry prefs; returns null when the file does not exist. */
export function readPrefs(): TelemetryPrefs | null {
  try {
    const raw = fs.readFileSync(PREFS_FILE, 'utf-8');
    return JSON.parse(raw) as TelemetryPrefs;
  } catch {
    return null;
  }
}

/** Persists telemetry prefs to ~/.healthy-ai-code/telemetry.json. */
export function writePrefs(prefs: TelemetryPrefs): void {
  try {
    fs.mkdirSync(path.dirname(PREFS_FILE), { recursive: true });
    fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), 'utf-8');
  } catch {
    // Non-fatal: if we can't write prefs we'll ask again next run.
  }
}

/** Generates a random session ID (UUID v4). Not tied to any identity. */
export function newSessionId(): string {
  return crypto.randomUUID();
}

/**
 * Fires a telemetry event, fire-and-forget.
 * Returns immediately; never throws; silently drops the event on network error.
 */
export function emitEvent(
  payload: TelemetryPayload,
  prefs: TelemetryPrefs,
): void {
  if (!prefs.optedIn) return;

  // Use the Node.js built-in `fetch` (available since Node 18).
  // We intentionally do not await — install flow must not block on telemetry.
  void sendEventAsync(payload, prefs.installId);
}

async function sendEventAsync(
  payload: TelemetryPayload,
  installId: string,
): Promise<void> {
  try {
    const body = JSON.stringify({ installId, ...payload });
    await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Network unreachable, endpoint down, or timeout — silently swallow.
  }
}

/**
 * Returns the "shape" of a telemetry event as plain JSON — used in dry-run
 * mode to show users exactly what would be sent without sending anything.
 */
export function describeEventShape(event: TelemetryEvent): object {
  return {
    installId: '<random-uuid-per-install>',
    sessionId: '<random-uuid-per-run>',
    event,
    toolVersion: '<semver>',
    nodeVersion: '<node-version>',
    platform: '<win32|linux|darwin>',
    harnessSlug: '<claude-code|cursor|unknown>',
    elapsedMs: '<ms-since-install-start>',
    // first-score only:
    scoreBucket: '<floor(score)  -- integer, never exact float>',
    scoreBand: '<green|yellow|red>',
    // install-error only:
    errorClass: '<ErrorClassName -- no message text>',
    // Fields that are NEVER present:
    _omitted: [
      'filePaths',
      'sourceCode',
      'repoUrl',
      'projectName',
      'username',
      'hostname',
      'envVars',
      'smellDetails',
    ],
  };
}
