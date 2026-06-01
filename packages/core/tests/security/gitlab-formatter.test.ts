// packages/core/tests/security/gitlab-formatter.test.ts
// Unit tests for the GitLab Code Quality JSON formatter (Sprint 59).

import { describe, it, expect } from 'vitest';
import { formatAsGitlabJson } from '../../src/security/gitlab-formatter';
import {
  GITLAB_FORMAT_SMELLS,
  GITLAB_FORMAT_FILE_PATH,
} from '../fixtures/unhealthy/gitlab-format-fixture';

describe('formatAsGitlabJson', () => {
  it('returns an empty array when no smells are provided', () => {
    expect(formatAsGitlabJson([], 'src/app.ts')).toHaveLength(0);
  });

  it('returns one entry per smell', () => {
    const result = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
    expect(result).toHaveLength(GITLAB_FORMAT_SMELLS.length);
  });

  describe('severity mapping', () => {
    it('maps critical smell to "critical"', () => {
      const result = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
      const critical = result.find((r) => r.check_name === 'SqlInjectionRisk');
      expect(critical?.severity).toBe('critical');
    });

    it('maps high smell to "major"', () => {
      const result = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
      const major = result.find((r) => r.check_name === 'ComplexMethod');
      expect(major?.severity).toBe('major');
    });

    it('maps low smell to "info"', () => {
      const result = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
      const info = result.find((r) => r.check_name === 'LowDocCoverage');
      expect(info?.severity).toBe('info');
    });
  });

  describe('fingerprint', () => {
    it('fingerprint is a 32-character hex string (MD5)', () => {
      const result = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
      for (const entry of result) {
        expect(entry.fingerprint).toMatch(/^[0-9a-f]{32}$/);
      }
    });

    it('fingerprint is deterministic across calls', () => {
      const r1 = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
      const r2 = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
      for (let i = 0; i < r1.length; i++) {
        expect(r1[i]!.fingerprint).toBe(r2[i]!.fingerprint);
      }
    });

    it('different smells produce different fingerprints', () => {
      const result = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
      const fps = result.map((r) => r.fingerprint);
      const unique = new Set(fps);
      expect(unique.size).toBe(fps.length);
    });
  });

  describe('location.path', () => {
    it('strips leading ./ from file path', () => {
      const result = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, './src/order-service.ts');
      for (const entry of result) {
        expect(entry.location.path).not.toMatch(/^\.\//);
        expect(entry.location.path).toBe('src/order-service.ts');
      }
    });

    it('does not strip leading ./ from paths without it', () => {
      const result = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
      for (const entry of result) {
        expect(entry.location.path).toBe(GITLAB_FORMAT_FILE_PATH);
      }
    });

    it('sets location.lines.begin to smell.line', () => {
      const result = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
      expect(result[0]!.location.lines.begin).toBe(GITLAB_FORMAT_SMELLS[0]!.line);
      expect(result[1]!.location.lines.begin).toBe(GITLAB_FORMAT_SMELLS[1]!.line);
      expect(result[2]!.location.lines.begin).toBe(GITLAB_FORMAT_SMELLS[2]!.line);
    });
  });

  describe('other fields', () => {
    it('sets check_name to smell.type', () => {
      const result = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
      expect(result[0]!.check_name).toBe('SqlInjectionRisk');
      expect(result[1]!.check_name).toBe('ComplexMethod');
      expect(result[2]!.check_name).toBe('LowDocCoverage');
    });

    it('sets description to smell.description', () => {
      const result = formatAsGitlabJson(GITLAB_FORMAT_SMELLS, GITLAB_FORMAT_FILE_PATH);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]!.description).toBe(GITLAB_FORMAT_SMELLS[i]!.description);
      }
    });
  });
});
