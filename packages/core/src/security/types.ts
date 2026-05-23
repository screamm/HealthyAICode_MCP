// packages/core/src/security/types.ts
// Shared type vocabulary for all security analysis layers (Sprint 28).

export type SecurityFindingType =
  | 'SqlInjectionRisk'
  | 'XssRisk'
  | 'CommandInjectionRisk'
  | 'HardcodedCredential'
  | 'HardcodedApiKey'
  | 'UnsafeDeserialization'
  | 'PathTraversalRisk'
  | 'DependencyVulnerability';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Exploitability = 'trivial' | 'moderate' | 'complex' | 'theoretical';
export type ScanDepth = 'quick' | 'standard' | 'deep';

/** A finding produced by the deterministic static analysis layer. */
export interface StaticFinding {
  type: SecurityFindingType;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  filePath: string;
  /** ±3 lines of surrounding code. */
  codeSnippet: string;
  /** Deterministic risk score in [0, 1]. */
  static_score: number;
  /** Variable or expression that is the taint source (if taint tracking produced this finding). */
  taintSource?: string;
  /** Sink category (sql_query | shell_command | file_path | html_output) if applicable. */
  taintSink?: string;
}

/** Assessment returned by the LLM layer for a single static finding. */
export interface LlmAssessment {
  confidence: number;
  severity: Severity;
  false_positive_likelihood: number;
  exploitability: Exploitability;
  remediation_code: string;
  explanation: string;
  model_used: string;
  cost_usd: number;
}

/** Combined result after aggregating static finding with LLM assessment. */
export interface AggregatedFinding extends StaticFinding {
  llm_assessment: LlmAssessment;
  /** combined_score = 0.4 * static_score + 0.6 * llm_confidence */
  combined_score: number;
  /** True when static_score and llm_confidence diverge significantly. */
  disagreement: boolean;
  /** True when disagreement is true — flagged for human review. */
  requires_manual_review: boolean;
}

/** Full result of a security audit run across files. */
export interface SecurityAuditResult {
  directory: string;
  language: string;
  depth: ScanDepth;
  scanned_files: number;
  findings: AggregatedFinding[];
  total_cost_usd: number;
  sarif: SarifReport;
}

// ── Minimal SARIF 2.1.0 subset ───────────────────────────────────────────────

export interface SarifReport {
  version: '2.1.0';
  runs: SarifRun[];
}

export interface SarifRun {
  tool: { driver: { name: string; version: string } };
  results: SarifResult[];
}

export interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: SarifLocation[];
  properties: Record<string, unknown>;
}

export interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region: { startLine: number; startColumn: number };
  };
}
