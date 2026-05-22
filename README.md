# Healthy AI Code MCP

> **28 biomarkers across 11 languages • CodeScene state-of-the-art parity + method-level X-Ray**

A local MCP server that gives AI assistants objective code health feedback, enabling a self-correcting refactoring loop. The AI refactors until the health score reaches the target level — no human judgment required in the loop.

## Installation

### Claude Code (recommended)

```bash
claude mcp add healthy-ai-code -s user -- npx @healthy-ai-code/mcp-server
```

Verify with `claude mcp get healthy-ai-code`.

For local development, point at the built entry directly:

```bash
claude mcp add healthy-ai-code -s user -- node /absolute/path/to/packages/mcp-server/dist/index.js
```

### VS Code

The repository ships a `.vscode/mcp.json` that activates the server automatically when you open the project. No extra steps needed — just open the folder in VS Code with the Claude extension installed.

### Cursor, Claude Desktop, and other MCP clients

Add to your client's MCP configuration file:

```json
{
  "mcpServers": {
    "healthy-ai-code": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@healthy-ai-code/mcp-server"]
    }
  }
}
```

### Docker

```bash
docker build -t healthy-ai-code-mcp .
docker run --rm -i healthy-ai-code-mcp
```

Point your MCP client at the container by replacing `command` / `args` with:

```json
{
  "command": "docker",
  "args": ["run", "--rm", "-i", "healthy-ai-code-mcp"]
}
```

### Homebrew (macOS)

```bash
brew tap YOUR_USERNAME/healthy-ai-code-mcp
brew install healthy-ai-code-mcp
```

See `Formula/README.md` for tap setup and SHA256 update instructions for new releases.

### Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/YOUR_USERNAME/healthy-ai-code-mcp/master/install.ps1 | iex
```

The script checks for Node ≥ 18, installs the server globally via npm, and prints config snippets for Claude Code, Claude Desktop, VS Code, and Cursor.

## Agent Setup

Copy `AGENTS.md` to the root of each repository where you want AI-guided health enforcement. This file instructs agents to run health checks before and after every change and blocks commits on files scoring below 7.0.

## Skills

The `skills/` directory contains nine prompt templates that teach AI assistants specific code health workflows. Drop the relevant skill into your system prompt or reference it via your AI client's prompt library:

| Skill | Purpose |
|-------|---------|
| `installing-and-configuring` | First-time setup and configuration |
| `explaining-code-health` | Audience-specific explanations (dev / tech lead / PM) |
| `safeguarding-ai-generated-code` | Mandatory 3-gate review protocol for AI output |
| `guided-refactoring` | Score-driven refactoring loop |
| `making-the-business-case` | ROI calculation and stakeholder presentation |
| `code-health-review-workflow` | Single-file and PR review workflows |
| `knowledge-risk-assessment` | Bus factor and temporal coupling analysis |
| `prioritizing-technical-debt` | Health × frequency priority matrix for backlog |
| `pre-commit-protection` | Manual, Git hook, and CI/CD protection levels |

## Tools

| Tool | Input | Purpose |
|------|-------|---------|
| `code_health_review` | `filePath` | Detailed review with refactoring guidance — main feedback-loop tool |
| `code_health_score` | `filePath` | Quick health score for screening |
| `pre_commit_code_health_safeguard` | `repoPath`, `files[]` | Gate files before commit |
| `analyze_change_set` | `repoPath`, `baseBranch` | Check full diff before PR |
| `code_health_auto_refactor` | `filePath` | Returns primary refactoring target with code context and instructions. For BumpyRoad targets, includes `chunkRanges` with exact line spans to extract |
| `code_health_refactoring_business_case` | `filePath` | ROI estimate for refactoring investment |
| `code_health_knowledge_map` | `projectPath` | Knowledge distribution, bus factor, and temporal coupling |
| `code_health_method_coupling` | `filePath` | Method-level temporal coupling — pairs of methods in the same file that historically change together (X-Ray-light) |
| `get_config` | *(none)* | Read current server configuration |
| `set_config` | key, value | Persist a configuration value |
| `explain_code_health` | *(none)* | What is code health? |
| `explain_code_health_productivity` | *(none)* | Health → productivity link |

### Configuration keys

| Key | Type | Description |
|-----|------|-------------|
| `healthyThreshold` | number 1–10 | Minimum score for the healthy (green) category. Default: `9.0` |
| `aiReadyThreshold` | number 1–10 | Minimum score for `loopComplete: true`. Default: `9.5` |
| `defaultBranch` | string | Base branch used by `analyze_change_set`. Default: `main` |
| `projectName` | string | Project name shown in reports |
| `useCalibratedThresholds` | boolean | Opt-in empirically validated thresholds (Java only). Default: `false`. See `docs/calibration/`. |

## Biomarkers (28)

Healthy AI Code detects 28 code health biomarkers across six sprint generations, matching and exceeding CodeScene's 26-biomarker coverage.

### Core smells (Sprints 1–4)
| Biomarker | Description |
|-----------|-------------|
| `ComplexMethod` | Cyclomatic complexity above threshold |
| `LongMethod` | Functions exceeding line-length limits |
| `LargeClass` | Classes with too many responsibilities |
| `LongParameterList` | Functions with excessive parameter counts |
| `DeepNesting` | Deeply nested control structures |
| `PrimitiveObsession` | Overuse of primitive types as parameters |
| `SpeculativeGenerality` | Unused abstractions and over-engineering |

### Cognitive & type safety (Sprint 5)
| Biomarker | Description |
|-----------|-------------|
| `CognitiveComplexity` | SonarSource S3776 cognitive complexity metric |
| `TypeSafetyEscape` | Use of `any`, `@ts-ignore`, or unsafe casts |
| `MagicNumber` | Unexplained numeric or string literals — all 11 languages |
| `LowDocCoverage` | Insufficient documentation on public APIs |

### Duplication & structure (Sprint 6)
| Biomarker | Description |
|-----------|-------------|
| `Duplication` | Token-fingerprint Jaccard similarity detection |
| `LanguageMix` | Mixed natural languages reducing AI readability |
| `DeadExports` | Exported symbols never referenced outside their module |

### Hotspot & compound smells (Sprint 7)
| Biomarker | Description |
|-----------|-------------|
| `Hotspot` | High commit frequency × high complexity (change-risk index) |
| `BrainMethod` | Compound smell combining multiple severe method-level issues |
| `BumpyRoad` | A single function with multiple sequential sibling control-flow chunks — chunk-based detection (per-function), candidate for chunk-extraction refactoring |
| `TestProximity` | Insufficient test coverage near changed code |

### Conditionals & coupling (Sprint 8)
| Biomarker | Description |
|-----------|-------------|
| `ComplexConditional` | Nested ternaries and long boolean chains |
| `MessageChain` | Law of Demeter violations (train-wreck calls) |
| `DataClumps` | Recurring groups of parameters/fields that belong together |
| `SATD` | Self-Admitted Technical Debt (`TODO`, `FIXME`, `HACK` comments) — all 11 languages |

### OO design metrics (Sprint 9)
| Biomarker | Description |
|-----------|-------------|
| `GodClass` | ATFD + WMC + LCOM4 composite god-class detector |
| `FeatureEnvy` | Methods more interested in other classes' data than their own |
| `LowMaintainability` | Halstead volume + cyclomatic complexity + LOC composite index |

### Temporal & organisational (Sprints 10, 19)
| Biomarker | Description |
|-----------|-------------|
| `CodeChurn` | Nagappan & Ball churn metric — frequently rewritten code |
| `TemporalCoupling` | Files that change together more than their dependencies suggest |
| `DeveloperCongestion` | Too many developers touching the same module |
| `KnowledgeLoss` | Bus factor / DOA — code known only by departed contributors |
| `MethodTemporalCoupling` | X-Ray-light: method pairs that co-change in git history — advisory (weight 0 until sprint 20 validation) |

## Supported Languages

TypeScript, JavaScript, Python, Java, Kotlin, C#, Rust, Go, PHP, Ruby, Swift (11 languages)

See `docs/language-coverage-matrix.md` for a per-language biomarker coverage matrix.

## Health Score Scale

| Score | Category | Meaning |
|-------|----------|---------|
| 9.5–10.0 | Green | AI-ready — loop complete |
| 9.0–9.4 | Green | Healthy |
| 6.0–8.9 | Yellow | Technical debt present |
| 1.0–5.9 | Red | Severe technical debt |

## Scoring Formula

Each detected smell deducts points from a base score of 10.0 using a progressive formula:

```
deduction = weight × √count   (per smell type)
```

Multiple smells of the same type compound progressively — two `ComplexMethod` smells hurt more than one, but the penalty grows sub-linearly (square root), reflecting that a few extra smells are worse than none, but the file isn't four times as bad as having one. The floor is always 1.0.

## Empirical Calibration (Opt-in)

The default thresholds are industry-standard values calibrated in Sprint 11. Sprint 18 added an opt-in
empirically validated overlay for Java, derived from the Defects4J defect dataset.

Enable with:

```
set_config useCalibratedThresholds true
```

See `docs/calibration/README.md` for methodology and ROC/AUC validation.

## Self-Correcting Loop

```
AI runs code_health_score (quick screen)
        ↓
score ≥ 9.5? ──Yes──→ AI runs pre_commit_code_health_safeguard
        │
        No
        ↓
AI runs code_health_auto_refactor
  (returns primary target + code context + instructions)
        ↓
AI applies the single targeted refactoring
        ↓
AI runs code_health_review (verify improvement)
        ↓
loopComplete: true? ──Yes──→ pre_commit_code_health_safeguard
        │
        No
        └──────────────────→ repeat from code_health_auto_refactor
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

## Self-Audit

This project uses its own MCP server to monitor its own code health. Current status:

```
63 / 63 files — 10/10 (green)   ✓ AI-ready
```

Run the audit yourself:

```bash
node scripts/health-audit.mjs
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

# Typecheck all packages
pnpm -r typecheck

# Run the self-audit script
node scripts/health-audit.mjs
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
│   │   │   ├── smells/          # Code smell detectors
│   │   │   ├── temporal/        # Git-history biomarkers
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
├── skills/                      # AI prompt templates for workflows
├── Formula/                     # Homebrew formula
├── scripts/                     # Development and audit scripts
├── .vscode/mcp.json             # VS Code MCP auto-configuration
├── Dockerfile                   # Multi-stage Docker build
├── install.ps1                  # Windows PowerShell installer
├── server.json                  # MCP registry schema
├── AGENTS.md                    # Copy to your repo root
└── README.md
```

## License

MIT
