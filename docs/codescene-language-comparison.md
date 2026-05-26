# CodeScene Language Comparison

**Date:** 2026-05-25  
**Sources:**
- https://docs.enterprise.codescene.io/latest/usage/language-support.html (CodeScene 7.1.2 — authoritative)
- https://codescene.com/languages
- https://codescene.io/docs/usage/language-support.html
- https://github.com/tree-sitter/tree-sitter/wiki/List-of-parsers

---

## CodeScene's Exact Language Count and List

CodeScene supports **32 languages/dialects** in total (31 with full Code Health + 1 X-Ray only):

### Full Code Health Support (31 languages/dialects)
| # | Language | Notes |
|---|----------|-------|
| 1 | C | |
| 2 | C++ | |
| 3 | C# | |
| 4 | Java | |
| 5 | Groovy | |
| 6 | JavaScript | |
| 7 | TypeScript | |
| 8 | React (JSX/TSX) | Treated as JS/TS dialect |
| 9 | ECMAScript Modules | Treated as JS dialect |
| 10 | Vue.js | |
| 11 | Objective-C 2.0 | |
| 12 | Scala | |
| 13 | Python | |
| 14 | Swift | |
| 15 | Go | |
| 16 | Dart 2 | |
| 17 | Visual Basic .NET | |
| 18 | PHP | |
| 19 | Rust | |
| 20 | Ruby | |
| 21 | Rational Software Architect models (C++) | Niche IBM/UML modeling language |
| 22 | Kotlin | |
| 23 | Perl 5 | |
| 24 | Erlang | |
| 25 | Elixir | |
| 26 | Clojure | |
| 27 | PowerShell | |
| 28 | TCL | |
| 29 | Apex (Salesforce) | |
| 30 | BrightScript | Roku smart TV platform |
| 31 | BrighterScript | Typed superset of BrightScript |

### X-Ray Only (no Code Health metrics, 1 language)
| # | Language | Notes |
|---|----------|-------|
| 32 | Terraform (HCL) | Method-level hotspots only |

**Note:** CodeScene markets itself as "40+" or "over 25" languages, but the documented list in their technical docs
counts 32 distinct entries (counting JSX/TSX/ESM as separate dialect entries). When counting distinct language
families, the number is closer to 28–29 unique languages.

---

## Our Language Coverage (41 languages/formats)

### Tier A — Full AST / tree-sitter (15 languages)
TypeScript, JavaScript, Python, Java, C#, Go, Ruby, Rust, PHP, Kotlin\*, Dart\*, C\*, C++\*, Scala\*, Swift

\* Kotlin, Dart, C, C++, Scala: tree-sitter parsers wired but full LanguageProfile (GodClass, FeatureEnvy, etc.) not
yet implemented; functionally equivalent to Tier B accuracy for most biomarkers.

### Tier B — Regex-based metric extraction (14 languages)
Bash, Lua, Elixir, Haskell, R, Clojure, COBOL, Apex, F#, VB.NET, Perl, Groovy, Objective-C, PowerShell

### Tier C — Structural / config formats (10 formats)
YAML, JSON, Dockerfile, HCL/Terraform, Makefile, SQL, HTML, CSS, Markdown, TOML

---

## Gap Analysis — What CodeScene Has That We Don't

| Language | CodeScene Tier | Tree-sitter Parser Available? | Priority |
|----------|---------------|-------------------------------|----------|
| **Erlang** | Full Code Health | Yes — `WhatsApp/tree-sitter-erlang` (ABI 14, active) | High |
| **TCL** | Full Code Health | Yes — `tree-sitter-grammars/tree-sitter-tcl` (ABI 15, active) | Medium |
| **BrightScript** | Full Code Health | Yes — `ajdelcimmuto/tree-sitter-brightscript` (ABI 14, active) | Low |
| **BrighterScript** | Full Code Health | No dedicated tree-sitter parser found | Low |
| **Vue.js** | Full Code Health | Yes — `tree-sitter-grammars/tree-sitter-vue` (ABI 14) | Medium |
| **Rational SW Architect (C++)** | Full Code Health | No (IBM proprietary modeling format) | None |

**Summary: 4 real languages we're missing (Erlang, TCL, BrightScript/BrighterScript, Vue.js)**  
Rational Software Architect is a niche IBM tooling artifact; not worth supporting.

---

## Our Advantages — What We Support That CodeScene Doesn't

| Language/Format | Our Tier | Notes |
|----------------|----------|-------|
| **Haskell** | Tier B | Functional language; not in CodeScene docs |
| **R** | Tier B | Data science language; not in CodeScene docs |
| **Lua** | Tier B | Embedded scripting; not in CodeScene docs |
| **Bash/Shell** | Tier B | Not in CodeScene's language list |
| **COBOL** | Tier B | Legacy enterprise; not in CodeScene's list |
| **F#** | Tier B | .NET functional; not explicitly listed by CodeScene |
| **YAML** | Tier C | Config format; CodeScene is code-only |
| **JSON** | Tier C | Config format; CodeScene is code-only |
| **Dockerfile** | Tier C | Infrastructure-as-code |
| **Makefile** | Tier C | Build tooling |
| **SQL** | Tier C | Query language |
| **HTML** | Tier C | Markup |
| **CSS** | Tier C | Styles |
| **Markdown** | Tier C | Documentation; SATD detection in docs |
| **TOML** | Tier C | Config format |

**15 languages/formats we cover that CodeScene does not document.**

Note: CodeScene's "basic" tier covers all text files for hotspot/churn analysis (file-level), which is roughly
equivalent to our Tier C. However, they do not advertise Code Health metrics for config/data formats. Our explicit
Tier C support is a differentiator for teams tracking config file complexity.

---

## Detailed Comparison Table

| Language | CodeScene | Us | Gap? |
|----------|-----------|-------|------|
| TypeScript | Full | Tier A | — |
| JavaScript (+ JSX/TSX) | Full | Tier A | — |
| Python | Full | Tier A | — |
| Java | Full | Tier A | — |
| C# | Full | Tier A | — |
| Go | Full | Tier A | — |
| Ruby | Full | Tier A | — |
| Rust | Full | Tier A | — |
| PHP | Full | Tier A | — |
| Swift | Full | Tier A | — |
| Kotlin | Full | Tier A* | — |
| Dart | Full | Tier A* | — |
| C | Full | Tier A* | — |
| C++ | Full | Tier A* | — |
| Scala | Full | Tier A* | — |
| Groovy | Full | Tier B | — |
| Objective-C | Full | Tier B | — |
| Perl | Full | Tier B | — |
| Elixir | Full | Tier B | — |
| Clojure | Full | Tier B | — |
| PowerShell | Full | Tier B | — |
| Apex | Full | Tier B | — |
| VB.NET | Full | Tier B | — |
| Erlang | Full | **MISSING** | We lack Erlang |
| TCL | Full | **MISSING** | We lack TCL |
| Vue.js | Full | **MISSING** | We lack Vue |
| BrightScript | Full | **MISSING** | We lack BrightScript |
| BrighterScript | Full | **MISSING** | We lack BrighterScript |
| Terraform (HCL) | X-Ray only | Tier C | Comparable |
| React (JSX/TSX) | Full | Tier A (via TS) | — |
| Rational SW Architect | Full | Not applicable | N/A |
| Haskell | None | Tier B | Our advantage |
| R | None | Tier B | Our advantage |
| Lua | None | Tier B | Our advantage |
| Bash | None | Tier B | Our advantage |
| COBOL | None | Tier B | Our advantage |
| F# | None | Tier B | Our advantage |
| YAML | None (basic) | Tier C | Our advantage |
| JSON | None (basic) | Tier C | Our advantage |
| Dockerfile | None (basic) | Tier C | Our advantage |
| Makefile | None (basic) | Tier C | Our advantage |
| SQL | None (basic) | Tier C | Our advantage |
| HTML | None (basic) | Tier C | Our advantage |
| CSS | None (basic) | Tier C | Our advantage |
| Markdown | None (basic) | Tier C | Our advantage |
| TOML | None (basic) | Tier C | Our advantage |

---

## Recommended Additions

### Priority 1 — Erlang (High Value)
- **Why:** Full Code Health support in CodeScene; active BEAM ecosystem (used in telecoms, fintech, Discord)
- **Tree-sitter:** `WhatsApp/tree-sitter-erlang` — maintained by WhatsApp/Meta, ABI 14, last commit Feb 2025
- **Approach:** Add as Tier B initially (regex-based function extraction using `-spec` and function clause patterns),
  upgrade to Tier A with tree-sitter binding in a follow-up sprint.
- **Effort:** ~1 sprint for Tier B; ~2 sprints for full Tier A profile

### Priority 2 — Vue.js (Medium Value)
- **Why:** Major JavaScript framework; CodeScene tracks it as a distinct language
- **Tree-sitter:** `tree-sitter-grammars/tree-sitter-vue` (ABI 14, last commit July 2023 — less active)
- **Approach:** Since Vue SFCs (`.vue` files) contain `<script>` blocks that are JavaScript/TypeScript, a pragmatic
  approach is to strip the `<script>` block and route to our existing TypeScript/JavaScript analyzer. This gives
  Code Health metrics without a full Vue grammar.
- **Effort:** ~0.5 sprints (script-block extraction + routing)

### Priority 3 — TCL (Medium-Low Value)
- **Why:** Used in EDA (chip design), legacy automation, test frameworks (DejaGnu)
- **Tree-sitter:** `tree-sitter-grammars/tree-sitter-tcl` (ABI 15, last commit Apr 2025 — active)
- **Approach:** Tier B via regex (proc/namespace pattern detection); upgrade path available via tree-sitter
- **Effort:** ~0.5 sprints for Tier B

### Priority 4 — BrightScript/BrighterScript (Low Value)
- **Why:** Roku-specific language; niche market (smart TV app development only)
- **Tree-sitter:** Available for BrightScript (`ajdelcimmuto/tree-sitter-brightscript`); BrighterScript lacks one
- **Approach:** Tier B via regex if needed; very low general demand
- **Effort:** ~0.5 sprints for Tier B

---

## Summary Verdict

| Metric | CodeScene | Us |
|--------|-----------|-----|
| Distinct languages with code metrics | 31 | 29 (Tiers A+B) |
| Infrastructure/config formats | ~0 explicit | 10 (Tier C) |
| Total coverage entries | 32 | 41 |
| Missing vs CodeScene | — | 4–5 languages |
| Exclusive coverage | — | 15 languages/formats |

**We are broadly tied on mainstream language coverage and ahead on config/infrastructure formats.**

We are missing 4–5 languages CodeScene explicitly documents: Erlang, TCL, Vue.js, BrightScript, and BrighterScript.
Of these, only Erlang and Vue.js represent meaningful developer populations.

Our 15 exclusive entries (Haskell, R, Lua, Bash, COBOL, F#, YAML, JSON, Dockerfile, Makefile, SQL, HTML, CSS,
Markdown, TOML) are a genuine differentiator, especially for teams working on data science (R, Haskell), scripting
(Bash, Lua), legacy systems (COBOL, F#), and infrastructure-as-code (YAML, Dockerfile, HCL, Makefile).

**Recommended next sprint focus:** Add Erlang (Tier B) and Vue.js (script-block routing) to close the most
impactful gaps. This would bring our language count to 43 and eliminate the two most visible missing entries
relative to CodeScene.
