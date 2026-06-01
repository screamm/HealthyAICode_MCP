// packages/core/src/security/sarif-formatter.ts
// SARIF 2.1.0 compatible output formatter. Pure data transformation, no external deps.
// Sprint 28. Updated sprint sarif-unify: adds partialFingerprints (GitHub dedup key)
// and security-severity (GitHub Advanced Security) via shared sarif-enrichment helper,
// unifying both SARIF output paths.

import type { AggregatedFinding, SarifReport } from './types';
import {
  primaryLocationLineHash,
  severityToSarifLevel,
  SECURITY_SEVERITY_MAP,
} from './sarif-enrichment';

/** Official SARIF 2.1.0 JSON Schema URI as published at SchemaStore. */
export const SARIF_SCHEMA_URI = 'https://json.schemastore.org/sarif-2.1.0.json';

/** One SARIF rule entry per SecurityFindingType. */
const SECURITY_RULES: ReadonlyArray<{
  id: string;
  name: string;
  text: string;
  cweId?: string;
  helpUri: string;
}> = [
  {
    id: 'HAC101',
    name: 'SqlInjectionRisk',
    text: 'Potential SQL injection vulnerability (CWE-89)',
    cweId: 'CWE-89',
    helpUri: 'https://cwe.mitre.org/data/definitions/89.html',
  },
  {
    id: 'HAC102',
    name: 'XssRisk',
    text: 'Potential cross-site scripting vulnerability (CWE-79)',
    cweId: 'CWE-79',
    helpUri: 'https://cwe.mitre.org/data/definitions/79.html',
  },
  {
    id: 'HAC103',
    name: 'CommandInjectionRisk',
    text: 'Potential OS command injection vulnerability (CWE-78)',
    cweId: 'CWE-78',
    helpUri: 'https://cwe.mitre.org/data/definitions/78.html',
  },
  {
    id: 'HAC104',
    name: 'HardcodedCredential',
    text: 'Hard-coded credential detected (CWE-798)',
    cweId: 'CWE-798',
    helpUri: 'https://cwe.mitre.org/data/definitions/798.html',
  },
  {
    id: 'HAC105',
    name: 'HardcodedApiKey',
    text: 'Hard-coded API key detected (CWE-321)',
    cweId: 'CWE-321',
    helpUri: 'https://cwe.mitre.org/data/definitions/321.html',
  },
  {
    id: 'HAC106',
    name: 'UnsafeDeserialization',
    text: 'Deserialization of untrusted data (CWE-502)',
    cweId: 'CWE-502',
    helpUri: 'https://cwe.mitre.org/data/definitions/502.html',
  },
  {
    id: 'HAC107',
    name: 'PathTraversalRisk',
    text: 'Potential path traversal vulnerability (CWE-22)',
    cweId: 'CWE-22',
    helpUri: 'https://cwe.mitre.org/data/definitions/22.html',
  },
  {
    id: 'HAC108',
    name: 'DependencyVulnerability',
    text: 'Dependency on vulnerable third-party component (CWE-1395)',
    cweId: 'CWE-1395',
    helpUri: 'https://cwe.mitre.org/data/definitions/1395.html',
  },
];

const NAME_TO_RULE_ID: ReadonlyMap<string, string> = new Map(
  SECURITY_RULES.map((r) => [r.name, r.id]),
);

// ──────────────────────────────────────────────────────────────────────────────
// Internal enriched types — not exported; the public API return type is SarifReport
// ──────────────────────────────────────────────────────────────────────────────

/** SARIF result with partialFingerprints added (superset of SarifResult). */
interface EnrichedSarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: object[];
  /** GitHub Code Quality dedup key — required for alert deduplication across runs. */
  partialFingerprints: { primaryLocationLineHash: string };
  properties: Record<string, unknown>;
}

/** SARIF rule with optional security-severity (superset of baseline rule shape). */
interface EnrichedSarifRule {
  id: string;
  name: string;
  shortDescription: { text: string };
  helpUri: string;
  properties: { tags: string[]; 'security-severity'?: string };
}

/**
 * Format an array of AggregatedFindings into a SARIF 2.1.0 report.
 *
 * The report includes (sprint sarif-unify enrichment):
 * - `$schema` pointing to the official SchemaStore SARIF 2.1.0 schema
 * - `tool.driver.rules` with `security-severity` property for GitHub Advanced Security
 * - `result.partialFingerprints.primaryLocationLineHash` for GitHub Code Quality dedup
 * - `originalUriBaseIds` so paths resolve relative to the repository root
 */
export function formatAsSarif(
  findings: AggregatedFinding[],
  toolVersion = '1.0.0',
): SarifReport {
  const usedRuleIds = new Set(findings.map((f) => NAME_TO_RULE_ID.get(f.type) ?? f.type));

  const rules: EnrichedSarifRule[] = SECURITY_RULES.filter((r) =>
    usedRuleIds.has(r.id),
  ).map((r) => {
    const secSeverity = SECURITY_SEVERITY_MAP[r.name as keyof typeof SECURITY_SEVERITY_MAP];
    return {
      id: r.id,
      name: r.name,
      shortDescription: { text: r.text },
      helpUri: r.helpUri,
      properties: {
        tags: ['security'],
        ...(secSeverity !== undefined ? { 'security-severity': secSeverity } : {}),
      },
    };
  });

  const results: EnrichedSarifResult[] = findings.map((f) =>
    toEnrichedSarifResult(f, NAME_TO_RULE_ID),
  );

  // SarifReport.runs[].results is typed as SarifResult[] in types.ts (Foundation-owned,
  // must not be edited). EnrichedSarifResult is a structural superset; cast via unknown.
  return {
    version: '2.1.0',
    $schema: SARIF_SCHEMA_URI,
    runs: [
      {
        tool: {
          driver: {
            name: 'HealthyAICode-SecurityAudit',
            version: toolVersion,
            informationUri: 'https://github.com/screamm/healthy-ai-code-mcp',
            rules,
          },
        },
        results: results as unknown as SarifReport['runs'][0]['results'],
        originalUriBaseIds: {
          '%SRCROOT%': { uri: 'file:///' },
        },
      },
    ],
  } as unknown as SarifReport;
}

function toEnrichedSarifResult(
  f: AggregatedFinding,
  nameToId: ReadonlyMap<string, string>,
): EnrichedSarifResult {
  const ruleId = nameToId.get(f.type) ?? f.type;
  return {
    ruleId,
    level: severityToSarifLevel(f.llm_assessment.severity),
    message: { text: f.llm_assessment.explanation },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: f.filePath,
            uriBaseId: '%SRCROOT%',
          },
          region: { startLine: f.line, startColumn: f.column },
        },
      },
    ],
    partialFingerprints: {
      primaryLocationLineHash: primaryLocationLineHash(f.filePath, f.type, f.line),
    },
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
