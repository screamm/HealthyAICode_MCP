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
import { registerBusFactor } from './tools/bus-factor';
import { registerArchitectureDebt } from './tools/architecture-debt';
import { registerHotspots } from './tools/hotspots';
import { registerTrendAnalysis } from './tools/trend-analysis';
import { registerAIReadiness } from './tools/ai-readiness';
import { registerCalibrationStatus } from './tools/calibration-status';
import { registerAiAudit } from './tools/ai-audit';
import { registerModelBenchmark } from './tools/model-benchmark';
import { registerSecurityAudit } from './tools/security-audit';
import { registerArchitectureReport } from './tools/architecture-report';
import { registerValidateDataset } from './tools/validate-dataset';

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
  registerArchitectureDebt(server);
  registerConfigTools(server);
  registerAutoRefactor(server);
  registerBusFactor(server);
  registerHotspots(server);
  registerTrendAnalysis(server);
  registerAIReadiness(server);
  registerCalibrationStatus(server);
  registerAiAudit(server);
  registerModelBenchmark(server);
  registerSecurityAudit(server);
  registerArchitectureReport(server);
  registerValidateDataset(server);

  return server;
}
