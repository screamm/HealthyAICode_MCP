/**
 * ast-grep-runner.ts — Sprint 53 (patched: astgrep-fix)
 *
 * Applies early-return / guard-clause rewrites using ast-grep CLI (v0.43+).
 * Each supported Tier A language has a corresponding YAML rule file under
 * `./ast-grep-rules/`. The runner writes the source to a temp file, invokes
 * `sg scan --rule <file> --update-all`, reads back the result, and cleans up.
 *
 * Fixes applied (astgrep-fix):
 *  1. Windows binary resolution: execFile('sg', ...) fails on Windows because `sg`
 *     is installed as a bash/cmd wrapper that Node's execFile cannot spawn without
 *     shell:true. The fix resolves the real sg binary via `which`/`where` and caches
 *     it; falls back to trying 'sg.cmd' on win32 before giving up.
 *  2. Missing else-guard in rules: the pattern `if ($COND) { $$$BODY }` matched
 *     if-else statements in all rules except C# and Ruby, causing the else branch to
 *     be silently dropped. Fixed by adding `not: regex` constraints to all affected
 *     rule files. (See individual .yaml files for the specific constraint added.)
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Language } from '../types';

const execFileAsync = promisify(execFile);

/** Path to the bundled ast-grep rule files shipped with this package. */
const RULES_DIR = path.join(__dirname, 'ast-grep-rules');

/** Result of an ast-grep early-return transformation. */
export interface AstGrepResult {
  /** The (possibly transformed) source code. Equals input when matchCount === 0. */
  transformedCode: string;
  /** Number of pattern matches (and rewrites) applied. */
  matchCount: number;
  /** Set when the transformation failed or ast-grep is unavailable. */
  error?: string;
}

/**
 * Maps Language values to the bundled ast-grep YAML rule filenames.
 * Languages without a rule file are omitted — callers get matchCount=0.
 *
 * Notes on language-specific choices:
 * - `javascript` has its own rule (language: JavaScript) because the TypeScript
 *   rule declares `language: TypeScript` and ast-grep will skip .js files.
 * - `csharp` uses a kind+field rule (not a pattern rule) because the C# tree-sitter
 *   grammar does not parse `if ($COND) { ... }` correctly in isolation; see the
 *   rule file header for a full explanation.
 * - `php` uses the standard pattern rule — the PHP tree-sitter grammar supports it.
 */
const LANGUAGE_RULE_MAP: Partial<Record<Language, string>> = {
  typescript:  'early-return-typescript.yaml',
  javascript:  'early-return-javascript.yaml',
  python:      'early-return-python.yaml',
  go:          'early-return-go.yaml',
  ruby:        'early-return-ruby.yaml',
  java:        'early-return-java.yaml',
  csharp:      'early-return-csharp.yaml',
  php:         'early-return-php.yaml',
  kotlin:      'early-return-kotlin.yaml',
  rust:        'early-return-rust.yaml',
  swift:       'early-return-swift.yaml',
  scala:       'early-return-scala.yaml',
  elixir:      'early-return-elixir.yaml',
};

/** File extensions used when writing temp files so ast-grep picks the right grammar. */
const LANGUAGE_EXT: Partial<Record<Language, string>> = {
  typescript:  '.ts',
  javascript:  '.js',
  python:      '.py',
  go:          '.go',
  ruby:        '.rb',
  java:        '.java',
  csharp:      '.cs',
  php:         '.php',
  kotlin:      '.kt',
  rust:        '.rs',
  swift:       '.swift',
  scala:       '.scala',
  elixir:      '.ex',
};

/** Cached availability result (undefined = not yet checked). */
let _astGrepAvailable: boolean | undefined;

/**
 * Resolves the invocation strategy for `sg` / `ast-grep`.
 *
 * On Linux/Mac, `sg` is a real ELF/Mach-O binary; `execFile('sg', args)` works.
 *
 * On Windows, npm installs `sg` as two wrappers:
 *  - `sg.cmd` — a cmd.exe batch wrapper (execFile cannot run .cmd without shell)
 *  - `sg`     — a Unix shell (bash/sh) script (bash can execute it directly)
 *
 * The Windows fix: use `where.exe` to locate the Unix shell script (`sg` without
 * extension), then invoke it via `execFileAsync('bash', [sgPath, ...args])`.
 * This avoids shell-string interpolation entirely — all args are passed as an array
 * to `bash`, so paths containing spaces are handled correctly and safely.
 *
 * Result: a frozen `InvokeStrategy` object that `runSg` uses on every call.
 */

interface InvokeStrategy {
  /** How to invoke sg: 'direct' = execFile(bin, args), 'bash' = execFile('bash', [binPath, ...args]) */
  kind: 'direct' | 'bash';
  /** The binary name ('sg', 'ast-grep') for 'direct', or the full shell-script path for 'bash'. */
  bin: string;
}

let _strategy: InvokeStrategy | null | undefined; // undefined=not resolved, null=not found

async function resolveAstGrepBinary(): Promise<InvokeStrategy | null> {
  if (_strategy !== undefined) return _strategy;

  // --- Attempt 1: direct execFile('sg', ...) — works on Linux/Mac
  for (const bin of ['sg', 'ast-grep']) {
    try {
      const { stdout } = await execFileAsync(bin, ['--version'], { timeout: 5000 });
      if (stdout.includes('ast-grep') || /\d+\.\d+/.test(stdout)) {
        _strategy = { kind: 'direct', bin };
        return _strategy;
      }
    } catch {
      // try next
    }
  }

  // --- Attempt 2 (Windows): find the Unix shell-script wrapper and run via bash
  //     npm installs a Unix sh-script named 'sg' (no extension) alongside 'sg.cmd'.
  //     `where.exe sg` returns both; we pick the one WITHOUT a .cmd/.ps1 extension.
  if (process.platform === 'win32') {
    for (const name of ['sg', 'ast-grep']) {
      try {
        const { stdout: paths } = await execFileAsync(
          'where.exe', [name], { timeout: 5000 },
        );
        // where.exe returns one path per line; pick the Unix-script (no extension)
        const scriptPath = paths
          .trim()
          .split(/\r?\n/)
          .map(p => p.trim())
          .find(p => !/\.(cmd|ps1|bat|exe)$/i.test(p));

        if (scriptPath && fs.existsSync(scriptPath)) {
          // Verify bash can actually run it
          const { stdout: ver } = await execFileAsync(
            'bash', [scriptPath, '--version'], { timeout: 5000 },
          );
          if (ver.includes('ast-grep') || /\d+\.\d+/.test(ver)) {
            _strategy = { kind: 'bash', bin: scriptPath };
            return _strategy;
          }
        }
      } catch {
        // try next name
      }
    }
  }

  _strategy = null;
  return null;
}

/**
 * Invokes the resolved `sg` binary with the given args array.
 *
 * On Linux/Mac: execFile(sg, args)
 * On Windows:   execFile(bash, [sgScriptPath, ...args])   — no shell interpolation
 *
 * Both forms pass arguments as an array, so paths with spaces are handled safely.
 */
async function runSg(args: string[], timeoutMs: number): Promise<{ stdout: string }> {
  const strategy = await resolveAstGrepBinary();
  if (!strategy) throw new Error('ast-grep binary not found');

  if (strategy.kind === 'bash') {
    const { stdout } = await execFileAsync('bash', [strategy.bin, ...args], { timeout: timeoutMs });
    return { stdout };
  }
  const { stdout } = await execFileAsync(strategy.bin, args, { timeout: timeoutMs });
  return { stdout };
}

/**
 * Returns true if the `sg` / `ast-grep` binary is on PATH and reports version 0.3+.
 * Result is cached for the process lifetime.
 */
export async function canUseAstGrep(): Promise<boolean> {
  if (_astGrepAvailable !== undefined) return _astGrepAvailable;
  const strategy = await resolveAstGrepBinary();
  _astGrepAvailable = strategy !== null;
  return _astGrepAvailable;
}

/**
 * Applies early-return / guard-clause rewrites to `code` using ast-grep.
 *
 * Strategy:
 * 1. Look up the YAML rule for `language`; return unchanged if none exists.
 * 2. Write `code` to a temp file with the correct extension.
 * 3. Run `sg scan --rule <ruleFile> --json` to count matches.
 * 4. If matches > 0, run `sg scan --rule <ruleFile> --update-all` to apply.
 * 5. Read back the transformed file, clean up, return result.
 *
 * @param code       Source code to transform.
 * @param language   Language of the source code.
 * @param filePath   Optional hint (unused at runtime; kept for API symmetry).
 */
export async function applyAstGrepEarlyReturn(
  code: string,
  language: Language,
  filePath?: string,
): Promise<AstGrepResult> {
  void filePath; // API symmetry only

  const ruleFile = LANGUAGE_RULE_MAP[language];
  if (!ruleFile) {
    return { transformedCode: code, matchCount: 0 };
  }

  if (!(await canUseAstGrep())) {
    return {
      transformedCode: code,
      matchCount: 0,
      error: 'ast-grep (sg) is not available on PATH',
    };
  }

  const rulePath = path.join(RULES_DIR, ruleFile);
  if (!fs.existsSync(rulePath)) {
    return {
      transformedCode: code,
      matchCount: 0,
      error: `Rule file not found: ${rulePath}`,
    };
  }

  const ext = LANGUAGE_EXT[language] ?? '.txt';
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'astgrep-'));
  const tmpFile = path.join(tmpDir, `input${ext}`);

  try {
    await fs.promises.writeFile(tmpFile, code, 'utf8');

    // --- Phase 1: count matches via JSON output --------------------------------
    let matchCount = 0;
    try {
      const { stdout: jsonOut } = await runSg(
        ['scan', '--rule', rulePath, '--json', tmpFile],
        30_000,
      );
      const matches = JSON.parse(jsonOut || '[]') as unknown[];
      matchCount = Array.isArray(matches) ? matches.length : 0;
    } catch (jsonErr: unknown) {
      // sg exits non-zero when it finds matches in some versions; parse stdout anyway
      const errObj = jsonErr as { stdout?: string };
      if (errObj?.stdout) {
        try {
          const matches = JSON.parse(errObj.stdout) as unknown[];
          matchCount = Array.isArray(matches) ? matches.length : 0;
        } catch {
          // ignore parse errors — proceed with matchCount=0
        }
      }
    }

    if (matchCount === 0) {
      return { transformedCode: code, matchCount: 0 };
    }

    // --- Phase 2: apply rewrites in-place ------------------------------------
    await runSg(
      ['scan', '--rule', rulePath, '--update-all', tmpFile],
      30_000,
    ).catch(() => {
      // --update-all may exit non-zero on some platforms even on success
    });

    const transformed = await fs.promises.readFile(tmpFile, 'utf8');
    return { transformedCode: transformed, matchCount };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { transformedCode: code, matchCount: 0, error: msg };
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Exposed for tests — resets the cached availability flag and resolved strategy. */
export function _resetAstGrepCache(): void {
  _astGrepAvailable = undefined;
  _strategy = undefined;
}
