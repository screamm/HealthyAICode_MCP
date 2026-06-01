# @healthy-ai-code/mcp-server

> **27 tools · 28 biomarkers · 46 languages · fully local, no account required**

A local [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that gives AI assistants objective, score-based code health feedback — enabling a self-correcting refactoring loop where the AI keeps iterating until the health score reaches the target (≥ 9.5).

---

## Installation

### Claude Code (recommended)

```bash
claude mcp add healthy-ai-code -s user -- npx @healthy-ai-code/mcp-server
```

Verify: `claude mcp get healthy-ai-code`

### Cursor, Claude Desktop, and other MCP clients

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

### VS Code (Claude extension)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "healthy-ai-code": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@healthy-ai-code/mcp-server"]
    }
  }
}
```

---

## Self-Correcting Loop

```
code_health_review (or code_health_score for a quick screen)
        │
        ▼
score ≥ 9.5? ──Yes──→ loopComplete: true — stop
        │
        No
        ▼
code_health_auto_refactor
  returns: smell type, target function, numbered steps, example skeleton,
           predicted score delta, remaining smell queue
        │
        ▼
Claude Opus applies the targeted refactoring
        │
        ▼
code_health_review (verify improvement)
        │
        ▼
loopComplete: true? ──Yes──→ done
        │
        No  (typical: 2–4 iterations)
        └──────────────────→ code_health_auto_refactor (next smell)
```

---

## Tools (27)

### Review loop

| Tool | Input | What it does |
|------|-------|-------------|
| `code_health_score` | `filePath` | Quick score for screening |
| `code_health_review` | `filePath`, `repoPath?` | Detailed review with smell breakdown and next-action |
| `pre_commit_code_health_safeguard` | `repoPath`, `files[]` | Gate files before commit |
| `analyze_change_set` | `repoPath`, `baseBranch` | Check full branch diff before PR merge |

### Refactoring

| Tool | Input | What it does |
|------|-------|-------------|
| `code_health_auto_refactor` | `filePath`, `targetSmell?` | Returns structured instructions for the worst smell |
| `code_health_auto_refactor_apply` | `filePath` | Applies mechanical rewrite; returns before/after score |
| `code_health_refactoring_business_case` | `filePath` | ROI estimate for refactoring investment |

### Temporal and organisational

| Tool | Input | What it does |
|------|-------|-------------|
| `code_health_hotspots` | `repoPath` | Top-N files by complexity × churn |
| `code_health_trend_analysis` | `repoPath`, `filePaths[]` | Complexity slope per file over time |
| `code_health_knowledge_map` | `projectPath` | Knowledge distribution, bus factor, temporal coupling |
| `code_health_bus_factor` | `projectPath` | Bus factor (Shannon entropy), sprint congestion, knowledge-loss index |
| `code_health_method_coupling` | `filePath` | Method pairs that co-change in git history |

### Architecture

| Tool | Input | What it does |
|------|-------|-------------|
| `code_health_architecture_debt` | `directory` | FAN-IN/OUT, instability, propagation cost, dependency cycles |
| `code_health_architecture_report` | `directory` | Self-contained interactive HTML dependency graph (offline) |

### AI-specific

| Tool | Input | What it does |
|------|-------|-------------|
| `code_health_ai_readiness` | `directory` | Composite AI-Readiness Score — naming, types, context fit, docs, modularity |
| `code_health_ai_audit` | `filePath` | AbstractionLeakage, HardcodedAssumption, MissingEdgeCase, StyleInconsistency |
| `code_health_model_benchmark` | `model_name`, `generated_code`, `reference_code` | Tracks per-model quality history |

### Security

| Tool | Input | What it does |
|------|-------|-------------|
| `code_health_security_audit` | `directory` | SQL injection, XSS, command injection, path traversal, hardcoded secrets — SARIF or summary |

### Debt management

| Tool | Input | What it does |
|------|-------|-------------|
| `code_health_debt_goal_set` | `filePath`, `goalType` | Create or update a debt goal |
| `code_health_debt_goals_list` | `filePath?` | List tracked goals |
| `code_health_debt_goal_remove` | `filePath` | Remove a goal |
| `code_health_debt_goals_report` | `projectDir?` | Report all goals with current health scores |

### Calibration and validation

| Tool | Input | What it does |
|------|-------|-------------|
| `code_health_calibration_status` | — | Show active empirical calibration overlays |
| `validate_dataset` | `datasetPath` | Validate a benchmark dataset against health scores |

### Configuration and education

| Tool | Input | What it does |
|------|-------|-------------|
| `get_config` | — | Read current server configuration |
| `set_config` | `key`, `value` | Persist a configuration value |
| `explain_code_health` | — | What is code health? |
| `explain_code_health_productivity` | — | Health → productivity link |

---

## Health Score Scale

| Score | Category | Meaning |
|-------|----------|---------|
| 9.5–10.0 | Green | AI-ready (`loopComplete: true`) |
| 9.0–9.4 | Green | Healthy |
| 6.0–8.9 | Yellow | Technical debt present |
| 1.0–5.9 | Red | Severe technical debt |

**Formula:** `score = 10 − Σ(weight × √count)` per smell type, floor 1.0

---

## Example Tool Response

```json
{
  "followUpInstruction": "Apply the refactoringInstructions. Then run code_health_review to verify. Loop until loopComplete: true (score ≥ 9.5).",
  "smell": { "type": "ComplexMethod", "severity": "high", "functionName": "validateUser", "line": 42 },
  "refactoringStrategy": "extract_method",
  "refactoringInstructions": [
    "1. Identify logically cohesive sections within 'validateUser'.",
    "2. Extract lines 42–55 into 'validateUserInput'.",
    "3. Extract lines 56–70 into 'checkUserPermissions'.",
    "4. Replace each block with a call to the new helper.",
    "5. Ensure 'validateUser' now reads as a sequence of named calls."
  ],
  "predictedScoreDelta": "+2.5",
  "remainingSmellTypes": ["DeepNesting", "LowDocCoverage"],
  "currentHealthScore": 5.2,
  "targetFunction": "validateUser"
}
```

---

## Supported Languages (46)

**Tier A — Full AST (tree-sitter) · 17 languages**
TypeScript, JavaScript, Python, Java, C#, Kotlin, Scala, Swift, Ruby, Rust, Go, PHP, Vue.js, Elixir, Haskell, Julia, OCaml

**Tier B — Regex · 19 languages**
Bash, Lua, R, Clojure, Dart, C, C++, COBOL, Apex, F#, VB.NET, Perl, Groovy, Objective-C, PowerShell, Erlang, Zig, Nim, Crystal

**Tier C — Structural · 10 formats**
YAML, JSON, Dockerfile, HCL/Terraform, Makefile, SQL, HTML, CSS, Markdown, TOML

---

## Requirements

- Node.js ≥ 18.0.0
- An MCP-compatible client (Claude Code, Cursor, Claude Desktop, etc.)

---

## Links

- [GitHub repository](https://github.com/screamm/HealthyAICode_MCP)
- [Core package](https://www.npmjs.com/package/@healthy-ai-code/core)
- [Issues](https://github.com/screamm/HealthyAICode_MCP/issues)

---

## License

MIT — see [LICENSE](./LICENSE)
