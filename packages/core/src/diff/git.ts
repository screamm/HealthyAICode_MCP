import simpleGit from 'simple-git';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { analyzeCode } from '../index';
import { detectLanguage } from '../language-detect';
import type { ChangesetResult, FileRegression, FileImprovement, HealthResult } from '../types';

export async function analyzeChangeset(
  repoPath: string,
  baseBranch: string
): Promise<ChangesetResult> {
  const git = simpleGit(repoPath);

  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error(`${repoPath} is not a git-repository`);
  }

  const diff = await git.diff(['--name-only', `${baseBranch}...HEAD`]);
  const changedFiles = diff.trim().split('\n').filter(Boolean);

  const regressions: FileRegression[] = [];
  const improvements: FileImprovement[] = [];
  const newUnhealthyFiles: HealthResult[] = [];

  for (const relPath of changedFiles) {
    const absPath = path.join(repoPath, relPath);
    const language = detectLanguage(absPath);
    if (language === 'unsupported') continue;

    let currentCode: string;
    try {
      currentCode = await fsp.readFile(absPath, 'utf-8');
    } catch {
      continue;
    }

    let baseCode: string;
    try {
      baseCode = await git.show([`${baseBranch}:${relPath}`]);
    } catch {
      const result = analyzeCode(currentCode, language, absPath);
      if (result.score < 7.0) {
        newUnhealthyFiles.push(result);
      }
      continue;
    }

    const baseResult = analyzeCode(baseCode, language, absPath);
    const currentResult = analyzeCode(currentCode, language, absPath);

    if (currentResult.score < baseResult.score - 0.5) {
      regressions.push({
        filePath: relPath,
        scoreBefore: baseResult.score,
        scoreAfter: currentResult.score,
        newSmells: currentResult.smells.filter(
          s =>
            !baseResult.smells.some(
              bs => bs.type === s.type && bs.functionName === s.functionName
            )
        ),
      });
    } else if (currentResult.score > baseResult.score + 0.5) {
      improvements.push({
        filePath: relPath,
        scoreBefore: baseResult.score,
        scoreAfter: currentResult.score,
        fixedSmells: baseResult.smells.filter(
          s =>
            !currentResult.smells.some(
              cs => cs.type === s.type && cs.functionName === s.functionName
            )
        ),
      });
    }
  }

  return {
    filesAnalyzed: changedFiles.length,
    regressions,
    improvements,
    newUnhealthyFiles,
    overallSafe: regressions.length === 0 && newUnhealthyFiles.length === 0,
  };
}
