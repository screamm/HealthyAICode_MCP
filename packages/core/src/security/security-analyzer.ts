// packages/core/src/security/security-analyzer.ts
// Orchestrator: combines secret detection + injection detection + aggregation + SARIF.
// Sprint 28 — static + mock-LLM (confidence=0.5) phase.

import { detectSecrets } from './secret-detection';
import { detectInjectionRisks } from './injection-detector';
import { aggregateFindings } from './aggregator';
import { formatAsSarif } from './sarif-formatter';
import { assessFinding } from './llm-assessor';
import type { StaticFinding, AggregatedFinding, SarifReport, ScanDepth } from './types';

export interface SecurityAuditFileResult {
  filePath: string;
  findings: AggregatedFinding[];
  riskScore: number;
  sarif: SarifReport;
}

export interface AuditFileInput {
  path: string;
  content: string;
  language: string;
}

/**
 * Audit a set of files for security vulnerabilities.
 *
 * Each file is analyzed with:
 *  1. Secret detection (regex + entropy)
 *  2. Injection risk detection (SQL, XSS, command, path traversal)
 *  3. Aggregation with stub LLM score (confidence = 0.5)
 *  4. SARIF formatting
 *
 * The riskScore is the average combined_score of findings, scaled to [0, 10].
 */
export async function auditSecurity(
  files: AuditFileInput[],
  depth: ScanDepth = 'standard',
): Promise<SecurityAuditFileResult[]> {
  const results: SecurityAuditFileResult[] = [];

  for (const file of files) {
    const staticFindings: StaticFinding[] = [];

    // Secret detection
    for (const sf of detectSecrets(file.content, file.path)) {
      staticFindings.push(sf);
    }

    // Injection risk detection — attach filePath
    for (const inj of detectInjectionRisks(file.content, file.language)) {
      staticFindings.push({ ...inj, filePath: file.path });
    }

    // Aggregate each static finding with a stub LLM assessment
    const aggregated: AggregatedFinding[] = [];
    for (const sf of staticFindings) {
      const assessment = await assessFinding(sf, file.content, depth);
      aggregated.push(aggregateFindings(sf, assessment));
    }

    // Compute file risk score [0, 10]
    const riskScore =
      aggregated.length === 0
        ? 0
        : Math.min(
            10,
            (aggregated.reduce((sum, f) => sum + f.combined_score, 0) / aggregated.length) * 10,
          );

    results.push({
      filePath: file.path,
      findings: aggregated,
      riskScore: parseFloat(riskScore.toFixed(2)),
      sarif: formatAsSarif(aggregated),
    });
  }

  return results;
}
