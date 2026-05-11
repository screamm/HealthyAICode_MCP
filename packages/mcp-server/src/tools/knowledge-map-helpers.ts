import { analyzeDeveloperCongestion, analyzeKnowledgeLoss, analyzeTemporalCoupling } from '@healthy-ai-code/core';
import { glob } from 'fast-glob';

type CongestionResult = Awaited<ReturnType<typeof analyzeDeveloperCongestion>>;
type KnowledgeResult = Awaited<ReturnType<typeof analyzeKnowledgeLoss>>;
type CoupledPair = Awaited<ReturnType<typeof analyzeTemporalCoupling>>[number];

const MIN_CONGESTION = 5, MIN_OWNERSHIP = 0.8, MIN_COUPLING = 0.5, MAX_PAIRS = 10;

/** Globs all TypeScript and JavaScript files in the project, excluding tests and build output. */
export async function collectProjectFiles(projectPath: string): Promise<string[]> {
  return glob('**/*.{ts,js}', { cwd: projectPath, ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*'], absolute: true });
}

/** Runs congestion, knowledge-loss, and temporal-coupling analyses in parallel. */
export async function analyzeAllFiles(projectPath: string, files: string[]) {
  return Promise.all([Promise.all(files.map(f => analyzeDeveloperCongestion(projectPath, f))), Promise.all(files.map(f => analyzeKnowledgeLoss(projectPath, f))), analyzeTemporalCoupling(projectPath, files)]);
}

/** Filters analysis results to only the high-risk entries for each category. */
export function filterRisks(congestionResults: CongestionResult[], knowledgeResults: KnowledgeResult[], coupledPairs: CoupledPair[]) {
  return {
    highCongestion: congestionResults.filter(r => r.authorCount >= MIN_CONGESTION),
    singleOwner: knowledgeResults.filter(r => r.primaryOwnershipRatio >= MIN_OWNERSHIP),
    highCoupling: coupledPairs.filter(p => p.couplingStrength > MIN_COUPLING),
  };
}

/** Assembles the final response body from filtered risk results. */
export function buildResponseBody(projectPath: string, files: string[], highCongestion: CongestionResult[], singleOwner: KnowledgeResult[], highCoupling: CoupledPair[]) {
  return {
    projectPath,
    summary: { totalFiles: files.length, congestionRisk: highCongestion.length, singleOwnerRisk: singleOwner.length, hiddenCouplingPairs: highCoupling.length },
    developerCongestion: highCongestion.map(r => ({ file: r.filePath, authors: r.authorCount, severity: r.smell?.severity })),
    knowledgeRisk: singleOwner.map(r => ({ file: r.filePath, primaryAuthor: r.primaryAuthor, ownershipRatio: (r.primaryOwnershipRatio * 100).toFixed(0) + '%', busFactorEstimate: r.busFactorEstimate })),
    temporalCoupling: highCoupling.slice(0, MAX_PAIRS).map(p => ({ fileA: p.fileA, fileB: p.fileB, coChanges: p.coChangeCount, coupling: (p.couplingStrength * 100).toFixed(0) + '%', severity: p.severity })),
  };
}
