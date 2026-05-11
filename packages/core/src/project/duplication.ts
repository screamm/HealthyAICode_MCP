import * as fsp from 'fs/promises';
import { fingerprintFile, type FunctionFingerprint } from './fingerprint';
import type { DuplicationFinding } from '.';

const SIMILARITY_THRESHOLD = 0.7;

export async function detectDuplications(files: string[]): Promise<DuplicationFinding[]> {
  const allFingerprints = await collectAllFingerprints(files);
  return findSimilarPairs(allFingerprints);
}

async function collectAllFingerprints(files: string[]): Promise<FunctionFingerprint[]> {
  const all: FunctionFingerprint[] = [];
  for (const file of files) {
    const source = await fsp.readFile(file, 'utf-8');
    all.push(...fingerprintFile(file, source));
  }
  return all;
}

function findSimilarPairs(fps: FunctionFingerprint[]): DuplicationFinding[] {
  const findings: DuplicationFinding[] = [];
  for (let i = 0; i < fps.length; i++) {
    for (let j = i + 1; j < fps.length; j++) {
      const sim = jaccard(fps[i].hashes, fps[j].hashes);
      if (sim < SIMILARITY_THRESHOLD) continue;
      findings.push({
        filePathA: fps[i].filePath,
        filePathB: fps[j].filePath,
        startLineA: fps[i].startLine,
        startLineB: fps[j].startLine,
        tokenCount: Math.min(fps[i].tokenCount, fps[j].tokenCount),
        similarity: sim,
        severity: classifySeverity(sim),
      });
    }
  }
  return findings;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

function classifySeverity(sim: number): 'low' | 'medium' | 'high' {
  if (sim >= 0.95) return 'high';
  if (sim >= 0.85) return 'medium';
  return 'low';
}
