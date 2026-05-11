import * as path from 'path';
import { countExports, candidateTestPaths, classifySeverity, inferProjectRoot } from './test-proximity-helpers';

/** A source file that exports symbols but has no adjacent test file. */
export interface TestProximityFinding {
  filePath: string;
  exportCount: number;
  searchedPaths: string[];
  severity: 'low' | 'medium' | 'high';
}

function isTestFile(file: string): boolean { return /\.(test|spec)\.[tj]sx?$/.test(file); }

/**
 * Detects source files that lack an adjacent test file.
 * Checks conventional test-file locations and emits a finding for each exported source file without coverage.
 */
export async function detectTestProximity(sourceFiles: string[], rootPath?: string): Promise<TestProximityFinding[]> {
  const testFileSet = new Set(sourceFiles.filter(isTestFile).map(f => path.resolve(f)));
  const findings: TestProximityFinding[] = [];
  for (const file of sourceFiles.filter(f => !isTestFile(f))) {
    const exportCount = await countExports(file);
    if (exportCount === 0) continue;
    const root = rootPath ?? inferProjectRoot(file);
    const candidates = candidateTestPaths(root, file);
    if (candidates.some(p => testFileSet.has(path.resolve(p)))) continue;
    findings.push({ filePath: file, exportCount, searchedPaths: candidates, severity: classifySeverity(file, exportCount) });
  }
  return findings;
}
