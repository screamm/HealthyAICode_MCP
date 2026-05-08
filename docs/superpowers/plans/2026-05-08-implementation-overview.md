# Healthy AI Code MCP — Implementation Overview

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Start with Sprint 1 and proceed in order. Sprint 2 and Sprint 3 can be started in parallel once Sprint 1 is complete.

**Total sprints:** 4
**Primary tech:** TypeScript 5.x (CommonJS), tree-sitter, @modelcontextprotocol/sdk, pnpm workspaces
**Node requirement:** Node.js 18+, pnpm 8+
**Design spec:** [`docs/superpowers/specs/2026-05-08-healthy-ai-code-mcp-design.md`](../specs/2026-05-08-healthy-ai-code-mcp-design.md)

---

## What We Are Building

A local MCP server (`@healthy-ai-code/mcp-server`) that exposes AST-based code health analysis directly to AI assistants and agents. The server analyses source files across TypeScript/JS, Python, Java/Kotlin, and C#, returns a 1–10 health score, identifies code smells, and drives a self-correcting refactoring feedback loop: the AI agent refactors until the score reaches the target (>= 9.5).

**Why it matters:** AI agents writing code today have no built-in quality gate. Without a health signal they accumulate technical debt at machine speed. This MCP server gives every agent an objective quality oracle and explicit `nextAction` instructions — turning AI coding from "generate and forget" into "generate and verify".

---

## Sprint Overview

| Sprint | Goal | Key Deliverables | Can Run In Parallel With | Blocker |
|--------|------|-----------------|--------------------------|---------|
| [Sprint 1](./2026-05-08-sprint-1-foundation.md) | Foundation | Monorepo, types, TypeScript analyzer, scoring engine, smell detector, core public API, test fixtures | — | None |
| [Sprint 2](./2026-05-08-sprint-2-multilanguage.md) | Multi-language support | Python analyzer, Java/Kotlin analyzer, C# analyzer, language router, per-language test fixtures | Sprint 3 (partial) | Sprint 1 complete |
| [Sprint 3](./2026-05-08-sprint-3-mcp-server.md) | MCP Server | mcp-server package scaffold, all 7 MCP tools, `nextAction` feedback loop, AGENTS.md | Sprint 2 (partial) | Sprint 1 complete |
| [Sprint 4](./2026-05-08-sprint-4-distribution.md) | Distribution | Integration tests, npm packaging, `bin` entry point, README, publish to npm | — | Sprint 1 + 2 + 3 complete |

### Parallel Execution Note

After Sprint 1 completes, two tracks can proceed concurrently:
- **Track A (Sprint 2):** Add Python, Java/Kotlin, C# analyzers to `packages/core`
- **Track B (Sprint 3):** Build the MCP server layer on top of the TypeScript-only core

Track B (Sprint 3) can start immediately after Sprint 1 because the MCP tools only call `analyzeFile()` / `analyzeCode()` from `core/index.ts`, which is fully functional with TypeScript/JS after Sprint 1. The MCP server does not need to know about language diversity — that is core's concern.

Sprint 4 must wait for all tracks to converge.

---

## Complete Final File Structure

```
healthy-ai-code-mcp/
├── packages/
│   ├── core/                                     # @healthy-ai-code/core
│   │   ├── src/
│   │   │   ├── analyzers/
│   │   │   │   ├── typescript.ts                 # TypeScript/JS AST analysis via tree-sitter
│   │   │   │   ├── python.ts                     # Python AST analysis via tree-sitter-python
│   │   │   │   ├── java.ts                       # Java/Kotlin AST analysis via tree-sitter-java
│   │   │   │   ├── csharp.ts                     # C# AST analysis via tree-sitter-c-sharp
│   │   │   │   └── index.ts                      # Language router: analyzeByLanguage()
│   │   │   ├── scoring/
│   │   │   │   ├── weights.ts                    # SMELL_WEIGHTS, thresholds
│   │   │   │   └── scorer.ts                     # calculateScore(), categorize()
│   │   │   ├── smells/
│   │   │   │   └── detector.ts                   # detectSmells() — all code smells
│   │   │   ├── diff/
│   │   │   │   └── git.ts                        # analyzeChangeset() via simple-git
│   │   │   ├── language-detect.ts                # detectLanguage() via file extension
│   │   │   ├── types.ts                          # All TypeScript interfaces
│   │   │   └── index.ts                          # analyzeFile(), analyzeCode(), analyzeChangeset()
│   │   ├── tests/
│   │   │   ├── analyzers/
│   │   │   │   ├── typescript.test.ts
│   │   │   │   ├── python.test.ts
│   │   │   │   ├── java.test.ts
│   │   │   │   └── csharp.test.ts
│   │   │   ├── scoring/
│   │   │   │   └── scorer.test.ts
│   │   │   ├── smells/
│   │   │   │   └── detector.test.ts
│   │   │   ├── diff/
│   │   │   │   └── git.test.ts
│   │   │   └── fixtures/
│   │   │       ├── healthy/
│   │   │       │   ├── simple.ts                 # score ~10.0
│   │   │       │   ├── simple.py
│   │   │       │   ├── Simple.java
│   │   │       │   └── Simple.cs
│   │   │       ├── unhealthy/
│   │   │       │   ├── complex.ts                # score ~3-4
│   │   │       │   ├── complex.py
│   │   │       │   ├── Complex.java
│   │   │       │   └── Complex.cs
│   │   │       └── edge-cases/
│   │   │           ├── empty.ts
│   │   │           └── single-line.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   └── mcp-server/                               # @healthy-ai-code/mcp-server
│       ├── src/
│       │   ├── tools/
│       │   │   ├── shared.ts                     # buildNextAction(), formatReviewSummary()
│       │   │   ├── code-health-score.ts           # code_health_score tool
│       │   │   ├── code-health-review.ts          # code_health_review tool (feedback loop)
│       │   │   ├── pre-commit-safeguard.ts        # pre_commit_code_health_safeguard
│       │   │   ├── analyze-change-set.ts          # analyze_change_set
│       │   │   ├── refactoring-business-case.ts   # code_health_refactoring_business_case
│       │   │   └── explain-code-health.ts         # explain_code_health + explain_productivity
│       │   ├── server.ts                          # createServer() — registers all tools
│       │   └── index.ts                           # Entry point with shebang
│       ├── tests/
│       │   ├── tools/
│       │   │   ├── code-health-score.test.ts
│       │   │   └── code-health-review.test.ts
│       │   └── integration/
│       │       └── mcp-server.test.ts
│       ├── package.json
│       └── tsconfig.json
├── AGENTS.md                                      # Agent workflow instructions (copy to user's repo)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── package.json                                   # Root workspace config
└── README.md
```

---

## Sprint Dependencies

```
Sprint 1 (Foundation)
  └── Sprint 2 (Multi-language)   [can start once Sprint 1 is done]
  └── Sprint 3 (MCP Server)       [can start once Sprint 1 is done, in parallel with Sprint 2]
        └── Sprint 4 (Distribution)  [requires Sprint 1 + 2 + 3]
```

**Why Sprint 2 and Sprint 3 can overlap:**

Sprint 3 builds the MCP server using `analyzeFile()` from the core public API. After Sprint 1, that API already works for TypeScript/JS. Sprint 3 has no dependency on which languages the core supports — it only depends on the API shape in `types.ts`. Sprint 2 and Sprint 3 extend different packages (`core` vs `mcp-server`) with no shared mutable state.

**Risk:** If Sprint 2 changes `types.ts` interfaces, Sprint 3 may need minor adjustments. Mitigate by freezing `HealthResult`, `Smell`, and `ChangesetResult` interfaces in Sprint 1 and treating them as stable contracts.

---

## Critical Design Decisions

These decisions were made during the design phase. They are not open for re-evaluation during implementation without explicit sign-off.

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **CommonJS (not ESM)** | tree-sitter native Node.js bindings load via `require()`. ESM interop with native addons is unreliable across Node.js versions. Use CJS throughout. |
| 2 | **pnpm workspaces** | `core` must be built before `mcp-server`. Use `workspace:*` dependency reference so the local build is always used, not a published version. Build order: `pnpm -r run build`. |
| 3 | **`pool: 'forks'` in Vitest** | tree-sitter is a native addon. Vitest's default `pool: 'threads'` (worker threads) cannot load native `.node` files reliably. Set `pool: 'forks'` in `vitest.config.ts` for both packages. |
| 4 | **`nextAction` in every tool response** | The self-correcting feedback loop depends on every tool response containing an explicit instruction for what the agent should do next. Without it, agents stop after one call. `toolToCallAfter` names the exact next MCP tool to invoke. |
| 5 | **`loopComplete: true` at score >= 9.5, not 10.0** | A score of 10.0 requires zero detectable smells. Real-world code with legitimate complexity will hover at 9.5–9.9. Setting the threshold at 10.0 creates an infinite loop. 9.5 is the practical "AI-ready" target. |
| 6 | **simple-git for diff analysis** | Pure Node.js library, no `child_process` shell invocations, works on Windows/macOS/Linux without git on PATH issues. Used in `diff/git.ts` for `analyzeChangeset()`. |
| 7 | **Cognitive complexity = cyclomatic complexity in v1** | True cognitive complexity (Sonar's definition) requires tracking nesting depth multipliers per control structure. That is a Sprint 2+ feature. In v1, both metrics use the same branch-counting algorithm. Documented as a known simplification. |
| 8 | **One file per MCP tool** | Each tool in `packages/mcp-server/src/tools/` is self-contained. Shared helpers live in `shared.ts`. This makes it easy to add, remove, or modify a single tool without touching others. |
| 9 | **`analyzeCode(code, language)` as the primitive** | `analyzeFile()` reads disk and calls `analyzeCode()`. `analyzeChangeset()` uses git to get file contents and calls `analyzeCode()`. All analysis paths converge on the same pure function, making testing straightforward. |

---

## MCP Tools Reference

| Tool name | Input | Primary use |
|-----------|-------|-------------|
| `code_health_score` | `filePath: string` | Quick single-number score for a file |
| `code_health_review` | `filePath: string` | Full review with smells, issues, and `nextAction` — drives the refactoring loop |
| `pre_commit_code_health_safeguard` | `repoPath: string`, `files: string[]` | Checks staged/unstaged files before commit; blocks red files |
| `analyze_change_set` | `repoPath: string`, `baseBranch: string` | Full diff against base branch; used before opening a PR |
| `code_health_refactoring_business_case` | `filePath: string` | ROI calculation for refactoring investment |
| `explain_code_health` | *(none)* | Explains what the health score means |
| `explain_code_health_productivity` | *(none)* | Explains the link between code health and developer productivity |

---

## Health Score Reference

| Score | Category | Meaning |
|-------|----------|---------|
| 10.0 | green | Perfect, AI-ready |
| 9.5–9.9 | green | AI-ready (loop target) |
| 9.0–9.4 | green | Healthy |
| 4.0–8.9 | yellow | Technical debt |
| 1.0–3.9 | red | Severe technical debt |

`loopComplete: true` when score >= 9.5.

---

## Quick Start for a New Engineer

```bash
# 1. Clone the repository
git clone <repo-url>
cd healthy-ai-code-mcp

# 2. Install pnpm if not already available
npm install -g pnpm

# 3. Install all workspace dependencies
pnpm install

# 4. Open Sprint 1 and start at Task 1
# File: docs/superpowers/plans/2026-05-08-sprint-1-foundation.md
# Begin with Task 1 (monorepo setup) and follow TDD steps in order
```

**First file to open:**
`docs/superpowers/plans/2026-05-08-sprint-1-foundation.md`

**First command to run after setup:**
```bash
pnpm test   # should pass 0 tests (no implementation yet) and not crash
```

**Verification that Sprint 1 is complete:**
```bash
pnpm -r run build   # core and mcp-server both compile without errors
pnpm -r run test    # all tests in packages/core/tests pass
```

---

## Sprint Plan Links

| Sprint | File | Status |
|--------|------|--------|
| Sprint 1: Foundation | [2026-05-08-sprint-1-foundation.md](./2026-05-08-sprint-1-foundation.md) | Available |
| Sprint 2: Multi-language | [2026-05-08-sprint-2-multilanguage.md](./2026-05-08-sprint-2-multilanguage.md) | Available |
| Sprint 3: MCP Server | [2026-05-08-sprint-3-mcp-server.md](./2026-05-08-sprint-3-mcp-server.md) | Available |
| Sprint 4: Distribution | [2026-05-08-sprint-4-distribution.md](./2026-05-08-sprint-4-distribution.md) | Available |

---

## Data Flow (End to End)

```
AI assistant
    |
    | MCP tool call (e.g. code_health_review { filePath: "src/auth.ts" })
    v
mcp-server/src/tools/code-health-review.ts
    |
    | core.analyzeFile("src/auth.ts")
    v
core/src/index.ts
    |
    +-- language-detect.ts          detectLanguage("auth.ts") -> "typescript"
    |
    +-- analyzers/typescript.ts     parse AST via tree-sitter
    |                               extract functions, measure cyclomatic complexity,
    |                               nesting depth, parameter counts, line counts
    |
    +-- smells/detector.ts          detectSmells(metrics) -> Smell[]
    |
    +-- scoring/scorer.ts           calculateScore(smells) -> 1-10
    |
    v
HealthResult { score, category, smells, metrics, functions }
    |
    v
mcp-server/src/tools/shared.ts
    |
    | buildNextAction(result, targetScore=9.5)
    v
ToolResponse { score, category, loopComplete, issues, summary, nextAction }
    |
    v
AI assistant reads nextAction.instruction and nextAction.toolToCallAfter
    |
    | (if loopComplete: false) -> refactor -> call toolToCallAfter
    | (if loopComplete: true)  -> commit safe
    v
pre_commit_code_health_safeguard before git commit
```

---

## Error Handling Contract

| Scenario | Behaviour |
|----------|-----------|
| File not found | Structured MCP error response, descriptive message, no crash |
| Unknown file extension | `language: 'unsupported'`, analysis skipped, tool returns advisory message |
| Parse error (invalid syntax) | Partial result with warning flag; does not abort the call |
| No git repo at `repoPath` | `analyze_change_set` returns structured error explaining the requirement |
| File > 10,000 lines | Analysis runs; response includes `performanceWarning: true` |

All errors are returned as structured MCP error responses — never as unhandled exceptions that crash the server process.
