// packages/core/tests/fixtures/method-coupling-bash-repo-builder.ts
//
// Builds a deterministic git repository containing a Bash script with four functions.
// Commit patterns mirror those in method-coupling-repo-builder.ts so the same
// coupling thresholds apply:
//
//   Pattern A — deploy_app + validate_config co-change 7 times (strong coupling)
//   Pattern B — setup_env + teardown_env co-change 4 times (meets MIN_CO_CHANGE_COUNT)
//   Pattern C — deploy_app alone 3 times (solo)
//   Pattern D — setup_env alone 2 times (solo)
//
// Total commits: 1 initial + 7 + 4 + 3 + 2 = 17 (≥ MIN_COMMITS_FOR_SIGNAL = 10)

import * as path from 'path';
import * as os from 'os';
import * as fsp from 'fs/promises';
import simpleGit from 'simple-git';

export interface BashFixtureRepo {
  rootPath: string;
  filePath: string;
  cleanup: () => Promise<void>;
}

interface BashFileState {
  deploy_app: string;
  validate_config: string;
  setup_env: string;
  teardown_env: string;
}

const INITIAL: BashFileState = {
  deploy_app: `deploy_app() {\n  echo "deploying app"\n}`,
  validate_config: `validate_config() {\n  echo "validating config"\n}`,
  setup_env: `setup_env() {\n  echo "setting up env"\n}`,
  teardown_env: `teardown_env() {\n  echo "tearing down env"\n}`,
};

function render(state: BashFileState): string {
  return [
    '#!/usr/bin/env bash',
    '',
    state.deploy_app,
    '',
    state.validate_config,
    '',
    state.setup_env,
    '',
    state.teardown_env,
  ].join('\n');
}

/** Bumps a function body with a version comment to force a real line change. */
function bumped(fn: string, version: number): string {
  // Replace closing brace line to append a comment; preserves function structure
  return fn.replace(/\n\}$/, `\n  # v${version}\n}`);
}

export async function buildMethodCouplingBashRepo(): Promise<BashFixtureRepo> {
  const rootPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'method-coupling-bash-'));
  await fsp.mkdir(path.join(rootPath, 'src'), { recursive: true });
  const filePath = 'src/deploy.sh';

  const git = simpleGit(rootPath);
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'test');
  await git.addConfig('commit.gpgsign', 'false');

  const state: BashFileState = { ...INITIAL };
  let v = 0;

  // Initial commit
  await fsp.writeFile(path.join(rootPath, filePath), render(state), 'utf-8');
  await git.add(filePath);
  await git.commit('initial');

  // Pattern A: deploy_app + validate_config change together (7 commits)
  for (let i = 0; i < 7; i++) {
    state.deploy_app = bumped(INITIAL.deploy_app, ++v);
    state.validate_config = bumped(INITIAL.validate_config, v);
    await fsp.writeFile(path.join(rootPath, filePath), render(state), 'utf-8');
    await git.add(filePath);
    await git.commit(`coupled-A-${i}`);
  }

  // Pattern B: setup_env + teardown_env change together (4 commits)
  for (let i = 0; i < 4; i++) {
    state.setup_env = bumped(INITIAL.setup_env, ++v);
    state.teardown_env = bumped(INITIAL.teardown_env, v);
    await fsp.writeFile(path.join(rootPath, filePath), render(state), 'utf-8');
    await git.add(filePath);
    await git.commit(`coupled-B-${i}`);
  }

  // Pattern C: deploy_app alone (3 commits)
  for (let i = 0; i < 3; i++) {
    state.deploy_app = bumped(INITIAL.deploy_app, ++v);
    await fsp.writeFile(path.join(rootPath, filePath), render(state), 'utf-8');
    await git.add(filePath);
    await git.commit(`solo-A-${i}`);
  }

  // Pattern D: setup_env alone (2 commits)
  for (let i = 0; i < 2; i++) {
    state.setup_env = bumped(INITIAL.setup_env, ++v);
    await fsp.writeFile(path.join(rootPath, filePath), render(state), 'utf-8');
    await git.add(filePath);
    await git.commit(`solo-B-${i}`);
  }

  return {
    rootPath,
    filePath,
    cleanup: async () => {
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
