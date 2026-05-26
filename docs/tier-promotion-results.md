# Tier Promotion Results — Kotlin, Scala, Elixir

**Date:** 2026-05-25

## Summary

Three languages were promoted from Tier B (regex-based) to Tier A (full tree-sitter AST) analysis. A fourth candidate (Dart) was blocked by a native binding incompatibility.

---

## Tree-Sitter Package Availability

| Language | npm package | Version | Native build | Result |
|---|---|---|---|---|
| Kotlin | `tree-sitter-kotlin` | 0.3.8 | Compiled via node-gyp (no prebuilds) | **Promoted** |
| Scala | `tree-sitter-scala` | 0.24.0 | Prebuilt binaries (win32-x64) | **Promoted** |
| Elixir | `tree-sitter-elixir` | 0.3.5 | Prebuilt binaries (win32-x64) | **Promoted** |
| Dart | `tree-sitter-dart` | 1.0.0 | Compiled via node-gyp, but exports `{name, nodeTypeInfo}` only — missing `language` object | **Blocked** |

Dart's native binding compiled successfully but does not expose the `language` object that `tree-sitter@0.25.0` requires when calling `parser.setLanguage()`. This is a version compatibility gap between tree-sitter-dart v1.0.0 and tree-sitter v0.25.0.

---

## What Was Implemented

### Kotlin — Tier A (`packages/core/src/analyzers/kotlin.ts`)

Replaces the previous regex-based `analyzeGenericTierB` implementation.

**Capabilities gained:**
- Function detection via tree-sitter AST (`function_declaration`, `anonymous_function`, `secondary_constructor`)
- Accurate parameter counting via `function_value_parameters`
- Cyclomatic complexity from AST node types: `if_expression`, `when_expression`, `when_entry`, `for_statement`, `while_statement`, `do_while_statement`, `catch_block`
- Max nesting depth via `calculateMaxNestingDepth`
- Full LanguageProfile (`kotlinProfile`) enabling: GodClass, FeatureEnvy, MessageChain, DataClumps, PrimitiveObsession, ComplexConditional, LowDocCoverage, BumpyRoad
- Extension function detection

**Note:** `kotlinProfile` was already stubbed in `language-profile.ts`. This promotion activates it.

### Scala — Tier A (`packages/core/src/analyzers/scala.ts`)

New tree-sitter-based implementation.

**Capabilities gained:**
- Function detection: `function_definition` (concrete) and `function_declaration` (abstract in traits)
- Class detection: `class_definition`, `object_definition` (companion/standalone), `trait_definition`
- Field detection: `val_definition`, `var_definition` for LCOM4 computation
- Cyclomatic complexity from: `if_expression`, `for_expression`, `case_clause`, `while_expression`, `try_expression`, `catch_clause`
- Full LanguageProfile (`scalaProfile`) enabling all 8 AST-based smell detectors

### Elixir — Tier A (`packages/core/src/analyzers/elixir.ts`)

New tree-sitter-based implementation. Elixir's functional paradigm requires a different approach: rather than class-based profiles, the analyzer targets `def`/`defp` function call nodes.

**Capabilities gained:**
- Function detection by recognising `call` nodes with identifier `def`, `defp`, `defmacro`, `defmacrop`
- Name extraction handles both simple calls and `when` guard patterns (binary_operator nodes)
- Parameter counting from inner function call's `arguments` node
- Cyclomatic complexity from control-flow call keywords (`if`, `unless`, `cond`, `case`, `receive`, `with`, `for`) plus `stab_clause` / `else_block` nodes
- Max nesting depth via control-flow call detection
- Text-based smells: SATD, MagicNumbers

Elixir does **not** run the LanguageProfile-based detectors (GodClass, FeatureEnvy, etc.) because Elixir has no class concept. The `elixirProfile` is defined but used only for future extension.

---

## New Language Profiles

Two new `LanguageProfile` objects were added to `packages/core/src/smells/language-profile.ts`:

- `scalaProfile` — full profile for OO/FP Scala code
- `elixirProfile` — functional profile (empty classNodeTypes/methodNodeTypes; used structurally)

---

## New Test Fixtures

| File | Purpose |
|---|---|
| `tests/fixtures/healthy/Simple.kt` | Kotlin: two simple methods, low CC |
| `tests/fixtures/unhealthy/Complex.kt` | Kotlin: `processOrder` with CC > 5, SATD |
| `tests/fixtures/healthy/simple.scala` | Scala: two simple defs in an object |
| `tests/fixtures/unhealthy/complex.scala` | Scala: `processOrder` with match/case, CC > 5, SATD |
| `tests/fixtures/healthy/simple.ex` | Elixir: two simple defmodule functions |
| `tests/fixtures/unhealthy/complex.ex` | Elixir: deeply nested `process_order`, CC > 5, SATD |

---

## New Test Files

| File | Tests |
|---|---|
| `tests/analyzers/kotlin.test.ts` | 23 tests — replaces previous inline-only tests with fixture-based Tier A coverage |
| `tests/analyzers/scala.test.ts` | New — 24 tests covering function detection, params, CC, nesting, smells, fixtures |
| `tests/analyzers/elixir.test.ts` | New — 26 tests covering def/defp detection, when guards, CC, multi-clause, fixtures |

---

## Test Results

```
Before:  77 test files, 813 tests
After:   79 test files, 877 tests (+ 2 new test files, + 64 new tests)
Status:  All 877 tests pass
```

---

## Language Count Update

| Tier | Before | After |
|---|---|---|
| Tier A | 16 | 17 (Kotlin, Scala, Elixir promoted; Dart blocked) |
| Tier B | 15 | 14 (Kotlin, Scala, Elixir moved out; Dart stays) |
| Tier C | 10 | 10 |
| **Total** | **41** | **41** |

---

## Build Notes

- `tree-sitter-kotlin` and `tree-sitter-dart` have no prebuilt binaries for win32-x64.
  Both were compiled with `npx node-gyp rebuild` inside their pnpm store directories.
- `tree-sitter-scala` and `tree-sitter-elixir` have prebuilt binaries and load immediately.
- If deployed in a clean environment, `tree-sitter-kotlin` will need its build scripts
  approved via `pnpm approve-builds` or by adding build exceptions to `.npmrc`.
