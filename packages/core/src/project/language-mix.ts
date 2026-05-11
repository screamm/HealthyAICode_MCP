import * as fsp from 'fs/promises';
import type { LanguageMixFinding } from '.';
import { analyzeFileLang } from './language-mix-helpers';

/** Analyses source files for mixed natural-language usage in comments and strings. */
export async function detectLanguageMix(files: string[]): Promise<LanguageMixFinding[]> {
  const findings: LanguageMixFinding[] = [];
  for (const file of files) { const source = await fsp.readFile(file, 'utf-8'); const f = analyzeFileLang(file, source); if (f) findings.push(f); }
  return findings;
}
