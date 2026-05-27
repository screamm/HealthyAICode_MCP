# Healthy AI Code MCP

> **27 tools · 28 biomarkers · 46 languages · fully local, no account required**

A local MCP server that gives AI assistants objective, score-based code health feedback — enabling a self-correcting refactoring loop where the AI keeps iterating until the health score reaches the target.

---

## Verified Benchmarks

All numbers come from reproducible runs on purpose-built fixtures. Raw data: [`docs/benchmarks/`](docs/benchmarks/).

### Mechanical loop — no LLM required

`runRefactoringLoop()` applies AST-guided rewrites (extract method, early return, parameter object) with zero Claude calls.

| Metric | Result |
|--------|--------|
| Corpus | 17 unhealthy fixture files, 12 languages |
| Fix rate (score < 9.0 → ≥ 9.5) | **11.8%** (2 / 17) |
| Average score improvement | **+0.27 pts** |
| Median iterations to fix | 3 |
| Cost | **$0** |

Language coverage is the constraint: TypeScript, JavaScript, and PHP have working transformers; Go, Python, Ruby, Rust, Elixir, and Swift receive smell detection but no automated rewrites yet.

### Claude Opus — single pass

`code_health_auto_refactor` returns structured instructions (function name, numbered steps, example skeleton). Claude Opus applies them in one pass, using your existing Pro/Max session — no separate billing.

| Metric | Result |
|--------|--------|
| Corpus | 5 files with actionable smells |
| Fix rate (→ ≥ 9.5, single pass) | **20%** (1 / 5) |
| Average score improvement | **+2.04 pts** |
| Best single-pass result | `complex.ex` (Elixir) 5.1 → **9.6** (+4.5 pts) |
| Cost | **Included in Claude Pro/Max** |

Near-misses in a single pass: `Complex.cs` (C#) 5.5 → 8.7 (+3.2 pts). These cross the threshold on the second iteration.

### Claude Opus — multi-iteration loop

Running `code_health_auto_refactor → apply → code_health_review` until `loopComplete: true`:

| File | Language | Start | End | Iterations |
|------|----------|-------|-----|------------|
| `bumpy-road-fixture.ts` | TypeScript | 8.9 | **10.0** | 2 |
| `Complex.java` | Java | 5.5 | **10.0** | 6 |

Files near the scoring floor (< 5.0) need more passes and benefit from targeting the highest-weight smell first (enforced since Sprint 34).

### Sprint 50 BEFORE → AFTER benchmark

Purpose-built bad-code fixtures (≈1.0–1.2 score, 32–34 smells) refactored to ≥ 9.5 in one session. Fixtures live in [`before-after/benchmark-sprint50/`](before-after/benchmark-sprint50/).

| File | BEFORE | AFTER | Δ Score | Smells↓ |
|------|--------|-------|---------|---------|
| `typescript.ts` | 1.00 | **9.60** | +8.60 | 32 → 1 |
| `python.py` | 1.00 | **9.70** | +8.70 | 33 → 1 |
| `go.go` | 1.20 | **10.00** | +8.80 | 34 → 0 |

Key smells eliminated per file: DeepNesting, ComplexMethod, MagicNumber, BumpyRoad, LargeMethod, DataClumps, LowDocCoverage, CognitiveComplexity, PrimitiveObsession. Run: `pnpm --filter @healthy-ai-code/core test tests/benchmark/sprint50-after.test.ts`

### Test suite

| Package | Test files | Tests | Status |
|---------|-----------|-------|--------|
| `@healthy-ai-code/core` | 82 | 905 | ✅ all passing |
| `@healthy-ai-code/mcp-server` | 20 | 118 | ✅ all passing |
| **Total** | **102** | **1 023** | ✅ |

Run: `pnpm test`

---

## Self-Correcting Loop

```
code_health_review (or code_health_score for quick screen)
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
Claude Opus 4.7 subagent applies the targeted refactoring
  (model: claude-opus-4-7 — highest fix rate on structured instructions)
        │
        ▼
code_health_review (verify improvement)
        │
        ▼
loopComplete: true? ──Yes──→ done
        │
        No  (minimum 3 iterations; most files need 3–5)
        └──────────────────→ code_health_auto_refactor (next smell)
```

The tool response is structured for reasoning-first consumption: `followUpInstruction` and `refactoringInstructions` appear before the code block so the agent reads context before applying changes.

---

## Installation

### Claude Code (recommended)

```bash
claude mcp add healthy-ai-code -s user -- npx @healthy-ai-code/mcp-server
```

Verify: `claude mcp get healthy-ai-code`

For local development:

```bash
claude mcp add healthy-ai-code -s user -- node /absolute/path/to/packages/mcp-server/dist/index.js
```

### VS Code

The repository ships `.vscode/mcp.json` — opening the folder with the Claude extension installed is sufficient.

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

### Docker

```bash
docker build -t healthy-ai-code-mcp .
docker run --rm -i healthy-ai-code-mcp
```

```json
{ "command": "docker", "args": ["run", "--rm", "-i", "healthy-ai-code-mcp"] }
```

---

## Agent Setup

Copy `AGENTS.md` to the root of any repository where you want health enforcement. It instructs agents to run health checks before and after every change and blocks commits on files scoring below 7.0.

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
| `code_health_auto_refactor` | `filePath`, `targetSmell?` | Returns structured refactoring instructions for worst smell |
| `code_health_auto_refactor_apply` | `filePath` | Applies mechanical rewrite and writes file back — returns before/after score |
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
| `code_health_debt_goal_set` | `filePath`, `goalType` | Create or update a debt goal (`planned_refactoring` / `supervise` / `accepted` / `no_problem`) |
| `code_health_debt_goals_list` | `filePath?` | List tracked goals, optionally filtered by file |
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

## Biomarkers (28)

### Method-level

| Biomarker | Weight | Description |
|-----------|--------|-------------|
| `ComplexMethod` | 1.5 | Cyclomatic complexity above threshold |
| `BrainMethod` | 1.2 | Compound smell — multiple severe method-level issues |
| `DeepNesting` | 1.2 | Nesting depth > 3 |
| `BumpyRoad` | 0.8 | Sequential sibling control-flow chunks — extract-chunk candidate |
| `CognitiveComplexity` | 0.8 | SonarSource S3776 cognitive complexity |
| `LargeMethod` | 0.6 | Function exceeds line-length limit |
| `ComplexConditional` | 0.5 | Nested ternaries and long boolean chains |
| `LongParameterList` | 0.4 | Excessive parameter count |
| `MagicNumber` | 0.4 | Unexplained numeric or string literals |
| `LowDocCoverage` | 0.3 | Insufficient documentation on public APIs |

### Class / module level

| Biomarker | Weight | Description |
|-----------|--------|-------------|
| `GodClass` | 1.5 | ATFD + WMC + LCOM4 composite detector |
| `KnowledgeLoss` | 1.0 | Bus factor / DOA — code known only by departed contributors |
| `FeatureEnvy` | 0.7 | Method more interested in other classes' data |
| `TypeSafetyEscape` | 0.7 | `any`, `@ts-ignore`, unsafe casts |
| `SATD` | 0.6 | Self-Admitted Technical Debt (`TODO` / `FIXME` / `HACK`) |
| `LargeFile` | 0.3 | File exceeds size limit |
| `MethodTemporalCoupling` | 0.3 | Method pairs that co-change in git history |

### Organisational / temporal

| Biomarker | Weight | Description |
|-----------|--------|-------------|
| `DeveloperCongestion` | 0.7 | Too many developers touching the same module |
| `CodeChurn` | 0.6 | Nagappan & Ball churn — frequently rewritten code |
| `DataClumps` | 0.5 | Recurring groups of parameters / fields |
| `MessageChain` | 0.5 | Law of Demeter violations (train-wreck calls) |
| `TestProximity` | 0.5 | Insufficient test coverage near changed code |
| `PrimitiveObsession` | 0.5 | Overuse of primitives as parameters |
| `LowMaintainability` | 0.4 | Halstead volume + CC + LOC composite index |

### Security

| Biomarker | Weight | Description |
|-----------|--------|-------------|
| `HardcodedCredential` | 2.0 | Plaintext passwords, tokens, connection strings |
| `HardcodedApiKey` | 2.0 | API keys and secrets in source |
| `SqlInjectionRisk` | 1.5 | Unsanitised SQL string interpolation |
| `XssRisk` | 1.5 | Unsanitised HTML rendering |
| `CommandInjectionRisk` | 1.5 | Shell command with user-controlled input |

---

## Supported Languages (46)

### Tier A — Full AST (tree-sitter) · 17 languages

TypeScript, JavaScript, Python, Java, C#, Kotlin, Scala, Swift, Ruby, Rust, Go, PHP, Vue.js, Elixir, Haskell, Julia, OCaml

All 28 biomarkers available. Language-profile biomarkers (GodClass, FeatureEnvy, DataClumps) vary by language. Elixir is function-oriented (def/defp, no class analog). Swift is lazy-loaded and falls back to empty metrics if `tree-sitter-swift` is absent.

### Tier B — Regex · 19 languages

Bash, Lua, R, Clojure, Dart, C, C++, COBOL, Apex, F#, VB.NET, Perl, Groovy, Objective-C, PowerShell, Erlang, Zig, Nim, Crystal

Function extraction, cyclomatic complexity, SATD, MagicNumber. Method temporal coupling is also available for Tier B via regex-extracted function ranges.

### Tier C — Structural · 10 formats

YAML, JSON, Dockerfile, HCL/Terraform, Makefile, SQL, HTML, CSS, Markdown, TOML

LOC, LargeFile, SATD only.

---

## Health Score

### Scale

| Score | Category | Meaning |
|-------|----------|---------|
| 9.5–10.0 | Green | AI-ready (`loopComplete: true`) |
| 9.0–9.4 | Green | Healthy |
| 6.0–8.9 | Yellow | Technical debt present |
| 1.0–5.9 | Red | Severe technical debt |

### Formula

```
score = 10 − Σ (weight × √count)   per smell type
floor = 1.0
```

The square-root term makes penalties sub-linear: three `ComplexMethod` smells deduct `1.5 × √3 ≈ 2.6` points, not `1.5 × 3 = 4.5`. Smells are prioritised by weight when choosing the next refactoring target, so each iteration maximises score gain.

---

## Example Tool Response

```json
{
  "followUpInstruction": "Apply the refactoringInstructions using model claude-opus-4-7. Then run code_health_review to verify. Loop until loopComplete: true (score ≥ 9.5). Minimum 3 iterations — most files need 3–5 passes.",
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
  "targetFunction": "validateUser",
  "currentCode": "function validateUser(...) { ... }"
}
```

---

## Empirical Calibration (opt-in)

Validated thresholds derived from the Defects4J Java defect dataset. Active for Java only.

```
set_config useCalibratedThresholds true
```

See [`docs/calibration/`](docs/calibration/) for methodology and ROC/AUC results.

---

## Skills

Nine prompt templates for common workflows in `skills/`:

| Skill | Purpose |
|-------|---------|
| `installing-and-configuring` | First-time setup |
| `explaining-code-health` | Audience-specific explanations (dev / lead / PM) |
| `safeguarding-ai-generated-code` | Mandatory 3-gate review for AI output |
| `guided-refactoring` | Score-driven refactoring loop |
| `making-the-business-case` | ROI calculation and stakeholder framing |
| `code-health-review-workflow` | Single-file and PR review workflows |
| `knowledge-risk-assessment` | Bus factor and temporal coupling analysis |
| `prioritizing-technical-debt` | Health × frequency priority matrix |
| `pre-commit-protection` | Manual, Git hook, and CI/CD protection levels |

---

## Local Development

```bash
pnpm install          # install dependencies
pnpm build            # build all packages
pnpm test             # run all 1 013 tests
pnpm -r typecheck     # TypeScript check all packages
pnpm --filter @healthy-ai-code/core test        # core tests only
pnpm --filter @healthy-ai-code/mcp-server test  # MCP server tests only
node scripts/health-audit.mjs                   # self-audit
```

---

## Project Structure

```
healthy-ai-code-mcp/
├── packages/
│   ├── core/                     # @healthy-ai-code/core — all analysis logic
│   │   ├── src/
│   │   │   ├── analyzers/        # Language-specific AST + regex parsers (46 languages)
│   │   │   ├── refactor/         # auto-refactor-analyzer, smell-instructions, loop
│   │   │   ├── scoring/          # weights, scorer, calibration
│   │   │   ├── smells/           # 28 biomarker detectors
│   │   │   ├── temporal/         # git-history biomarkers
│   │   │   ├── validation/       # dataset runner, correlation metrics
│   │   │   └── index.ts          # public API
│   │   └── tests/                # 80 test files, 895 tests
│   └── mcp-server/               # @healthy-ai-code/mcp-server — MCP wire protocol
│       ├── src/
│       │   ├── tools/            # one file per MCP tool (27 tools)
│       │   └── server.ts         # tool registration
│       └── tests/                # 20 test files, 118 tests
├── docs/
│   ├── benchmarks/               # refactoring-loop-benchmark.md + JSON, claude-benchmark
│   └── calibration/              # Defects4J-derived Java threshold validation
├── before-after/                 # real before/after files from refactoring runs
├── skills/                       # 9 AI prompt templates
├── scripts/                      # health-audit, benchmark, loop test scripts
├── AGENTS.md                     # copy to your repo root for agent health enforcement
├── CLAUDE.md                     # codebase reference for AI assistants
└── server.json                   # MCP registry schema
```

---

## License

MIT
