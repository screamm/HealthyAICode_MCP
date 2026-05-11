# Healthy AI Code MCP

> **27 biomarkers • CodeScene state-of-the-art parity**

A local MCP server that gives AI assistants objective code health feedback, enabling a self-correcting refactoring loop. The AI refactors until the health score reaches the target level — no human judgment required in the loop.

## Installation

### Claude Code

After publishing to npm, register the server with the Claude Code CLI:

```bash
claude mcp add healthy-ai-code -s user -- npx @healthy-ai-code/mcp-server
```

For local development before publishing, point at the built entry directly:

```bash
claude mcp add healthy-ai-code -s user -- node /absolute/path/to/packages/mcp-server/dist/index.js
```

Verify the server is connected with `claude mcp get healthy-ai-code`.

### Other MCP clients (Cursor, Claude Desktop, etc.)

Add to your client's MCP configuration:

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
| `code_health_knowledge_map` | `repoPath` | Knowledge distribution, bus factor, and temporal coupling analysis |
| `explain_code_health` | *(none)* | What is code health? |
| `explain_code_health_productivity` | *(none)* | Health → productivity link |

## Biomarkers (27)

Healthy AI Code detects 27 code health biomarkers across four sprint generations, matching and exceeding CodeScene's 26-biomarker coverage.

### Core smells (Sprints 1–4)
| Biomarker | Description |
|-----------|-------------|
| `ComplexMethod` | Cyclomatic complexity above threshold |
| `LongMethod` | Functions exceeding line-length limits |
| `LargeClass` | Classes with too many responsibilities |
| `LongParameterList` | Functions with excessive parameter counts |
| `DeepNesting` | Deeply nested control structures |
| `PrimitiveObsession` | Overuse of primitive types |
| `SpeculativeGenerality` | Unused abstractions and over-engineering |

### Cognitive & type safety (Sprint 5)
| Biomarker | Description |
|-----------|-------------|
| `CognitiveComplexity` | SonarSource S3776 cognitive complexity metric |
| `TypeSafetyEscape` | Use of `any`, `@ts-ignore`, or unsafe casts |
| `MagicNumber` | Unexplained numeric or string literals |
| `LowDocCoverage` | Insufficient documentation on public APIs |

### Duplication & structure (Sprint 6)
| Biomarker | Description |
|-----------|-------------|
| `Duplication` | Token-fingerprint Jaccard similarity detection |
| `LanguageMix` | Mixed natural languages (e.g. Swedish/English) reducing AI readability |
| `DeadExports` | Exported symbols never referenced outside their module |

### Hotspot & compound smells (Sprint 7)
| Biomarker | Description |
|-----------|-------------|
| `Hotspot` | High commit frequency × high complexity (change-risk index) |
| `BrainMethod` | Compound smell combining multiple severe method-level issues |
| `TestProximity` | Insufficient test coverage near changed code |

### Conditionals & coupling (Sprint 8)
| Biomarker | Description |
|-----------|-------------|
| `ComplexConditional` | Nested ternaries and long boolean chains |
| `MessageChain` | Law of Demeter violations (train-wreck calls) |
| `DataClumps` | Recurring groups of parameters/fields that belong together |
| `SATD` | Self-Admitted Technical Debt (`TODO`, `FIXME`, `HACK` comments) |

### OO design metrics (Sprint 9)
| Biomarker | Description |
|-----------|-------------|
| `GodClass` | ATFD + WMC + LCOM4 composite god-class detector |
| `FeatureEnvy` | Methods more interested in other classes' data than their own |
| `LowMaintainability` | Halstead volume + cyclomatic complexity + LOC composite index |

### Temporal & organisational (Sprint 10)
| Biomarker | Description |
|-----------|-------------|
| `CodeChurn` | Nagappan & Ball churn metric — frequently rewritten code |
| `TemporalCoupling` | Files that change together more than their dependencies suggest |
| `DeveloperCongestion` | Too many developers touching the same module |
| `KnowledgeLoss` | Bus factor / DOA — code known only by departed contributors |

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
