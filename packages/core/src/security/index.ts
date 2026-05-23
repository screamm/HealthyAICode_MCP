// packages/core/src/security/index.ts
// Public API for the Sprint 28 security module.

export type {
  SecurityFindingType,
  StaticFinding,
  LlmAssessment,
  AggregatedFinding,
  SecurityAuditResult,
  SarifReport,
  SarifRun,
  SarifResult,
  SarifLocation,
  Severity,
  Exploitability,
  ScanDepth,
} from './types';

export { detectSecrets, shannonEntropy, SECRET_KEYWORDS, HIGH_ENTROPY_THRESHOLD, MIN_SECRET_LENGTH } from './secret-detection';
export { detectInjectionRisks } from './injection-detector';
export type { InjectionFinding } from './injection-detector';
export { aggregateFindings, detectDisagreement } from './aggregator';
export { formatAsSarif } from './sarif-formatter';
export { estimateScanCost } from './cost-estimation';
export type { CostEstimate } from './cost-estimation';
export { assessFinding, buildAssessmentPrompt, parseAssessmentResponse } from './llm-assessor';
export { auditSecurity } from './security-analyzer';
export type { SecurityAuditFileResult, AuditFileInput } from './security-analyzer';
