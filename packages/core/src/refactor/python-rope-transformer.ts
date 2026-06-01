/**
 * Python ExtractMethod transformer (Sprint 53).
 *
 * Shells out to a Python interpreter and drives `rope.refactor.extract.ExtractMethod`
 * via a small generated script. The health scorer already identifies the target method
 * (ComplexMethod / BrainMethod) with start/end lines; the caller converts those to byte
 * offsets and this module performs the deterministic extract, returning the unified diff
 * produced by rope's `changes.get_description()`.
 *
 * Runtime isolation: the MCP server is Node/TypeScript and rope is a Python package, so
 * the transformation runs in a subprocess. A missing interpreter or a missing `rope`
 * package never throws — every entry point reports tool-unavailability gracefully.
 */

import { execFile } from 'node:child_process';

/** Result of a rope ExtractMethod transformation. */
export interface RopeTransformResult {
  success: boolean;
  /** Unified diff (rope `changes.get_description()` output), empty on failure. */
  diff: string;
  /** Human-readable reason when `success` is false. */
  error?: string;
}

/**
 * Candidate interpreters, in priority order. Override the first candidate with the
 * `HEALTHY_AI_PYTHON` environment variable (e.g. a venv interpreter that has rope).
 */
function pythonCandidates(): string[] {
  const override = process.env.HEALTHY_AI_PYTHON?.trim();
  // An explicit override is authoritative — do not silently fall back to PATH interpreters.
  if (override && override.length > 0) return [override];
  // `python` first: on Windows the launcher-installed 3.x typically carries site-packages.
  return ['python', 'python3'];
}

interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  spawnError?: NodeJS.ErrnoException;
}

/** Runs an executable without ever rejecting; failures are reported in the result. */
function runProcess(file: string, args: string[]): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: number }) | null;
        const spawnError = e && typeof e.code === 'string' ? e : undefined;
        const exitCode =
          e && typeof e.code === 'number'
            ? e.code
            : spawnError
              ? null
              : 0;
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
 * Resolves the first Python interpreter that can `import rope`. Returns `null` when no
 * candidate satisfies the check (interpreter missing or rope not installed).
 */
async function resolveRopeInterpreter(): Promise<string | null> {
  for (const candidate of pythonCandidates()) {
    const res = await runProcess(candidate, ['-c', 'import rope']);
    if (res.code === 0) return candidate;
  }
  return null;
}

/**
 * Returns true when a usable Python interpreter with the `rope` package is available.
 * Never throws.
 */
export async function canUseRope(): Promise<boolean> {
  return (await resolveRopeInterpreter()) !== null;
}

/**
 * Generated Python driver. Reads the source file, builds an in-memory rope project, runs
 * ExtractMethod over [start_offset, end_offset), and prints the unified diff to stdout.
 * On any rope error it prints a `ROPE_ERROR:` line to stderr and exits non-zero.
 */
const ROPE_DRIVER = `
import sys, os, json, tempfile, shutil
try:
    from rope.base.project import Project
    from rope.refactor.extract import ExtractMethod
except Exception as exc:
    sys.stderr.write("ROPE_IMPORT_ERROR:" + str(exc))
    sys.exit(3)

def main():
    payload = json.loads(sys.stdin.read())
    src = open(payload["file"], "r", encoding="utf-8").read()
    start = int(payload["start"])
    end = int(payload["end"])
    name = payload["name"]
    workdir = tempfile.mkdtemp()
    try:
        module_path = os.path.join(workdir, "module_under_refactor.py")
        with open(module_path, "w", encoding="utf-8") as fh:
            fh.write(src)
        project = Project(workdir, ropefolder=None)
        try:
            resource = project.get_resource("module_under_refactor.py")
            extractor = ExtractMethod(project, resource, start, end)
            changes = extractor.get_changes(name)
            sys.stdout.write(changes.get_description())
        finally:
            project.close()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

try:
    main()
except Exception as exc:
    sys.stderr.write("ROPE_ERROR:" + str(exc))
    sys.exit(4)
`;

/**
 * Runs rope's ExtractMethod on the file region [startOffset, endOffset) (0-based byte
 * offsets into the file's UTF-8 source) and returns the resulting unified diff.
 *
 * @param filePath     Absolute path to the Python file on disk.
 * @param startOffset  0-based start offset of the region to extract.
 * @param endOffset    Exclusive end offset of the region to extract.
 * @param newName      Name for the extracted method (default `extracted_method`).
 */
export async function applyRopeExtractMethod(
  filePath: string,
  startOffset: number,
  endOffset: number,
  newName = 'extracted_method',
): Promise<RopeTransformResult> {
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || startOffset < 0) {
    return { success: false, diff: '', error: 'Invalid offset arguments' };
  }
  if (endOffset <= startOffset) {
    return { success: false, diff: '', error: 'endOffset must be greater than startOffset' };
  }

  const interpreter = await resolveRopeInterpreter();
  if (interpreter === null) {
    return {
      success: false,
      diff: '',
      error:
        'rope unavailable: no Python interpreter with the `rope` package found ' +
        '(set HEALTHY_AI_PYTHON to a suitable interpreter)',
    };
  }

  const payload = JSON.stringify({
    file: filePath,
    start: startOffset,
    end: endOffset,
    name: newName,
  });

  const res = await runScriptWithStdin(interpreter, ['-c', ROPE_DRIVER], payload);
  if (res.spawnError) {
    return { success: false, diff: '', error: `rope unavailable: ${res.spawnError.code}` };
  }
  if (res.code !== 0) {
    const detail = (res.stderr || res.stdout).trim() || `exit code ${res.code}`;
    return { success: false, diff: '', error: `rope ExtractMethod failed: ${detail}` };
  }
  const diff = res.stdout.trim();
  if (diff.length === 0) {
    return { success: false, diff: '', error: 'rope produced an empty diff' };
  }
  return { success: true, diff: res.stdout };
}

/** Runs an executable, feeding `stdin`, without ever rejecting. */
function runScriptWithStdin(
  file: string,
  args: string[],
  stdin: string,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      file,
      args,
      { maxBuffer: 16 * 1024 * 1024, windowsHide: true },
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
    if (child.stdin) {
      child.stdin.end(stdin);
    }
  });
}
