# Language Coverage Matrix

Per-language biomarker coverage. Generated after Sprints 14, 16, 17, 19, and 25.

| Symbol | Meaning |
|--------|---------|
| ✓ | Fully wired with test coverage |
| ❌ | Not implemented |
| partial | Wired but text-heuristic only (no AST validation) |
| ~ | Tier B text-based extraction (regex, no AST) |
| – | N/A for this language (e.g. `GodClass` on a language with no classes) |
| C | Tier C structural only (file-level metrics) |

## Coverage Table — Tier A (AST-based) Languages

| Biomarker | TS | JS | Py | Java | Kotlin | C# | Rust | Go | PHP | Ruby | Swift |
|-----------|----|----|-----|------|--------|----|------|----|-----|------|-------|
| ComplexMethod | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| LargeMethod (LongMethod) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| LargeFile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| LongParameterList | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| DeepNesting | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CognitiveComplexity | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ❌ | ❌ | ❌ | ❌ | ❌ |
| TypeSafetyEscape | ✓ | partial | ❌ | partial | partial | partial | – | – | – | – | – |
| MagicNumber | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| LowDocCoverage | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Duplication | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| LanguageMix | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| DeadExports | ✓ | ✓ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Hotspot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| BrainMethod | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ❌ | ❌ | ❌ | ❌ | ❌ |
| BumpyRoad | ✓ | ✓ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| TestProximity | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ComplexConditional | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ❌ | ❌ | ❌ | ❌ | ❌ |
| MessageChain | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DataClumps | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ❌ | ❌ | ❌ | ❌ | ❌ |
| SATD | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| GodClass | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | – | – | ✓ | ✓ | ✓ |
| FeatureEnvy | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ❌ | ❌ | ❌ | ❌ | ❌ |
| LowMaintainability | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ❌ | ❌ | ❌ | ❌ | ❌ |
| CodeChurn | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| TemporalCoupling | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| DeveloperCongestion | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| KnowledgeLoss | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| MethodTemporalCoupling | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| PrimitiveObsession | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Coverage** | **~100%** | **~100%** | **~89%** | **~89%** | **~89%** | **~89%** | **~54%** | **~54%** | **~57%** | **~57%** | **~57%** |

## Coverage Table — Tier B (Text-based) Languages (Sprint 25)

Tier B languages use regex-based extraction. Functions are detected, CC is computed from keyword counting.
No AST parsing — faster but less precise. Nesting depth, parameter count, and all AST-based smells are not available.

| Biomarker | Bash | Lua | Elixir | Haskell | R | Clojure | Kotlin* |
|-----------|------|-----|--------|---------|---|---------|---------|
| ComplexMethod (CC) | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| LargeMethod | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| LargeFile | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| LongParameterList | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| DeepNesting | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| MagicNumber | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| SATD | ~ | ~ | ~ | ~ | ~ | ~ | ~ |
| Hotspot | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| CodeChurn | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| TemporalCoupling | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| DeveloperCongestion | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| KnowledgeLoss | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| All other AST smells | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Coverage** | **~25%** | **~25%** | **~25%** | **~25%** | **~25%** | **~25%** | **~25%** |

\* Kotlin moved from Java-routing to native Tier B analyzer in Sprint 25. This trades AST accuracy for Kotlin-correct `fun` keyword detection.
Tier A Kotlin analyzer (tree-sitter-kotlin) is planned for a future sprint.

## Coverage Table — Tier C (Structural) Languages (Sprint 25)

Tier C languages return file-level metrics only. No function-level analysis.
Provides: totalLines, LargeFile smell, SATD detection.

| Biomarker | YAML | JSON | Dockerfile | HCL | Makefile | SQL | HTML | CSS | Markdown | TOML |
|-----------|------|------|------------|-----|----------|-----|------|-----|----------|------|
| LargeFile | C | C | C | C | C | C | C | C | C | C |
| SATD | C | – | C | C | C | C | C | C | C | C |
| ComplexDockerLayer | – | – | C | – | – | – | – | – | – | – |
| All function-level smells | – | – | – | – | – | – | – | – | – | – |
| Temporal biomarkers | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Coverage** | **~10%** | **~8%** | **~12%** | **~10%** | **~10%** | **~8%** | **~8%** | **~8%** | **~8%** | **~8%** |

## Notes

- TypeScript/JavaScript is the reference implementation — all biomarkers have a TS/JS version first.
- Python, Java, Kotlin (pre-Sprint 25), and C# gained Tier A parity in Sprint 14.
- Rust, Go, PHP, Ruby, and Swift have Tier B coverage from Sprint 16 (basic metrics + text heuristics).
- **Sprint 25**: Added Tier B analyzers for Bash, Lua, Elixir, Haskell, R, Clojure; Tier C for YAML, JSON, Dockerfile, HCL, Makefile, SQL, HTML, CSS, Markdown, TOML. Kotlin moved to native Tier B analyzer.
- `GodClass` is marked `–` for Rust and Go: these languages have no classes. Rust impl-blocks and Go struct methods may qualify in a future sprint.
- `TypeSafetyEscape` is `–` for dynamically typed languages and `partial` for statically typed languages with text-heuristic analysis.
- `DeadExports` is TS/JS-only (requires module-graph resolution).
- `BumpyRoad` is TS/JS-only (chunk-based per-function detection). Tier A porting planned for a future sprint.
- Temporal biomarkers (`Hotspot`, `CodeChurn`, `TemporalCoupling`, `DeveloperCongestion`, `KnowledgeLoss`, `MethodTemporalCoupling`) operate on git history — language-agnostic (✓ for all languages).
- JSON does not support comments, so SATD detection yields no results for JSON files.
- Tier B CC = control-flow keyword count + 1 (base). Nesting depth is not tracked.
- `~` = text-based heuristic rather than AST-computed value.
