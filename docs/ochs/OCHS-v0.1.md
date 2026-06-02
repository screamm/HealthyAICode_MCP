<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Healthy AI Code contributors.

Documentation text is additionally licensed under CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/).

You may reproduce, adapt, and build upon this specification for any purpose,
including commercial use, provided you give appropriate credit and indicate
any changes made.
-->

# Open Code Health Score (OCHS) — Specification v0.1

**Date:** 2026-06-01
**Status:** Draft — seeking feedback and conformance implementors
**Canonical URL:** https://github.com/screamm/Healthy-AI-Code-MCP/blob/master/docs/ochs/OCHS-v0.1.md
**Reference implementation:** `@healthy-ai-code/core` (this repository)

---

## Abstract

The Open Code Health Score (OCHS) is a deterministic, auditable 1–10 numeric
health score for a single source-code file. It is computed from a weighted
penalty formula applied to a defined set of 55 *biomarkers* (detected code
smells and structural findings). Every weight, every biomarker definition, and
the scoring formula itself are published in this document under open licenses so
that independent tools can produce a conformant OCHS score.

The score is intentionally *file-local and synchronous*: given the same source
text and the same OCHS version, any conformant implementation must return an
identical score. Reproducibility is a first-class design goal.

---

## 1. Scoring Formula

```
score = max( FLOOR, 10 − Σ_i ( weight_i × sqrt( count_i ) ) )
```

Where:

| Symbol | Value | Meaning |
|--------|-------|---------|
| `FLOOR` | 1.0 | Minimum possible score |
| `weight_i` | per-biomarker constant (Table 2) | Penalty per biomarker type |
| `count_i` | non-negative integer | Number of instances of biomarker i detected in the file |
| `sqrt` | IEEE 754 double-precision square root | Diminishing-return on repeated findings |

The sum runs over all biomarker types that have at least one detection in the
file. Types with zero detections contribute 0 to the sum. The floor ensures
the score never drops below 1.0 regardless of how many findings are present.

### 1.1 Score Thresholds

| Constant | Value | Meaning |
|----------|-------|---------|
| `AI_READY_THRESHOLD` | 9.5 | `loopComplete: true` in the auto-refactor loop |
| `HEALTHY_THRESHOLD` | 9.0 | Green category floor |
| `PROBLEMATIC_THRESHOLD` | 6.0 | Yellow/red boundary; below = red |

Files in the green category (score ≥ 9.0) are considered maintainable.
Files meeting the AI-ready threshold (score ≥ 9.5) are declared safe for
autonomous AI-assisted modification without a human review gate.

### 1.2 Tiered AI Gate

When a file contains at least one `AiAttributedSATD` finding, the
`loopComplete` threshold rises from 9.5 to 9.7. This is the only score
threshold that adjusts dynamically based on file content.

---

## 2. Biomarker Catalogue

This section defines all 55 biomarkers in OCHS v0.1. Each entry states:

- **Weight** — the `weight_i` constant used in the scoring formula.
- **Detection trigger** — what structural property or textual pattern causes the biomarker to fire.
- **Severity range** — the severity values the implementation may attach (`critical`, `high`, `medium`, `low`). Severity is informational and does not affect the score; only the weight and count matter.
- **Origin sprint** — the development sprint in which this biomarker was introduced, for traceability.

### Table 1 — Biomarker Catalogue (55 entries)

Biomarkers are grouped into six categories. Within each category, entries are ordered alphabetically by identifier.

---

#### Category A — Complexity Smells (6 biomarkers)

| # | Identifier | Weight | Detection Trigger | Severity Range | Sprint |
|---|-----------|--------|-------------------|----------------|--------|
| 1 | `BrainMethod` | 1.2 | A method that is simultaneously very long (> threshold lines) AND has high cyclomatic complexity (> threshold CC), combining both LargeMethod and ComplexMethod characteristics into a single function. | high–critical | early |
| 2 | `BumpyRoad` | 0.8 | A function body that contains multiple sequential conditional blocks ("bumps") at the same nesting level, indicating a flat but branchy control flow that is hard to reason about. Chunk ranges are reported to aid targeted extraction. | medium | 17 |
| 3 | `CognitiveComplexity` | 0.8 | Cognitive complexity (Sonar metric) of a function exceeds a configured threshold. Cognitive complexity counts nesting penalties and structural breaks, not just branching paths. | medium–high | early |
| 4 | `ComplexMethod` | 1.5 | Cyclomatic complexity (CC) of a function is **strictly greater than 10** (`CC > 10`). Weight is the **single constant 1.5** for every firing instance — there is no threshold-gated weight tier. CC only modulates the (informational) severity: `high` for `10 < CC ≤ 20`, `critical` for `CC > 20`. See §2.1 for the exact threshold table and §2.2 for the resolution of the earlier weight-tier wording. | high–critical | early |
| 5 | `DeepNesting` | 1.2 | Maximum nesting depth of a function exceeds the configured threshold (typically 4). Measures the deepest level of nested control structures (if/for/while/try). | medium–high | early |
| 6 | `LargeMethod` | 0.6 | A function or method exceeds the configured line-count threshold (typically 40–60 lines of code, excluding blank lines and comments). | low–medium | early |

---

#### Category B — Design Smells (10 biomarkers)

| # | Identifier | Weight | Detection Trigger | Severity Range | Sprint |
|---|-----------|--------|-------------------|----------------|--------|
| 7 | `ComplexConditional` | 0.5 | A boolean expression inside a conditional contains more than the threshold number of logical operators (`&&`, `\|\|`, `!`), indicating a condition too complex to read at a glance. | low–medium | 5 |
| 8 | `DataClumps` | 0.5 | Two or more function signatures share three or more parameters of the same types and names, indicating a missing data abstraction (Fowler). Detected via cross-function parameter-group comparison on Tier A ASTs. | low–medium | 9 |
| 9 | `FeatureEnvy` | 0.7 | A method accesses more data or calls more methods from another class than from its own class, suggesting it belongs in the other class. Detected via call-chain analysis on Tier A ASTs. | medium | 9 |
| 10 | `FragmentedCode` | 0.3 | A file contains an unusually large number of very short functions (< threshold lines each) relative to its total line count, indicating over-fragmentation that harms navigability. Advisory weight; intended to signal anti-gaming of the scoring formula. | low | 56 |
| 11 | `GodClass` | 1.5 | A class exceeds thresholds on multiple dimensions simultaneously: very high number of methods, very high number of fields, and/or very high LCOM4 (lack of cohesion). Represents a class doing too many things. Detected via AST class-node analysis on Tier A. | high–critical | 9 |
| 12 | `LongParameterList` | 0.4 | A function or method has more than the threshold number of parameters (typically > 4). More parameters increase coupling and make call sites harder to read. | low | early |
| 13 | `MessageChain` | 0.5 | A chain of method calls or property accesses exceeds the configured depth (e.g., `a.b().c().d()`), violating the Law of Demeter and creating tight coupling between distant objects. | low–medium | 5 |
| 14 | `PrimitiveObsession` | 0.5 | A function has a high proportion of primitive-typed parameters (int, string, bool, etc.) with no structured types, indicating missing value objects or domain types. | low–medium | 9 |
| 15 | `SplitResidue` | 0.5 | After an Extract Method refactoring, the original function retains a structural pattern (high CC or deep nesting) that is comparable to what was extracted, suggesting the extraction was superficial. Comparable weight to `ComplexConditional`; deliberately below `ComplexMethod` to avoid double-penalising partial extractions. | medium | 56 |
| 16 | `TypeSafetyEscape` | 0.7 | Usage of type-unsafe constructs: `any`, unsafe casts (`as T`), `@ts-ignore`, `@ts-nocheck`, or equivalent escape hatches that bypass the type system (TypeScript / JavaScript specific). | medium | 5 |

---

#### Category C — Maintainability & Documentation (7 biomarkers)

| # | Identifier | Weight | Detection Trigger | Severity Range | Sprint |
|---|-----------|--------|-------------------|----------------|--------|
| 17 | `DocumentationDebt` | 0.5 | Documentation Debt Index (DDI) = normalizedCognitiveComplexity × (1 − docCoverage) exceeds the threshold. High DDI means complex code is also undocumented. Referenced in the Triple Debt Model (arXiv 2603.22106). | medium–high | 23 |
| 18 | `IntentClarity` | 0.4 | Composite Intent Clarity Score below threshold, combining: fraction of documented functions, fraction of typed parameters/returns (TypeScript/Python), and a name-quality index penalising functions with names shorter than 3 characters or generic names (`tmp`, `data`, `x`, etc.). Referenced in Triple Debt Model (arXiv 2603.22106). | low–medium | 23 |
| 19 | `LargeFile` | 0.3 | Total line count of the file exceeds the configured threshold (typically 300–500 lines). A structurally-simple signal that rarely fires alone on healthy code. Applies to all tiers including Tier C (YAML, JSON, Dockerfile, etc.). | low | early |
| 20 | `LowDocCoverage` | 0.3 | Fewer than the threshold fraction of public functions in the file have a documentation comment (JSDoc, docstring, or equivalent). Threshold is language-aware. | low | early |
| 21 | `LowMaintainability` | 0.3 | Maintainability Index (MI) of the file is below 30 (on the 0–100 scale). MI is derived from Halstead Volume, cyclomatic complexity, and line count. Weight reduced from 0.4 to 0.3 in Sprint 47 to remove the derived-smell ceiling: a single MI instance now scores 9.7 instead of 9.6. | low–medium | early |
| 22 | `MagicNumber` | 0.4 | A numeric literal appears in executable code with no named constant or explanation. Excludes common identity values (0, 1, −1, 100) and values in configuration contexts. Language-specific exclusions apply. | low | 5 |
| 23 | `TestProximity` | 0.5 | The file lacks a co-located test file (e.g., no `*.test.ts` or `*_test.py` within the same directory or a parallel `__tests__/` directory). Advisory; does not fire for files that are themselves test files. | low | early |

---

#### Category D — Organisational & Temporal (7 biomarkers)

| # | Identifier | Weight | Detection Trigger | Severity Range | Sprint |
|---|-----------|--------|-------------------|----------------|--------|
| 24 | `ArchitectureDebt` | 0.6 | A file participates in a dependency cycle (SCC size > 1) and/or has a high propagation cost (fraction of the codebase transitively depending on it) combined with high change frequency. Requires project-level import graph analysis. | medium–high | 22 |
| 25 | `CodeChurn` | 0.6 | The file has been modified in a disproportionately high number of commits relative to its size and the repository average, indicating instability. Requires git history access. | medium | 27 |
| 26 | `DeveloperCongestion` | 0.7 | Three or more distinct developers have committed to the file within the last 14-day sprint window, indicating concurrent-change risk. Requires git log. | medium | 23 |
| 27 | `KnowledgeLoss` | 1.0 | More than 40 % of the file's lines (by git blame) were last authored by contributors who have had no commit activity in the past 6 months. Indicates orphaned code. Requires git blame. | high | 23 |
| 28 | `MethodTemporalCoupling` | 0.3 | Two methods within the same file change together in the same commits at a rate exceeding the configured coupling threshold. Advisory weight: only computed and included in the score when `analyzeFileWithHistory()` is called; `analyzeFile()` never emits this type. Empirical basis: D'Ambros 2009, Kirbas 2017, arXiv 2504.18511. | low–medium | 19 |
| 29 | `SATD` | 0.6 | A comment in the file contains a self-admitted technical debt marker: `HACK`, `XXX`, `BUG` (critical), `FIXME`, `BROKEN` (high), `TODO`, `TEMP`, `WORKAROUND`, `KLUDGE` (medium), or `REFACTOR` (low). Weight reflects that LLM-generated code accumulates more SATD than human-written code (arXiv 2601.06266). | low–critical | early |
| 30 | `StyleInconsistency` | 0.3 | The file uses inconsistent naming conventions or formatting patterns (e.g., mixing camelCase and snake_case for similar identifiers). Advisory AI-specific smell. | low | 29 |

---

#### Category E — Security Smells (11 biomarkers)

| # | Identifier | Weight | Detection Trigger | Severity Range | Sprint |
|---|-----------|--------|-------------------|----------------|--------|
| 31 | `CommandInjectionRisk` | 1.5 | A system/shell command is constructed by concatenating or interpolating user-controlled input without sanitisation (CWE-78). Detected via taint-like call-site pattern matching. | high–critical | 28 |
| 32 | `CryptographicMisuseRisk` | 1.0 | Usage of a known-weak cryptographic algorithm (MD5, SHA-1, DES, RC4, ECB mode) in a security context. Weight is conservative until "MD5 as cache key" context filtering is implemented. | medium–high | 58 |
| 33 | `DependencyVulnerability` | 1.0 | A declared dependency matches a known-vulnerable version range in a maintained advisory database. Requires access to the dependency manifest (package.json, requirements.txt, etc.). | medium–critical | 28 |
| 34 | `HardcodedApiKey` | 2.0 | A string literal matching common API key or token patterns (e.g., `sk-`, `ghp_`, `AIza`, `Bearer `) appears in source code outside of a test fixture. | critical | 28 |
| 35 | `HardcodedCredential` | 2.0 | A password, secret, or credential appears to be hardcoded in source code (e.g., assigned to a variable named `password`, `secret`, `token`, or `key` as a non-empty string literal). | critical | 28 |
| 36 | `PathTraversalRisk` | 1.2 | File system path construction uses user-controlled input without normalisation, allowing directory traversal attacks (CWE-22). | high | 28 |
| 37 | `SlopsquattingRisk` | 1.5 | An imported package name is either (a) absent from the lock file, (b) matches the DepScope hallucination corpus, (c) is within edit distance 2 of a popular package name (typosquat), or (d) returns HTTP 404 / was first published fewer than 90 days ago on the registry. Distinct from `HallucinatedPackageImport` (which signals a package that does not exist at all). Weight at parity with `SqlInjectionRisk`: named, actively-exploited 2026 supply-chain threat. ~20 % LLM package-hallucination rate; 43 % reproduced per run (CSA Research Note, Apr 2026). | high–critical | 51–60 |
| 38 | `SqlInjectionRisk` | 1.5 | A SQL query is constructed by string concatenation or interpolation of user-controlled input without parameterisation (CWE-89). | high–critical | 28 |
| 39 | `SsrfRisk` | 1.3 | An outbound HTTP/network request is constructed from user-controlled input without allowlist validation, allowing Server-Side Request Forgery (CWE-918). Weight slightly below injection sinks (1.5) because heuristic regex detection without full taint analysis produces more false positives. | high | 58 |
| 40 | `UnsafeDeserialization` | 1.2 | Deserialisation of untrusted data using an unsafe mechanism: Python `pickle.load`/`yaml.load`, Java `ObjectInputStream`, PHP `unserialize`, Ruby `Marshal.load`, Node.js `vm.runInNewContext`, etc. (CWE-502). | high–critical | 28 |
| 41 | `XssRisk` | 1.5 | User-controlled input is rendered as HTML without escaping, or `innerHTML`/`dangerouslySetInnerHTML` is used with dynamic content (CWE-79). | high–critical | 28 |

---

#### Category F — AI-Native Smells (9 biomarkers)

| # | Identifier | Weight | Detection Trigger | Severity Range | Sprint |
|---|-----------|--------|-------------------|----------------|--------|
| 42 | `AbstractionLeakage` | 0.6 | AI-generated code exposes implementation-specific details at an abstraction boundary (e.g., internal model names, provider-specific error codes, raw JSON structures) that should be hidden behind a domain interface. Advisory AI-specific smell. | medium | 29 |
| 43 | `AiAttributedSATD` | 0.8 | A comment contains both an AI attribution term (`LLM`, `AI`, `GPT`, `ChatGPT`, `Copilot`, `Gemini`, `Claude`) AND a SATD marker (`TODO`, `FIXME`, `HACK`, `XXX`) in the same comment node. If an uncertainty phrase also appears (`no clue`, `not sure`, `unclear why`), severity is elevated. Based on GIST taxonomy (arXiv 2601.07786); inter-annotator agreement κ = 0.896. Triggers the tiered AI gate (loopComplete requires score ≥ 9.7). | low–medium | 57 |
| 44 | `AsyncAntiPattern` | 0.7 | One of four DrAsync anti-patterns is detected (TypeScript/JavaScript only): P1 async function with no `await`, P3 redundant `return await` outside try-block, P7 `.then()` callback returning another `.then()`, P8 `new Promise` constructor missing the `reject` argument. (ICSE 2022) | medium | 58 |
| 45 | `ComplexityMassConcentration` | 1.2 | Structural Erosion Index (SlopCodeBench, arXiv 2603.24755) exceeds 0.60. Erosion = Σ mass(f, CC > 10) / Σ mass(all f), where mass(f) = CC(f) × √length(f) and length(f) is the function's line span (see §2.1f). Fires when there are ≥ 3 functions. Agent-generated code averages erosion 0.68 vs human code 0.34. | high–critical | 57 |
| 46 | `DuplicateCode` | 1.0 | A significant fraction of the file's abstract syntax tree subtrees are structurally identical to subtrees elsewhere in the file (type-2 clone detection via SHA-1 subtree hashing). Reflects the observed rise in clone frequency in AI-assisted codebases (8.3 % → 12.3 % across tracked repositories). | medium–high | 58 |
| 47 | `ExceptionHandlingAntiPattern` | 0.8 | One of four exception-handling anti-patterns is detected across Tier A languages: EmptyCatch (empty or comment-only catch block), CatchGeneric (catching the base exception type without re-throw), DestructiveWrapping (re-throw losing the original stack trace), UnreachableHandler (broad catch placed before a specific catch). | medium | 58 |
| 48 | `HallucinatedPackageImport` | 1.5 | An imported package name does not exist in the offline snapshot of the npm or PyPI registry. Distinct from `SlopsquattingRisk` (which handles packages that exist but are suspicious). Reference: 19.7 % of LLM tool-recommendation sessions recommend non-existent packages (arXiv 2501.19012). Weight at parity with `SqlInjectionRisk` (supply-chain risk). | high–critical | 57 |
| 49 | `HardcodedAssumption` | 0.5 | AI-generated code contains values or constraints that should be configurable but are hardcoded: environment assumptions, model-specific limits, vendor-specific defaults. Advisory AI-specific smell. | low–medium | 29 |
| 50 | `LlmNoStructuredOutput` | 1.0 | An LLM inference call site (SpecDetect4AI NSO) does not specify a structured output schema or response format, relying on free-form text parsing. (arXiv 2512.18020; 86 % precision) | medium | 57 |
| 51 | `LlmNoSystemMessage` | 1.0 | An LLM inference call site (SpecDetect4AI NSM) does not supply a system message or system prompt, omitting safety and behavioural framing. (arXiv 2512.18020; 86 % precision) | medium | 57 |
| 52 | `LlmUnboundedCall` | 1.0 | An LLM inference call site (SpecDetect4AI UMM) is missing `max_tokens`/`max_output_tokens` AND is also missing timeout or max-retry bounds on the SDK constructor or call. (arXiv 2512.18020; 86 % precision) | medium | 57 |
| 53 | `LlmUnpinnedModel` | 1.0 | An LLM inference call site (SpecDetect4AI NMVP) references a model name without a version pin (e.g., `gpt-4` instead of `gpt-4-0613`, or `claude-3` instead of `claude-3-opus-20240229`). (arXiv 2512.18020; 86 % precision) | medium | 57 |
| 54 | `LlmUnsetTemperature` | 0.8 | An LLM inference call site (SpecDetect4AI TNES) does not explicitly set the `temperature` parameter, relying on provider defaults that may change. (arXiv 2512.18020) | low–medium | 57 |
| 55 | `MissingEdgeCase` | 0.5 | AI-generated code appears to lack guard clauses or handling for common boundary conditions (null inputs, empty collections, off-by-one boundaries) based on static heuristics. Advisory AI-specific smell. | low–medium | 29 |

---

> **Biomarker count:** The OCHS v0.1 catalogue contains **55 distinct biomarker types** — the complete set of `SmellType` union members in `packages/core/src/types.ts` and keys in `packages/core/src/scoring/weights.ts`. Earlier planning documents referenced "43 biomarkers"; that count predated the Sprint 56–60 additions (SplitResidue, FragmentedCode, five LlmXxx smells, HallucinatedPackageImport, AiAttributedSATD, ComplexityMassConcentration, SsrfRisk, CryptographicMisuseRisk, ExceptionHandlingAntiPattern, AsyncAntiPattern, DuplicateCode, SlopsquattingRisk).

---

### 2.1 Normative Firing Thresholds — Structural Biomarkers

The prose detection triggers in Table 1 describe *what* each structural biomarker measures. This section publishes the **exact numeric thresholds** required to reproduce the reference implementation's firing decisions, so the structural biomarkers are re-implementable from the spec alone. Every value below is the reference implementation's **default** (uncalibrated) threshold and is the ground truth: a conformant implementation MUST fire each biomarker under exactly these conditions to produce an identical OCHS score.

All comparisons are **strict** unless stated otherwise (e.g. `CC > 10` fires at CC = 11, not CC = 10). Severity is informational (it never affects the score); it is published here only because the reference detector computes it and it aids cross-implementation diffing.

> **Calibration note.** The reference implementation also ships an *opt-in* calibrated-threshold mode (`useCalibratedThresholds: true`, validated for Java only). The values in this section are the **default** thresholds used when calibration is off. OCHS v0.1 conformance is defined against these default thresholds; calibrated mode is an implementation extension and is out of scope for v0.1 reproducibility.

#### Table 1a — Per-function complexity thresholds (all language tiers with function extraction)

These five biomarkers fire per function using the function's cyclomatic complexity (`CC`), maximum nesting depth, line count, parameter count, and cognitive complexity. They apply to every Tier A and Tier B language (any language for which functions are extracted).

| Biomarker | Fires when | Severity tiers | Metric definition |
|-----------|-----------|----------------|-------------------|
| `ComplexMethod` | `CC > 10` | `critical` if `CC > 20`, else `high` | Cyclomatic complexity = 1 + count of decision points (`if`, `for`, `while`, `case`, `catch`, `&&`, `\|\|`, ternary `?`). |
| `DeepNesting` | `nestingDepth > 3` | `critical` if `> 5`, `high` if `> 4`, else `medium` | Maximum depth of nested control structures (`if`/`for`/`while`/`switch`/`try`) within the function body. |
| `LargeMethod` | `length > 50` | `medium` (single tier) | Function length in source lines (start line to end line inclusive). |
| `LongParameterList` | `parameterCount > 4` | `medium` (single tier) | Number of declared parameters (implicit receivers such as `self`/`this` excluded). |
| `CognitiveComplexity` | `cognitiveComplexity > 15` | `critical` if `> 25`, else `high` | SonarSource Cognitive Complexity (S3776): +1 per control-flow break, +`nesting` extra for each nested one, +1 per logical operator in a boolean chain. |

#### Table 1b — File-level structural thresholds

| Biomarker | Fires when | Severity | Metric definition |
|-----------|-----------|----------|-------------------|
| `LargeFile` | `totalLines > 500` | `medium` | Total physical line count of the file. Applies to **all tiers**, including Tier C (YAML/JSON/Dockerfile/…). |
| `LowMaintainability` | `MI < 30` (on a 0–100 scale) | `medium` if `MI < 15`, else `low` | Maintainability Index, normalised to 0–100: `MI = clamp(0,100, round(100 × (171 − 5.2·ln(HV) − 0.23·CC̄ − 16.2·ln(LOC)) / 171))`, where `HV` = Halstead Volume, `CC̄` = mean per-function cyclomatic complexity, `LOC` = total lines. `HV`, `CC̄`, `LOC` are each floored at 1 before the logs. |
| `LowDocCoverage` | file has **≥ 3** documentable exported symbols **and** documented-ratio `< 0.8` | `medium` if ratio `< 0.5`, else `low` | Documented-ratio = (exported symbols with an immediately-preceding doc comment) / (exported symbols). Symbols ≤ 3 lines long and names in {`constructor`, `ngOnInit`, `ngOnDestroy`, `setup`, `teardown`} are excluded from both numerator and denominator. Files with < 3 qualifying exports never fire. |
| `MagicNumber` (Tier A, AST) | a single function contains **≥ 3** magic numeric literals | `medium` | A "magic" literal is a numeric literal that is **not** one of {`0`, `1`, `-1`, `2`, `100`}, **not** inside a `const` declarator, and **not** an enum member value. Counted per-function; the function fires once when its count reaches 3. Test files (`*.test.*` / `*.spec.*`) are skipped entirely. |
| `MagicNumber` (Tier B/C, text) | any qualifying magic literal on a non-skipped line | `low` | Text-based fallback: integers with absolute value ≥ 2 (i.e. excluding `0`/`±1`), excluding `ALL_CAPS = …` / `final`/`const … NAME = …` constant declarations, comment lines, and `import`/`require`/`from`/`using`/`package` lines. Config/data extensions (`.json`, `.yml`, `.yaml`, `.xml`, `.toml`, `.ini`, `.cfg`) are skipped. Each qualifying literal is one finding. |

#### Table 1c — Design-smell thresholds (Tier A `LanguageProfile` languages)

`GodClass`, `FeatureEnvy`, `DataClumps`, and `PrimitiveObsession` require a full `LanguageProfile` and are computed for: TypeScript, JavaScript, Python, Java, C#, Go, Ruby, Rust, PHP, Kotlin, Scala. Other languages do not fire these.

| Biomarker | Fires when | Severity | Metric definitions |
|-----------|-----------|----------|--------------------|
| `GodClass` | **all three** simultaneously: `ATFD > 5` **and** `WMC ≥ 20` **and** `LCOM4 > 1` | `high` | **ATFD** (Access To Foreign Data) = count of distinct *imported* type names whose members the class accesses. **WMC** (Weighted Methods per Class) = Σ over methods of `(decision points in method body) + 1`. **LCOM4** = number of connected components in the method-graph where two methods are connected iff they reference a common field via the language's self/this keyword. |
| `FeatureEnvy` | a method's most-called foreign type has `maxForeignCalls ≥ 3` **and** `maxForeignCalls / totalCalls ≥ 0.6` | `medium` | `totalCalls` = own-type member accesses (via self/this) + all foreign-type member accesses. `maxForeignCalls` = call count to the single most-accessed *imported* type. |
| `DataClumps` | a parameter group of **≥ 3** identically-named parameters recurs across **≥ 2** distinct function signatures | `medium` | Two signatures clump when the intersection of their parameter-name sets has size ≥ 3. Each distinct shared-name set is reported once. Implicit receiver names are excluded. |
| `PrimitiveObsession` | a function has **≥ 3** primitive-typed parameters | `high` if `≥ 5`, else `medium` | A parameter is primitive when its resolved type name is in the language profile's primitive-type set (e.g. `number`/`string`/`boolean` for TS, `int`/`str`/`bool` for Python). Implicit receivers excluded. |

#### Table 1d — Control-flow & readability thresholds (Tier A)

| Biomarker | Fires when | Severity | Metric definition |
|-----------|-----------|----------|------------------|
| `BumpyRoad` | a function body contains **≥ 4** top-level sibling control-flow "chunks" | `high` | A chunk is a direct child of the function body that is one of: `if`/`for`/`for-in`/`while`/`do`/`switch`/`try`/`with`/`foreach`/enhanced-for. Only top-level siblings count — nested control flow is `DeepNesting`'s domain, not `BumpyRoad`'s. |
| `ComplexConditional` | a boolean expression contains **≥ 3** logical operators (`&&` / `\|\|`, language-specific), **or** a ternary whose consequent or alternative is itself a ternary (nested ternary) | `high` (nested ternary), `medium` (boolean chain) | Logical-operator count is the number of `&&`/`\|\|` nodes in a single top-level boolean chain (the outermost expression of the chain is counted; nested chains within it add to the count). |
| `MessageChain` | a call/property chain has **depth ≥ 4** (e.g. `a.b().c().d()`) | `medium` | Chain depth = number of chained member-call links rooted at the outermost call expression. |
| `TypeSafetyEscape` (TS/JS) | use of `any`, or a comment directive `@ts-ignore` / `@ts-nocheck` / `@ts-expect-error` | `critical` (`@ts-nocheck`), `high` (`@ts-ignore`), `medium` (`any`), `low` (`@ts-expect-error`) | Each occurrence of the `any` type node, and each comment line containing a directive, is one finding. |

#### Table 1e — SATD (self-admitted technical debt)

The reference implementation runs an **AST-based** SATD detector for Tier A languages and a **text/regex** detector for Tier B/C. Both emit `SATD` (weight 0.6). Severity differs by tier; severity is informational.

| Detector | Keyword → severity | Notes |
|----------|--------------------|-------|
| AST (Tier A) | `HACK`/`XXX`/`BUG` → critical; `FIXME`/`BROKEN` → high; `TODO`/`TEMP`/`WORKAROUND`/`KLUDGE` → medium; `REFACTOR` → low | Matched on comment nodes; the **first** matching tier wins per comment (one finding per comment node). |
| Text (Tier B/C) | `TODO`/`FIXME`/`HACK`/`XXX`/`BUG`/`KLUDGE` → low | Line-by-line regex on comment markers (`//`, `#`, `--`, `;`, `*`). One finding per matching line. |

> Both detectors count toward the same `SATD` type and weight; only the firing keyword set and severity assignment differ by tier. Conformant Tier A implementations SHOULD use the AST keyword/severity mapping; Tier B/C implementations use the text mapping.

#### Table 1f — Composite / index-based structural biomarkers

These biomarkers fire from a derived index rather than a single metric. The full formula is published so they are reproducible.

| Biomarker | Fires when | Formula |
|-----------|-----------|---------|
| `BrainMethod` | `brain_score ≥ 0.55` **and** at least **3 of the 5** factors exceed `0.5` | `brain_score = 0.30·L + 0.25·C + 0.25·G + 0.10·N + 0.10·X`, where each factor is `clamp(0,1, value / threshold)`: `L = length/100`, `C = CC/25`, `G = cognitive/30`, `N = nestingDepth/6`, `X = centrality/maxCentrality`. Centrality is a within-file proxy = sum of the function's own CC across name-matching definitions; `maxCentrality` is the file maximum (floored at 1). Severity: `critical` if `brain_score ≥ 0.85`, `high` if `≥ 0.70`, else `medium`. |
| `ComplexityMassConcentration` | `erosion > 0.60` **and** the file has **≥ 3** functions | `erosion = Σ mass(f \| CC(f) > 10) / Σ mass(all f)`, where `mass(f) = CC(f) × sqrt(max(1, length(f)))` and `length(f)` is the function's **line span** (`endLine − startLine + 1`, the same `length` metric used by `LargeMethod` in §2.1a and the `L` factor of `BrainMethod`) (SlopCodeBench, arXiv 2603.24755). Severity: `critical` if `erosion > 0.80`, else `high`. |
| `DuplicateCode` | a code block of **≥ 6 lines** occurs in **≥ 2 disjoint** locations in the file and contains executable logic | See §2.3 for the full algorithm. |

#### Table 1g — Index-based maintainability biomarkers (separate analyzers)

`DocumentationDebt` and `IntentClarity` are computed by **dedicated analyzers** (`analyzeDocDebt`, `analyzeIntentClarity`), not by the default per-file `analyzeCode` pipeline. A conformant implementation that exposes these biomarkers MUST use the following definitions; an implementation that does not run these analyzers simply omits the type (this does not change the score of a file that has no other findings).

| Biomarker | Fires when | Formula |
|-----------|-----------|---------|
| `DocumentationDebt` | `DDI > 0` | `DDI = min(1, cognitiveComplexity / 50) × (1 − docCoverage)`, rounded to 4 decimals. Severity: `high` if `DDI ≥ 0.60`, `medium` if `≥ 0.30`, else `low`. |
| `IntentClarity` | `intentClarityScore < 0.65` | `intentClarityScore = 0.40·docRatio + 0.35·typeAnnotationRatio + 0.25·nameQualityScore`. `nameQualityScore` penalises identifiers shorter than 3 characters or in a generic-name blocklist (`data`,`tmp`,`temp`,`result`,`res`,`val`,`item`,`obj`,`foo`,`bar`,`x`,`y`,`n`,`s`,`e`,`err`); loop variables `i`/`j`/`k` are exempt. Severity: `high` if score `< 0.40`, else `medium`. |

### 2.2 Resolution of the `ComplexMethod` Weight-Tier Wording

Earlier drafts of this spec (and some planning notes) described `ComplexMethod` as applying a **threshold-gated weight**: "1.0 at CC 15–24, 1.5 at CC ≥ 25". **That description does not match the reference engine and is hereby corrected.** The authoritative behaviour, taken directly from the detector source (`packages/core/src/smells/detector.ts`) and the scoring formula (`packages/core/src/scoring/scorer.ts`), is:

1. **Single firing threshold:** `ComplexMethod` fires when `CC > 10`. There is no secondary CC-15 or CC-25 gate on *firing*.
2. **Single weight:** the scoring formula uses **one** weight per smell type. `ComplexMethod`'s weight is the constant **1.5** for every instance, regardless of CC. The penalty is `1.5 × sqrt(count)` where `count` is the number of complex methods in the file. A per-instance weight of 1.0 is **not representable** in the formula `score = 10 − Σ(weight × sqrt(count))`, because the weight is a per-*type* constant, not a per-*instance* value — so a "1.0 tier" could never have been applied without changing the formula itself.
3. **CC affects severity only, never the score:** the engine sets the (informational) severity to `critical` when `CC > 20` and `high` otherwise. Per §2 of this spec, severity does not enter the scoring formula.

**Reconciliation of the CC numbers.** The "15 / 25" figures in the old wording originated from the *cognitive*-complexity tiers and from a discarded weight-tiering proposal; they were never the cyclomatic firing thresholds. The reference engine's actual cyclomatic thresholds are `CC > 10` (fire) and `CC > 20` (severity `critical`). The cognitive-complexity biomarker — a **separate** type with weight 0.8 — uses `> 15` (fire) and `> 25` (severity `critical`); those are the real "15 / 25" numbers, and they belong to `CognitiveComplexity`, not `ComplexMethod`. With §2.1 publishing both biomarkers' true thresholds, the spec is now internally consistent and matches the engine.

### 2.3 `DuplicateCode` Detection Algorithm (reproducible from this spec)

`DuplicateCode` is AST/text-derivable and its full algorithm is published here so it can be reimplemented without the reference detector. It detects type-1 (exact) and type-2 (structural) clones within a single file using sliding-window hashing:

1. **Window size:** `minLines = 6`. Files with fewer than `2 × minLines = 12` lines never fire.
2. **Type-1 normalisation** of a window: trim each line, drop blank lines, join with `\n`.
3. **Type-2 normalisation:** apply type-1 normalisation, then replace every identifier token (`/\b[A-Za-z_$][A-Za-z0-9_$]*\b/`) that is **not** a reserved keyword with the placeholder `$ID`. (The reserved-keyword set is the union of TypeScript/JavaScript and Python keywords; an implementation MAY use its own language-appropriate keyword set.)
4. **Window hashing:** for each starting line `i` in `[0, lines.length − minLines]`, hash the normalised `minLines`-line window with **SHA-1** (used as a fast identity hash, not for security). Group window starts by hash; any hash with ≥ 2 starts is a candidate duplicate.
5. **Region merging:** sort the duplicate start-pairs and merge consecutive pairs (where both occurrences advance by exactly one line) into contiguous clone blocks, so a long duplicated block is reported as a single finding rather than many overlapping windows. A clone block's extent is `[startWindow, endWindow + minLines − 1]`.
6. **Disjointness:** reject any group whose two occurrences overlap in line span (a real clone has two **disjoint** occurrences).
7. **Logic-content guard:** reject a clone block unless at least one of its non-comment lines contains executable logic (a control keyword, `=>`, a call `…(…)`, a method call `.name(`, a `return`/`throw`/`raise`/`await`/`yield`, etc.). This suppresses false positives on aligned constant tables, import groups, and struct/field lists.
8. **Type precedence:** run type-1 first; run type-2 only on line ranges not already covered by a type-1 clone.
9. **Severity:** `high` if the cloned block is > 15 lines, else `medium`. Weight is `1.0` regardless.

This is a deterministic, file-local algorithm: identical source text yields identical `DuplicateCode` findings across implementations. Type-3 (near-clone via edit distance) is **not** part of OCHS v0.1.

### 2.4 Scoring Determinism — Rounding Rule

For full cross-implementation reproducibility, the reference engine applies one rounding step that Section 1's formula does not make explicit: after computing `10 − Σ(weight × sqrt(count))`, the raw score is **rounded to one decimal place** (`parseFloat(score.toFixed(1))`, i.e. round-half-up at the first decimal) **before** the floor of 1.0 is applied:

```
score = max( 1.0, round1( 10 − Σ_i ( weight_i × sqrt( count_i ) ) ) )
```

where `round1(x)` rounds `x` to one decimal place using IEEE-754 double arithmetic and the standard `toFixed(1)` half-away-from-zero behaviour. A conformant implementation MUST apply this one-decimal rounding so that, e.g., a single `LowMaintainability` finding (`10 − 0.3 = 9.7`) and a single `ComplexMethod` finding (`10 − 1.5 = 8.5`) match the reference engine exactly.

---

## 3. Biomarker → ISO/IEC 25010 Mapping

ISO/IEC 25010:2023 defines software quality characteristics and sub-characteristics. The table below maps each OCHS biomarker to the most relevant ISO 25010 sub-characteristic. One biomarker may map to multiple sub-characteristics; the primary mapping is listed first.

**ISO/IEC 25010 sub-characteristics referenced:**

| Code | Sub-characteristic | Parent characteristic |
|------|-------------------|----------------------|
| FUNC | Functional completeness | Functional suitability |
| MTB | Modularity | Maintainability |
| REUSE | Reusability | Maintainability |
| ANALYZ | Analysability | Maintainability |
| MODIFY | Modifiability | Maintainability |
| TEST | Testability | Maintainability |
| CONF | Confidentiality | Security |
| INTEG | Integrity | Security |
| NONREP | Non-repudiation | Security |
| AUTH | Authenticity | Security |
| RELI | Fault tolerance | Reliability |
| RECOV | Recoverability | Reliability |
| PERF | Time behaviour | Performance efficiency |
| COMPAT | Interoperability | Compatibility |
| SAFE | Safety | (cross-cutting) |

### Table 2 — Biomarker → ISO/IEC 25010 Mapping

| Identifier | Weight | Primary ISO 25010 | Secondary ISO 25010 |
|-----------|--------|-------------------|---------------------|
| `AbstractionLeakage` | 0.6 | MTB | MODIFY, COMPAT |
| `AiAttributedSATD` | 0.8 | ANALYZ | MODIFY |
| `ArchitectureDebt` | 0.6 | MTB | MODIFY, ANALYZ |
| `AsyncAntiPattern` | 0.7 | RELI | PERF |
| `BrainMethod` | 1.2 | ANALYZ | MODIFY, TEST |
| `BumpyRoad` | 0.8 | ANALYZ | MODIFY |
| `CodeChurn` | 0.6 | MODIFY | TEST |
| `CognitiveComplexity` | 0.8 | ANALYZ | MODIFY |
| `CommandInjectionRisk` | 1.5 | CONF | INTEG, SAFE |
| `ComplexConditional` | 0.5 | ANALYZ | MODIFY |
| `ComplexityMassConcentration` | 1.2 | ANALYZ | MODIFY, TEST |
| `ComplexMethod` | 1.5 | ANALYZ | MODIFY, TEST |
| `CryptographicMisuseRisk` | 1.0 | CONF | INTEG |
| `DataClumps` | 0.5 | MTB | REUSE |
| `DeepNesting` | 1.2 | ANALYZ | MODIFY |
| `DependencyVulnerability` | 1.0 | CONF | INTEG, SAFE |
| `DeveloperCongestion` | 0.7 | MODIFY | ANALYZ |
| `DocumentationDebt` | 0.5 | ANALYZ | MODIFY |
| `DuplicateCode` | 1.0 | MTB | MODIFY, REUSE |
| `ExceptionHandlingAntiPattern` | 0.8 | RELI | ANALYZ |
| `FeatureEnvy` | 0.7 | MTB | MODIFY |
| `FragmentedCode` | 0.3 | ANALYZ | MTB |
| `GodClass` | 1.5 | MTB | MODIFY, TEST |
| `HallucinatedPackageImport` | 1.5 | CONF | INTEG, SAFE |
| `HardcodedApiKey` | 2.0 | CONF | AUTH, NONREP |
| `HardcodedAssumption` | 0.5 | MODIFY | RELI |
| `HardcodedCredential` | 2.0 | CONF | AUTH, INTEG |
| `IntentClarity` | 0.4 | ANALYZ | MODIFY |
| `KnowledgeLoss` | 1.0 | ANALYZ | MODIFY |
| `LargeFile` | 0.3 | ANALYZ | MTB |
| `LargeMethod` | 0.6 | ANALYZ | MODIFY |
| `LlmNoStructuredOutput` | 1.0 | RELI | COMPAT |
| `LlmNoSystemMessage` | 1.0 | CONF | RELI |
| `LlmUnboundedCall` | 1.0 | RELI | PERF |
| `LlmUnpinnedModel` | 1.0 | MODIFY | RELI |
| `LlmUnsetTemperature` | 0.8 | RELI | MODIFY |
| `LongParameterList` | 0.4 | ANALYZ | TEST |
| `LowDocCoverage` | 0.3 | ANALYZ | MODIFY |
| `LowMaintainability` | 0.3 | ANALYZ | MODIFY |
| `MagicNumber` | 0.4 | ANALYZ | MODIFY |
| `MessageChain` | 0.5 | MTB | MODIFY |
| `MethodTemporalCoupling` | 0.3 | TEST | MODIFY |
| `MissingEdgeCase` | 0.5 | TEST | RELI |
| `PathTraversalRisk` | 1.2 | CONF | INTEG, SAFE |
| `PrimitiveObsession` | 0.5 | MTB | MODIFY |
| `SATD` | 0.6 | ANALYZ | MODIFY |
| `SlopsquattingRisk` | 1.5 | CONF | INTEG, SAFE |
| `SplitResidue` | 0.5 | ANALYZ | MODIFY |
| `SqlInjectionRisk` | 1.5 | CONF | INTEG, SAFE |
| `SsrfRisk` | 1.3 | CONF | INTEG, SAFE |
| `StyleInconsistency` | 0.3 | ANALYZ | MODIFY |
| `TestProximity` | 0.5 | TEST | ANALYZ |
| `TypeSafetyEscape` | 0.7 | ANALYZ | MODIFY |
| `UnsafeDeserialization` | 1.2 | CONF | INTEG, SAFE |
| `XssRisk` | 1.5 | CONF | INTEG, SAFE |

---

## 4. Conformance Requirements

A tool claiming OCHS v0.1 conformance MUST:

1. Implement the scoring formula exactly as specified in Section 1 (IEEE 754 double-precision arithmetic, floor 1.0).
2. Implement all 55 biomarker types listed in Section 2 with the weights in Table 2.
3. Produce deterministic output: the same source text and OCHS version string MUST produce the same score across runs and implementations.
4. Report the OCHS version string alongside every emitted score.
5. Not alter the formula or weights without incrementing the version number.

A tool SHOULD:

- Implement all language tiers (A, B, C) as described in the reference implementation documentation.
- Include the ISO 25010 sub-characteristic mapping in structured output.
- Pass the public conformance test fixtures distributed alongside this spec.

A tool MAY:

- Add additional biomarkers beyond the 55 defined here, provided they are clearly labelled as extensions and do not affect the OCHS v0.1 score computation.
- Report subscores (security, complexity, maintainability, duplication) as supplementary information.

---

## 5. Language Coverage

The reference implementation supports three tiers of analysis depth. OCHS v0.1 does not mandate a specific tier for any language; conformant implementations may choose their analysis depth and SHOULD document it.

### Tier A — Full AST (tree-sitter)
TypeScript, JavaScript, Python, Java, C#, Go, Ruby, Rust, PHP, Kotlin, Scala, Elixir, Swift, Vue.js, Haskell, Julia, OCaml — 17 languages.

Full `LanguageProfile` (GodClass, FeatureEnvy, DataClumps, etc.) is implemented for: TypeScript, Python, Java, C#, Go, Ruby, Rust, PHP, Kotlin, Scala.

### Tier B — Regex
Bash, Lua, R, Clojure, Dart, C, C++, COBOL, Apex, F#, VB.NET, Perl, Groovy, Objective-C, PowerShell, Erlang, Zig, Nim, Crystal — 19 languages. Function extraction, cyclomatic complexity, SATD, MagicNumber only.

### Tier C — Structural
YAML, JSON, Dockerfile, HCL/Terraform, Makefile, SQL, HTML, CSS, Markdown, TOML — 10 formats. LOC, LargeFile, SATD only.

---

## Appendix A — Validation Evidence (Honest Statement)

This appendix documents the empirical validation status of the OCHS scoring
system as of 2026-06-01. All numbers are produced by actually running the
reference implementation on the stated datasets; none are synthetic or
extrapolated.

### A.1 Predictive Power — MLCQ Dataset (Java, code-smell detection)

**Dataset:** MLCQ — 358 labeled Java code elements (341 unique files), human
majority-vote labels from 26 professional reviewers (Madeyski & Lewowski,
*EASE 2020*; Zenodo DOI `10.5281/zenodo.3666840`). Positive = `minor|major|critical`,
negative = `none`.

**Metric:** AUROC (area under the ROC curve). Higher = better ranking of smelly
files above clean ones. 0.5 = chance, 1.0 = perfect.

**Our result:** AUROC **0.688** (95 % CI: 0.632–0.741, bootstrap n = 2000).

**Head-to-head comparison via DeLong paired test (two-tailed):**

| Comparison | n (paired) | AUROC ours | AUROC competitor | Δ | p | Bonferroni (α=0.01) |
|-----------|-----------|-----------|-----------------|---|---|---------------------|
| vs lizard (max CCN) | 334 | 0.6811 | 0.6848 | −0.0037 | 0.847 | Tie (not significant) |
| vs PMD 7.10 (quickstart) | 343 | 0.6874 | 0.6210 | +0.0664 | 0.0021 | **Significant** |
| vs SonarQube (code_smells) | 343 | 0.6874 | 0.6455 | +0.0419 | 0.046 | Not after Bonferroni |
| vs SonarQube (sqale_index) | 343 | 0.6874 | 0.6467 | +0.0407 | 0.053 | Not significant |
| vs SonarQube (cognitive_complexity) | 280 | 0.6689 | 0.6312 | +0.0378 | 0.070 | Not significant |

**Honest interpretation:**

- We are **statistically tied with lizard** on MLCQ (Δ = −0.0037, p = 0.85; point
  estimate marginally favours lizard). A single max-cyclomatic-complexity number is a
  very strong MLCQ predictor because MLCQ smells are heavily size/complexity-correlated.
- We are **statistically and practically superior to PMD** (Δ = +0.066, p = 0.0021,
  CI entirely above zero, survives Bonferroni correction).
- SonarQube leads are at or below the uncorrected 0.05 threshold and do not survive
  multiple-comparison correction. We do not claim a verified lead over SonarQube.
- The per-smell-type breakdown shows high precision but low recall: when our detectors
  fire on a labeled element they are usually correct (long-method precision 0.91, micro
  precision 0.85), but we miss most human-flagged elements (micro recall 0.16). Our
  thresholds are tuned for refactoring-loop precision over survey recall.
- `GodClass` and `FeatureEnvy` detectors were recalibrated on 2026-06-01 to fire on
  real files (previously 0 detections on the MLCQ Java corpus). The recalibration did
  not materially change the headline AUROC (0.688 → 0.687 on the paired set).
- **Scope:** Java only. Calibration for the other ~44 supported languages has not been
  validated against an external labelled dataset. We do not claim MLCQ results
  generalise to other languages.

### A.2 Bug Prediction — Defects4J Dataset (Java)

**Dataset:** Defects4J — 96 buggy/fixed Java source pairs from `commons-lang` and
`commons-math` (Just et al., *ISSTA 2014*). Positive = buggy commit, negative = fixed.

**Result:** AUROC **0.495** (95 % CI: 0.386–0.605, bootstrap n = 2000).
Mann-Whitney p = 0.91. Near chance.

**Honest interpretation:**

Defects4J bugs are predominantly small logic changes (off-by-one, null guard,
boundary condition) that do not alter the structural smells OCHS measures
(complexity, nesting, god-class, security patterns). The buggy and fixed versions of
the same class receive nearly identical health scores. The near-chance AUROC is the
expected, correct result: **OCHS measures structural and maintainability health, not
the presence of specific logic defects.** We actively do not claim OCHS is a bug oracle.

### A.3 Robustness

**Result:** 0 crashes / 0 parse errors across 12,583 source files in 13 open-source
repositories covering 10 languages (verified independently by a test harness re-run
on 2026-06-01).

Robustness is a genuine, documented strength. It does not imply superior predictive
accuracy.

### A.4 Auto-Refactoring Loop Effectiveness

**Mechanical loop (rule-based, no LLM):** 1/55 medium-complexity files (score 5–8)
reached the 9.5 threshold (2 % success rate). 84 % of files were not modified at all.
Median score delta = 0. The mechanical loop is safe (0 regressions) but rarely
improves medium-complexity files.

**LLM-driven loop:** Only 5 fixture files tested (Claude model, May 2026). Fix rate
20 % vs 11.8 % mechanical; mean score delta +2.04. Direction is encouraging but the
sample is statistically insufficient. **The LLM-driven loop has not been benchmarked
at statistical scale as of this specification's publication date.** A public benchmark
on ≥ 500 files is planned (see plan document `claudedocs/2026-06-01-path-to-world-best.md`,
Sats 5).

### A.5 Calibration Scope

Empirical calibration (threshold tuning against external labels) has been performed
for **Java only** using the MLCQ and Defects4J datasets. Calibration for Python,
TypeScript, and other languages is planned but not yet validated. We do not claim
that biomarker thresholds are empirically optimised for non-Java languages.

### A.6 Cross-Implementation Reproducibility (clean-room second implementation)

To test whether OCHS is genuinely third-party implementable from this document
alone, an independent, stdlib-only **clean-room Python implementation**
(`ochs-ref-py/ochs_ref.py`) was written *from the published spec only* — the
formula (§1), the normative firing thresholds (§2.1–§2.4), the weight table
(Table 2), and the honest annex (Appendix D). It does not import, read, or port
any code from the reference engine; it implements biomarker detection
independently using Python's own `ast` module plus the text rules the spec
publishes. Its score is computed independently and only afterwards compared to
the reference engine's score on the same fixtures (the engine is invoked purely
as a black box).

**Measurement scope.** Agreement is measured over the **structural subset** —
the 25 biomarkers §2.4 declares "reproducible from this spec alone." The 30
biomarkers Appendix D honestly annexes as *not* reproducible from the prose
(D.1 registry-data-dependent, D.2 git/project-history-dependent, D.3
shared-curated-pattern/SDK-list-dependent) are **excluded** from the
structural-agreement metric and reported separately. Omitting an annexed
biomarker is conformant (§4 / Appendix D): the formula is unchanged.

**Corpus.** 15 Python fixtures (`ochs-ref-py/fixtures/`) spanning healthy,
borderline, and unhealthy code.

**Result (2026-06-02), structural subset:**

| Metric | Before threshold publication | After §2.1–§2.4 publication |
|--------|------------------------------|------------------------------|
| Exact score agreement (\|Δ\| ≤ 0.0001) | 33.3 % (5/15) | **100 % (15/15)** |
| Within-0.5 agreement | 80.0 % (12/15) | **100 % (15/15)** |
| Category agreement (green/yellow/red) | 80.0 % (12/15) | **100 % (15/15)** |
| Mean \|Δ\| | 0.5303 | **0.0000** |

On the structural subset the two implementations now produce **byte-identical
smell vectors and identical OCHS scores on every fixture**. The clean-room
implementation reaches **L2 conformance** (exact score agreement on all
structural fixtures). This confirms that publishing the exact thresholds in
§2.1–§2.4 (and resolving the `ComplexMethod` rule to `CC > 10` in §2.2) made the
structural biomarkers reproducible from the spec alone — the earlier divergence
was caused by under-specified thresholds, not by an intrinsic non-reproducibility.

**Honest scope of the remaining divergence.** The full-score table (all 55
biomarkers) still diverges on 3 of 15 fixtures (12/15 exact). Every one of those
divergences is driven **solely by an annexed biomarker** — `UnsafeDeserialization`,
`CryptographicMisuseRisk`, and `ExceptionHandlingAntiPattern` (all D.3
curated-pattern-list detectors). The clean-room implementation fires zero of
these (it has no access to the reference engine's curated sink/anti-pattern
inventory) and zero structural false positives or misses. This is the expected,
honest result: D.3 biomarkers require a shared pattern/SDK inventory for
byte-identical agreement, which this document does not — and per Appendix D,
cannot — embed. The reproducibility claim is scoped to the structural subset.

Reproduce with:

```bash
node ochs-ref-py/core_reference.mjs > ochs-ref-py/core_reference.json
cd ochs-ref-py && python cross_check.py
```

---

## Appendix B — Weight Rationale

| Biomarker | Weight | Rationale |
|-----------|--------|-----------|
| `HardcodedCredential`, `HardcodedApiKey` | 2.0 | Credential exposure is an immediate, exploitable risk with no false-positive tolerance. Highest weight in the catalogue. |
| `ComplexMethod`, `GodClass`, `SqlInjectionRisk`, `XssRisk`, `CommandInjectionRisk`, `HallucinatedPackageImport`, `SlopsquattingRisk` | 1.5 | Severe structural or security findings; each independently warrants immediate remediation. |
| `SsrfRisk` | 1.3 | High severity but weight reduced slightly below 1.5 because heuristic detection without full taint analysis produces more false positives than SQL/XSS patterns. |
| `BrainMethod`, `DeepNesting`, `UnsafeDeserialization`, `PathTraversalRisk`, `ComplexityMassConcentration` | 1.2 | High structural or security impact; typically require significant refactoring effort. |
| `KnowledgeLoss` | 1.0 | Orphaned code represents a compounding maintenance risk as the team cannot safely change it. Aligned with DependencyVulnerability and DuplicateCode. |
| `DependencyVulnerability`, `DuplicateCode`, `LlmUnboundedCall`, `LlmUnpinnedModel`, `LlmNoSystemMessage`, `LlmNoStructuredOutput`, `CryptographicMisuseRisk` | 1.0 | Significant risk or design failure; weight calibrated against frequency of occurrence and remediation cost. |
| `ExceptionHandlingAntiPattern`, `AsyncAntiPattern`, `AiAttributedSATD` | 0.7–0.8 | Reliability/intent concerns; important but less immediately exploitable than security sinks. |
| `TypeSafetyEscape`, `FeatureEnvy`, `CognitiveComplexity`, `BumpyRoad` | 0.7–0.8 | Structural quality; significant but localised impact. |
| `ArchitectureDebt`, `CodeChurn`, `LargeMethod`, `SATD` | 0.6 | Project-level or medium structural concerns. |
| `DataClumps`, `MessageChain`, `PrimitiveObsession`, `GodClass`-adjacent | 0.5 | Common but addressable design issues. |
| `LongParameterList`, `MagicNumber`, `IntentClarity` | 0.4 | Low-impact, often addressed as part of larger refactorings. |
| `LargeFile`, `LowDocCoverage`, `LowMaintainability`, `StyleInconsistency`, `FragmentedCode` | 0.3 | Advisory signals; low weight to avoid dominating the score. `LowMaintainability` reduced from 0.4 in Sprint 47 to prevent a derived-smell ceiling. |
| `MethodTemporalCoupling` | 0.3 | Advisory; only computed via `analyzeFileWithHistory()`. Literature basis: D'Ambros 2009, Kirbas 2017, arXiv 2504.18511. |

---

## Appendix C — Versioning Policy

- **Patch versions** (v0.1.x): bug fixes, clarifications, no change to weights or formula.
- **Minor versions** (v0.x.0): new biomarkers added; existing weights unchanged; scores can only decrease.
- **Major versions** (v1.0.0, v2.0.0): weight changes, formula changes, or biomarker removals. Scores are not comparable across major versions.

All implementations MUST include the full version string (e.g., `ochs:0.1`) in scored output so downstream consumers know which specification applies.

---

## Appendix D — Biomarkers Not Reproducible From the Prose Spec Alone (Honest Annex)

The structural biomarkers in §2.1–§2.4 are fully reproducible from this document: given the same source text, any implementation that follows those thresholds and formulas produces an identical OCHS score for the file-local, syntax-derived smells. **A number of biomarkers, however, cannot be reproduced from the prose specification alone.** They depend on one of three external inputs that this document does not — and cannot — embed: (a) a **package-registry data snapshot**, (b) **git history / repository context**, or (c) a **fixed pattern/SDK list whose membership is the detector, not a derivable rule**.

This annex states honestly, for each such biomarker, *why* it is not spec-derivable and *what an implementation needs* to reproduce the reference behaviour. An implementation that lacks the required input MUST either obtain an equivalent input or omit the biomarker; it MUST NOT claim spec-derived reproducibility for these types. Omitting a reference-data-dependent biomarker is conformant — it simply means that finding does not contribute to the score (the formula is unchanged).

### D.1 Reference-data-dependent (require a registry snapshot or curated corpus)

| Biomarker | Required input | Why it is not derivable from prose |
|-----------|----------------|------------------------------------|
| `HallucinatedPackageImport` | An offline **npm / PyPI package-name snapshot** (`data/npm-snapshot.json`, `data/pypi-snapshot.json`). | Firing = "imported package name is **absent** from the registry snapshot." The verdict is a membership test against a live-registry-derived dataset of millions of names. Two implementations with **different-dated snapshots will disagree** on borderline (new or recently-removed) packages. The truth set is data, not prose — the spec cannot enumerate "every package that exists." Reproducibility requires shipping or agreeing on a specific snapshot version. |
| `SlopsquattingRisk` | The same registry snapshot **plus** two curated data files: a **prominent-targets** list (`data/slopsquatting/prominent-targets.json`) and an **LLM-hallucination corpus** (`data/slopsquatting/hallucinated-corpus.json`); optionally a project lockfile and an opt-in live-registry fetch. | Firing combines (a) a documented-hallucination-corpus membership test, (b) a high-signal single-edit typosquat distance to a *curated* prominent-package set, and optionally (c) a live registry lookup (404 / first-published < 90 days). The typosquat rule's *algorithm* (single keyboard-slip / homoglyph / adjacent-transposition / non-numeric indel against ≥ 4-char names, with separator/plural variants and a known-distinct allow-list excluded) is fully described in the source and could be re-specified — but its **inputs are curated lists** that two implementations would have to share verbatim to agree. The live-check path is non-deterministic by construction (network state, current date). |
| `DependencyVulnerability` | A maintained **advisory database** (e.g. OSV/GHSA) and the project's dependency manifest. | Firing = "a declared dependency matches a known-vulnerable version range." The truth set is an external, continuously-updated advisory feed; it is neither file-local nor static. Two implementations querying advisory databases of different vintages will disagree. |

### D.2 Git / repository-context-dependent (require history beyond a single file's text)

These biomarkers are by design **not** part of the file-local, synchronous score. In the reference implementation they are emitted only by history-aware or project-level entry points (`analyzeFileWithHistory`, the temporal analyzers, and the architecture-debt analyzer) — `analyzeFile()` / `analyzeCode()` never emit them. They cannot be reproduced from a single file's source text.

| Biomarker | Required input | Why it is not derivable from a single file |
|-----------|----------------|--------------------------------------------|
| `MethodTemporalCoupling` | **git commit history** of the file. | Firing = "two methods in the file change together across commits above a coupling threshold." Requires per-commit method-range diffs. Only included in the score via `analyzeFileWithHistory()` (weight 0.3); `analyzeFile()` never emits it. |
| `CodeChurn` | **git history** (commit frequency vs. file size and repo average). | A temporal-instability signal; undefined for a file with no history. |
| `DeveloperCongestion` | **git log** with author + date (distinct authors in a 14-day window). | Requires authorship/timestamps; not present in source text. |
| `KnowledgeLoss` | **git blame** + contributor activity recency (> 40 % of lines last authored by contributors inactive ≥ 6 months). | Requires blame and a notion of "recent activity"; not file-local. |
| `ArchitectureDebt` | **project-level import graph** (cycle / SCC membership, propagation cost) usually combined with change frequency. | Requires analysing the whole repository's dependency graph, not one file. |
| `TestProximity` | **filesystem / project layout** (presence of a co-located `*.test.*` / `*_test.*` or parallel `__tests__/`). | Requires directory listing beyond the file under analysis; a string passed to `analyzeCode` has no surrounding directory. |

### D.3 Pattern/SDK-list-dependent heuristics (algorithm is published, but the *list* is the detector)

These biomarkers are computed from a single file's text and are deterministic for a fixed pattern set — but the pattern set is an embedded, curated list of library/SDK call shapes and signatures, not a rule derivable from first principles. Two implementations agree **only if they use the same pattern list**. This document publishes their detection *intent* and the canonical pattern families; the exact regex/SDK inventory lives in the reference source and is the normative reference for byte-identical agreement.

| Biomarker(s) | Pattern family the detector encodes |
|--------------|--------------------------------------|
| `SqlInjectionRisk`, `XssRisk`, `CommandInjectionRisk`, `PathTraversalRisk` | Regex call-site patterns for specific sink shapes (e.g. `db/knex/sequelize.query(... + ...)`, `res.send/write(... + ...)`, `innerHTML = <non-literal>`, `spawnSync(..., [\`...${x}\`])`). Heuristic, not full taint analysis. The sink/library inventory is curated. |
| `HardcodedCredential`, `HardcodedApiKey` | A curated secret-keyword list (`password`, `secret`, `token`, `api_key`, …), a set of well-known key-format regexes (AWS `AKIA…`, JWT `eyJ…`, `sk-…`, `Bearer …`), and a Shannon-entropy threshold (`≥ 4.5`, min length 16). The keyword/format inventory is the detector. |
| `UnsafeDeserialization`, `SsrfRisk`, `CryptographicMisuseRisk` | Per-language sink regexes (`pickle.load`, `yaml.load`, `ObjectInputStream`, `unserialize`, `Marshal.load`, `vm.runInNewContext`, `eval(<non-literal>)`; HTTP sinks fed from request context; weak-hash/weak-RNG/short-RSA/hardcoded-IV patterns). Curated per-language pattern sets. |
| `LlmUnboundedCall`, `LlmUnpinnedModel`, `LlmNoSystemMessage`, `LlmNoStructuredOutput`, `LlmUnsetTemperature` | SpecDetect4AI call-site regexes bound to a fixed SDK inventory (OpenAI / Anthropic / LangChain in TS/JS/Python). Firing depends on which SDK call shapes and argument names are in the list. |
| `AsyncAntiPattern`, `ExceptionHandlingAntiPattern` | Fixed catalogues of named anti-patterns (DrAsync P1/P3/P7/P8; EmptyCatch / CatchGeneric / DestructiveWrapping / UnreachableHandler). The anti-pattern catalogue is the detector. |
| `AbstractionLeakage`, `HardcodedAssumption`, `MissingEdgeCase`, `StyleInconsistency` | Advisory AI-specific heuristics driven by curated indicator patterns. Explicitly advisory; low/medium weight. |
| `AiAttributedSATD` | Co-occurrence of an AI-attribution term (`LLM`/`AI`/`GPT`/`ChatGPT`/`Copilot`/`Gemini`/`Claude`) **and** a SATD marker in the same comment. The attribution-term and marker lists are curated. |

### D.4 Summary

- **Reproducible from this spec alone (§2.1–§2.4):** all per-function complexity biomarkers (`ComplexMethod`, `DeepNesting`, `LargeMethod`, `LongParameterList`, `CognitiveComplexity`), file-level structural biomarkers (`LargeFile`, `LowMaintainability`, `LowDocCoverage`, `MagicNumber`), Tier A design smells (`GodClass`, `FeatureEnvy`, `DataClumps`, `PrimitiveObsession`), control-flow/readability smells (`BumpyRoad`, `ComplexConditional`, `MessageChain`, `TypeSafetyEscape`), `SATD` (per the tier-specific keyword tables), and the composite indices `BrainMethod`, `ComplexityMassConcentration`, `DuplicateCode` (full algorithm in §2.3), plus `DocumentationDebt` and `IntentClarity` for implementations that run those analyzers.
- **Require a registry/advisory data snapshot (D.1):** `HallucinatedPackageImport`, `SlopsquattingRisk`, `DependencyVulnerability`.
- **Require git history / project context (D.2):** `MethodTemporalCoupling`, `CodeChurn`, `DeveloperCongestion`, `KnowledgeLoss`, `ArchitectureDebt`, `TestProximity`.
- **Require a shared curated pattern/SDK inventory (D.3):** the security-sink, secret, LLM-integration, async/exception anti-pattern, and advisory AI-specific biomarkers.

For the data- and history-dependent biomarkers (D.1, D.2), the reference detector or an equivalent data snapshot is required; they are **not reproducible from the prose spec alone**. For the pattern-list biomarkers (D.3), the detection *algorithm* is published here, but byte-identical cross-implementation agreement additionally requires the same pattern/SDK inventory (the normative copy of which is the reference source). This annex is the honest scope boundary of OCHS v0.1 reproducibility.

---

## References

- Madeyski & Lewowski, "MLCQ: Industry-Relevant Code Smell Data Set", EASE 2020. Zenodo DOI: 10.5281/zenodo.3666840.
- Just et al., "Defects4J: A Database of Existing Faults to Enable Controlled Testing Studies for Java Programs", ISSTA 2014.
- Palomba et al., arXiv 2504.18511 — method-level temporal coupling and change prediction.
- Kirbas et al., 2017 — method-level coupling empirical study.
- D'Ambros et al., 2009 — change coupling and defect prediction.
- Shen et al., "SpecDetect4AI", arXiv 2512.18020 — LLM-integration smell detection (UMM/NMVP/NSM/NSO/TNES).
- Dong et al., "SlopCodeBench", arXiv 2603.24755 — structural erosion index and ComplexityMassConcentration formula.
- Zhang et al., "GIST", arXiv 2601.07786 — AI-attributed self-admitted technical debt.
- Mastropaolo et al., arXiv 2601.06266 — LLM-generated code and SATD accumulation.
- Borg & Tornhill, arXiv 2601.02200 — AI-readiness and code health.
- Concordia taxonomy, arXiv 2605.02741 — AI-friendliness dimensions and gaps.
- Tambon et al., arXiv 2602.15761 — functional non-equivalence in LLM refactoring (19–35 % rate).
- Tambon et al., arXiv 2511.04824 — agentic refactoring smell-delta analysis.
- Cloud Security Alliance Research Note, April 2026 — slopsquatting and AI supply-chain risk. https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/04/CSA_research_note_slopsquatting-ai-supply-chain_20260419-csa-styled-1.pdf
- Sandoval et al., arXiv 2501.19012 — LLM hallucinated package recommendation rate (19.7 %).
- Triple Debt Model, arXiv 2603.22106 — cognitive debt and intent debt in AI-assisted development.
- OpenSSF Scorecard — https://openssf.org/projects/scorecard/
- ISO/IEC 25010:2023 — Systems and software Quality Requirements and Evaluation (SQuaRE).
- DeLong et al., 1988 — Comparing the areas under two or more correlated receiver operating characteristic curves.
