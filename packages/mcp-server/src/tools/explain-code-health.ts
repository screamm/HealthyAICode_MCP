import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const CODE_HEALTH_EXPLANATION = `
# What is Code Health?

Code Health is a measure (1-10) of how easy code is to understand, change, and maintain.

## Scale
- 9.5-10.0: AI-ready — safe and efficient for AI-assisted work
- 9.0-9.4: Green (Healthy) — low risk
- 4.0-8.9: Yellow (Technical debt) — increased risk and maintenance cost
- 1.0-3.9: Red (Severe technical debt) — high risk, hard to change

## Why does it matter for AI?
Research shows AI code assistants introduce 60%+ more bugs in unhealthy code.
Code with a health score below 7.0 is not reliable to modify with AI.

## What is measured?
- Cyclomatic complexity (branches in the code)
- Nesting depth (nested control structures)
- Function and file length
- Parameter count
- Code smells
`.trim();

const PRODUCTIVITY_EXPLANATION = `
# Code Health and Productivity

## Research findings (CodeScene, peer-reviewed)
- Improving from the industry average of 5.15 to 9.1 yields:
  - ~36% faster delivery time
  - ~36% fewer production defects
  - ~50% lower token cost for AI assistance

## AI assistance and code health
- 20%: Without structural guidance, frontier models fix only 20% of issues
- 90-100%: With Code Health guidance, the fix rate rises to 90-100%
- Each point of improvement = ~4% faster and ~4% fewer defects

## Recommendation
Aim for 9.5+ for AI-ready code. Refactor to 9.5+ before letting AI
modify a file — otherwise you risk the AI introducing bugs.
`.trim();

/** Registers the explain_code_health tool on the MCP server. */
export function registerExplainCodeHealth(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'explain_code_health',
    {
      title: 'Explain Code Health',
      description: 'Explains what the Code Health score means and how it is calculated.',
      inputSchema: {},
      annotations: {
        title: 'Explain Code Health',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => ({ content: [{ type: 'text' as const, text: CODE_HEALTH_EXPLANATION }] })
  );
}

/** Registers the explain_code_health_productivity tool on the MCP server. */
export function registerExplainProductivity(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.registerTool as any)(
    'explain_code_health_productivity',
    {
      title: 'Explain Code Health Productivity Impact',
      description: 'Explains the relationship between Code Health and delivery speed / defect rates.',
      inputSchema: {},
      annotations: {
        title: 'Explain Code Health Productivity Impact',
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => ({ content: [{ type: 'text' as const, text: PRODUCTIVITY_EXPLANATION }] })
  );
}
