import simpleGit, { type SimpleGit } from 'simple-git';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { analyzeCode } from '../index';
import { detectLanguage } from '../language-detect';
import type {
  ChangesetResult,
  FileRegression,
  FileImprovement,
  HealthResult,
  Language,
  Smell,
} from '../types';

const REGRESSION_DELTA = 0.5;
const NEW_FILE_UNHEALTHY_THRESHOLD = 7.0;

interface FilePair {
  baseResult: HealthResult;
  currentResult: HealthResult;
}

export async function analyzeChangeset(
  repoPath: string,
  baseBranch: string
): Promise<ChangesetResult> {
  const git = simpleGit(repoPath);
  await assertIsGitRepo(git, repoPath);

  const changedFiles = await listChangedFiles(git, baseBranch);
  const regressions: FileRegression[] = [];
  const improvements: FileImprovement[] = [];
  const newUnhealthyFiles: HealthResult[] = [];

  for (const relPath of changedFiles) {
    await processChangedFile(git, repoPath, baseBranch, relPath, {
      regressions,
      improvements,
      newUnhealthyFiles,
    });
  }

  return {
    filesAnalyzed: changedFiles.length,
    regressions,
    improvements,
    newUnhealthyFiles,
    overallSafe: regressions.length === 0 && newUnhealthyFiles.length === 0,
  };
}

async function assertIsGitRepo(git: SimpleGit, repoPath: string): Promise<void> {
  const isRepo = await git.checkIsRepo();
  if (!isRepo) {
    throw new Error(`${repoPath} is not a git-repository`);
  }
}

async function listChangedFiles(git: SimpleGit, baseBranch: string): Promise<string[]> {
  const diff = await git.diff(['--name-only', `${baseBranch}...HEAD`]);
  return diff.trim().split('\n').filter(Boolean);
}

interface ChangesetAccumulator {
  regressions: FileRegression[];
  improvements: FileImprovement[];
  newUnhealthyFiles: HealthResult[];
}

async function processChangedFile(
  git: SimpleGit,
  repoPath: string,
  baseBranch: string,
  relPath: string,
  acc: ChangesetAccumulator
): Promise<void> {
  const absPath = path.join(repoPath, relPath);
  const language = detectLanguage(absPath);
  if (language === 'unsupported') return;

  const currentCode = await readFileSafe(absPath);
  if (currentCode === null) return;

  const baseCode = await readBaseVersion(git, baseBranch, relPath);
  if (baseCode === null) {
    collectNewFileIfUnhealthy(currentCode, language, absPath, acc.newUnhealthyFiles);
    return;
  }

  const pair = analyzePair(baseCode, currentCode, language, absPath);
  applyComparison(pair, relPath, acc);
}

async function readFileSafe(absPath: string): Promise<string | null> {
  try {
    return await fsp.readFile(absPath, 'utf-8');
  } catch {
    return null;
  }
}

async function readBaseVersion(
  git: SimpleGit,
  baseBranch: string,
  relPath: string
): Promise<string | null> {
  try {
    return await git.show([`${baseBranch}:${relPath}`]);
  } catch {
    return null;
  }
}

function collectNewFileIfUnhealthy(
  code: string,
  language: Language,
  absPath: string,
  sink: HealthResult[]
): void {
  const result = analyzeCode(code, language, absPath);
  if (result.score < NEW_FILE_UNHEALTHY_THRESHOLD) {
    sink.push(result);
  }
}

function analyzePair(
  baseCode: string,
  currentCode: string,
  language: Language,
  absPath: string
): FilePair {
  return {
    baseResult: analyzeCode(baseCode, language, absPath),
    currentResult: analyzeCode(currentCode, language, absPath),
  };
}

function applyComparison(pair: FilePair, relPath: string, acc: ChangesetAccumulator): void {
  const { baseResult, currentResult } = pair;
  if (currentResult.score < baseResult.score - REGRESSION_DELTA) {
    acc.regressions.push(buildRegression(pair, relPath));
  } else if (currentResult.score > baseResult.score + REGRESSION_DELTA) {
    acc.improvements.push(buildImprovement(pair, relPath));
  }
}

function buildRegression(pair: FilePair, filePath: string): FileRegression {
  return {
    filePath,
    scoreBefore: pair.baseResult.score,
    scoreAfter: pair.currentResult.score,
    newSmells: diffSmells(pair.currentResult.smells, pair.baseResult.smells),
  };
}

function buildImprovement(pair: FilePair, filePath: string): FileImprovement {
  return {
    filePath,
    scoreBefore: pair.baseResult.score,
    scoreAfter: pair.currentResult.score,
    fixedSmells: diffSmells(pair.baseResult.smells, pair.currentResult.smells),
  };
}

function diffSmells(source: Smell[], reference: Smell[]): Smell[] {
  return source.filter(
    s => !reference.some(r => r.type === s.type && r.functionName === s.functionName)
  );
}
