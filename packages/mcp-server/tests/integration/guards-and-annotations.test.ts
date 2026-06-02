// packages/mcp-server/tests/integration/guards-and-annotations.test.ts
//
// Sprint hardening — end-to-end checks that:
//   1. file-access tool handlers reject path traversal and oversized files,
//   2. tool registrations carry English descriptions and MCP annotations.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { tmpdir } from 'os';

import { registerCodeHealthScore, handleCodeHealthScore } from '../../src/tools/code-health-score';
import { registerAutoRefactorApply } from '../../src/tools/auto-refactor-apply';
import { registerCodeHealthReview } from '../../src/tools/code-health-review';
import { registerSecurityAudit } from '../../src/tools/security-audit';
import { registerDebtGoalsTools } from '../../src/tools/debt-goals';
import { MAX_FILE_SIZE_BYTES } from '../../src/tools/path-safety';

// A capturing mock that records the full registerTool config object.
class CapturingMcpServer {
  public registered = new Map<
    string,
    { config: Record<string, unknown>; handler: (a: Record<string, unknown>) => Promise<unknown> }
  >();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool(name: string, config: any, handler: any): void {
    this.registered.set(name, { config, handler });
  }
  // legacy shim (should be unused after migration, but kept for safety)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool(name: string, _d: string, _s: any, handler: any): void {
    this.registered.set(name, { config: { legacy: true }, handler });
  }
  async call(name: string, args: Record<string, unknown>): Promise<{ content: { text: string }[]; isError?: boolean }> {
    const entry = this.registered.get(name);
    if (!entry) throw new Error(`Tool ${name} not registered`);
    return entry.handler(args) as Promise<{ content: { text: string }[]; isError?: boolean }>;
  }
}

// ── Guards via a real handler ────────────────────────────────────────────────

describe('security guard: path traversal is rejected by file-access handlers', () => {
  it('code_health_score: NUL-byte path is rejected as an error', async () => {
    const result = await handleCodeHealthScore('evil' + String.fromCharCode(0) + '.ts');
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/NUL byte/i);
    expect(parsed.rejected).toBe(true);
  });

  it('pre_commit safeguard rejects a relative file escaping the repo base', async () => {
    const { registerPreCommitSafeguard } = await import('../../src/tools/pre-commit-safeguard');
    const server = new CapturingMcpServer();
    registerPreCommitSafeguard(server as never);
    const result = await server.call('pre_commit_code_health_safeguard', {
      repoPath: path.resolve(tmpdir(), 'some-repo'),
      files: ['../../../etc/passwd'],
    });
    const parsed = JSON.parse(result.content[0].text);
    // The single bad file surfaces a traversal error, never analysed.
    expect(parsed.results[0].error).toMatch(/traversal|escapes/i);
  });
});

describe('security guard: oversized files are rejected', () => {
  let dir: string;
  let bigFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(tmpdir(), 'haic-guard-'));
    bigFile = path.join(dir, 'huge.ts');
    fs.writeFileSync(bigFile, Buffer.alloc(MAX_FILE_SIZE_BYTES + 4096, 0x41));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('code_health_score returns an error for a file above the 5 MB cap', async () => {
    const result = await handleCodeHealthScore(bigFile);
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/exceeding|cap|MB/i);
  });

  it('auto_refactor_apply (writes to disk) refuses to read an oversized file', async () => {
    const server = new CapturingMcpServer();
    registerAutoRefactorApply(server as never);
    const result = await server.call('code_health_auto_refactor_apply', { filePath: bigFile });
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/exceeding|cap|MB/i);
    // The original file must be unchanged (no write happened) and no .bak created.
    expect(fs.existsSync(bigFile + '.bak')).toBe(false);
  });
});

// ── English descriptions + annotations ───────────────────────────────────────

/** Latin-1 supplement letters used in Swedish (å ä ö Å Ä Ö). */
const SWEDISH_CHARS = /[åäöÅÄÖ]/;

describe('tool registrations: English descriptions', () => {
  it('code_health_score has an English description with no Swedish characters', () => {
    const server = new CapturingMcpServer();
    registerCodeHealthScore(server as never);
    const cfg = server.registered.get('code_health_score')!.config;
    const desc = cfg['description'] as string;
    expect(desc).toBeTruthy();
    expect(desc).not.toMatch(SWEDISH_CHARS);
    // A keyword an English-speaking model would key on for tool selection.
    expect(desc.toLowerCase()).toContain('health score');
  });

  it('code_health_review description is English and mentions loopComplete', () => {
    const server = new CapturingMcpServer();
    registerCodeHealthReview(server as never);
    const cfg = server.registered.get('code_health_review')!.config;
    const desc = cfg['description'] as string;
    expect(desc).not.toMatch(SWEDISH_CHARS);
    expect(desc).toContain('loopComplete');
  });

  it('security_audit description is English', () => {
    const server = new CapturingMcpServer();
    registerSecurityAudit(server as never);
    const cfg = server.registered.get('code_health_security_audit')!.config;
    expect(cfg['description']).not.toMatch(SWEDISH_CHARS);
  });
});

describe('tool registrations: MCP annotations', () => {
  it('read-only analysis tools declare readOnlyHint: true', () => {
    const server = new CapturingMcpServer();
    registerCodeHealthScore(server as never);
    registerCodeHealthReview(server as never);
    registerSecurityAudit(server as never);
    for (const name of ['code_health_score', 'code_health_review', 'code_health_security_audit']) {
      const ann = server.registered.get(name)!.config['annotations'] as Record<string, unknown>;
      expect(ann).toBeDefined();
      expect(ann['readOnlyHint']).toBe(true);
    }
  });

  it('auto_refactor_apply declares destructiveHint: true (writes to disk)', () => {
    const server = new CapturingMcpServer();
    registerAutoRefactorApply(server as never);
    const ann = server.registered.get('code_health_auto_refactor_apply')!.config['annotations'] as Record<string, unknown>;
    expect(ann['readOnlyHint']).toBe(false);
    expect(ann['destructiveHint']).toBe(true);
  });

  it('debt_goal_remove declares destructiveHint: true; list is read-only', () => {
    const server = new CapturingMcpServer();
    registerDebtGoalsTools(server as never);
    const removeAnn = server.registered.get('code_health_debt_goal_remove')!.config['annotations'] as Record<string, unknown>;
    const listAnn = server.registered.get('code_health_debt_goals_list')!.config['annotations'] as Record<string, unknown>;
    expect(removeAnn['destructiveHint']).toBe(true);
    expect(listAnn['readOnlyHint']).toBe(true);
  });
});
