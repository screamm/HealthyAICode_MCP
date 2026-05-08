# Healthy AI Code MCP

A local MCP server that gives AI assistants objective code health feedback, enabling a self-correcting refactoring loop. The AI refactors until the health score reaches the target level — no human judgment required in the loop.

## Installation

Add to your MCP client configuration (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "healthy-ai-code": {
      "type": "stdio",
      "command": "npx",
      "args": ["@healthy-ai-code/mcp-server"]
    }
  }
}
```

For Claude Code specifically, add to `~/.claude/settings.json` under `"mcpServers"`.

## Agent Setup

Copy `AGENTS.md` to the root of each repository where you want AI-guided health enforcement. This file instructs agents to run health checks before and after every change.

## Tools

| Tool | Input | Purpose |
|------|-------|---------|
| `code_health_review` | `filePath` | Detailed review with refactoring guidance — use in the feedback loop |
| `code_health_score` | `filePath` | Quick health score only |
| `pre_commit_code_health_safeguard` | `repoPath`, `files[]` | Check files before commit |
| `analyze_change_set` | `repoPath`, `baseBranch` | Check full diff before PR |
| `code_health_refactoring_business_case` | `filePath` | ROI estimate for refactoring |
| `explain_code_health` | *(none)* | What is code health? |
| `explain_code_health_productivity` | *(none)* | Health → productivity link |

## Supported Languages

TypeScript, JavaScript, Python, Java, Kotlin, C#

## Health Score Scale

| Score | Category | Meaning |
|-------|----------|---------|
| 9.5–10.0 | Green | AI-ready — loop complete |
| 9.0–9.4 | Green | Healthy |
| 4.0–8.9 | Yellow | Technical debt present |
| 1.0–3.9 | Red | Severe technical debt |

## Self-Correcting Loop

```
AI runs code_health_review
        ↓
score < 9.5? → Yes → AI refactors per nextAction.instruction
        ↓                        ↓
      No               AI runs code_health_review again
        ↓                        ↓
  loopComplete: true      (repeat until loopComplete: true)
        ↓
  AI runs pre_commit_code_health_safeguard
```

## Example Response

When a file has problems, every tool response includes explicit next-step instructions:

```json
{
  "score": 4.2,
  "category": "red",
  "loopComplete": false,
  "nextAction": {
    "action": "refactor",
    "instruction": "Refactor 'validateUser' to reduce cyclomatic complexity from 18 to under 10. Extract logic into separate helper functions. Then run code_health_review again.",
    "priority": { "smell": "ComplexMethod", "function": "validateUser" },
    "toolToCallAfter": "code_health_review"
  }
}
```

## Local Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests
pnpm test

# Run only core tests
pnpm --filter @healthy-ai-code/core test

# Run only MCP server tests
pnpm --filter @healthy-ai-code/mcp-server test
```

## Project Structure

```
healthy-ai-code-mcp/
├── packages/
│   ├── core/                    # @healthy-ai-code/core
│   │   ├── src/
│   │   │   ├── analyzers/       # Language-specific AST parsers
│   │   │   ├── metrics/         # Individual metrics
│   │   │   ├── scoring/         # Score aggregation
│   │   │   ├── smells/          # Code smell detection
│   │   │   └── index.ts         # Public API
│   │   └── tests/
│   │       └── fixtures/        # healthy/ unhealthy/ edge-cases/
│   └── mcp-server/              # @healthy-ai-code/mcp-server
│       ├── src/
│       │   ├── tools/           # One file per MCP tool
│       │   ├── server.ts
│       │   └── index.ts         # Entry point (bin)
│       └── tests/
│           └── integration/
├── AGENTS.md                    # Copy to your repo root
└── README.md
```

## License

MIT
