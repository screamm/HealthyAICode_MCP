/**
 * semgrep-prepass.ts — Sprint 53
 *
 * Runs `semgrep --autofix` as a cheap pre-pass before the LLM refactoring loop.
 * The pre-pass eliminates straightforward smells (MagicNumber, trivial security
 * issues, etc.) so that fewer issues remain for the more expensive LLM phase.
 *
 * Exit-code semantics (semgrep scan):
 *   0  — no findings (nothing to fix)
 *   1  — findings present (fixes may have been applied when --autofix is used)
 *   2  — fatal error (bad config, missing file, network failure, etc.)
 *
 * The pre-pass modifies the file **in place** when `--autofix` is used.
 * Callers are responsible for reading the updated file content after the call.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import type { Language } from '../types';

const execFileAsync = promisify(execFile);

/** Result returned by `runSemgrepPrepass`. */
export interface SemgrepResult {
  /** True when semgrep ran and applied at least one autofix. */
  applied: boolean;
  /** Number of findings that semgrep reported (fixes applied = findings, roughly). */
  fixCount: number;
  /** Set when semgrep is unavailable or exits with a fatal error code (≥2). */
  error?: string;
}

/** Cached availability result (undefined = not yet checked). */
let _semgrepAvailable: boolean | undefined;

/**
 * Returns true if the `semgrep` binary is reachable and reports a version.
 * Result is cached for the process lifetime.
 */
export async function canUseSemgrep(): Promise<boolean> {
  if (_semgrepAvailable !== undefined) return _semgrepAvailable;
  try {
    const { stdout } = await execFileAsync('semgrep', ['--version'], { timeout: 10_000 });
    _semgrepAvailable = /\d+\.\d+/.test(stdout);
  } catch {
    _semgrepAvailable = false;
  }
  return _semgrepAvailable;
}

/**
 * Languages for which semgrep `--config=auto` has meaningful autofix rules.
 * Other languages are passed through without running semgrep.
 */
const SEMGREP_SUPPORTED_LANGUAGES = new Set<Language>([
  'python',
  'javascript',
  'typescript',
  'java',
  'go',
  'ruby',
  'php',
  'csharp',
  'kotlin',
  'rust',
]);

/**
 * Runs semgrep --autofix on `filePath` as a pre-pass.
 *
 * @param filePath   Absolute path to the file to fix (modified in place).
 * @param language   Language of the file (used to gate semgrep invocation).
 * @param configPath Optional path to a local semgrep rule set. Defaults to
 *                   `auto` (downloads rules from semgrep.dev on first run).
 */
export async function runSemgrepPrepass(
  filePath: string,
  language: Language,
  configPath = 'auto',
): Promise<SemgrepResult> {
  if (!SEMGREP_SUPPORTED_LANGUAGES.has(language)) {
    return { applied: false, fixCount: 0 };
  }

  if (!(await canUseSemgrep())) {
    return { applied: false, fixCount: 0 };
  }

  const args = [
    'scan',
    `--config=${configPath}`,
    '--autofix',
    '--quiet',
    '--json',
    filePath,
  ];

  try {
    const { stdout } = await execFileAsync('semgrep', args, {
      timeout: 60_000,
    });
    const fixCount = parseSemgrepFindingCount(stdout);
    return { applied: fixCount > 0, fixCount };
  } catch (err: unknown) {
    const errObj = err as { code?: number; stdout?: string; stderr?: string; message?: string };
    const exitCode = errObj?.code ?? -1;

    if (exitCode === 1) {
      // Exit code 1 = findings present; fixes were applied (stdout has JSON)
      const fixCount = parseSemgrepFindingCount(errObj?.stdout ?? '');
      return { applied: true, fixCount };
    }

    if (exitCode === 2) {
      // Exit code 2 = fatal error
      const errMsg = errObj?.stderr ?? errObj?.message ?? 'semgrep fatal error';
      return { applied: false, fixCount: 0, error: errMsg };
    }

    // Any other unexpected error
    const msg = errObj?.message ?? String(err);
    return { applied: false, fixCount: 0, error: msg };
  }
}

/**
 * Parses the `results` array length from semgrep JSON output.
 * Returns 0 if the output is empty or malformed.
 */
function parseSemgrepFindingCount(jsonOutput: string): number {
  if (!jsonOutput.trim()) return 0;
  try {
    const parsed = JSON.parse(jsonOutput) as { results?: unknown[] };
    return Array.isArray(parsed.results) ? parsed.results.length : 0;
  } catch {
    return 0;
  }
}

/** Exposed for tests — resets the cached availability flag. */
export function _resetSemgrepCache(): void {
  _semgrepAvailable = undefined;
}
