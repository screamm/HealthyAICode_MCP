// packages/core/src/security/sarif-taxonomy.ts
// CWE/OWASP taxonomy mapping for biomarkers + SARIF 2.1.0 taxa section builder.
// Sprint 59.

import type { SmellType } from '../types';

/** A CWE taxonomy entry mapping a SmellType to a CWE identifier. */
export interface CweEntry {
  id: string;
  name: string;
  helpUri: string;
}

/**
 * SARIF 2.1.0 taxonomy object for inclusion in `run.taxonomies[]`.
 * Mirrors the structure used by CodeQL and other SARIF producers.
 */
export interface SarifTaxonomy {
  name: string;
  version: string;
  organization: string;
  shortDescription: { text: string };
  informationUri: string;
  isComprehensive: boolean;
  downloadUri: string;
  taxa: SarifTaxon[];
}

/** A single entry within a SARIF taxonomy. */
export interface SarifTaxon {
  id: string;
  name: string;
  shortDescription: { text: string };
  helpUri: string;
}

/**
 * Mapping from SmellType to CWE identifier for all SecurityFindingType members
 * plus the new Sprint 58 security smell types.
 */
export const SMELL_TO_CWE: Partial<Record<SmellType, CweEntry>> = {
  SqlInjectionRisk: {
    id: 'CWE-89',
    name: 'SQL Injection',
    helpUri: 'https://cwe.mitre.org/data/definitions/89.html',
  },
  XssRisk: {
    id: 'CWE-79',
    name: 'Cross-site Scripting',
    helpUri: 'https://cwe.mitre.org/data/definitions/79.html',
  },
  CommandInjectionRisk: {
    id: 'CWE-78',
    name: 'OS Command Injection',
    helpUri: 'https://cwe.mitre.org/data/definitions/78.html',
  },
  HardcodedCredential: {
    id: 'CWE-798',
    name: 'Use of Hard-coded Credentials',
    helpUri: 'https://cwe.mitre.org/data/definitions/798.html',
  },
  HardcodedApiKey: {
    id: 'CWE-321',
    name: 'Use of Hard-coded Cryptographic Key',
    helpUri: 'https://cwe.mitre.org/data/definitions/321.html',
  },
  UnsafeDeserialization: {
    id: 'CWE-502',
    name: 'Deserialization of Untrusted Data',
    helpUri: 'https://cwe.mitre.org/data/definitions/502.html',
  },
  PathTraversalRisk: {
    id: 'CWE-22',
    name: 'Path Traversal',
    helpUri: 'https://cwe.mitre.org/data/definitions/22.html',
  },
  DependencyVulnerability: {
    id: 'CWE-1395',
    name: 'Dependency on Vulnerable Third-Party Component',
    helpUri: 'https://cwe.mitre.org/data/definitions/1395.html',
  },
  SsrfRisk: {
    id: 'CWE-918',
    name: 'Server-Side Request Forgery (SSRF)',
    helpUri: 'https://cwe.mitre.org/data/definitions/918.html',
  },
  CryptographicMisuseRisk: {
    id: 'CWE-327',
    name: 'Use of a Broken or Risky Cryptographic Algorithm',
    helpUri: 'https://cwe.mitre.org/data/definitions/327.html',
  },
  HallucinatedPackageImport: {
    id: 'CWE-829',
    name: 'Inclusion of Functionality from Untrusted Control Sphere',
    helpUri: 'https://cwe.mitre.org/data/definitions/829.html',
  },
};

/**
 * Build a SARIF 2.1.0-compatible taxa section pointing to the official CWE taxonomy.
 * Include this in `run.taxonomies[]` to enable CWE filtering in SARIF consumers.
 *
 * @example
 * const taxonomy = buildTaxaSection();
 * sarifRun.taxonomies = [taxonomy];
 */
export function buildTaxaSection(): SarifTaxonomy {
  const taxa: SarifTaxon[] = Object.values(SMELL_TO_CWE).map((entry) => ({
    id: entry.id,
    name: entry.name,
    shortDescription: { text: entry.name },
    helpUri: entry.helpUri,
  }));

  return {
    name: 'CWE',
    version: '4.14',
    organization: 'MITRE',
    shortDescription: {
      text: 'The MITRE Common Weakness Enumeration (CWE) taxonomy of software weaknesses.',
    },
    informationUri: 'https://cwe.mitre.org/',
    isComprehensive: false,
    downloadUri:
      'https://raw.githubusercontent.com/sarif-standard/taxonomies/main/CWE_v4.4.sarif',
    taxa,
  };
}
