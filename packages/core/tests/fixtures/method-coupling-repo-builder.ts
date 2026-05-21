// packages/core/tests/fixtures/method-coupling-repo-builder.ts
import * as path from 'path';
import * as os from 'os';
import * as fsp from 'fs/promises';
import simpleGit from 'simple-git';

export interface FixtureRepo {
  rootPath: string;
  filePath: string;
  cleanup: () => Promise<void>;
}

interface FileState {
  validateUser: string;
  formatError: string;
  parseToken: string;
  refreshToken: string;
}

const INITIAL: FileState = {
  validateUser: 'export function validateUser(u: string): boolean {\n  return u.length > 0;\n}',
  formatError: 'export function formatError(e: Error): string {\n  return e.message;\n}',
  parseToken: 'export function parseToken(t: string): string {\n  return t.split(".")[0];\n}',
  refreshToken: 'export function refreshToken(t: string): string {\n  return t + "-new";\n}',
};

function render(state: FileState): string {
  return [state.validateUser, state.formatError, state.parseToken, state.refreshToken].join('\n\n');
}

function bumped(s: string, version: number): string {
  // Inject a comment to force a real line-change without breaking the parser
  return s.replace('{\n', `{\n  // v${version}\n`);
}

export async function buildMethodCouplingFixtureRepo(): Promise<FixtureRepo> {
  const rootPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'method-coupling-'));
  await fsp.mkdir(path.join(rootPath, 'src'), { recursive: true });
  const filePath = 'src/auth.ts';

  const git = simpleGit(rootPath);
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'test');
  await git.addConfig('commit.gpgsign', 'false');

  const state: FileState = { ...INITIAL };
  let v = 0;

  await fsp.writeFile(path.join(rootPath, filePath), render(state), 'utf-8');
  await git.add(filePath);
  await git.commit('initial');

  // Pattern A: validateUser + formatError change together (7 commits)
  for (let i = 0; i < 7; i++) {
    state.validateUser = bumped(INITIAL.validateUser, ++v);
    state.formatError = bumped(INITIAL.formatError, v);
    await fsp.writeFile(path.join(rootPath, filePath), render(state), 'utf-8');
    await git.add(filePath);
    await git.commit(`coupled-A-${i}`);
  }

  // Pattern B: parseToken + refreshToken change together (4 commits)
  for (let i = 0; i < 4; i++) {
    state.parseToken = bumped(INITIAL.parseToken, ++v);
    state.refreshToken = bumped(INITIAL.refreshToken, v);
    await fsp.writeFile(path.join(rootPath, filePath), render(state), 'utf-8');
    await git.add(filePath);
    await git.commit(`coupled-B-${i}`);
  }

  // Pattern C: validateUser alone (3 commits)
  for (let i = 0; i < 3; i++) {
    state.validateUser = bumped(INITIAL.validateUser, ++v);
    await fsp.writeFile(path.join(rootPath, filePath), render(state), 'utf-8');
    await git.add(filePath);
    await git.commit(`solo-A-${i}`);
  }

  // Pattern D: parseToken alone (2 commits)
  for (let i = 0; i < 2; i++) {
    state.parseToken = bumped(INITIAL.parseToken, ++v);
    await fsp.writeFile(path.join(rootPath, filePath), render(state), 'utf-8');
    await git.add(filePath);
    await git.commit(`solo-B-${i}`);
  }

  return {
    rootPath,
    filePath,
    cleanup: async () => { await fsp.rm(rootPath, { recursive: true, force: true }); },
  };
}
