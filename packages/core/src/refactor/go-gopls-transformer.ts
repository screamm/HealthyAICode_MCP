/**
 * Go ExtractFunction transformer (Sprint 53).
 *
 * Shells out to `gopls codeaction -exec -kind refactor.extract.function -diff` which takes
 * 0-based byte offsets in the `file.go:#START-#END` form and prints a unified diff to
 * stdout. The health scorer identifies the target function; the caller supplies the byte
 * offsets and this module performs the deterministic extract.
 *
 * gopls requires a valid Go module context: an isolated `.go` fixture without a `go.mod`
 * fails. To make single-file inputs work, this module copies the source into a throwaway
 * temp module (with a minimal `go.mod`) when no enclosing module is found, runs gopls over
 * the copy, and rewrites the diff headers back to the original path.
 *
 * gopls is not on PATH in this environment; it lives at C:\\Users\\david\\go\\bin\\gopls.exe.
 * The default binary path is configurable via the `HEALTHY_AI_GOPLS` environment variable.
 * A missing binary never throws — every entry point reports tool-unavailability gracefully.
 */

import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/** Result of a gopls ExtractFunction transformation. */
export interface GoplsTransformResult {
  success: boolean;
  /** Unified diff from gopls stdout, empty on failure. */
  diff: string;
  /** Human-readable reason when `success` is false. */
  error?: string;
}

const DEFAULT_GOPLS_PATH = 'C:\\Users\\david\\go\\bin\\gopls.exe';

/** Resolves the gopls executable path (env override → documented default). */
function goplsPath(): string {
  const override = process.env.HEALTHY_AI_GOPLS?.trim();
  return override && override.length > 0 ? override : DEFAULT_GOPLS_PATH;
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
      { cwd, maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: 25_000 },
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
 * Returns true when the gopls binary responds to `gopls version`. Never throws.
 */
export async function canUseGopls(): Promise<boolean> {
  const res = await runProcess(goplsPath(), ['version']);
  return res.code === 0 && !res.spawnError;
}

/** Walks up from `dir` looking for an enclosing `go.mod`. Returns the dir or null. */
async function findModuleRoot(dir: string): Promise<string | null> {
  let current = path.resolve(dir);
  // Bound the walk to avoid an unterminated loop on malformed paths.
  for (let depth = 0; depth < 64; depth++) {
    try {
      await fs.access(path.join(current, 'go.mod'));
      return current;
    } catch {
      // No go.mod here; continue upward.
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

/**
 * Runs gopls ExtractFunction on the file region [startOffset, endOffset) (0-based byte
 * offsets) and returns the resulting unified diff.
 *
 * When the file is not inside a Go module, the source is copied into a temporary module so
 * gopls has a valid build context; the resulting diff paths are normalized back to the
 * original `filePath`.
 *
 * @param filePath     Absolute path to the Go file on disk.
 * @param startOffset  0-based start offset of the region to extract.
 * @param endOffset    Exclusive end offset of the region to extract.
 */
export async function applyGoplsExtractFunction(
  filePath: string,
  startOffset: number,
  endOffset: number,
): Promise<GoplsTransformResult> {
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset < 0) {
    return { success: false, diff: '', error: 'Invalid offset arguments' };
  }
  if (endOffset <= startOffset) {
    return { success: false, diff: '', error: 'endOffset must be greater than startOffset' };
  }

  if (!(await canUseGopls())) {
    return {
      success: false,
      diff: '',
      error:
        `gopls unavailable: could not run "${goplsPath()} version" ` +
        '(set HEALTHY_AI_GOPLS to the gopls binary path)',
    };
  }

  const moduleRoot = await findModuleRoot(path.dirname(filePath));
  if (moduleRoot !== null) {
    return runGoplsExtract(filePath, startOffset, endOffset, moduleRoot, filePath);
  }

  // No enclosing module: copy into a throwaway temp module.
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'healthy-ai-gopls-'));
  try {
    const source = await fs.readFile(filePath, 'utf8');
    const tmpFile = path.join(tmpDir, path.basename(filePath));
    await fs.writeFile(tmpFile, source, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'go.mod'), 'module healthyaifixture\n\ngo 1.21\n', 'utf8');
    const result = await runGoplsExtract(tmpFile, startOffset, endOffset, tmpDir, filePath);
    return result;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Invokes gopls and normalizes diff headers from `runPath` back to `displayPath`. */
async function runGoplsExtract(
  runPath: string,
  startOffset: number,
  endOffset: number,
  cwd: string,
  displayPath: string,
): Promise<GoplsTransformResult> {
  const spec = `${runPath}:#${startOffset}-#${endOffset}`;
  const res = await runProcess(
    goplsPath(),
    ['codeaction', '-exec', '-kind', 'refactor.extract.function', '-diff', spec],
    cwd,
  );

  if (res.spawnError) {
    return { success: false, diff: '', error: `gopls unavailable: ${res.spawnError.code}` };
  }
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout).trim() || `exit code ${res.code}`;
    return { success: false, diff: '', error: `gopls ExtractFunction failed: ${detail}` };
  }

  const raw = res.stdout;
  if (raw.trim().length === 0) {
    return { success: false, diff: '', error: 'gopls produced an empty diff' };
  }

  const diff = normalizeDiffPaths(raw, runPath, displayPath);
  return { success: true, diff };
}

/** Rewrites diff header paths that reference the temp copy back to the original file. */
function normalizeDiffPaths(diff: string, runPath: string, displayPath: string): string {
  if (runPath === displayPath) return diff;
  // gopls emits headers like `--- <path>.orig` / `+++ <path>`; replace any occurrence of
  // the temp file path with the original path the caller knows about.
  return diff.split(runPath).join(displayPath);
}
