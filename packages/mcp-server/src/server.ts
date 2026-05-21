import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCodeHealthScore } from './tools/code-health-score';
import { registerCodeHealthReview } from './tools/code-health-review';
import { registerPreCommitSafeguard } from './tools/pre-commit-safeguard';
import { registerAnalyzeChangeSet } from './tools/analyze-change-set';
import { registerRefactoringBusinessCase } from './tools/refactoring-business-case';
import { registerExplainCodeHealth, registerExplainProductivity } from './tools/explain-code-health';
import { registerKnowledgeMap } from './tools/knowledge-map';
import { registerMethodCoupling } from './tools/method-coupling';
import { registerConfigTools } from './tools/config';
import { registerAutoRefactor } from './tools/auto-refactor';

export async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: 'healthy-ai-code',
    version: '0.1.0',
  });

  registerCodeHealthScore(server);
  registerCodeHealthReview(server);
  registerPreCommitSafeguard(server);
  registerAnalyzeChangeSet(server);
  registerRefactoringBusinessCase(server);
  registerExplainCodeHealth(server);
  registerExplainProductivity(server);
  registerKnowledgeMap(server);
  registerMethodCoupling(server);
  registerConfigTools(server);
  registerAutoRefactor(server);

  return server;
}
