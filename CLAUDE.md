# CLAUDE.md — Healthy AI Code MCP

Reference documentation for AI assistants working on this codebase.

---

## Project Overview

Local MCP server that gives AI assistants objective code health feedback (28 biomarkers, 41 languages, 27 tools). Enables a self-correcting refactoring loop where the AI refactors until a health score target is reached.

**Monorepo structure:**

```
packages/
  core/          # @healthy-ai-code/core   — all analysis logic, language-agnostic
  mcp-server/    # @healthy-ai-code/mcp-server — MCP wire protocol, one tool per file
```

**Package manager:** pnpm

---

## Quick Commands

```bash
pnpm build                                          # Build all packages
pnpm test                                           # Run all tests
pnpm -r typecheck                                   # TypeScript check all packages
pnpm --filter @healthy-ai-code/core test            # Core tests only
pnpm --filter @healthy-ai-code/mcp-server test      # MCP server tests only
node scripts/health-audit.mjs                       # Self-audit (runs score on all project files)
```

---

## Architecture Decisions

### Three analysis entry points

| Function | Signature | When to use |
|---|---|---|
| `analyzeCode()` | `(code: string, language, filePath?)` — **sync** | Inline analysis, no disk access, no git |
| `analyzeFile()` | `(filePath: string)` — **async** | Reads file from disk, no git |
| `analyzeFileWithHistory()` | `(filePath, repoPath)` — **async** | Adds `MethodTemporalCoupling` smells from git history |

`analyzeFileWithHistory` runs `analyzeFile` and `analyzeMethodCoupling` in parallel, merges smells, and recalculates the score. It is the only entry point where `MethodTemporalCoupling` weight affects the final score.

### MCP tool registration

- Each tool lives in its own file under `packages/mcp-server/src/tools/`.
- Every tool file exports a single `register<ToolName>(server: McpServer)` function.
- `packages/mcp-server/src/server.ts` is the sole registration point — import and call the register function there.

### Language dispatch

`analyzeByLanguage()` in `packages/core/src/analyzers/index.ts` is the single dispatcher. Pass it `(code, language, filePath)`.

### Scoring formula

```
score = 10 - Σ(weight × √count)   per smell type
floor = 1.0
```

Weights are in `packages/core/src/scoring/weights.ts`. Key values:

| Smell | Weight | Notes |
|---|---|---|
| `ComplexMethod` | 1.5 | |
| `GodClass` | 1.5 | |
| `SqlInjectionRisk` / `XssRisk` / `CommandInjectionRisk` | 1.5 | |
| `HardcodedCredential` / `HardcodedApiKey` | 2.0 | |
| `DeepNesting` | 1.2 | |
| `BrainMethod` | 1.2 | |
| `KnowledgeLoss` | 1.0 | |
| `MethodTemporalCoupling` | 0.3 | Requires git history; only via `analyzeFileWithHistory` |

### Score thresholds

| Constant | Value | Meaning |
|---|---|---|
| `AI_READY_THRESHOLD` | 9.5 | `loopComplete: true` |
| `HEALTHY_THRESHOLD` | 9.0 | Green category floor |
| `PROBLEMATIC_THRESHOLD` | 6.0 | Yellow/red boundary |

---

## API Usage Tips (custom Claude API clients)

Tips for operators building custom clients around the refactoring loop tools. These are
**opt-in headers / parameters** — the MCP server itself does not set them; include them in
your HTTP client when calling the Anthropic Messages API directly.

### Token-efficient tools (beta)
```
anthropic-beta: token-efficient-tools-2025-02-19
```
Reduces token usage for tool-use responses by ~40 % with no change to tool behaviour.
Safe to enable globally on all refactoring loop calls.

### Structured outputs / schema caching (beta)
```
anthropic-beta: structured-outputs-2025-11-13
```
Enables constrained decoding (output always matches the JSON schema) and caches the
tool schemas for 24 hours. Reduces both per-call latency and schema-transmission tokens
when the same tool is called many times in a loop.

### Task budgets — total loop cost cap (beta)
```
anthropic-beta: task-budgets-2026-03-13
```
Attach a `task_budget` object to the first call in a refactoring loop to hard-cap the
total tokens consumed across all iterations. Reduces loop cost by 40–60 % on long
sessions. The model returns `budget_exhausted: true` when the cap is hit, which maps
cleanly to `loopComplete: true`.

### Adaptive thinking effort (`effort`) — Opus 4.x
The `code_health_auto_refactor` tool already computes and returns the correct effort
level in `followUpInstruction`. When calling Opus 4.7 directly:

| Situation | `effort` value |
|---|---|
| `nearTarget: true` (score ≥ 9.0) | `"low"` |
| `successLikelihood: "medium"` | `"medium"` |
| `successLikelihood: "hard"` | `"high"` |
| `successLikelihood: "hard"` AND score < 5 | `"max"` |
| Long-horizon agentic session (Opus 4.7 only) | `"xhigh"` |

`"xhigh"` is Opus 4.7-exclusive; on earlier models it falls back to `"high"`.

### Prompt cache TTL — session-level savings
The Anthropic prompt cache has a **1-hour TTL** for paid tiers. For a multi-file
refactoring session, structure the system prompt (tool schemas, project instructions)
as the first cache-breakpoint message so the same cache block is reused across all
tool calls within the session. This requires no API changes — just keep the system
prompt identical across calls.

---

## Language Support

### Tier A — Full AST (tree-sitter)

TypeScript, JavaScript, Python, Java, C#, Go, Ruby, Rust, PHP, Kotlin, Scala, Elixir, Swift, Vue.js, Haskell, Julia, OCaml — 17 languages.

Full `LanguageProfile` (GodClass, FeatureEnvy, DataClumps, etc.) is implemented for: TypeScript, Python, Java, C#, Go, Ruby, Rust, PHP, Kotlin, Scala. Elixir uses a function-oriented profile (no class analog). Swift is lazy-loaded; falls back to empty metrics if `tree-sitter-swift` is missing. Haskell, Julia, and OCaml provide function extraction with cyclomatic complexity and nesting depth via tree-sitter AST.

### Tier B — Regex

Bash, Lua, R, Clojure, Dart, C, C++, COBOL, Apex, F#, VB.NET, Perl, Groovy, Objective-C, PowerShell, Erlang, Zig, Nim, Crystal — 19 languages. Function extraction, cyclomatic complexity, SATD, MagicNumber only.

### Tier C — Structural

YAML, JSON, Dockerfile, HCL/Terraform, Makefile, SQL, HTML, CSS, Markdown, TOML — 10 formats. LOC, LargeFile, SATD only.

---

## Test Conventions

- **Fixtures:** `packages/core/tests/fixtures/` with `healthy/` and `unhealthy/` sub-directories. Put edge cases in `edge-cases/` if needed.
- **Integration tests:** `packages/mcp-server/tests/integration/` — test the MCP tool responses end-to-end.
- **Temporal coupling tests:** Use `method-coupling-repo-builder.ts` (TypeScript fixture) or `method-coupling-bash-repo-builder.ts` (Bash/Tier B fixture) to construct deterministic fake git repos. Do not depend on the project's own git history in tests.

---

## Known Behaviour / Edge Cases

- **JSX/TSX** is normalised to TS/JS before method-coupling analysis. The language returned in `HealthResult` will reflect the normalised value.
- **`rangesCache`** in `method-coupling-helpers` has a max of 500 entries (LRU-like eviction). Relevant when running analysis across large repos in a single process.
- **Kotlin** uses Tier A (tree-sitter-kotlin). The `kotlinProfile` is a full LanguageProfile enabling GodClass, DataClumps, etc.
- **Scala** uses Tier A (tree-sitter-scala). Full `scalaProfile` with class_definition, object_definition, trait_definition.
- **Elixir** uses Tier A (tree-sitter-elixir). Function-oriented: def/defp functions are extracted with CC from if/case/cond. No class profile (Elixir has no classes).
- **Swift** tree-sitter binding is lazy-loaded. If `tree-sitter-swift` is absent, analysis silently falls back to empty metrics rather than throwing.
- **Haskell** uses Tier A (tree-sitter-haskell). Multiple clauses for the same function name are merged into one `FunctionResult`. No LanguageProfile (Haskell is purely functional).
- **Julia** uses Tier A (tree-sitter-julia). Both long-form (`function foo(...)...end`) and short-form (`foo(args) = expr`) functions are detected.
- **OCaml** uses Tier A (tree-sitter-ocaml). Only `let_binding` nodes with at least one `parameter` child are treated as functions; value bindings are ignored.
- **Zig, Nim, Crystal** use Tier B (regex). Zig detects `fn name(`, Nim detects `proc/func/method/iterator/template/macro name`, Crystal detects `def name`.
- **`MethodTemporalCoupling`** has weight 0.3 but is **not included** in the health score from `analyzeFile()` — only `analyzeFileWithHistory()` merges these smells before scoring.
- **`MethodTemporalCoupling` is language-neutral**: `getMethodRangesAtCommit()` in `method-coupling-helpers.ts` calls `analyzeByLanguage()` for all detected languages. Tier A languages use tree-sitter AST for method ranges; Tier B languages (Bash, Lua, Haskell, R, etc.) use regex-extracted functions from `analyzeGenericTierB`. Tier C languages (YAML, JSON, etc.) return no functions and thus get no method coupling signal — this is expected. Only files with `detectLanguage()` returning `'unsupported'` are excluded entirely.
- **Empirical calibration** is opt-in (`useCalibratedThresholds: true`) and currently validated for Java only (Defects4J dataset). See `docs/calibration/README.md`.

---

## Adding a New MCP Tool

1. Create `packages/mcp-server/src/tools/<tool-name>.ts` and export a `register<ToolName>(server: McpServer): void` function.
2. Import and call it in `packages/mcp-server/src/server.ts` inside `createServer()`.
3. If the tool requires new core logic, implement it in `packages/core/src/` and re-export from `packages/core/src/index.ts`.
4. Add integration tests under `packages/mcp-server/tests/integration/`.

---

## Public API Surface

All public exports are in `packages/core/src/index.ts`. Key groups:

| Export group | Source module |
|---|---|
| `analyzeCode`, `analyzeFile`, `analyzeFileWithHistory` | `index.ts` (defined inline) |
| `analyzeChangeset` | `./diff` |
| `analyzeArchitectureDebt`, `computeFanInFanOut`, `computePropagationCost` | `./analyzers/architecture-debt` |
| `analyzeBusFactor`, `analyzeSprintCongestion`, `analyzeKnowledgeLossIndex` | `./temporal/bus-factor`, `sprint-congestion`, `knowledge-loss-index` |
| `analyzeHotspots`, `analyzeFileCoupling`, `analyzeComplexityTrend` | `./temporal/behavioral-analytics`, `file-coupling`, `complexity-trend` |
| `auditSecurity`, `detectSecrets`, `formatAsSarif` | `./security/index` |
| `analyzeAIReadiness`, `analyzeNamingClarity`, `analyzeTypeCoverage` | `./ai-readiness/` |
| `analyzeForAutoRefactor`, `applyAutoRefactor` | `./refactor/` |
| `runRefactoringLoop` | `./refactor/refactoring-loop` |
| `loadGoals`, `setGoal`, `removeGoal`, `listGoals` | `./debt-goals` |
| `runValidation`, `pearsonCorrelation`, `computeAUROC` | `./validation/index` |
| `setConfig`, `getConfig` | `./config` |
