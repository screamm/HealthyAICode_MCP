// packages/core/tests/security/sarif-taxonomy.test.ts
// Unit tests for CWE/OWASP taxonomy mapping (Sprint 59).

import { describe, it, expect } from 'vitest';
import { SMELL_TO_CWE, buildTaxaSection } from '../../src/security/sarif-taxonomy';

describe('SMELL_TO_CWE', () => {
  it('maps SqlInjectionRisk to CWE-89', () => {
    expect(SMELL_TO_CWE['SqlInjectionRisk']?.id).toBe('CWE-89');
    expect(SMELL_TO_CWE['SqlInjectionRisk']?.name).toBe('SQL Injection');
    expect(SMELL_TO_CWE['SqlInjectionRisk']?.helpUri).toContain('89.html');
  });

  it('maps XssRisk to CWE-79', () => {
    expect(SMELL_TO_CWE['XssRisk']?.id).toBe('CWE-79');
    expect(SMELL_TO_CWE['XssRisk']?.name).toBe('Cross-site Scripting');
  });

  it('maps CommandInjectionRisk to CWE-78', () => {
    expect(SMELL_TO_CWE['CommandInjectionRisk']?.id).toBe('CWE-78');
  });

  it('maps HardcodedCredential to CWE-798', () => {
    expect(SMELL_TO_CWE['HardcodedCredential']?.id).toBe('CWE-798');
  });

  it('maps HardcodedApiKey to CWE-321', () => {
    expect(SMELL_TO_CWE['HardcodedApiKey']?.id).toBe('CWE-321');
  });

  it('maps UnsafeDeserialization to CWE-502', () => {
    expect(SMELL_TO_CWE['UnsafeDeserialization']?.id).toBe('CWE-502');
  });

  it('maps PathTraversalRisk to CWE-22', () => {
    expect(SMELL_TO_CWE['PathTraversalRisk']?.id).toBe('CWE-22');
  });

  it('maps DependencyVulnerability to CWE-1395', () => {
    expect(SMELL_TO_CWE['DependencyVulnerability']?.id).toBe('CWE-1395');
  });

  it('maps SsrfRisk to CWE-918', () => {
    expect(SMELL_TO_CWE['SsrfRisk']?.id).toBe('CWE-918');
  });

  it('all entries have non-empty id, name, and helpUri', () => {
    for (const [smellType, entry] of Object.entries(SMELL_TO_CWE)) {
      expect(entry?.id, `${smellType}.id`).toBeTruthy();
      expect(entry?.name, `${smellType}.name`).toBeTruthy();
      expect(entry?.helpUri, `${smellType}.helpUri`).toMatch(/^https?:\/\//);
    }
  });
});

describe('buildTaxaSection', () => {
  it('returns a taxonomy with name "CWE"', () => {
    const taxa = buildTaxaSection();
    expect(taxa.name).toBe('CWE');
  });

  it('returns organization "MITRE"', () => {
    expect(buildTaxaSection().organization).toBe('MITRE');
  });

  it('returns isComprehensive false (we only map our biomarkers, not all CWEs)', () => {
    expect(buildTaxaSection().isComprehensive).toBe(false);
  });

  it('includes a taxa array with one entry per mapped smell', () => {
    const section = buildTaxaSection();
    expect(section.taxa.length).toBeGreaterThanOrEqual(8); // minimum 8 core security smells
    const ids = section.taxa.map((t) => t.id);
    expect(ids).toContain('CWE-89'); // SqlInjectionRisk
    expect(ids).toContain('CWE-79'); // XssRisk
    expect(ids).toContain('CWE-798'); // HardcodedCredential
  });

  it('each taxon has id, name, shortDescription, and helpUri', () => {
    for (const taxon of buildTaxaSection().taxa) {
      expect(taxon.id).toBeTruthy();
      expect(taxon.name).toBeTruthy();
      expect(taxon.shortDescription.text).toBeTruthy();
      expect(taxon.helpUri).toMatch(/^https?:\/\//);
    }
  });

  it('downloadUri points to the official sarif-standard taxonomies', () => {
    expect(buildTaxaSection().downloadUri).toContain('sarif-standard/taxonomies');
  });

  it('informationUri points to cwe.mitre.org', () => {
    expect(buildTaxaSection().informationUri).toContain('cwe.mitre.org');
  });
});
