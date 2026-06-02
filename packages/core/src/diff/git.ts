import simpleGit, { type SimpleGit } from 'simple-git';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { analyzeCode } from '../index';
import { detectLanguage } from '../language-detect';
import type { ChangesetResult, FileRegression, FileImprovement, HealthResult, Language, Smell } from '../types';

const REGRESSION_DELTA = 0.5;
const NEW_FILE_UNHEALTHY_THRESHOLD = 7.0;

interface FilePair { baseResult: HealthResult; currentResult: HealthResult; }
interface ChangesetAccumulator { regressions: FileRegression[]; improvements: FileImprovement[]; newUnhealthyFiles: HealthResult[]; }
interface ChangeContext { repoPath: string; baseBranch: string; relPath: string; }

export async function analyzeChangeset(repoPath: string, baseBranch: string): Promise<ChangesetResult> {
  const git = simpleGit(repoPath);
  if (!await git.checkIsRepo()) throw new Error(`${repoPath} is not a git-repository`);
  const diffOutput = await git.diff(['--name-only', `${baseBranch}...HEAD`]);
  const changed = diffOutput.trim().split('\n').filter(Boolean);
  const acc: ChangesetAccumulator = { regressions: [], improvements: [], newUnhealthyFiles: [] };
  for (const relPath of changed) await processChangedFile(git, { repoPath, baseBranch, relPath }, acc);
  const overallSafe = acc.regressions.length === 0 && acc.newUnhealthyFiles.length === 0;
  return { filesAnalyzed: changed.length, ...acc, overallSafe };
}

async function processChangedFile(git: SimpleGit, ctx: ChangeContext, acc: ChangesetAccumulator): Promise<void> {
  const absPath = path.join(ctx.repoPath, ctx.relPath);
  const language = detectLanguage(absPath);
  if (language === 'unsupported') return;
  const currentCode = await readFileSafe(absPath);
  if (currentCode === null) return;
  const baseCode = await readBaseVersion(git, ctx.baseBranch, ctx.relPath);
  if (baseCode === null) {
    recordIfNewUnhealthy(analyzeCode(currentCode, language, absPath), acc);
    return;
  }
  applyComparison({ baseResult: analyzeCode(baseCode, language, absPath), currentResult: analyzeCode(currentCode, language, absPath) }, ctx.relPath, acc);
}

/** Reads a file's content at the base branch, returning null when the file is new (no base version). */
async function readBaseVersion(git: SimpleGit, baseBranch: string, relPath: string): Promise<string | null> {
  try { return await git.show([`${baseBranch}:${relPath}`]); } catch { return null; /* new file */ }
}

/** Records a brand-new file as unhealthy when its score falls below the new-file threshold. */
function recordIfNewUnhealthy(result: HealthResult, acc: ChangesetAccumulator): void {
  if (result.score < NEW_FILE_UNHEALTHY_THRESHOLD) acc.newUnhealthyFiles.push(result);
}

async function readFileSafe(absPath: string): Promise<string | null> {
  try { return await fsp.readFile(absPath, 'utf-8'); } catch { return null; }
}

function applyComparison(pair: FilePair, relPath: string, acc: ChangesetAccumulator): void {
  const scoreDelta = pair.currentResult.score - pair.baseResult.score;
  if (scoreDelta < -REGRESSION_DELTA) {
    acc.regressions.push({ filePath: relPath, scoreBefore: pair.baseResult.score, scoreAfter: pair.currentResult.score, newSmells: diffSmells(pair.currentResult.smells, pair.baseResult.smells) });
  } else if (scoreDelta > REGRESSION_DELTA) {
    acc.improvements.push({ filePath: relPath, scoreBefore: pair.baseResult.score, scoreAfter: pair.currentResult.score, fixedSmells: diffSmells(pair.baseResult.smells, pair.currentResult.smells) });
  }
}

function diffSmells(source: Smell[], reference: Smell[]): Smell[] {
  return source.filter(s => !reference.some(r => r.type === s.type && r.functionName === s.functionName));
}
