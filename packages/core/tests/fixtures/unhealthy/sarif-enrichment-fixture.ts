// Fixture: unhealthy TypeScript file with SqlInjectionRisk, HardcodedCredential and XssRisk.
// Used to drive SARIF-enrichment unit tests (Sprint 59).

import type { AggregatedFinding } from '../../../src/security/types';

/** A minimal LLM assessment stub for fixture use. */
const stubAssessment = {
  confidence: 0.9,
  severity: 'high' as const,
  false_positive_likelihood: 0.05,
  exploitability: 'moderate' as const,
  remediation_code: '// fix it',
  explanation: 'This is a test finding',
  model_used: 'claude-sonnet-4-6',
  cost_usd: 0.001,
};

/** Findings used in SARIF-enrichment tests. */
export const SARIF_ENRICHMENT_FINDINGS: AggregatedFinding[] = [
  {
    type: 'SqlInjectionRisk',
    line: 12,
    column: 5,
    endLine: 12,
    endColumn: 60,
    filePath: 'src/app.ts',
    codeSnippet: "  return `SELECT * FROM users WHERE id = '${userId}'`;",
    static_score: 0.9,
    taintSource: 'userId',
    taintSink: 'sql_query',
    llm_assessment: {
      ...stubAssessment,
      severity: 'critical',
      exploitability: 'trivial',
    },
    combined_score: 0.92,
    disagreement: false,
    requires_manual_review: false,
  },
  {
    type: 'HardcodedCredential',
    line: 3,
    column: 1,
    endLine: 3,
    endColumn: 45,
    filePath: 'src/app.ts',
    codeSnippet: "const DB_PASSWORD = 'super-secret-pass-1234';",
    static_score: 0.95,
    llm_assessment: {
      ...stubAssessment,
      severity: 'critical',
      exploitability: 'trivial',
    },
    combined_score: 0.95,
    disagreement: false,
    requires_manual_review: false,
  },
  {
    type: 'XssRisk',
    line: 27,
    column: 3,
    endLine: 27,
    endColumn: 50,
    filePath: 'src/app.ts',
    codeSnippet: '  res.send(`<h1>Hello ${req.query.name}</h1>`);',
    static_score: 0.8,
    taintSource: 'req.query.name',
    taintSink: 'html_output',
    llm_assessment: {
      ...stubAssessment,
      severity: 'high',
      exploitability: 'moderate',
    },
    combined_score: 0.84,
    disagreement: false,
    requires_manual_review: false,
  },
];

// ── Raw TypeScript code that corresponds to the above findings ─────────────────

export const DB_PASSWORD = 'super-secret-pass-1234'; // HardcodedCredential

export function queryUser(userId: string): string {
  // SqlInjectionRisk: user input directly interpolated into SQL
  return `SELECT * FROM users WHERE id = '${userId}'`;
}

export function greetUser(name: string): string {
  // XssRisk: user input interpolated into HTML without escaping
  return `<h1>Hello ${name}</h1>`;
}
