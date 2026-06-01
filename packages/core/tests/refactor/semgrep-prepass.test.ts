/**
 * semgrep-prepass.test.ts — Sprint 53
 *
 * Tests for the semgrep pre-pass runner.
 *
 * Approach: vi.mock('child_process') at module level so Vitest replaces the
 * entire module with a factory — this works even for non-configurable CJS
 * properties. Each describe block sets up the mock behaviour it needs via
 * vi.mocked(...).mockImplementation() inside beforeEach/it.
 *
 * The real-invocation test at the bottom skips automatically if semgrep is
 * not on PATH.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Must be hoisted above imports — Vitest processes vi.mock() calls before
// module resolution.
vi.mock('child_process', () => {
  return {
    execFile: vi.fn(),
  };
});

import * as childProcess from 'child_process';
import {
  runSemgrepPrepass,
  canUseSemgrep,
  _resetSemgrepCache,
} from '../../src/refactor/semgrep-prepass';

// ---------------------------------------------------------------------------
// Typed mock reference
// ---------------------------------------------------------------------------
const mockExecFile = vi.mocked(childProcess.execFile);

/**
 * Calls `cb` (the 4th positional argument) with either a success result or
 * an error, matching the shape that util.promisify expects.
 */
type ExecFileCb = (
  err: NodeJS.ErrnoException | null,
  result?: { stdout: string; stderr: string },
) => void;

function simulateSuccess(stdout: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: readonly string[], _opts: object, cb: unknown) => {
      (cb as ExecFileCb)(null, { stdout, stderr: '' });
      return undefined as any;
    },
  );
}

function simulateError(err: Error) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: readonly string[], _opts: object, cb: unknown) => {
      (cb as ExecFileCb)(err as NodeJS.ErrnoException);
      return undefined as any;
    },
  );
}

// ---------------------------------------------------------------------------
// canUseSemgrep
// ---------------------------------------------------------------------------

describe('canUseSemgrep', () => {
  beforeEach(() => {
    _resetSemgrepCache();
    vi.clearAllMocks();
  });
  afterEach(() => {
    _resetSemgrepCache();
  });

  it('returns true when semgrep --version succeeds', async () => {
    simulateSuccess('1.164.0\n');
    const result = await canUseSemgrep();
    expect(result).toBe(true);
  });

  it('returns false when semgrep binary is missing (ENOENT)', async () => {
    simulateError(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const result = await canUseSemgrep();
    expect(result).toBe(false);
  });

  it('caches the result — execFile is called only once on repeated calls', async () => {
    simulateSuccess('1.164.0\n');
    await canUseSemgrep();
    await canUseSemgrep();
    // First call: --version; subsequent calls should use cache
    expect(mockExecFile).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// runSemgrepPrepass — exit code 0 (no findings)
// ---------------------------------------------------------------------------

describe('runSemgrepPrepass — exit code 0 (no findings)', () => {
  beforeEach(() => {
    _resetSemgrepCache();
    vi.clearAllMocks();
  });
  afterEach(() => {
    _resetSemgrepCache();
  });

  it('returns applied=false and fixCount=0 when semgrep finds nothing', async () => {
    // First call: --version (canUseSemgrep); second call: scan
    mockExecFile.mockImplementation(
      (_cmd: string, args: readonly string[], _opts: object, cb: unknown) => {
        const argList = args as string[];
        if (argList.includes('--version')) {
          (cb as ExecFileCb)(null, { stdout: '1.164.0\n', stderr: '' });
        } else {
          (cb as ExecFileCb)(null, {
            stdout: JSON.stringify({ results: [], errors: [] }),
            stderr: '',
          });
        }
        return undefined as any;
      },
    );

    const result = await runSemgrepPrepass('/tmp/fake.py', 'python');

    expect(result.applied).toBe(false);
    expect(result.fixCount).toBe(0);
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// runSemgrepPrepass — exit code 1 (findings / fixes applied)
// ---------------------------------------------------------------------------

describe('runSemgrepPrepass — exit code 1 (findings/fixes applied)', () => {
  beforeEach(() => {
    _resetSemgrepCache();
    vi.clearAllMocks();
  });
  afterEach(() => {
    _resetSemgrepCache();
  });

  it('returns applied=true and fixCount > 0 when semgrep exits 1', async () => {
    const findings = JSON.stringify({
      results: [
        { check_id: 'python.lang.security.audit.eval-detected' },
        { check_id: 'python.lang.security.audit.eval-detected' },
      ],
      errors: [],
    });

    mockExecFile.mockImplementation(
      (_cmd: string, args: readonly string[], _opts: object, cb: unknown) => {
        const argList = args as string[];
        if (argList.includes('--version')) {
          (cb as ExecFileCb)(null, { stdout: '1.164.0\n', stderr: '' });
        } else {
          const err = Object.assign(new Error('exit 1'), {
            code: 1,
            stdout: findings,
            stderr: '',
          });
          (cb as ExecFileCb)(err as NodeJS.ErrnoException);
        }
        return undefined as any;
      },
    );

    const result = await runSemgrepPrepass('/tmp/fake.py', 'python');

    expect(result.applied).toBe(true);
    expect(result.fixCount).toBe(2);
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// runSemgrepPrepass — exit code 2 (fatal error)
// ---------------------------------------------------------------------------

describe('runSemgrepPrepass — exit code 2 (fatal error)', () => {
  beforeEach(() => {
    _resetSemgrepCache();
    vi.clearAllMocks();
  });
  afterEach(() => {
    _resetSemgrepCache();
  });

  it('returns applied=false with error message when semgrep exits 2', async () => {
    mockExecFile.mockImplementation(
      (_cmd: string, args: readonly string[], _opts: object, cb: unknown) => {
        const argList = args as string[];
        if (argList.includes('--version')) {
          (cb as ExecFileCb)(null, { stdout: '1.164.0\n', stderr: '' });
        } else {
          const err = Object.assign(new Error('fatal'), {
            code: 2,
            stdout: '',
            stderr: 'Error: invalid config path',
          });
          (cb as ExecFileCb)(err as NodeJS.ErrnoException);
        }
        return undefined as any;
      },
    );

    const result = await runSemgrepPrepass('/tmp/fake.py', 'python');

    expect(result.applied).toBe(false);
    expect(result.fixCount).toBe(0);
    expect(result.error).toMatch(/invalid config/);
  });
});

// ---------------------------------------------------------------------------
// runSemgrepPrepass — semgrep unavailable
// ---------------------------------------------------------------------------

describe('runSemgrepPrepass — semgrep unavailable', () => {
  beforeEach(() => {
    _resetSemgrepCache();
    vi.clearAllMocks();
  });
  afterEach(() => {
    _resetSemgrepCache();
  });

  it('returns applied=false with no error when semgrep is not installed', async () => {
    simulateError(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    const result = await runSemgrepPrepass('/tmp/fake.py', 'python');

    expect(result.applied).toBe(false);
    expect(result.fixCount).toBe(0);
    // Graceful no-op — no error exposed to caller
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// runSemgrepPrepass — unsupported language
// ---------------------------------------------------------------------------

describe('runSemgrepPrepass — unsupported language', () => {
  beforeEach(() => {
    _resetSemgrepCache();
    vi.clearAllMocks();
  });
  afterEach(() => {
    _resetSemgrepCache();
  });

  it('returns applied=false without invoking semgrep scan for lua', async () => {
    // Language guard fires before canUseSemgrep() — no execFile call at all
    const result = await runSemgrepPrepass('/tmp/fake.lua', 'lua');

    expect(result.applied).toBe(false);
    expect(result.fixCount).toBe(0);
    // No execFile call because language is filtered out first
    expect(mockExecFile).toHaveBeenCalledTimes(0);
  });
});

// ---------------------------------------------------------------------------
// runSemgrepPrepass — custom configPath
// ---------------------------------------------------------------------------

describe('runSemgrepPrepass — custom configPath', () => {
  beforeEach(() => {
    _resetSemgrepCache();
    vi.clearAllMocks();
  });
  afterEach(() => {
    _resetSemgrepCache();
  });

  it('passes custom configPath to semgrep scan arguments', async () => {
    const capturedArgs: string[][] = [];

    mockExecFile.mockImplementation(
      (_cmd: string, args: readonly string[], _opts: object, cb: unknown) => {
        const argList = args as string[];
        capturedArgs.push(argList);
        if (argList.includes('--version')) {
          (cb as ExecFileCb)(null, { stdout: '1.164.0\n', stderr: '' });
        } else {
          (cb as ExecFileCb)(null, {
            stdout: JSON.stringify({ results: [], errors: [] }),
            stderr: '',
          });
        }
        return undefined as any;
      },
    );

    await runSemgrepPrepass('/tmp/fake.py', 'python', '/my/local/rules');

    const scanArgs = capturedArgs.find(a => a.includes('scan'));
    expect(scanArgs).toBeDefined();
    expect(scanArgs!.some(a => a === '--config=/my/local/rules')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Real integration test — skips automatically if semgrep is unavailable
// ---------------------------------------------------------------------------

describe('runSemgrepPrepass — real invocation', () => {
  // Use the ACTUAL child_process for real tests — but since we've mocked the
  // module globally, we need to un-mock and re-import. In Vitest this is done
  // by using the real module directly. The simplest approach: restore the real
  // mock to pass through for this block.
  beforeEach(() => {
    _resetSemgrepCache();
    vi.clearAllMocks();
  });
  afterEach(() => {
    _resetSemgrepCache();
  });

  it('runs semgrep on a real Python file without crashing (skips if unavailable)', async () => {
    // Restore real execFile behaviour for this integration test
    const realExecFile = await import('child_process').then(m => m.execFile);

    mockExecFile.mockImplementation(
      (cmd: string, args: readonly string[], opts: object, cb: unknown) => {
        return realExecFile(
          cmd,
          args as string[],
          opts as Parameters<typeof realExecFile>[2],
          cb as Parameters<typeof realExecFile>[3],
        );
      },
    );

    const available = await canUseSemgrep();
    if (!available) {
      console.log('Skipping real semgrep test — semgrep not available');
      return;
    }

    const fs = await import('fs');
    const os = await import('os');
    const path = await import('path');

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'semgrep-test-'));
    const tmpFile = path.join(tmpDir, 'sample.py');
    // Use a known-safe string literal (no actual eval executed here)
    await fs.promises.writeFile(tmpFile, 'x = 1 + 1\nprint(x)\n', 'utf8');

    try {
      const result = await runSemgrepPrepass(tmpFile, 'python');
      expect(typeof result.applied).toBe('boolean');
      expect(typeof result.fixCount).toBe('number');
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
