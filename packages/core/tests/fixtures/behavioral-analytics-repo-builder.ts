// packages/core/tests/fixtures/behavioral-analytics-repo-builder.ts
import * as path from 'path';
import * as os from 'os';
import * as fsp from 'fs/promises';
import simpleGit from 'simple-git';

export interface BehavioralFixtureRepo {
  rootPath: string;
  cleanup: () => Promise<void>;
}

function makeDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

/**
 * Generates auth.ts with successively more complex logic (more nested if-statements per version).
 * Each version adds one more if-branch, so complexity increases linearly.
 */
function authContent(complexity: number): string {
  const nestings = Array.from({ length: complexity }, (_, i) =>
    `  if (condition${i + 1}) {\n    return value${i + 1};\n  }`,
  ).join('\n');
  return `export function validateUser(user: string): boolean {\n${nestings}\n  return true;\n}\n`;
}

function utilsContent(version: number): string {
  return `export function formatUser(u: string): string {\n  // v${version}\n  return u.trim();\n}\n`;
}

function typesContent(version: number): string {
  return `export type User = { id: ${version}; name: string; };\n`;
}

/**
 * Builds a behavioral analytics fixture repo with controlled evolution:
 *
 * - src/auth.ts  — complexity increases with each commit (more nesting per version)
 * - src/utils.ts — changes together with auth.ts in 12 of the first 15 commits (>75% coupling)
 * - src/types.ts — changes rarely and alone (healthy file, low churn)
 *
 * Total: 20 commits distributed 120 days back in time.
 */
export async function buildBehavioralAnalyticsFixtureRepo(): Promise<BehavioralFixtureRepo> {
  const rootPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'behavioral-analytics-'));
  await fsp.mkdir(path.join(rootPath, 'src'), { recursive: true });

  const git = simpleGit(rootPath);
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'Test');
  await git.addConfig('commit.gpgsign', 'false');

  // Build a safe environment: inherit process.env but strip vars that trigger
  // simple-git's unsafe-plugin sandbox restrictions.
  const safeEnv: Record<string, string> = {};
  const blockedKeys = new Set([
    'GIT_ASKPASS', 'SSH_ASKPASS', 'GIT_TERMINAL_PROMPT',
    'EDITOR', 'GIT_EDITOR', 'VISUAL',
    'GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_SSL_NO_VERIFY',
  ]);
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !blockedKeys.has(k)) {
      safeEnv[k] = v;
    }
  }

  async function commit(message: string, daysAgo: number): Promise<void> {
    const date = makeDate(daysAgo);
    const env = { ...safeEnv, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date };
    await git.env(env).commit(message);
  }

  // Commit 0: Initial setup (day 120)
  await fsp.writeFile(path.join(rootPath, 'src/auth.ts'), authContent(1), 'utf-8');
  await fsp.writeFile(path.join(rootPath, 'src/utils.ts'), utilsContent(0), 'utf-8');
  await fsp.writeFile(path.join(rootPath, 'src/types.ts'), typesContent(0), 'utf-8');
  await git.add(['src/auth.ts', 'src/utils.ts', 'src/types.ts']);
  await commit('initial: project setup', 120);

  // Commits 1–12: auth.ts + utils.ts change together, complexity rises (days 110 → 10)
  for (let i = 1; i <= 12; i++) {
    await fsp.writeFile(path.join(rootPath, 'src/auth.ts'), authContent(i + 1), 'utf-8');
    await fsp.writeFile(path.join(rootPath, 'src/utils.ts'), utilsContent(i), 'utf-8');
    await git.add(['src/auth.ts', 'src/utils.ts']);
    await commit(`feat: update auth logic v${i}`, 120 - i * 10);
  }

  // Commits 13–15: utils.ts alone (days 5, 4, 3)
  for (let i = 0; i < 3; i++) {
    await fsp.writeFile(path.join(rootPath, 'src/utils.ts'), utilsContent(13 + i), 'utf-8');
    await git.add('src/utils.ts');
    await commit(`refactor: utils cleanup ${i}`, 5 - i);
  }

  // Commits 16–19: types.ts alone, infrequently changed (days 60, 45, 30, 15)
  for (let i = 1; i <= 4; i++) {
    await fsp.writeFile(path.join(rootPath, 'src/types.ts'), typesContent(i), 'utf-8');
    await git.add('src/types.ts');
    await commit(`chore: update types v${i}`, 75 - i * 15);
  }

  return {
    rootPath,
    cleanup: async () => {
      // Retry cleanup to handle Windows EBUSY file locks from lingering git processes
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await fsp.rm(rootPath, { recursive: true, force: true });
          return;
        } catch {
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }
      }
    },
  };
}
