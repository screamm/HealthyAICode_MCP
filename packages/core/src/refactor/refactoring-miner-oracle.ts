/**
 * RefactoringMiner behavior-preservation oracle (Caveat 2c).
 *
 * RefactoringMiner (https://github.com/tsantalis/RefactoringMiner) is a Java AST-diff tool
 * that classifies the refactorings between two revisions of a Java code base with very high
 * precision/recall (F1 ≈ 99.7% on its Oracle dataset). We use it as an independent oracle to
 * confirm that an `applyAutoRefactor` transform produced the *intended* refactoring type
 * (e.g. Extract Method) and nothing unintended — i.e. that the change is behavior-preserving
 * in the structural sense RefactoringMiner verifies.
 *
 * RefactoringMiner is **Java-only** and its detection CLI operates on git commits, not loose
 * files. This module therefore exposes two entry points:
 *
 *   - {@link verifyRefactoringBetweenCommits} — run on an existing repo + two commit SHAs.
 *   - {@link verifyRefactoringBetweenFileVersions} — build a throwaway 2-commit git repo from
 *     a "before" and "after" source string, then run the commit-range detector on it.
 *
 * Runtime isolation: the MCP server is Node/TypeScript; RefactoringMiner is a Java program
 * shipped as a distribution zip. The transformation runs in a subprocess via `java`/the
 * launcher script. A missing launcher or a missing JRE never throws — every entry point
 * reports tool-unavailability gracefully (mirrors python-rope-transformer / go-gopls).
 *
 * Vendoring: the ~157 MB distribution is fetched on demand into `tools/refactoringminer/`
 * (gitignored). Override the launcher location with the `HEALTHY_AI_REFACTORING_MINER`
 * environment variable. See docs/refactoring-miner-oracle.md for the fetch command.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** A single refactoring instance as reported by RefactoringMiner's JSON output. */
export interface DetectedRefactoring {
  /** Refactoring type, e.g. "Extract Method", "Rename Variable". */
  type: string;
  /** Human-readable description from RefactoringMiner. */
  description: string;
}

/** Result of an oracle verification run. */
export interface OracleResult {
  /** True only when the tool ran AND the expected refactoring type was detected. */
  verified: boolean;
  /** Every refactoring RefactoringMiner detected between the two revisions. */
  detected: DetectedRefactoring[];
  /**
   * True when a refactoring whose type/description did not match the expected type was
   * present. Callers can use this to flag "intended refactoring happened, but additional
   * unintended structural changes were also detected".
   */
  unexpectedChanges: boolean;
  /** Human-readable reason when {@link verified} is false (tool error or no match). */
  error?: string;
}

/** Fully-qualified RefactoringMiner CLI entry-point class. */
const RM_MAIN_CLASS = 'org.refactoringminer.RefactoringMiner';

/** Pinned distribution version (see docs/refactoring-miner-oracle.md). */
const RM_VERSION = '3.1.4';

/**
 * Default `lib/` directory inside the vendored distribution, which holds the main jar plus
 * all transitive dependency jars. We run RefactoringMiner via `java -cp "<libDir>/*"` rather
 * than the shipped `.bat`/shell launcher: the launcher cannot be spawned reliably on Windows
 * when the install path contains spaces (cmd.exe re-splits the path), whereas the JVM expands
 * the `<dir>/*` classpath wildcard itself, sidestepping all shell-quoting issues.
 *
 * Source layout: this file compiles to `dist/refactor/`; four `..` reach the repo root.
 */
const VENDOR_LIB_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'tools',
  'refactoringminer',
  `RefactoringMiner-${RM_VERSION}`,
  'lib',
);

/**
 * Resolves the RefactoringMiner `lib/` directory (env override → vendored default).
 * Set `HEALTHY_AI_REFACTORING_MINER` to the absolute path of an alternative `lib/` directory.
 */
export function refactoringMinerLibDir(): string {
  const override = process.env.HEALTHY_AI_REFACTORING_MINER?.trim();
  return override && override.length > 0 ? override : VENDOR_LIB_DIR;
}

/** Resolves the `java` executable (env override → PATH). */
function javaExecutable(): string {
  const override = process.env.HEALTHY_AI_JAVA?.trim();
  return override && override.length > 0 ? override : 'java';
}

/**
 * Backwards-compatible accessor returning a human-readable description of how the oracle is
 * invoked (used in diagnostics/error messages).
 */
export function refactoringMinerLauncher(): string {
  return `${javaExecutable()} -cp "${path.join(refactoringMinerLibDir(), '*')}" ${RM_MAIN_CLASS}`;
}

interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  spawnError?: NodeJS.ErrnoException;
}

/** Runs an executable without ever rejecting; failures are reported in the result. */
function runProcess(file: string, args: string[], cwd?: string): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        cwd,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        timeout: 120_000,
      },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number }) | null;
        const spawnError = e && typeof e.code === 'string' ? e : undefined;
        const exitCode =
          e && typeof e.code === 'number' ? e.code : spawnError ? null : 0;
        resolve({
          code: exitCode,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          spawnError: spawnError as NodeJS.ErrnoException | undefined,
        });
      },
    );
  });
}

/**
 * Runs RefactoringMiner with the given CLI args via `java -cp "<libDir>/*" <mainClass> ...`.
 * The JVM expands the classpath wildcard, so no shell is involved. Never rejects.
 */
function runRefactoringMiner(args: string[]): Promise<ExecResult> {
  const classpath = path.join(refactoringMinerLibDir(), '*');
  return runProcess(javaExecutable(), ['-cp', classpath, RM_MAIN_CLASS, ...args]);
}

/**
 * Returns true when RefactoringMiner responds to `-h`. Never throws.
 * A missing JRE, a missing/empty lib directory, or a bad classpath all report false.
 */
export async function canUseRefactoringMiner(): Promise<boolean> {
  const res = await runRefactoringMiner(['-h']);
  // `-h` exits 0 and prints the usage banner (which contains the "Show options" line).
  return res.code === 0 && !res.spawnError && res.stdout.includes('Show options');
}

/** Parses RefactoringMiner JSON output into a flat list of detected refactorings. */
function parseRefactorings(json: string): DetectedRefactoring[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const commits = (parsed as { commits?: unknown }).commits;
  if (!Array.isArray(commits)) return [];
  const out: DetectedRefactoring[] = [];
  for (const commit of commits) {
    const refs = (commit as { refactorings?: unknown }).refactorings;
    if (!Array.isArray(refs)) continue;
    for (const r of refs) {
      const type = (r as { type?: unknown }).type;
      const description = (r as { description?: unknown }).description;
      if (typeof type === 'string') {
        out.push({
          type,
          description: typeof description === 'string' ? description : '',
        });
      }
    }
  }
  return out;
}

/**
 * Builds an OracleResult from a detected-refactoring list and an expected type.
 * `verified` requires at least one detected refactoring whose type equals `expectedType`
 * (case-insensitive). `unexpectedChanges` is true when any detected refactoring's type is
 * NOT the expected type — surfacing co-occurring structural changes for the caller to judge.
 */
function evaluate(
  detected: DetectedRefactoring[],
  expectedType: string,
): OracleResult {
  const wanted = expectedType.trim().toLowerCase();
  const matched = detected.some((r) => r.type.trim().toLowerCase() === wanted);
  const unexpectedChanges = detected.some(
    (r) => r.type.trim().toLowerCase() !== wanted,
  );
  if (matched) {
    return { verified: true, detected, unexpectedChanges };
  }
  return {
    verified: false,
    detected,
    unexpectedChanges,
    error:
      detected.length === 0
        ? `no refactorings detected (expected "${expectedType}")`
        : `expected "${expectedType}" not detected; found: ` +
          detected.map((r) => r.type).join(', '),
  };
}

/**
 * Runs RefactoringMiner over a commit range of an existing git repo and verifies that the
 * expected refactoring type was detected.
 *
 * @param repoPath     Absolute path to the git repository working tree.
 * @param startCommit  SHA of the "before" commit.
 * @param endCommit    SHA of the "after" commit.
 * @param expectedType Refactoring type to require, e.g. "Extract Method".
 */
export async function verifyRefactoringBetweenCommits(
  repoPath: string,
  startCommit: string,
  endCommit: string,
  expectedType: string,
): Promise<OracleResult> {
  if (!startCommit || !endCommit) {
    return {
      verified: false,
      detected: [],
      unexpectedChanges: false,
      error: 'both startCommit and endCommit are required',
    };
  }

  const jsonOut = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), 'rm-oracle-')),
    'out.json',
  );

  const res = await runRefactoringMiner([
    '-bc',
    repoPath,
    startCommit,
    endCommit,
    '-json',
    jsonOut,
  ]);

  if (res.spawnError) {
    return {
      verified: false,
      detected: [],
      unexpectedChanges: false,
      error:
        `RefactoringMiner unavailable: ${res.spawnError.code} ` +
        `(invocation: ${refactoringMinerLauncher()})`,
    };
  }
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout).trim().slice(0, 500) || `exit ${res.code}`;
    return {
      verified: false,
      detected: [],
      unexpectedChanges: false,
      error: `RefactoringMiner failed: ${detail}`,
    };
  }

  let raw = '';
  try {
    raw = await fs.readFile(jsonOut, 'utf8');
  } catch {
    return {
      verified: false,
      detected: [],
      unexpectedChanges: false,
      error: 'RefactoringMiner produced no JSON output file',
    };
  } finally {
    await fs.rm(path.dirname(jsonOut), { recursive: true, force: true });
  }

  return evaluate(parseRefactorings(raw), expectedType);
}

/** Runs `git` in `cwd`, never rejecting. */
function git(cwd: string, args: string[]): Promise<ExecResult> {
  return runProcess('git', args.length ? ['-C', cwd, ...args] : args, cwd);
}

/**
 * Verifies an Extract-Method-style transform from two source strings of the SAME Java file.
 * Builds a throwaway 2-commit git repo (before → after) and runs the commit-range detector.
 *
 * The relative path inside the repo must match the package/class so RefactoringMiner can
 * resolve the type — callers pass the same `relativePath` they would use on disk.
 *
 * @param before       Source of the file at the "before" revision.
 * @param after        Source of the file at the "after" revision.
 * @param relativePath Path of the file within the repo, e.g. "src/Calculator.java".
 * @param expectedType Refactoring type to require, e.g. "Extract Method".
 */
export async function verifyRefactoringBetweenFileVersions(
  before: string,
  after: string,
  relativePath: string,
  expectedType: string,
): Promise<OracleResult> {
  // Fail fast (and cheaply) if the tool is not usable, before touching the filesystem.
  if (!(await canUseRefactoringMiner())) {
    return {
      verified: false,
      detected: [],
      unexpectedChanges: false,
      error:
        'RefactoringMiner unavailable: launcher not found or not runnable ' +
        `(set HEALTHY_AI_REFACTORING_MINER; tried "${refactoringMinerLauncher()}")`,
    };
  }

  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'rm-oracle-repo-'));
  try {
    const filePath = path.join(repo, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let r = await git(repo, ['init', '-q']);
    if (r.code !== 0 && !r.spawnError) {
      return failGit(r, 'git init');
    }
    if (r.spawnError) {
      return {
        verified: false,
        detected: [],
        unexpectedChanges: false,
        error: `git unavailable: ${r.spawnError.code}`,
      };
    }
    // Deterministic identity so commits are reproducible and don't depend on global config.
    await git(repo, ['config', 'user.email', 'oracle@healthy-ai-code.local']);
    await git(repo, ['config', 'user.name', 'oracle']);
    // Disable autocrlf so line endings are stable across platforms.
    await git(repo, ['config', 'core.autocrlf', 'false']);

    await fs.writeFile(filePath, before, 'utf8');
    await git(repo, ['add', '-A']);
    r = await git(repo, ['commit', '-qm', 'before']);
    if (r.code !== 0) return failGit(r, 'git commit (before)');
    const startCommit = (await git(repo, ['rev-parse', 'HEAD'])).stdout.trim();

    await fs.writeFile(filePath, after, 'utf8');
    await git(repo, ['add', '-A']);
    r = await git(repo, ['commit', '-qm', 'after']);
    if (r.code !== 0) return failGit(r, 'git commit (after)');
    const endCommit = (await git(repo, ['rev-parse', 'HEAD'])).stdout.trim();

    return await verifyRefactoringBetweenCommits(
      repo,
      startCommit,
      endCommit,
      expectedType,
    );
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
}

function failGit(res: ExecResult, step: string): OracleResult {
  const detail = (res.stderr || res.stdout).trim().slice(0, 300) || `exit ${res.code}`;
  return {
    verified: false,
    detected: [],
    unexpectedChanges: false,
    error: `${step} failed: ${detail}`,
  };
}
