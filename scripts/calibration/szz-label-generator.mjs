#!/usr/bin/env node
/**
 * SZZ Label Generator (Basic SZZ variant)
 *
 * Identifies bug-introducing commits in a git repository by:
 * 1. Finding fix-commits (commits whose message mentions a bug/fix)
 * 2. Diffing each fix-commit to identify removed lines (buggy lines in parent)
 * 3. Running git blame on the parent commit to find who introduced those lines
 *
 * Reference: Sliwerski, Zimmermann, Zeller (2005) — "When Do Changes Induce Fixes?"
 *
 * Usage (ESM import):
 *   import { generateSzzLabels } from './szz-label-generator.mjs';
 *   const labels = await generateSzzLabels('/path/to/repo', { maxCommits: 500 });
 */

import simpleGit from 'simple-git';

/**
 * @typedef {Object} SzzLabel
 * @property {string} filePath      - Relative path to the file (from repo root)
 * @property {number} buggyLine     - 1-based line number identified as buggy (in the parent/pre-fix commit)
 * @property {string} fixCommit     - SHA of the bug-fix commit
 * @property {string} introCommit   - SHA of the commit that introduced the buggy line
 */

/**
 * @typedef {Object} SzzOptions
 * @property {number}   [maxCommits=1000]          - Maximum commits to scan
 * @property {string}   [since]                    - ISO date string, limits history (e.g. "2023-01-01")
 * @property {boolean}  [excludeMerges=true]       - Skip merge commits
 * @property {boolean}  [excludeVersionBumps=true] - Skip version-bump / chore commits
 * @property {string[]} [fileExtensions]           - Restrict to these extensions (e.g. ['py', 'ts'])
 */

/**
 * @typedef {Object} SzzResult
 * @property {SzzLabel[]} labels               - All identified buggy-line labels
 * @property {string[]}   fixCommits           - SHAs of all detected fix-commits
 * @property {{ fixCommitsFound: number, labelsGenerated: number, filesLabelled: number }} stats
 */

const FIX_COMMIT_PATTERN = /\b(fix|bug|issue|error|defect|patch|closes?\s*#\d+|resolves?\s*#\d+)\b/i;
const VERSION_BUMP_PATTERN = /^(bump|chore(?:\(release\))?|release|version|v\d+\.\d+)/i;

/**
 * Identifies fix-commits in the repository using regex on commit messages.
 *
 * @param {import('simple-git').SimpleGit} git
 * @param {SzzOptions} options
 * @returns {Promise<Array<{sha: string, subject: string}>>}
 */
async function identifyFixCommits(git, options) {
  const logArgs = ['log', '--format=%H|%s|%P'];

  if (options.excludeMerges !== false) logArgs.push('--no-merges');
  if (options.maxCommits) logArgs.push(`-${options.maxCommits}`);
  if (options.since) logArgs.push(`--since=${options.since}`);

  const log = await git.raw(logArgs);
  const commits = [];

  for (const line of log.split('\n').filter(Boolean)) {
    const pipeIdx1 = line.indexOf('|');
    const pipeIdx2 = line.indexOf('|', pipeIdx1 + 1);
    if (pipeIdx1 === -1 || pipeIdx2 === -1) continue;

    const sha = line.slice(0, pipeIdx1).trim();
    const subject = line.slice(pipeIdx1 + 1, pipeIdx2).trim();
    const parents = line.slice(pipeIdx2 + 1).trim();

    if (!sha || !subject) continue;

    // Exclude merge commits (have more than one parent SHA in the parents field)
    if (options.excludeMerges !== false && parents.includes(' ')) continue;

    // Exclude version bumps / chore commits
    if (options.excludeVersionBumps !== false && VERSION_BUMP_PATTERN.test(subject)) continue;

    if (FIX_COMMIT_PATTERN.test(subject)) {
      commits.push({ sha, subject });
    }
  }

  return commits;
}

/**
 * Parses unified diff output into a map of { filePath -> removedLineNumbers[] }.
 *
 * Handles only Modified files (no renames, no binary files).
 *
 * @param {string} diff - Raw unified diff text from `git show`
 * @param {string[]} [fileExtensions] - Optional allowlist of extensions
 * @returns {Array<{filePath: string, removedLines: number[]}>}
 */
function parseDiffIntoFileBlocks(diff, fileExtensions) {
  const blocks = [];
  let currentFile = null;
  let currentRemoved = [];
  let oldLineNum = 0;

  for (const line of diff.split('\n')) {
    // New file header
    if (line.startsWith('--- a/')) {
      // Save previous block
      if (currentFile && currentRemoved.length > 0) {
        blocks.push({ filePath: currentFile, removedLines: currentRemoved });
      }
      const filePath = line.slice(6); // strip '--- a/'
      // Filter by extension if specified
      if (fileExtensions && fileExtensions.length > 0) {
        const ext = filePath.split('.').pop() ?? '';
        currentFile = fileExtensions.includes(ext) ? filePath : null;
      } else {
        currentFile = filePath;
      }
      currentRemoved = [];
      oldLineNum = 0;
      continue;
    }

    if (!currentFile) continue;

    // Hunk header: @@ -oldStart[,oldCount] +newStart[,newCount] @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
    if (hunkMatch) {
      oldLineNum = parseInt(hunkMatch[1], 10);
      continue;
    }

    // Removed line (in old/buggy version)
    if (line.startsWith('-') && !line.startsWith('---')) {
      currentRemoved.push(oldLineNum);
      oldLineNum++;
      continue;
    }

    // Context line (neither added nor removed)
    if (!line.startsWith('+')) {
      oldLineNum++;
    }
    // Added lines (+) do not affect old line numbering
  }

  // Save last block
  if (currentFile && currentRemoved.length > 0) {
    blocks.push({ filePath: currentFile, removedLines: currentRemoved });
  }

  return blocks;
}

/**
 * Runs `git blame` on a file at a specific commit and returns a map of
 * lineNumber -> introCommitSha for the requested line numbers.
 *
 * Uses --porcelain format for reliable parsing, runs once per file (batched).
 *
 * @param {import('simple-git').SimpleGit} git
 * @param {string} filePath
 * @param {string} atCommit - The commit/ref to blame at (parent of fix-commit)
 * @param {number[]} lineNumbers - 1-based line numbers of interest
 * @returns {Promise<Array<{lineNumber: number, introSha: string}>>}
 */
async function batchGitBlame(git, filePath, atCommit, lineNumbers) {
  let blameOutput;
  try {
    blameOutput = await git.raw(['blame', atCommit, '--porcelain', '--', filePath]);
  } catch {
    // File doesn't exist at this commit (e.g. the file was added in this fix)
    return [];
  }

  if (!blameOutput || !blameOutput.trim()) return [];

  // Parse porcelain blame output.
  // Format per hunk:
  //   <40-char sha> <orig-line> <result-line> [<num-lines>]
  //   author <name>
  //   ... (other headers)
  //   \t<line content>
  const lineMap = new Map(); // resultLine -> sha
  const lines = blameOutput.split('\n');
  let i = 0;
  while (i < lines.length) {
    const header = lines[i];
    // A hunk header: 40-char SHA followed by space and numbers
    if (header && /^[0-9a-f]{40} /.test(header)) {
      const parts = header.split(' ');
      const sha = parts[0];
      const resultLine = parseInt(parts[2], 10);
      lineMap.set(resultLine, sha);
    }
    i++;
  }

  const results = [];
  for (const lineNumber of lineNumbers) {
    const introSha = lineMap.get(lineNumber);
    if (introSha) {
      results.push({ lineNumber, introSha });
    }
  }
  return results;
}

/**
 * Main entry point. Generates SZZ labels for a git repository.
 *
 * @param {string} repoPath - Absolute path to the repository root
 * @param {SzzOptions} [options]
 * @returns {Promise<SzzResult>}
 */
export async function generateSzzLabels(repoPath, options = {}) {
  const opts = {
    maxCommits: 1000,
    excludeMerges: true,
    excludeVersionBumps: true,
    fileExtensions: undefined,
    since: undefined,
    ...options,
  };

  const git = simpleGit(repoPath);
  const allLabels = [];
  const fixCommitShas = [];

  // Step 1: Find fix-commits
  let fixCommits;
  try {
    fixCommits = await identifyFixCommits(git, opts);
  } catch {
    return { labels: [], fixCommits: [], stats: { fixCommitsFound: 0, labelsGenerated: 0, filesLabelled: 0 } };
  }

  fixCommitShas.push(...fixCommits.map(c => c.sha));

  // Step 2 & 3: For each fix-commit, diff and blame
  for (const fixCommit of fixCommits) {
    let diff;
    try {
      // --diff-filter=M: only modified files (skip added/deleted/renamed)
      const diffArgs = ['show', fixCommit.sha, '--unified=0', '--format=', '--diff-filter=M'];
      if (opts.fileExtensions && opts.fileExtensions.length > 0) {
        diffArgs.push('--');
        diffArgs.push(...opts.fileExtensions.map(ext => `*.${ext}`));
      }
      diff = await git.raw(diffArgs);
    } catch {
      continue;
    }

    if (!diff || !diff.trim()) continue;

    const fileBlocks = parseDiffIntoFileBlocks(diff, opts.fileExtensions);
    const parentRef = `${fixCommit.sha}^`;

    for (const { filePath, removedLines } of fileBlocks) {
      if (removedLines.length === 0) continue;

      const blamedLines = await batchGitBlame(git, filePath, parentRef, removedLines);

      for (const { lineNumber, introSha } of blamedLines) {
        allLabels.push({
          filePath,
          buggyLine: lineNumber,
          fixCommit: fixCommit.sha,
          introCommit: introSha,
        });
      }
    }
  }

  const uniqueFiles = new Set(allLabels.map(l => l.filePath));

  return {
    labels: allLabels,
    fixCommits: fixCommitShas,
    stats: {
      fixCommitsFound: fixCommits.length,
      labelsGenerated: allLabels.length,
      filesLabelled: uniqueFiles.size,
    },
  };
}

// Allow direct invocation for testing
if (process.argv[1] && process.argv[1].endsWith('szz-label-generator.mjs')) {
  const repoPath = process.argv[2];
  if (!repoPath) {
    console.error('Usage: node szz-label-generator.mjs <repoPath> [maxCommits]');
    process.exit(1);
  }
  const maxCommits = parseInt(process.argv[3] ?? '100', 10);
  generateSzzLabels(repoPath, { maxCommits })
    .then(result => {
      console.log(`Fix commits found: ${result.stats.fixCommitsFound}`);
      console.log(`Labels generated: ${result.stats.labelsGenerated}`);
      console.log(`Files labelled:   ${result.stats.filesLabelled}`);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
