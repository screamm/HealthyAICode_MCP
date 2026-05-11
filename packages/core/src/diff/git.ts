import simpleGit, { type SimpleGit } from 'simple-git';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { analyzeCode } from '../index';
import { detectLanguage } from '../language-detect';
import type { ChangesetResult, FileRegression, FileImprovement, HealthResult, Language, Smell } from '../types';

const REGRESSION_DELTA = 0.5, NEW_FILE_UNHEALTHY_THRESHOLD = 7.0;
interface FilePair { baseResult: HealthResult; currentResult: HealthResult; }
interface ChangesetAccumulator { regressions: FileRegression[]; improvements: FileImprovement[]; newUnhealthyFiles: HealthResult[]; }

export async function analyzeChangeset(repoPath: string, baseBranch: string): Promise<ChangesetResult> {
  const git = simpleGit(repoPath);
  if (!await git.checkIsRepo()) throw new Error(`${repoPath} is not a git-repository`);
  const changed = (await git.diff(['--name-only', `${baseBranch}...HEAD`])).trim().split('\n').filter(Boolean);
  const acc: ChangesetAccumulator = { regressions: [], improvements: [], newUnhealthyFiles: [] };
  for (const relPath of changed) await processChangedFile(git, repoPath, baseBranch, relPath, acc);
  return { filesAnalyzed: changed.length, ...acc, overallSafe: acc.regressions.length === 0 && acc.newUnhealthyFiles.length === 0 };
}

async function processChangedFile(git: SimpleGit, repoPath: string, baseBranch: string, relPath: string, acc: ChangesetAccumulator): Promise<void> {
  const absPath = path.join(repoPath, relPath);
  const language = detectLanguage(absPath);
  if (language === 'unsupported') return;
  const currentCode = await readFileSafe(absPath);
  if (currentCode === null) return;
  let baseCode: string | null = null;
  try { baseCode = await git.show([`${baseBranch}:${relPath}`]); } catch { /* new file */ }
  if (baseCode === null) {
    const r = analyzeCode(currentCode, language, absPath);
    if (r.score < NEW_FILE_UNHEALTHY_THRESHOLD) acc.newUnhealthyFiles.push(r);
    return;
  }
  applyComparison({ baseResult: analyzeCode(baseCode, language, absPath), currentResult: analyzeCode(currentCode, language, absPath) }, relPath, acc);
}

async function readFileSafe(absPath: string): Promise<string | null> {
  try { return await fsp.readFile(absPath, 'utf-8'); } catch { return null; }
}

function applyComparison(pair: FilePair, relPath: string, acc: ChangesetAccumulator): void {
  if (pair.currentResult.score < pair.baseResult.score - REGRESSION_DELTA)
    acc.regressions.push({ filePath: relPath, scoreBefore: pair.baseResult.score, scoreAfter: pair.currentResult.score, newSmells: diffSmells(pair.currentResult.smells, pair.baseResult.smells) });
  else if (pair.currentResult.score > pair.baseResult.score + REGRESSION_DELTA)
    acc.improvements.push({ filePath: relPath, scoreBefore: pair.baseResult.score, scoreAfter: pair.currentResult.score, fixedSmells: diffSmells(pair.baseResult.smells, pair.currentResult.smells) });
}

function diffSmells(source: Smell[], reference: Smell[]): Smell[] {
  return source.filter(s => !reference.some(r => r.type === s.type && r.functionName === s.functionName));
}
