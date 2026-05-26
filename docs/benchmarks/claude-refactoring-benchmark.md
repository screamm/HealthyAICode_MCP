# Claude Opus 4.7 Refactoring Benchmark

**Date:** 2026-05-25
**Model:** `opus`
**Session:** Claude Code Pro/Max (no API key or billing required)
**Dataset:** 5 unhealthy fixture files (score < 9.5, with actionable smells)

---

## Summary

| Metric | Mechanical only | With Claude Opus 4.7 |
|--------|----------------|----------------------|
| Files tested | 17 | 5 |
| Fix rate (reach ≥ 9.5) | 11.8% | **20%** |
| Avg score improvement | +0.27 pts | **+2.04 pts** |
| Cost | $0 | Included in Pro/Max |

---

## How it works

The MCP tool `code_health_auto_refactor` returns **structured refactoring instructions**
(target function, numbered steps, example skeleton). Claude Code then spawns a subagent
with model `opus` to apply them — using the user's existing Pro/Max session,
with no separate API billing.

---

## Per-file Results

| File | Language | Before | After | Delta | Status |
|------|----------|--------|-------|-------|--------|
| packages/core/tests/fixtures/unhealthy/agents-md-fixture.ts | typescript | 3.6 | 5.6 | +2.00 | NOT_FIXED |
| packages/core/tests/fixtures/unhealthy/bumpy-road-fixture.ts | typescript | 8.9 | 9.2 | +0.30 | NOT_FIXED |
| packages/core/tests/fixtures/unhealthy/Complex.cs | csharp | 5.5 | 8.7 | +3.20 | NOT_FIXED |
| packages/core/tests/fixtures/unhealthy/complex.ex | elixir | 5.1 | 9.6 | +4.50 | FIXED |
| packages/core/tests/fixtures/unhealthy/complex.go | go | 8.0 | 8.2 | +0.20 | NOT_FIXED |

---

## Methodology

- **Dataset:** `packages/core/tests/fixtures/unhealthy/` with score < 9.5 and actionable smell.
- **Instruction source:** `analyzeForAutoRefactor()` — same function behind the MCP tool.
- **Execution:** `claude --print --model opus --output-format text` (local Pro/Max session, no API key).
- **Scoring:** Post-refactor code re-scored via `analyzeCode()` in-memory (no disk writes).
- **Fix threshold:** Score ≥ 9.5.
- **Baseline:** Mechanical-only benchmark (11.8% fix rate, no Claude involved).
