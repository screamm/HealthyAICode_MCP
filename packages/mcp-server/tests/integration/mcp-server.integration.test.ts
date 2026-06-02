import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import { registerCodeHealthScore } from '../../src/tools/code-health-score';
import { registerCodeHealthReview } from '../../src/tools/code-health-review';
import { registerPreCommitSafeguard } from '../../src/tools/pre-commit-safeguard';
import { registerAnalyzeChangeSet } from '../../src/tools/analyze-change-set';
import { registerRefactoringBusinessCase } from '../../src/tools/refactoring-business-case';
import { registerExplainCodeHealth, registerExplainProductivity } from '../../src/tools/explain-code-health';

class MockMcpServer {
  private tools: Map<string, Function> = new Map();
  /** Legacy tool registration (deprecated SDK API). */
  tool(name: string, _desc: string, _schema: any, handler: Function): void {
    this.tools.set(name, handler);
  }
  /** New tool registration with config object (used by code_health_review and code_health_auto_refactor). */
  registerTool(name: string, _config: any, handler: Function): void {
    this.tools.set(name, handler);
  }
  async callTool(name: string, args: any): Promise<any> {
    const handler = this.tools.get(name);
    if (!handler) throw new Error(`Tool ${name} not found`);
    return handler(args);
  }
  getRegisteredToolNames(): string[] {
    return Array.from(this.tools.keys());
  }
}

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const HEALTHY_FILE = path.join(FIXTURES_DIR, 'healthy.ts');
const UNHEALTHY_FILE = path.join(FIXTURES_DIR, 'unhealthy.ts');

describe('MCP Server Integration', () => {
  let server: MockMcpServer;

  beforeAll(() => {
    server = new MockMcpServer();
    registerCodeHealthScore(server as any);
    registerCodeHealthReview(server as any);
    registerPreCommitSafeguard(server as any);
    registerAnalyzeChangeSet(server as any);
    registerRefactoringBusinessCase(server as any);
    registerExplainCodeHealth(server as any);
    registerExplainProductivity(server as any);
  });

  describe('Alla sju verktyg är registrerade', () => {
    it('registrerade verktygsnamn matchar specen', () => {
      const names = server.getRegisteredToolNames();
      expect(names).toContain('code_health_score');
      expect(names).toContain('code_health_review');
      expect(names).toContain('pre_commit_code_health_safeguard');
      expect(names).toContain('analyze_change_set');
      expect(names).toContain('code_health_refactoring_business_case');
      expect(names).toContain('explain_code_health');
      expect(names).toContain('explain_code_health_productivity');
      expect(names).toHaveLength(7);
    });
  });

  describe('Feedbackloop — healthy fixture', () => {
    it('code_health_score ger loopComplete true för healthy.ts', async () => {
      const result = await server.callTool('code_health_score', { filePath: HEALTHY_FILE });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.loopComplete).toBe(true);
      expect(parsed.score).toBeGreaterThan(9.0);
      expect(parsed.nextAction.action).toBe('commit_safe');
    });

    it('code_health_review ger tom issues-lista för healthy.ts', async () => {
      const result = await server.callTool('code_health_review', { filePath: HEALTHY_FILE });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.issues).toHaveLength(0);
      expect(parsed.summary).toContain('No issues found');
    });
  });

  describe('Feedbackloop — unhealthy fixture', () => {
    it('code_health_score ger loopComplete false för unhealthy.ts', async () => {
      const result = await server.callTool('code_health_score', { filePath: UNHEALTHY_FILE });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.loopComplete).toBe(false);
      expect(parsed.score).toBeLessThan(7.0);
      expect(parsed.nextAction.action).toBe('refactor');
    });

    it('code_health_review ger nextAction.priority med SmellType för unhealthy.ts', async () => {
      const result = await server.callTool('code_health_review', { filePath: UNHEALTHY_FILE });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.issues.length).toBeGreaterThan(0);
      expect(parsed.nextAction.priority).not.toBeNull();
      expect(parsed.nextAction.priority.type).toBeDefined();
      expect(parsed.nextAction.toolToCallAfter).toBe('code_health_review');
    });

    it('refactoring_business_case visar positiv ROI för unhealthy.ts', async () => {
      const result = await server.callTool('code_health_refactoring_business_case', { filePath: UNHEALTHY_FILE });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.improvement).toBeGreaterThan(1);
      expect(parsed.businessCase.developmentSpeedGain).not.toBe('+0%');
      expect(parsed.businessCase.recommendation).toContain('priority');
    });
  });

  describe('pre_commit_code_health_safeguard', () => {
    it('godkänner commit för healthy.ts', async () => {
      const result = await server.callTool('pre_commit_code_health_safeguard', {
        repoPath: FIXTURES_DIR,
        files: [HEALTHY_FILE],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.overallSafe).toBe(true);
    });

    it('blockerar commit för unhealthy.ts', async () => {
      const result = await server.callTool('pre_commit_code_health_safeguard', {
        repoPath: FIXTURES_DIR,
        files: [UNHEALTHY_FILE],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.overallSafe).toBe(false);
      expect(parsed.message).toContain('STOP');
    });
  });

  describe('Statiska verktyg', () => {
    it('explain_code_health returnerar icke-tom text', async () => {
      const result = await server.callTool('explain_code_health', {});
      expect(result.content[0].text.length).toBeGreaterThan(100);
    });

    it('explain_code_health_productivity returnerar icke-tom text', async () => {
      const result = await server.callTool('explain_code_health_productivity', {});
      expect(result.content[0].text.length).toBeGreaterThan(100);
    });
  });
});
