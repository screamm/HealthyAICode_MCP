// packages/core/src/security/sarif-formatter.ts
// SARIF 2.1.0 compatible output formatter. Pure data transformation, no external deps.
// Sprint 28.

import type { AggregatedFinding, SarifReport, SarifResult } from './types';

const SEVERITY_TO_LEVEL: Record<string, 'error' | 'warning' | 'note'> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'note',
};

/**
 * Format an array of AggregatedFindings into a SARIF 2.1.0 report.
 */
export function formatAsSarif(
  findings: AggregatedFinding[],
  toolVersion = '1.0.0',
): SarifReport {
  return {
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'HealthyAICode-SecurityAudit', version: toolVersion } },
        results: findings.map(toSarifResult),
      },
    ],
  };
}

function toSarifResult(f: AggregatedFinding): SarifResult {
  return {
    ruleId: f.type,
    level: SEVERITY_TO_LEVEL[f.llm_assessment.severity] ?? 'warning',
    message: { text: f.llm_assessment.explanation },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.filePath },
          region: { startLine: f.line, startColumn: f.column },
        },
      },
    ],
    properties: {
      static_score: f.static_score,
      llm_confidence: f.llm_assessment.confidence,
      combined_score: f.combined_score,
      false_positive_likelihood: f.llm_assessment.false_positive_likelihood,
      exploitability: f.llm_assessment.exploitability,
      remediation_code: f.llm_assessment.remediation_code,
      disagreement: f.disagreement,
      requires_manual_review: f.requires_manual_review,
      model_used: f.llm_assessment.model_used,
      cost_usd: f.llm_assessment.cost_usd,
    },
  };
}
