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
penalty formula applied to a defined set of 43 *biomarkers* (detected code
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

### Table 1 — Biomarker Catalogue (43 entries)

Biomarkers are grouped into six categories. Within each category, entries are ordered alphabetically by identifier.

---

#### Category A — Complexity Smells (6 biomarkers)

| # | Identifier | Weight | Detection Trigger | Severity Range | Sprint |
|---|-----------|--------|-------------------|----------------|--------|
| 1 | `BrainMethod` | 1.2 | A method that is simultaneously very long (> threshold lines) AND has high cyclomatic complexity (> threshold CC), combining both LargeMethod and ComplexMethod characteristics into a single function. | high–critical | early |
| 2 | `BumpyRoad` | 0.8 | A function body that contains multiple sequential conditional blocks ("bumps") at the same nesting level, indicating a flat but branchy control flow that is hard to reason about. Chunk ranges are reported to aid targeted extraction. | medium | 17 |
| 3 | `CognitiveComplexity` | 0.8 | Cognitive complexity (Sonar metric) of a function exceeds a configured threshold. Cognitive complexity counts nesting penalties and structural breaks, not just branching paths. | medium–high | early |
| 4 | `ComplexMethod` | 1.5 | Cyclomatic complexity (CC) of a function exceeds the threshold. Implementation applies a threshold-gated weight: 1.0 at CC 15–24, 1.5 at CC ≥ 25, to reduce penalty for borderline cases. | high–critical | early |
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
| 45 | `ComplexityMassConcentration` | 1.2 | Structural Erosion Index (SlopCodeBench, arXiv 2603.24755) exceeds 0.60. Erosion = Σ mass(f, CC > 10) / Σ mass(all f), where mass(f) = CC(f) × √SLOC(f). Fires when there are ≥ 3 functions. Agent-generated code averages erosion 0.68 vs human code 0.34. | high–critical | 57 |
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

- Add additional biomarkers beyond the 43 defined here, provided they are clearly labelled as extensions and do not affect the OCHS v0.1 score computation.
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
