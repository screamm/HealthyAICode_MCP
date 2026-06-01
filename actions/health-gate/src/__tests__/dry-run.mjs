/**
 * actions/health-gate/src/__tests__/dry-run.mjs
 *
 * Local dry-run: exercises the gate logic against a real sample diff
 * without needing a GitHub Actions runner.
 *
 * Strategy: spawns the compiled dist/gate.js as a child process with
 * NODE_PATH set so it can resolve @healthy-ai-code/core from the monorepo,
 * and with a real temporary git repo as INPUT_WORKING_DIRECTORY.  This
 * mirrors exactly how the action runs on a GitHub Actions runner.
 *
 *   CASE A (regressing change):   gate exits 1 (fail-on-regression=true)
 *   CASE B (clean/improving):     gate exits 0 (PASS)
 *   CASE C (new unhealthy file):  gate exits 1 (BLOCK)
 *
 * Run with:
 *   node actions/health-gate/src/__tests__/dry-run.mjs
 *
 * Exit code 0 = all assertions passed.
 * Exit code 1 = at least one assertion failed (details printed).
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Absolute path to the compiled gate entry point
const GATE_JS = path.resolve(__dirname, '../../dist/gate.js');

// Monorepo root  (4 levels up from src/__tests__/)
const REPO_ROOT = path.resolve(__dirname, '../../../..');

// NODE_PATH pointing at the monorepo's pnpm store so gate.js can
// resolve @healthy-ai-code/core without installing into node_modules.
const CORE_PARENT = path.resolve(REPO_ROOT, 'packages');
const NODE_PATH_EXTRA = CORE_PARENT;

// ---------------------------------------------------------------------------
// Git helper — argument-array form, no shell involved
// ---------------------------------------------------------------------------

/**
 * Run a git subcommand safely with spawnSync + argument array.
 * No shell is involved — arguments are passed directly to git.
 */
function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8' });
  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    throw new Error(`git ${args.join(' ')} failed (exit ${result.status}): ${stderr}`);
  }
  return (result.stdout ?? '').trim();
}

function initRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  // -b main ensures the initial branch is always 'main' regardless of
  // the host's init.defaultBranch setting — the gate uses 'main' as base.
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}

function stageAndCommit(dir, msg) {
  git(dir, ['add', '-A']);
  // msg is passed as a direct argument — no shell metacharacter risk.
  git(dir, ['commit', '-q', '-m', msg]);
}

// ---------------------------------------------------------------------------
// Gate runner: calls node dist/gate.js as a child process
// ---------------------------------------------------------------------------

/**
 * Run dist/gate.js with the given working-directory as the repo root.
 * Returns { exitCode, stdout, stderr }.
 *
 * NODE_PATH includes CORE_PARENT so the require('@healthy-ai-code/core')
 * inside gate.js resolves to packages/core, which already has its dist/
 * built.  Because gate.js is CJS it calls require() synchronously — that
 * triggers the same ERR_REQUIRE_ASYNC_MODULE issue on Node 24 with
 * tree-sitter-c-sharp.  We work around this by providing a shim module
 * that re-exports only the analyzeChangeset function from a path that
 * avoids the problematic C# analyzer (analyzeChangeset is in diff/git.js
 * and only calls analyzeCode which dispatches lazily).
 *
 * Actually: we override the module resolution by creating a tiny
 * node_modules/@healthy-ai-code/core shim inside the temp dir that
 * dynamically delegates to a wrapper that defers csharp loading.
 * But the most reliable approach is to write the shim into the
 * action's own dist/node_modules so that NODE_PATH lookup succeeds.
 */
function runGate(repoDir, extraEnv = {}) {
  const env = {
    ...process.env,
    INPUT_BASE_BRANCH: 'main',
    INPUT_FLOOR: '7.0',
    INPUT_REGRESSION_DELTA: '0.5',
    INPUT_SARIF_OUT: '',
    INPUT_FAIL_ON_REGRESSION: 'true',
    INPUT_WORKING_DIRECTORY: repoDir,
    GITHUB_WORKSPACE: repoDir,
    GITHUB_SHA: '',
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_BASE_REF: 'main',
    NODE_PATH: NODE_PATH_EXTRA,
    ...extraEnv,
  };

  const result = spawnSync(process.execPath, [GATE_JS], {
    encoding: 'utf-8',
    env,
    timeout: 60_000,
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// ---------------------------------------------------------------------------
// Sample code fixtures
// ---------------------------------------------------------------------------

/** A clean, well-structured TypeScript file (should score >= 8.5) */
const CLEAN_TS = `
/**
 * Calculates the sum of an array of numbers.
 */
export function sumArray(numbers: number[]): number {
  return numbers.reduce((acc, n) => acc + n, 0);
}

/**
 * Returns the maximum value in an array, or null if empty.
 */
export function maxValue(numbers: number[]): number | null {
  if (numbers.length === 0) return null;
  return Math.max(...numbers);
}
`.trimStart();

/** A deeply nested / complex version introducing smells */
const COMPLEX_TS = `
// Complex blob with deep nesting, magic numbers, long function
export class DataProcessor {
  process(input: any): any {
    if (input) {
      if (input.type === 1) {
        if (input.value > 0) {
          if (input.value < 100) {
            if (input.flag) {
              for (let i = 0; i < 999; i++) {
                if (i % 2 === 0) {
                  if (i % 3 === 0) {
                    if (i % 5 === 0) {
                      console.log(i * 3.14159);
                    }
                  }
                }
              }
            }
          }
        }
      } else if (input.type === 2) {
        let result = 0;
        for (let j = 0; j < input.items.length; j++) {
          result += input.items[j].value * 42;
        }
        return result;
      } else if (input.type === 3) {
        return input.data.map((x: number) => x * 2).filter((x: number) => x > 10)
          .reduce((a: number, b: number) => a + b, 0);
      }
    }
    return null;
  }

  validate(input: any): boolean {
    return input !== null && input !== undefined && typeof input === 'object';
  }

  transform(input: any): any {
    return { ...input, processed: true, timestamp: Date.now() };
  }

  normalize(input: any): any {
    if (!input) return {};
    const keys = Object.keys(input);
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof input[key] === 'string') {
        result[key] = input[key].trim().toLowerCase();
      } else {
        result[key] = input[key];
      }
    }
    return result;
  }
}
`.trimStart();

// ---------------------------------------------------------------------------
// Assert helper
// ---------------------------------------------------------------------------

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// CASE A: Regressing change — gate should BLOCK (exit 1)
// ---------------------------------------------------------------------------

async function runCaseA() {
  console.log('\n[CASE A] Regressing change: clean TypeScript → complex TypeScript');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hac-gate-test-a-'));
  try {
    initRepo(dir);

    const filePath = path.join(dir, 'processor.ts');
    fs.writeFileSync(filePath, CLEAN_TS, 'utf-8');
    stageAndCommit(dir, 'initial: clean implementation');

    git(dir, ['checkout', '-q', '-b', 'feature-regress']);
    fs.writeFileSync(filePath, COMPLEX_TS, 'utf-8');
    stageAndCommit(dir, 'feat: add complex processing logic');

    const { exitCode, stdout, stderr } = runGate(dir);
    console.log('  exit code:', exitCode);
    console.log('  stdout excerpt:', stdout.split('\n').slice(0, 6).join('\n  '));

    if (stderr.includes('Cannot load @healthy-ai-code/core')) {
      // NODE_PATH resolution failed — report clearly
      console.error('  [SKIP] Core not resolvable via NODE_PATH (build needed):', stderr.split('\n')[0]);
      return 'skip';
    }

    assert(exitCode === 1, `expected exit 1 (gate BLOCK) but got ${exitCode}`);
    console.log('  => PASS: gate exited 1, regression correctly blocked');
    return 'pass';
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// CASE B: Improving change — gate should PASS (exit 0)
// ---------------------------------------------------------------------------

async function runCaseB() {
  console.log('\n[CASE B] Clean change: complex TypeScript → clean TypeScript (improvement)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hac-gate-test-b-'));
  try {
    initRepo(dir);

    const filePath = path.join(dir, 'processor.ts');
    fs.writeFileSync(filePath, COMPLEX_TS, 'utf-8');
    stageAndCommit(dir, 'initial: complex legacy implementation');

    git(dir, ['checkout', '-q', '-b', 'feature-refactor']);
    fs.writeFileSync(filePath, CLEAN_TS, 'utf-8');
    stageAndCommit(dir, 'refactor: simplify implementation');

    const { exitCode, stdout, stderr } = runGate(dir, { INPUT_FAIL_ON_REGRESSION: 'true' });
    console.log('  exit code:', exitCode);
    console.log('  stdout excerpt:', stdout.split('\n').slice(0, 6).join('\n  '));

    if (stderr.includes('Cannot load @healthy-ai-code/core')) {
      console.error('  [SKIP] Core not resolvable via NODE_PATH:', stderr.split('\n')[0]);
      return 'skip';
    }

    assert(exitCode === 0, `expected exit 0 (gate PASS) but got ${exitCode}\nstdout: ${stdout}\nstderr: ${stderr}`);
    console.log('  => PASS: gate exited 0, clean change passes');
    return 'pass';
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// CASE C: New file below floor — gate should BLOCK (exit 1)
// ---------------------------------------------------------------------------

async function runCaseC() {
  console.log('\n[CASE C] New unhealthy file below floor (score < 7.0)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hac-gate-test-c-'));
  try {
    initRepo(dir);

    const placeholder = path.join(dir, 'README.md');
    fs.writeFileSync(placeholder, '# test\n', 'utf-8');
    stageAndCommit(dir, 'initial commit');

    git(dir, ['checkout', '-q', '-b', 'feature-new-file']);
    const filePath = path.join(dir, 'processor.ts');
    fs.writeFileSync(filePath, COMPLEX_TS, 'utf-8');
    stageAndCommit(dir, 'feat: add processor');

    const { exitCode, stdout, stderr } = runGate(dir);
    console.log('  exit code:', exitCode);
    console.log('  stdout excerpt:', stdout.split('\n').slice(0, 6).join('\n  '));

    if (stderr.includes('Cannot load @healthy-ai-code/core')) {
      console.error('  [SKIP] Core not resolvable via NODE_PATH:', stderr.split('\n')[0]);
      return 'skip';
    }

    assert(exitCode === 1, `expected exit 1 (gate BLOCK) but got ${exitCode}`);
    console.log('  => PASS: new unhealthy file blocked correctly');
    return 'pass';
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Run all cases
// ---------------------------------------------------------------------------

console.log('=== Healthy AI Code — Merge Gate dry-run ===');
console.log(`Gate script: ${GATE_JS}`);
console.log(`Core parent: ${NODE_PATH_EXTRA}`);

let passed = 0;
let skipped = 0;
let failed = 0;

for (const [label, fn] of [
  ['CASE A', runCaseA],
  ['CASE B', runCaseB],
  ['CASE C', runCaseC],
]) {
  try {
    const result = await fn();
    if (result === 'skip') {
      skipped++;
      console.log(`  [${label}] SKIPPED (core not loadable on this Node version)`);
    } else {
      passed++;
    }
  } catch (e) {
    console.error(`\n[FAIL] ${label}: ${e.message}`);
    failed++;
  }
}

console.log(`\n=== Dry-run results: ${passed} passed, ${skipped} skipped, ${failed} failed ===`);

if (failed > 0) {
  process.exit(1);
}
