// packages/core/tests/fixtures/bus-factor-repo-builder.ts
import * as path from 'path';
import * as os from 'os';
import * as fsp from 'fs/promises';
import simpleGit from 'simple-git';

export interface BusFactorFixtureRepo {
  rootPath: string;
  filePath: string;  // relative path used in git commands
  cleanup: () => Promise<void>;
}

/**
 * Builds a minimal git repo with a controlled commit history:
 *   - 10 commits from alice@example.com (dominant — 77%)
 *   -  2 commits from bob@example.com
 *   -  1 commit  from charlie@example.com (10 days ago, within sprint window)
 *
 * Total: 13 commits on src/feature.ts
 *
 * Expected bus factor: 1 (alice > 50%)
 * Expected uniqueContributors: 3
 */
export async function buildBusFactorFixtureRepo(): Promise<BusFactorFixtureRepo> {
  const rootPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'bus-factor-'));
  await fsp.mkdir(path.join(rootPath, 'src'), { recursive: true });
  const relFilePath = 'src/feature.ts';
  const absFilePath = path.join(rootPath, relFilePath);

  const git = simpleGit(rootPath);
  await git.init();
  await git.addConfig('commit.gpgsign', 'false');

  const baseContent = 'export function featureA(): void { /* implementation */ }\n';

  async function commit(email: string, name: string, version: number, dateOffset = 0): Promise<void> {
    const date = new Date(Date.now() - dateOffset * 24 * 60 * 60 * 1000);
    const isoDate = date.toISOString();
    await fsp.writeFile(absFilePath, baseContent + `// v${version}\n`, 'utf-8');
    await git.addConfig('user.email', email);
    await git.addConfig('user.name', name);
    await git.add(relFilePath);
    await git.raw([
      'commit',
      '-m', `v${version} by ${name}`,
      '--date', isoDate,
    ]);
  }

  // Initial commit from alice
  await fsp.writeFile(absFilePath, baseContent, 'utf-8');
  await git.addConfig('user.email', 'alice@example.com');
  await git.addConfig('user.name', 'Alice');
  await git.add(relFilePath);
  await git.commit('initial');

  // 9 more commits from alice (total = 10)
  for (let i = 1; i <= 9; i++) {
    await commit('alice@example.com', 'Alice', i, 30 - i);
  }

  // 2 commits from bob
  for (let i = 0; i < 2; i++) {
    await commit('bob@example.com', 'Bob', 100 + i, 20 - i);
  }

  // 1 commit from charlie — 10 days ago (within 14-day sprint window)
  await commit('charlie@example.com', 'Charlie', 200, 10);

  return {
    rootPath,
    filePath: relFilePath,
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
