# Language Coverage Matrix

Per-language biomarker coverage. Generated after Sprints 14, 16, 17, and 19.

| Symbol | Meaning |
|--------|---------|
| ✓ | Fully wired with test coverage |
| ❌ | Not implemented |
| partial | Wired but text-heuristic only (no AST validation) |
| – | N/A for this language (e.g. `GodClass` on a language with no classes) |

## Coverage Table

| Biomarker | TS | JS | Py | Java | Kotlin | C# | Rust | Go | PHP | Ruby | Swift |
|-----------|----|----|-----|------|--------|----|------|----|-----|------|-------|
| ComplexMethod | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| LargeMethod (LongMethod) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| LargeFile (LargeClass/LargeFile) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
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

## Notes

- TypeScript/JavaScript is the reference implementation — all biomarkers have a TS/JS version first. TypeScript and JavaScript share the same analyzer.
- Python, Java, Kotlin, and C# gained Tier A parity in Sprint 14 (all AST-based smells except `BumpyRoad`).
- Rust, Go, PHP, Ruby, and Swift have Tier B coverage from Sprint 16 (basic metrics + text heuristics). Tier A for these is future sprint work.
- `GodClass` is marked `–` for Rust and Go: these languages have no classes in the traditional sense. Rust impl-blocks and Go struct methods may qualify for an equivalent detector in a future sprint.
- `TypeSafetyEscape` is marked `–` for dynamically typed languages (Ruby, PHP without strict_types, Go) and `partial` for statically typed languages where the check is text-heuristic rather than full type-system analysis.
- `DeadExports` is TS/JS-only because it requires module-graph resolution that is not yet implemented for other languages.
- `BumpyRoad` is TS/JS-only (chunk-based, per-function detection). Tier A porting for Sprint 14 languages is planned for a future sprint.
- Temporal biomarkers (`Hotspot`, `CodeChurn`, `TemporalCoupling`, `DeveloperCongestion`, `KnowledgeLoss`, `MethodTemporalCoupling`) operate on git history, not AST, and are therefore language-agnostic (✓ for all 11 languages).
- `CognitiveComplexity` and `LowDocCoverage` use AST traversal patterns not yet ported to the Tier B (Rust/Go/PHP/Ruby/Swift) analyzers.
