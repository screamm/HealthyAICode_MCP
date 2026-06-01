# Healthy AI Code MCP — World-Class Research Roadmap

**Datum:** 2026-05-30
**Metod:** 22 agenter (18 parallella web-research-agenter på Sonnet + 4 synthesis-agenter på Opus). **242 webbsökningar**, 18 research-dimensioner, **186 evidensbaserade fynd** (146 nya / 37 delvis / 3 redan kända för projektet), 102 high-impact.
**Rådata:** `appendix-findings.json` (alla 186 fynd m. käll-URL) och `appendix-sources.json` (alla källor).

---

## Sammanfattning (exec summary)

### Den obekväma sanningen om "9.6 på allt"
Det starkaste enskilda kalibrerings-fyndet motsäger delvis målet. Publicerade trösklar lägger AI-säkerhetsklippan **lägre** än 9.6:
- CodeScene "Code Red"-studien (r=−0.58 mot issue-resolution-tid, 30 737 filer): grön tröskel = **8.0**.
- CodeScenes agentic-benchmark 2026: AI-tillförlitlighetsklippan = **9.4**.
- arXiv 2601.02200 (jan 2026, 5 000 Python-filer): code health slår perplexity som prediktor för säker AI-refaktorering, men vinsten planar ut i toppen.

→ **9.6 ligger *ovanför* båda publicerade klipporna.** De sista 0.1–0.2 poängen köper lite defektprevention men kostar många iterationer — och riskerar att jaga scoren in i mikro-metod-splittring (CC≈10 är LLM-sweetspot, inte CC=1). **Rekommendation:** validera mot ett märkt holdout (50–100 filer, 8.0–10.0) *innan* 9.6 låses som mål. Om brytfrekvensen är platt mellan 9.4 och 9.6 → sikta 9.4–9.5 och sluta. Detta kan radera hela iterationer.

### Konkurrensläget (måste tas på allvar)
"Bäst i världen" är **inte** greenfield: **CodeScene har redan släppt en konceptuellt identisk CodeHealth-MCP** — 1–10-score, 9.5 AI-ready-tröskel, self-correcting loop, `code_health_review`/`pre_commit`-verktyg, 25+ biomarkörer, ~30 språk, €8/mån. Plus **Roam** (Apache-2.0) som redan exporterar SARIF 2.1.0 från en MCP. Vår vinnbara terräng: **öppen/transparent scoring + språk-/transformbredd + en kalibrerings-dataflywheel som en stängd leverantör inte kan matcha i OSS-skala.**

### De fem dragen som återkommer i alla fyra teman (gör dessa först)
1. **`outputSchema` på `code_health_review` + `code_health_auto_refactor`** (låg insats) — grundbulten som låser upp diff-svar, TOON, strukturell re-review och 24h schema-cache. Allt token-arbete hänger på denna.
2. **Deferred tool loading (Tool Search Tool)** — ~85 % av verktygsschema-overhead bort per request för en 27-verktygs-server (Anthropic: 55K→8.7K tokens på 58 verktyg).
3. **Python (`rope`) + Go (`gopls codeaction`) + early-return-regler via `ast-grep` för alla Tier A** — höjer den mekaniska fix-raten från 11.8 % och tar deterministiska transformrar från 3→5+ språk. Projektets mest citerade svaghet.
4. **RCI-självkritik i `followUpInstruction` + Pre-Act helfils-plan + batcha alla instanser av tyngsta smell per pass** — ren prompt-design; RCI lyfte Python extract-method från ~40–50 %→83 % pass-rate; Pre-Act 32 %→82 % goal completion. Färre iterationer per fil.
5. **LLM-integration-smells (UMM/NMVP/NSM/NSO/TNES) + HallucinatedPackageImport (slopsquatting) + explicit `intentDebt`-fält** — AI-native biomarkörer som **ingen konkurrent** scorar (60.5 % av LLM-integrerade repos drabbade, 86 % precision). Landar "bäst för AI-genererad kod"-positioneringen.

### Korrigeringar att göra direkt (låg insats, hög säkerhet)
- **CLAUDE.md refererar stale `budget_tokens`-stil tänk-kontroll** → ger **400-fel** på Opus 4.7/4.8 (bara `thinking:{type:'adaptive'}`+`effort` accepteras). Hård bugg för klienter som följer doc:en.
- **Fine-grained tool streaming kräver inte längre header** (GA på Sonnet 4.6+) — ta bort header-referensen.
- **`max` effort är övermappad** (score<5) — reservera för genuint ny kod; `xhigh` är praktiska taket, `max` kan ge overthinking på strukturerade uppgifter.
- **Sätt explicit `ttl:'1h'`** på cache_control (default föll till 5 min 2026) och håll föränderlig per-turn-data (effort-hint) **efter** sista cache-brytpunkten.

### Sekvens (beroenden)
`outputSchema` → (diff-svar, TOON, strukturell re-review) ‖ Deferred tool loading ‖ transformrar (rope/gopls/ast-grep) → prompt-fixar (RCI/Pre-Act/batch) → tröskel-validering (holdout+ECE) → AI-native biomarkörer → SARIF/registry-distribution → kalibrerings-flywheel (kräver adoption först).

---

## Product improvements & new biomarkers

The current engine (`analyzeCode`/`analyzeFile`/`analyzeFileWithHistory`, dispatch via `analyzeByLanguage()` in `packages/core/src/analyzers/index.ts`, scoring `score = 10 - Σ(weight × √count)` with weights in `packages/core/src/scoring/weights.ts`) is a sound base. The 28-biomarker set is strong on classic structural/security smells but has clear gaps in three areas the 2025–2026 research consistently flags: AI-specific smells, exception/security sinks, and complexity *distribution* (not just totals). Most of the highest-ROI additions below are pure tree-sitter AST or regex passes that plug into existing Tier A infrastructure with no new parser dependencies — the cost is writing a detector + a weight entry + fixtures, not new plumbing.

A recurring caveat: nearly every "add a smell" item must also be reflected in `weights.ts` and validated against fixtures in `packages/core/tests/fixtures/{healthy,unhealthy}/`, and several interact with the √count damper in ways noted inline.

---

### A. New / strengthened biomarkers (highest ROI first)

#### 1. LLM-integration smells (UMM, NMVP, NSM, NSO, TNES) — impact: high, effort: med
The five SpecDetect4AI smells — missing `max_tokens`/timeout/retries, unpinned model aliases, no system message, no `response_format`, unset temperature — affect 60.5% of LLM-integrated open-source systems at ~86% precision and are detected by *no* competitor including SonarQube ([arxiv.org/html/2512.18020](https://arxiv.org/html/2512.18020)). These are call-site AST matches on the OpenAI/Anthropic/LangChain SDKs in the existing Python/TS/JS Tier A grammars. Genuinely new. Implement as a new analyzer module (e.g. `analyzers/llm-integration.ts`), weights ~1.0–1.2 each. This is the single most differentiating addition available and aligns directly with the project's AI-native positioning.

#### 2. HallucinatedPackageImport / slopsquatting — impact: high, effort: med
LLMs reference non-existent packages at 5.2% (commercial) to 21.7% (open-source) rates, an active supply-chain attack vector ([arxiv.org/html/2501.19012v1](https://arxiv.org/html/2501.19012v1)). Implementation: extract `import`/`require`/`use` nodes (already available from Tier A AST), cross-check against a periodically-cached PyPI Simple index / npm registry snapshot — an O(n) check, no runtime. Trivially extensible to `Cargo.toml`, `go.mod`, `Gemfile`, `pyproject.toml`. Weight ≥1.5 (parity with `SqlInjectionRisk`) given security impact. New. Note: the cache snapshot is the only operational wrinkle (offline/air-gap users need a bundled or skippable snapshot).

#### 3. InsecureDeserializationRisk, SsrfRisk, PathTraversalRisk — impact: high, effort: low–med
Three OWASP-Top-10:2025 gaps ([owasp.org/Top10/2025](https://owasp.org/Top10/2025)), all CWE-mapped, all detectable as call-site patterns without inter-procedural taint analysis:
- **InsecureDeserialization (CWE-502, 1.82× over-represented in AI code):** `pickle.load`, `yaml.load` w/o `SafeLoader` (Py), `ObjectInputStream.readObject` (Java), `unserialize` (PHP), `Marshal.load` (Ruby), `vm.runInNewContext` (JS). Lowest effort of the three — pure name matching ([sonarsource.com/solutions/taint-analysis](https://www.sonarsource.com/solutions/taint-analysis/)).
- **PathTraversal (CWE-22):** user input → `open`/`fs.readFile`/`new File`/`os.Open` ([arxiv.org/abs/2505.20186](https://arxiv.org/abs/2505.20186)).
- **SSRF:** `http.get`/`requests.get`/`fetch` with URL built from request params.

Suggested weights 1.2–1.5. These extend the existing `security/` module pattern. New.

#### 4. CryptographicMisuseRisk — impact: high, effort: med
Single biomarker closing CWE-326/327/338: weak algos (MD5/SHA-1/DES/RC4/3DES used for security), insufficient key length (RSA<2048), insecure randomness (`Math.random`/`random.random` for tokens), hardcoded IV/nonce. All AST call-site detections ([arxiv.org/abs/2409.06561](https://arxiv.org/abs/2409.06561)). New. One caveat: distinguishing "MD5 for security" from "MD5 for a cache key" needs a heuristic (variable-name/context) or it will false-positive — gate weight modestly (~1.0) until context filtering lands.

#### 5. Test-context reachability filter for security smells — impact: high, effort: med
Not a new smell — a *score-accuracy* fix. Currently every security smell counts equally regardless of whether it sits in a test harness. Apply a 0.3–0.5× weight multiplier when the enclosing file matches `/test/`, `/spec/`, `/__tests__/`, `*.test.*`, `*_test.go`, or when the dangerous sink receives only string literals. Industry reports 90–95% noise reduction from reachability ([konvu.com/solutions/reachability-analysis](https://konvu.com/solutions/reachability-analysis)). This directly helps files reach ≥9.5 that currently fail on legitimate test patterns. Implement as a weight modifier in the scoring path, keyed off file path + literal-argument check. New.

#### 6. Exception-handling anti-patterns — impact: high, effort: med
EmptyOrGenericCatch, UnhandledException, DestructiveWrapping — prevalent in 20–40% of catch blocks, correlated with *reliability* defects not just maintainability ([arxiv.org/abs/1704.00778](https://arxiv.org/abs/1704.00778)). Detectable as a new analyzer across all Tier A languages: empty catch bodies, `catch(Exception e)`, unreachable handlers after broader catches. Weight ~0.8. The project may already partially catch some via `DeadCode`; verify overlap before adding. New as a group.

#### 7. Async/Promise anti-patterns (TS/JS only) — impact: high, effort: med
UnnecessaryAsync (async w/ no await), RedundantAwait, MissingPromiseReturn, sequential-await-on-independent-ops — 2,600+ instances across 20 popular repos ([franktip.org/pubs/icse2022-drasync.pdf](https://www.franktip.org/pubs/icse2022-drasync.pdf)). Detectable in the existing TS/JS tree-sitter grammar. Weight ~0.8. Differentiates from SonarQube's partial coverage. New.

#### 8. DuplicateCode (Type 1–3 clones) — impact: high, effort: med
AI assistance drove clone rates 8.3%→12.3% (2021–2024) ([gitclear.com/ai_assistant_code_quality_2025_research](https://www.gitclear.com/ai_assistant_code_quality_2025_research)). Implementation: AST-subtree hashing within a file first, then cross-file within a repo scan, configurable threshold (e.g. ≥6 identical lines). Weight ~1.0. Note the CLAUDE.md doesn't list a dedicated clone biomarker; if one exists it's likely structural-only — confirm before building. Incentivizes the loop to consolidate rather than duplicate, which the √count formula otherwise tolerates.

#### 9. IdentifierNamingSmell sub-patterns — impact: high (LLM-sensitivity), effort: low
`NamingClarity` already exists, but research shows naming is the single most impactful readability signal for LLMs (3.1–78.9% score swings) and current static tools miss it ([arxiv.org/abs/2507.05289](https://arxiv.org/abs/2507.05289)). Strengthen the existing biomarker with concrete sub-patterns: single-letter vars outside loop induction, abbreviation ratio >40%, doppelganger names differing by one char, sub-3-char public-API params. Pure regex on captured identifier nodes — no grammar changes, works Tier A+B. Low effort, partially-already-done.

#### 10. AiAttributedSATD (GIST) — impact: high, effort: low
Extend the existing SATD pipeline with a second regex pass: `(LLM|AI|GPT|ChatGPT|Copilot|Gemini|Claude)` + `(generated|suggested|written)` near `(TODO|FIXME|HACK|XXX)`, optionally + uncertainty phrases ("no clue", "not sure"). 1.47% hit rate on AI comments → few false positives; κ=0.896 reliability ([arxiv.org/html/2601.07786v1](https://arxiv.org/html/2601.07786v1)). Weight ~0.8, separate from generic SATD. Reuses existing comment-node extraction — very low effort. Partially-new (SATD exists; AI-attribution overlay is the new part).

#### 11. ComplexityMassConcentration (Structural Erosion Index) — impact: high, effort: med
`erosion = Σ(mass in high-CC functions) / Σ(all mass)` where `mass(f) = CC(f) × √SLOC(f)`, high-CC = CC>10; fire when erosion >0.60. Validated specifically against agentic degradation: agent code 0.68 vs human 0.31 ([arxiv.org/html/2603.24755v1](https://arxiv.org/html/2603.24755v1)). Distinct from `ComplexMethod`/`BrainMethod` because it measures *concentration*, not totals — catches the snowball pattern the loop is meant to prevent. Computable from existing per-function CC + SLOC data. New, well-validated.

#### 12. Bumpy Road — impact: med, effort: med
Counts discrete nested-conditional chunks (≥3 chunks, mean depth ≥2) rather than total CC, grounded in working-memory limits ([codescene.com/blog/bumpy-road-code-complexity-in-context](https://codescene.com/blog/bumpy-road-code-complexity-in-context/)). Complements `DeepNesting` (depth) and `ComplexMethod` (total). Tree-sitter-implementable by counting top-level conditional blocks within a function body that themselves contain nested conditionals. New.

#### 13. Lower-priority candidates (med/low impact)
- **Temporal Field** (class var used by only a subset of methods) — AI-elevated smell, cross-method reference analysis ([arxiv.org/html/2605.02741](https://arxiv.org/html/2605.02741)). New, med effort.
- **CommentDebt** (CC>10 + zero comments) — orthogonal to SATD; weight ~0.5 ([onlinelibrary.wiley.com/doi/abs/10.1002/smr.70048](https://onlinelibrary.wiley.com/doi/abs/10.1002/smr.70048)). Low effort. Caveat: the loop is known to strip comments ([arxiv.org/abs/2602.21833](https://arxiv.org/abs/2602.21833)), so this and the loop fight each other — sequence carefully.
- **ModelDependencyDebt** (hardcoded model strings in non-config files) — overlaps NMVP from item 1 ([arxiv.org/html/2601.06266v1](https://arxiv.org/html/2601.06266v1)). Low.
- **LM-CC (LlmRefactorability)** — entropy-based LLM-perceived complexity, r=−0.93 with LLM repair success ([arxiv.org/abs/2602.07882](https://arxiv.org/abs/2602.07882)). High impact but high effort (requires a local model for token entropy) — defer unless a lightweight approximation proves viable.

---

### B. Deeper / broader analysis

- **Churn-weighted smell penalties — impact: high, effort: med.** Combined evolutionary+structural metrics beat structural-only for defect prediction ([sciencedirect.com/science/article/abs/pii/S2590118425000590](https://www.sciencedirect.com/science/article/abs/pii/S2590118425000590)). The project already computes hotspots/churn; apply a 1.2–1.5× multiplier to smell penalties in high-churn files. No new biomarker — a scoring-formula modification keyed off existing temporal analytics. **Prerequisite:** add bot-commit filtering first — 74% of hotspot edits are bot-generated ([arxiv.org/html/2602.13170v1](https://arxiv.org/html/2602.13170v1)); without filtering (committer matches `[bot]`, `dependabot`, `renovate`, `noreply`) churn weighting amplifies noise. The bot filter is low-effort and improves all existing churn metrics regardless.

- **Per-dimension subscores — impact: med, effort: low.** Surface Security/Complexity/Maintainability/Duplication subscores alongside the aggregate 1–10, à la DeepSource ([deepsource.com/resources/ai-code-review-tools](https://deepsource.com/resources/ai-code-review-tools)). No formula change — just expose the component weight sums in the tool response. Helps the loop target the dominant dimension.

- **Cross-file function-level coupling — impact: high, effort: high.** Current `MethodTemporalCoupling` is within-file; cross-file function co-change requires a commit-indexed function-range map across all files (CodeScene thresholds: ≥10 commits, ≥10 co-changes, ≥50% strength). A new `code_health_cross_file_coupling` tool. High value, high cost — later phase.

- **SonarQube 2025.1 nested-function CC alignment — impact: med, effort: low.** SonarQube no longer aggregates nested arrow/callback complexity into the parent ([docs.sonarsource.com release notes](https://docs.sonarsource.com/sonarqube-server/2025.1/server-update-and-maintenance/release-notes-and-notices/release-upgrade-notes)). Audit the TS/JS `ComplexMethod` implementation; if it still aggregates, it over-penalizes idiomatic callback-heavy JS and may trigger unnecessary loop iterations. Correctness fix.

---

### C. Automated-transformer expansion beyond TS/JS/PHP

The 11.8% mechanical-fix rate is the most-cited limitation. A critical architectural constraint to respect: tree-sitter has no AST-mutation/write-back API — all transforms operate on source text then re-parse ([tree-sitter discussion #1108](https://github.com/tree-sitter/tree-sitter/discussions/1108)). This validates the existing string-in/string-out design and means each language needs a tool that understands source-text implications.

Concrete engines, ranked by ROI:

1. **Python extract-method via `rope` — impact: high, effort: med.** `ExtractMethod`/`ExtractVariable` with offset-based API (`project`, `resource`, `start_offset`, `end_offset`), fully headless, an MCP wrapper already exists ([rope.readthedocs.io/en/latest/library.html](https://rope.readthedocs.io/en/latest/library.html)). The health scorer (ComplexMethod/BrainMethod) names the target function; the LLM proposes the byte range; rope executes. Highest-ROI single addition — Python is the largest untransformed Tier A language.

2. **Go extract-function via `gopls` CLI — impact: high, effort: med.** `gopls codeaction -exec -kind refactor.extract.function -diff file.go:#start-#end` is non-interactive, outputs a unified diff, no GUI ([go.dev/gopls/features/transformation](https://go.dev/gopls/features/transformation)). Subprocess call from a new transformer. With rope, raises mechanical coverage from 3→5 languages covering the two most-requested gaps.

3. **Guard-clause/early-return via `ast-grep` or GritQL for all Tier A — impact: high, effort: low.** A library of ~10 YAML rules converting `if(cond){body}` → `if(!cond) return; body` is the *same structural pattern* across Python/Go/Ruby/Rust/Java/Kotlin/Elixir/Swift/Scala ([ast-grep.github.io](https://ast-grep.github.io/guide/rewrite-code.html), [docs.grit.io](https://docs.grit.io/)). Directly attacks `DeepNesting` (1.2) and `BrainMethod` (1.2) mechanically. Note the documented ast-grep constraint: one node per rule, so extract-method needs a two-pass workaround — but early-return is single-node and works cleanly. Low authoring cost, broad coverage.

4. **`semgrep --autofix` as a pre-pass — impact: high, effort: med.** Handles early-return, magic-number extraction, SATD removal across 30+ languages ([semgrep.dev/docs/writing-rules/autofix](https://semgrep.dev/docs/writing-rules/autofix)). Run before invoking the LLM to clear cheap smells, leaving fewer high-weight issues — fewer loop iterations.

5. **PolyglotPiranha for cascading cleanup — impact: med, effort: med.** Uber's tree-sitter rule engine with *chained* rules (Java/Kotlin/Swift/Go/Python/Scala/TS), proven on 1,611 PRs ([dl.acm.org/doi/10.1145/3656429](https://dl.acm.org/doi/10.1145/3656429)). Post-refactor cleanup step addressing the "fix one smell, reveal two" stall near 9.0 (unused imports after extraction, etc.).

6. **Rust extract-function (REM2.0) — impact: high, effort: high.** Borrow-checker-aware, but VSCode-coupled with no standalone CLI; needs a thin LSP client to the rust-analyzer daemon ([arxiv.org/abs/2601.19207](https://arxiv.org/abs/2601.19207)). Defer.

**Cross-cutting instruction improvement (impact: high, effort: low):** add RCI (Recursive Criticism and Improvement) self-verification to the `followUpInstruction` field — after proposing an extraction, prompt the model to verify free variables are passed as params, returns propagate, call site compiles. Raises Python extract-method test-pass from ~40–50% to ~83% ([arxiv.org/abs/2510.26480](https://arxiv.org/abs/2510.26480)). Pure prompt change, no dependency.

**Verification oracle (impact: high, effort: med):** there is currently no automated check that the TS/JS/PHP transformers produce behavior-preserving output. Adopt RefactoringMiner 3.0 (F1=99.7%) as a before/after oracle in the test suite to confirm the correct refactoring type and no unintended changes ([RefactoringMiner accuracy](https://github.com/tsantalis/RefactoringMiner/blob/master/documentation/accuracy.md)). Java-only today but the right gate for the transformer benchmark.

---

### D. Behavioral / AI-specific / security summary

Beyond the smells above: a **tiered AI-code gate** is worth surfacing as a HealthResult field — when `AiAttributedSATD > 0`, require 9.7 (or block `loopComplete` until it's zero), mirroring SonarQube's "AI code held to a higher bar" precedent ([docs.sonarsource.com AI autodetect](https://docs.sonarsource.com/sonarqube-server/2025.2/ai-capabilities/autodetect-ai-code)). Low effort, distinct positioning.

**Honest scoping notes:**
- Several findings overlap (NMVP ⊃ ModelDependencyDebt; HallucinatedPackageImport relates to NMVP's versioning). Build the SpecDetect4AI group (item 1) and slopsquatting (item 2) once, don't duplicate.
- ML-pipeline smells (22-smell SpecDetect4AI catalog, [arxiv.org/html/2509.20491v1](https://arxiv.org/html/2509.20491v1)) are high-value for Python ML codebases but framework-specific and higher-effort — a later wave, not a first cut.
- LLM-based smell detection (GPT-4: P=0.79/R=0.41) is *not* reliable enough to replace deterministic detection ([arxiv.org/abs/2504.16027](https://arxiv.org/abs/2504.16027)); keep all of the above rule-based.
- Co-occurrence weight bonuses (GodClass+BrainMethod → 1.2×) and SATT architectural-role-aware weights are defensible scoring refinements ([ietresearch...sfw2/5579438](https://ietresearch.onlinelibrary.wiley.com/doi/full/10.1049/sfw2/5579438), [ieeexplore.ieee.org/document/7781795](https://ieeexplore.ieee.org/document/7781795/)) but should wait until threshold calibration is empirically grounded, since they compound calibration error.

---

### Top 5 bets for this theme

1. **LLM-integration smell group (UMM/NMVP/NSM/NSO/TNES)** — high impact, med effort, zero competitor coverage, directly on-mission. New `analyzers/llm-integration.ts` + weights ~1.0–1.2.
2. **Python extract-method via `rope` + Go via `gopls` CLI** — attacks the 11.8% mechanical-fix ceiling head-on; raises automated-transformer coverage from 3→5 languages, the two most-requested.
3. **Security sink trio (InsecureDeserialization + SSRF + PathTraversal) + test-context reachability filter** — closes OWASP 2025 gaps with low-effort call-site matching, while the reachability filter improves score accuracy and ≥9.5 reachability on mixed codebases.
4. **ComplexityMassConcentration (Structural Erosion Index)** — the best-validated biomarker specifically tuned to the agentic degradation the loop exists to fix; computable from existing CC/SLOC data.
5. **AiAttributedSATD (GIST) + tiered AI-code gate** — very low effort (regex on existing comment nodes), differentiated positioning, and a concrete way to make "AI-ready" mean more than a structural score.

---

## Token-usage reduction playbook

This section consolidates every token-reduction lever relevant to driving the refactoring loop (`runRefactoringLoop` in `packages/core/src/refactor/refactoring-loop.ts`, the `code_health_review` → `code_health_auto_refactor` → apply → re-review cycle). Items are split into **API-side** (no MCP code change; configured in the client calling Anthropic's API) and **MCP-side** (changes to tool definitions and response shapes in `packages/mcp-server/`). Effort and expected savings are noted per item, with sources. The project's `CLAUDE.md` already documents a meaningful subset — those are flagged so effort goes to the genuinely new levers.

### Already documented in CLAUDE.md (verify, don't re-discover)
The API Usage Tips section already covers: token-efficient-tools beta, structured-outputs beta, task-budgets beta, prompt caching (with the 4 096-token Opus floor and 1h TTL note), programmatic tool calling, parallel tool calls, fine-grained streaming (`eager_input_streaming`), and adaptive thinking effort mapping. The work here is mostly **correctness/freshness audits** of that doc plus a set of **new MCP-side levers** the project does not yet implement.

One stale item to fix first: CLAUDE.md still references `budget_tokens`-style thinking control. On Opus 4.7/4.8 manual `budget_tokens` is **rejected with a 400 error** — only `thinking: {type: 'adaptive'}` + `effort` is accepted ([adaptive-thinking docs](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking)). This is a hard bug for any client following the current doc against `claude-opus-4-8`. **Effort: low.**

---

### Tier 1 — Highest impact

**1. Tool Search Tool / deferred tool loading — ~85% cut on tool-definition overhead. Effort: med (MCP-side enabler) + low (client header).**
The server exposes 27 tools, but a single loop iteration uses only `code_health_review`, `code_health_auto_refactor`, and an apply tool. Static loading transmits all 27 schemas on every request. Anthropic measured 58 tools ≈ 55K tokens dropping to ≈ 8.7K with the Tool Search Tool (`advanced-tool-use-2025-11-20`), and tool-selection accuracy on Opus 4.5 rising 79.5%→88.1% ([advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)). Mark the ~22 non-loop tools (`auditSecurity`, `analyzeBusFactor`, `analyzeArchitectureDebt`, etc.) `defer_loading: true`. The Speakeasy dynamic-toolset variant reports 90–96% input-token reduction with 100% maintained success rate at the cost of ~50% more execution time ([Speakeasy](https://www.speakeasy.com/blog/how-we-reduced-token-usage-by-100x-dynamic-toolsets-v2)). For a 10-iteration session this is on the order of tens of thousands of tokens saved. New lever — not currently implemented.

**2. Prompt cache TTL set explicitly to 1h on system prompt + tool schemas — ~55% of the prior caching benefit, restored. Effort: low.**
The default TTL dropped to 5 minutes in 2026; refactoring sessions run 20–60 min, so the default causes silent cache misses mid-session. Cache reads cost 0.1× base input; the 1h write costs 2× but pays for itself after ~2 reads/hour ([prompt-caching docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). CLAUDE.md documents 1h TTL conceptually but the client must **actively set `ttl: '1h'`** on the `cache_control` block. Critical structural rule for this loop: the per-turn `followUpInstruction` carries a changing `effort` hint — keep all mutable per-turn data **after** the last `cache_control` breakpoint, or every turn busts the cache. Partially documented; the breakpoint-ordering gotcha is the new actionable detail.

**3. Return diffs, not full files, from `code_health_auto_refactor` — ~17–30% per large edit. Effort: med (MCP-side).**
The auto-refactor tool currently returns full-function rewrites. FuncDiff/BlockDiff formats match or exceed full-rewrite accuracy while cutting tokens and latency 30%+ on code >300 tokens ([To Diff or Not to Diff](https://arxiv.org/html/2604.27296)); SWE-Edit's adaptive format selection gives +2.1% resolved rate **and** −17.9% cost simultaneously ([SWE-Edit](https://arxiv.org/abs/2604.26102)). Add an `editMode: 'patch' | 'funcRewrite' | 'fileRewrite'` field, selected by smell type and function size: find-replace patches for `MagicNumber`/early-return/`HardcodedCredential`, FuncDiff for `ComplexMethod`/`BrainMethod` above the token threshold, full rewrite only for `GodClass`-scale restructuring. For TS/JS/PHP where deterministic AST transformers already exist in `packages/core/src/refactor/`, the exact replacement text can be computed server-side and shipped as a patch with zero LLM rewriting. New lever.

**4. Structural-diff / index-once review responses — 5–10× on repeated reviews. Effort: med (MCP-side).**
The biggest hidden cost in a loop is re-sending full file text on every `code_health_review`. Pre-built tree-sitter AST indexes answering structural queries report 10× fewer tokens and 2.1× fewer tool calls at 83% answer quality ([arXiv 2603.27277](https://arxiv.org/abs/2603.27277)); JCodeMunch reports a concrete 3,850→700 token case (5.5×) on the index-once-query-cheaply model ([JCodeMunch](https://github.com/jgravelle/jcodemunch-mcp)). Concretely: on first analysis return full smell locations; on re-review return only `{file, functionName, byteRange, smellType, score}` and let the agent request targeted excerpts via the existing `focusLines` parameter rather than re-shipping the whole file. This stacks with `outputSchema` (item 7) and cached schemas. New lever, well-aligned with the existing tree-sitter Tier A pipeline.

**5. Three-tier effort/model routing keyed to the current health score — ~40–51% per session. Effort: med.**
The loop already computes the score and thresholds (`AI_READY_THRESHOLD=9.5`, `HEALTHY_THRESHOLD=9.0`, `PROBLEMATIC_THRESHOLD=6.0`). Route on those: Opus 4.8 at `xhigh` for orchestration/analysis when score < 7.0; Sonnet 4.6 at `medium` for applying pre-decomposed steps when 7.0 ≤ score < 9.0 (SWE-bench gap is only ~1.2 pts, $3/$15 vs $5/$25); Haiku 4.5 at `low` for read-only re-review passes when score ≥ 9.0 (the `loopComplete` check needs no deep reasoning, just JSON parsing). Reported three-tier routing savings: ~51% per session ([Augment routing guide](https://www.augmentcode.com/guides/ai-model-routing-guide)); effort-level differences alone are low=0.3×, medium=0.6×, high=1.0× baseline tokens ([effort docs](https://platform.claude.com/docs/en/build-with-claude/effort)). The `code_health_auto_refactor` `followUpInstruction` already emits an effort hint — extend it to also emit a suggested model tier. Partially documented (effort mapping exists; score-keyed model routing and Haiku re-review are new).

---

### Tier 2 — Solid, lower ceiling

**6. Programmatic tool calling — collapse N round-trips to ~2, up to 37–80% on multi-step loops. Effort: high.**
The `review → auto_refactor → apply → re-review` chain is highly regular. Wrapping it in code-execution orchestration (`code_execution_20250825`, `allowed_callers`) keeps intermediate tool results inside the container so only final outputs hit the model context: Anthropic measured 43,588→27,297 tokens (37%) and 19+ eliminated inference passes on a 20-tool workflow ([programmatic tool calling](https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling)); third-party reports up to 80%. CLAUDE.md already documents this conceptually. Honest caveat: it removes intermediate results from context, which can hurt mid-iteration self-correction on complex `GodClass`/`BrainMethod` fixes — benchmark before enabling globally rather than turning it on by default.

**7. `outputSchema` on all tools (start with `code_health_review`, `code_health_auto_refactor`) — eliminates text re-parse + enables 24h schema caching. Effort: low (MCP-side).**
The MCP spec requires servers to return `structuredContent` conforming to a declared `outputSchema` ([MCP 2025-11-25 tools spec](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)). This lets the model reason on the typed object (`score`, `smells[]`, `loopComplete`, `followUpInstruction`) without re-parsing a text blob, and unlocks Anthropic's structured-outputs constrained decoding which caches compiled schemas server-side for 24h ([structured outputs GA](https://docs.claude.com/en/docs/build-with-claude/structured-outputs)). CLAUDE.md documents the structured-outputs beta header but the tools do **not yet declare `outputSchema`** — this is the prerequisite the doc is missing. Also kills retry loops from malformed responses.

**8. Context compaction for long sessions — 87% active-context reduction. Effort: med.**
Loops of 6+ iterations on large files accumulate code blocks, tool results, and reasoning past 150K tokens. The compaction API (`compact-2026-01-12`) auto-summarizes 180K→~23K active tokens ([compaction docs](https://platform.claude.com/docs/en/build-with-claude/compaction)). Two project-specific gotchas: (a) supply a custom `instructions` field prohibiting tool calls during summarization (default behavior may call tools instead of writing the summary); (b) keep `cache_control` on the system prompt separate so it survives compaction, and carry `task_budget.remaining` forward across cycles. New lever.

**9. Manual tool-result stripping — complementary to compaction, cheaper and more precise. Effort: med.**
After each iteration, drop earlier `code_health_review` (~2K) and `auto_refactor` (~1K) tool-result blocks from the messages array, keeping only the most recent review result and last instruction ([effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)). A 6-iteration loop otherwise carries ~18K tokens of dead tool results into turn 6. No API beta required — pure client-side message-array management. New lever; cheaper than compaction for predictable loop shapes, and the two can coexist (strip first, compact only if still over threshold).

**10. `task_budget` advisory countdown — paces and winds down the loop. Effort: low.**
Already documented. Worth re-confirming the interaction: the budget counts only tokens Claude sees this turn (new results + generated), so prompt-cached turns cost almost nothing against it ([task budgets](https://platform.claude.com/docs/en/build-with-claude/task-budgets)). Do **not** decrement `remaining` client-side when resending history — that double-counts and causes premature termination. Size at empirical p99 of per-task spend, with `max_tokens` (set ≥ 64K on `xhigh`) as the hard backstop.

**11. TOON / tabular output format for smell arrays — 50–70% per payload. Effort: med (MCP-side).**
When a file has many smells, the `smells[]` array is the bulkiest part of the review response. A tabular-JSON (TOON) encoding cuts payload 50–70% vs raw JSON ([tree-sitter-analyzer](https://github.com/aimasteracc/tree-sitter-analyzer)). This is orthogonal to and stacks with `outputSchema` (define the schema as a tabular shape) and prompt caching. New lever. Lower priority than items 3/4 because it only compresses one field, but cheap to add once `outputSchema` exists.

---

### Tier 3 — Marginal / situational

**12. Token-efficient-tools beta — avg 14%, up to 70% on tool-response formatting. Effort: low.** Already documented; strictly additive header, stack with structured outputs.

**13. Message Batches API for offline work — flat 50% discount. Effort: low.** Not for the interactive loop, but directly applicable to `scripts/health-audit.mjs` and any nightly audits via Claude Routines ([batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing)). Stacks with cache reads: effective cost on a cache hit ≈ 0.5 × 0.1 = 5% of base input. New lever for the audit path.

**14. Fine-grained tool streaming — latency only, not tokens. Effort: low.** Now GA on Sonnet 4.6+, no beta header needed ([docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)); CLAUDE.md still implies a header is required. Cut the header reference. 200–800 ms TTFT on large `currentCode`/`focusLines` blocks — improves the interactive feel, saves no tokens.

**15. `llms-full.txt` at the docs URL — one-time session-init saving. Effort: low.** Embed all 27 tool schemas, scoring formula, smell definitions, and thresholds in a single cached fetch so assistants don't multi-read project files at session start ([llms.txt guide](https://buildwithfern.com/post/optimizing-api-docs-ai-agents-llms-txt-guide)). CLAUDE.md is a partial in-repo equivalent but not a spec-compliant served file. New lever.

**16. Don't use `max` effort in the loop. Effort: low.** Official guidance: `max` adds significant cost for marginal gain and can cause overthinking on structured-output tasks ([effort docs](https://platform.claude.com/docs/en/build-with-claude/effort)). CLAUDE.md currently maps `max` to `score < 5` — tighten this to reserve `max` for genuinely novel code; `xhigh` is the practical ceiling.

---

### Stacking note
These multiply, not add. A realistic loop config — deferred tool loading (item 1) + 1h cache with correct breakpoint ordering (2) + diff-mode responses (3) + structural re-review (4) + score-keyed routing (5) — plausibly removes the majority of per-iteration input tokens, with the API betas (6–10) compounding on top. The one prerequisite gating several MCP-side items is `outputSchema` (item 7): structured responses are what make diffs, TOON, and structural re-review cleanly machine-consumable.

### Top 5 bets for this theme
1. **Add `outputSchema` to `code_health_review` and `code_health_auto_refactor`** (low effort, MCP-side) — unblocks structured outputs, diff responses, TOON, and structural re-review. Foundational.
2. **Deferred tool loading via Tool Search Tool** (med effort) — ~85% of tool-definition overhead removed every request; biggest single input-token win for a 27-tool server.
3. **Diff-mode (`editMode`) responses from `code_health_auto_refactor`** (med effort) — 17–30% per large edit, deterministic for TS/JS/PHP via existing transformers.
4. **Score-keyed model + effort routing** (med effort) — ~40–51% per session by sending Haiku/Sonnet to the cheap passes and reserving Opus 4.8 `xhigh` for low-score orchestration.
5. **Fix the stale `budget_tokens` reference + set explicit 1h cache TTL with correct breakpoint ordering** (low effort) — prevents a hard 400 error on Opus 4.8 and restores ~55% of lost caching benefit; pure client-config, no code.

---

## Reaching >9.6 on everything with fewest iterations

The objective is two coupled problems: (1) the *score* must be a defensible target — reachable, non-gameable, and meaning the same thing across files; and (2) the *loop* must converge on that target in the fewest passes. The EMNLP 2025 self-correction Markov model (https://aclanthology.org/2025.emnlp-main.685/) is the governing constraint: the loop has a fixed ceiling `Upp = CS/(1−CL+CS)`, and adding iterations cannot push past it. The only levers are raising **CS** (probability a given fix actually clears the targeted smell) and protecting **CL** (probability a fix doesn't break an already-good area). Every recommendation below is aimed at one of those two, or at making the `9.6` line itself trustworthy.

### A. Make the target defensible before optimizing the loop

If the threshold is wrong, faster convergence just reaches a wrong number faster.

1. **Empirically anchor the 9.6 line; don't assume it. (impact: high, effort: med)**
   The current `AI_READY_THRESHOLD = 9.5` (in scoring thresholds) is calibrated only for Java/Defects4J per `CLAUDE.md`. Two independent datasets put the AI-safety cliff lower: CodeScene's Code Red study (https://ar5iv.labs.arxiv.org/html/2203.04374) found the *Green* threshold at **8.0** (r=−0.58 with issue-resolution time, 15× defect differential below 4.0), and their 2026 agentic benchmark (https://codescene.com/blog/making-legacy-code-ai-ready-benchmarks-on-agentic-refactoring) put the AI-reliability cliff at **9.4**. So `9.5` is plausibly conservative-but-fine, and a `9.6` target is *above* both published cliffs — meaning the last 0.1–0.2 buys little defect-prevention and a lot of iterations. Recommendation: keep `9.6` only if a labeled holdout (50–100 files spanning 8.0–10.0, human maintainability rating + measured LLM break rate) shows the break-rate still falling between 9.4 and 9.6. If it's flat, target 9.4–9.5 and stop. This is the single highest-leverage item: it may eliminate whole iterations by lowering the bar to where the evidence actually supports it.

2. **Measure Expected Calibration Error at each threshold. (impact: high, effort: high)**
   JIT defect models show ECE of 2–35% (https://arxiv.org/abs/2504.12051); a rule-weighted score is equally exposed. Without ECE we don't know whether 9.3 vs 9.6 is a real distinction. Add ECE to the existing `runValidation` pipeline (`./validation/index`, which already has `computeAUROC`/`pearsonCorrelation`) by binning predicted-score-band against actual smell presence in a holdout. This is the evidence that justifies whatever final number we pick.

3. **Close the obvious gameability holes in `score = 10 − Σ(weight×√count)`. (impact: high, effort: med)**
   The `√count` damper (in `scoring/weights.ts`) is a sound sub-linear penalty, but it has two known failure modes:
   - **Split-to-evade**: extracting a `ComplexMethod` into three still-complex private methods changes one `count=1` penalty (1.5) into `1.5×√3≈2.6` — so for `ComplexMethod` the formula *already* resists this. But the real exploit is extracting helper bodies *below* the CC threshold so they stop being counted at all, while comprehension is unchanged. Add a **split-residue smell** (https://codepulsehq.com/guides/goodharts-law-engineering-metrics): fire when a file has >3 private methods each called by exactly one caller with CC>2. Weight ~0.5.
   - **Co-occurrence under-weighting**: the additive model treats `GodClass`+`BrainMethod` on one file as independent, but co-occurrence has significant compounding impact on cohesion/size (not coupling/complexity) per Imran et al. (https://ietresearch.onlinelibrary.wiley.com/doi/full/10.1049/sfw2/5579438). Apply a 1.2× multiplier to the higher-weight smell when a cohesion/size pair co-occurs on the same file. This makes 9.6 *harder to reach via partial fixes* — which is the right kind of hard.

4. **Threshold-gate `ComplexMethod` weight instead of flat 1.5. (impact: med, effort: low)**
   At weight 1.5 a single organized-but-large function (CC 25) costs a full 1.5 points (`1.5×√1`), which can be the difference between 9.4 and 9.6 and pushes the loop to fragment a function that was fine. Cognitive-complexity validation shows the metric's predictive edge over cyclomatic is small (https://dl.acm.org/doi/10.1016/j.jss.2022.111561), and the LLM-reasoning sweet spot is CC≈10, *not* CC=1 (https://arxiv.org/abs/2601.21894) — over-fragmentation hurts the very agent we're optimizing for. Gate the weight: 1.0 for CC 15–24, 1.5 for CC≥25. Also add a `FragmentedCode` guard (CC=1, <3 LLOC, single caller) so the loop doesn't chase the score into micro-method sprawl that makes cross-file reasoning worse.

5. **Role-aware weights (SATT). (impact: med, effort: med)**
   A flat `GodClass` weight is too strict for an orchestration facade and too loose for a domain entity (https://ieeexplore.ieee.org/document/7781795/). Infer role from path/name (`controller`/`service`/`entity`/`util`/`test`) and adjust ±20–30%. Without this, some files have an unreachable 9.6 ceiling for legitimate structural reasons and the loop burns iterations against a wall it cannot clear. **Note:** this interacts with item B6 (test-context filtering) — both are forms of context-aware weighting and should share one role-classification helper.

### B. Raise CS — make each pass clear more smells

6. **Test-context reachability filter for security smells. (impact: high, effort: med)**
   A `SqlInjectionRisk` in a mock-data test harness counts the same as one in a request handler today. Filtering by path (`/test/`, `/__tests__/`, `*.spec.*`, `*_test.go`) and by literal-vs-variable sink arguments removes a large class of penalties the loop *cannot meaningfully fix*, which is exactly what strands files below 9.6 (industry reachability filtering reports 90–95% noise reduction: https://konvu.com/solutions/reachability-analysis). This is tractable at the tree-sitter AST level with no dataflow engine. Apply 0.3–0.5× weight in test contexts.

7. **Batch all instances of the top-weight smell in one pass. (impact: high, effort: med)**
   The loop should not fix smells one at a time. `code_health_auto_refactor` should return a single structured plan covering *every* instance of the highest-weight smell in the target file, because the `√count` curve means clearing all N instances of one smell type yields a far larger delta than clearing one instance each of N types. GitHub Copilot's move to clustered multi-line fixes drove measurable acceptance gains (https://github.blog/ai-and-ml/github-copilot/60-million-copilot-code-reviews-and-counting/). Order the plan by *marginal score delta per fix*, descending — this is a direct function of the existing weight table and is computable before any LLM call.

8. **Pre-Act planning step before the first refactor call. (impact: high, effort: low)**
   Emit a full per-file, per-function plan (smell priority, predicted Δ, fix strategy) from the health report *before* any `code_health_auto_refactor` call. Pre-Act raised goal completion from 32%→82% over ReAct (https://arxiv.org/html/2505.09970v2). This is a prompt-design change to the loop driver, not core code, and front-loads the reasoning that otherwise causes mid-loop course corrections. The project's `runRefactoringLoop` (`./refactor/refactoring-loop`) is the natural home; `followUpInstruction` already partially encodes this per-step but not as an upfront whole-file plan.

9. **RCI self-critique inside `followUpInstruction`. (impact: high, effort: low)**
   Append a structured self-verification prompt to the generated instructions: confirm (a) all free variables passed as params, (b) return values propagated, (c) call site valid. RCI prompting lifted Python extract-method test-pass rates from ~40–50% to ~83% on open models (https://arxiv.org/abs/2510.26480). Pure template change, no dependency. This is probably the best CS-per-effort ratio available.

10. **Inject git-blame context for `BrainMethod`/`GodClass`/`KnowledgeLoss`. (impact: high, effort: med)**
    HAFixAgent showed +190% fix rate on single-file multi-hunk bugs when the introducing commit diff and co-changed function snapshots are in context (https://arxiv.org/html/2511.01047), and crucially without raising step count. The project *already* runs git history for `MethodTemporalCoupling` via `analyzeFileWithHistory`; extend that same pipeline to attach the originating diff to the auto-refactor instructions for complex smells. Reuses existing infrastructure.

11. **Structure-aware diff output (FuncDiff) for large functions. (impact: med, effort: med)**
    `code_health_auto_refactor` returning full-function rewrites is token-heavy and not obviously more accurate. FuncDiff/BlockDiff match or beat full-rewrite accuracy at 30%+ lower tokens for code >300 tokens (https://arxiv.org/html/2604.27296), and SWE-Edit's adaptive selection cut cost 17.9% while *raising* resolved rate (https://arxiv.org/abs/2604.26102). Add an `editMode: 'patch'|'funcRewrite'|'fileRewrite'` field selected by smell type and function size — find-replace for `MagicNumber`/early-return, FuncRewrite only for `ComplexMethod`/`BrainMethod`/`GodClass`. Fewer tokens per pass doesn't raise CS directly but lets more passes fit the same budget.

### C. Protect CL and stop wasting iterations on unfixable targets

12. **Abstain-and-validate before applying. (impact: med, effort: med)**
    A lightweight plausibility check before each apply — does the proposed change actually target the weighted smells? — combined abstention+validation gave +39pp precision on real bugs (https://arxiv.org/abs/2510.03217). For files where estimated CS is low, mark `manual intervention required` rather than burning 2 passes on a predictably failing mechanical fix. This is what keeps the iteration distribution from degrading into the 6+ tail.

13. **Define and publish an explicit stopping rule. (impact: med, effort: low)**
    Stop when `score ≥ target AND per-iteration Δ < 0.1`. The GPT-5.1 iterative study (https://arxiv.org/abs/2602.21833) found structural change concentrates in the first 2 iterations (76% lines stable by v2, 92% by v5) and that absent stopping criteria the model **strips inline comments** and **oscillates on renames**. Both directly attack our score: comment stripping would *raise* a naive score while *lowering* comprehension (the Goodhart trap), and rename oscillation wastes passes. The loop must guard comment count as a non-decreasing invariant and treat rename-only diffs as non-progress.

### D. Raise the mechanical fix rate (the structural CS ceiling)

The 11.8% mechanical-only fix rate is the hard floor: every smell the loop can fix deterministically is one the LLM never has to attempt, which both raises effective CS and protects CL.

14. **Python extract-method via `rope`. (impact: high, effort: med)**
    Python is the largest untransformed Tier A language. `rope`'s `ExtractMethod` is a headless offset-based API (`project, resource, start_offset, end_offset` → `get_changes`) with an existing MCP wrapper (https://rope.readthedocs.io/en/latest/library.html). The detector already finds the target function (`ComplexMethod`/`BrainMethod`); the LLM only supplies offsets; `rope` executes deterministically. Highest single-language ROI.

15. **Go extract-function via `gopls codeaction`. (impact: high, effort: med)**
    `gopls codeaction -exec -kind refactor.extract.function -diff file.go:#start-#end` is fully non-interactive and emits a unified diff (https://go.dev/gopls/features/transformation). Same handoff pattern as `rope`. Together with Python this takes deterministic transforms from 3→5 languages.

16. **Guard-clause/early-return rules via ast-grep for all Tier A languages. (impact: high, effort: low)**
    `if (cond) { long body }` → `if (!cond) return; body` is the same structural pattern across Python/Go/Ruby/Rust/Java/Kotlin/Elixir/Swift/Scala and needs no semantic analysis (https://ast-grep.github.io/guide/rewrite-code.html). This directly attacks `DeepNesting` (1.2) and many `BrainMethod` (1.2) cases mechanically. ~1–2 rules per language; ast-grep's "one node at a time" constraint (https://ast-grep.github.io/guide/rewrite-code.html) doesn't bite here because early-return is a single-node, same-scope rewrite (unlike extract-method, which needs the two-pass rope/gopls path). Low effort, broad coverage.

17. **Verify transformer output with RefactoringMiner; cascade-clean with Piranha. (impact: med, effort: med)**
    Behavior-preservation is part of CL. RefactoringMiner 3.0 (F1=99.7%, https://github.com/tsantalis/RefactoringMiner/blob/master/documentation/accuracy.md) can serve as an oracle confirming the *right* refactoring happened with no unintended change — the project currently has no such oracle for its TS/JS/PHP transformers. Separately, PolyglotPiranha's cascading rules (https://dl.acm.org/doi/10.1145/3656429) auto-remove the now-dead imports/branches a fix exposes — the "fix one smell, reveal two" stall that parks files at ~9.0.

### Honest accounting

Already largely done: numbered steps + example skeleton in `followUpInstruction` (validated best practice per https://arxiv.org/abs/2507.00653); `√count` sub-linear damping; effort-level mapping in `CLAUDE.md`; git-history infra for temporal coupling; TS/JS/PHP transformers. Genuinely new here: empirical re-anchoring of the threshold, ECE measurement, split-residue + co-occurrence anti-gaming, role/test-context weighting, Pre-Act + RCI + abstain-validate loop structure, the comment-count invariant, and Python/Go/early-return mechanical transformers. The MANTRA RAG-of-prior-refactorings result (82.8% vs 8.7%, https://arxiv.org/html/2503.14340v2) is high-impact but high-effort (build/maintain a retrieval corpus) and is deliberately *not* in the top bets — it's a phase-2 CS multiplier once the cheaper levers are in.

### Top 5 bets for this theme

1. **Empirically anchor the threshold (A1) + ECE measurement (A2).** Decide what 9.6 means before chasing it; may lower the bar to where evidence supports it and delete iterations outright.
2. **RCI self-critique in `followUpInstruction` (B9).** Highest CS-per-effort: a template change that roughly doubles single-pass extract-method success.
3. **Pre-Act whole-file plan + batch top-weight smell per pass (B8 + B7).** Front-load reasoning and exploit the `√count` curve by clearing all instances of one smell type at once.
4. **Python `rope` + Go `gopls` + cross-language early-return rules (D14–D16).** Lift the mechanical fix rate well above 11.8%, raising the structural CS ceiling and protecting CL.
5. **Anti-gaming + context-aware weights (A3 split-residue/co-occurrence, B6 test-context, A5 role-aware).** Keep 9.6 reachable for honest code and unreachable by trivial splitting/comment-stripping — the whole point of a target worth converging on.

---

## Long-term strategy & moat (best-in-world)

The honest starting position: a direct, well-funded competitor (CodeScene) has already shipped a conceptually identical product — a local CodeHealth MCP server, 1–10 score, 9.5 AI-ready threshold, self-correcting loop, `code_health_review` / `pre_commit_code_health_safeguard` tools, 25+ biomarkers, ~30 languages, €8/mo per repo ([codescene.com/early-access-codescene-mcp-server](https://codescene.com/early-access-codescene-mcp-server)). They have $11.8M raised, ISO 27001, enterprise contracts, peer-reviewed citations, and first-mover brand. A second open-source competitor (Roam, Apache-2.0) already exports SARIF 2.1.0 from an MCP server with a 0–100 score and 57+ tools ([github.com/Cranot/roam-code](https://github.com/Cranot/roam-code)). So "best in the world" is not a greenfield claim — it is a fight on three axes where this project can actually win: **open/transparent core, language+transformer breadth, and a calibration data flywheel that a closed vendor cannot replicate at OSS scale.**

Below, prioritized by impact. Effort tags are relative engineering cost, not calendar time.

### 1. Win the distribution layer before refining the engine — SARIF + registry + IDE (impact: high)

The engine is already strong; it is *invisible* in the channels where adoption happens. This is the highest-leverage gap because it is mostly plumbing on top of capabilities the project already has.

- **Enrich `formatAsSarif()` (the project already has it) rather than build new.** (effort: med) The gap is field richness, not the format. Add `partialFingerprints.primaryLocationLineHash` (cross-run dedup), `properties.security-severity` (0.0–10.0) on the existing security smells (`SqlInjectionRisk`, `XssRisk`, `CommandInjectionRisk`, `HardcodedCredential`, `HardcodedApiKey`), and embed the aggregate score as `run.properties.healthScore`. This makes findings appear in GitHub Code Quality (public preview Oct 2025, org dashboard Feb 2026) via the standard `upload-sarif` path with zero SDK adoption by the user ([github.blog/changelog/2025-10-28](https://github.blog/changelog/2025-10-28-github-code-quality-in-public-preview/)). Ship a `healthy-ai-code/sarif-upload-action` GitHub Action; this also satisfies the OpenSSF Scorecard SAST check automatically ([github.com/ossf/scorecard-action](https://github.com/ossf/scorecard-action)).
- **CWE/OWASP taxonomy mapping in SARIF.** (effort: low) One-time map of the 28 biomarkers to CWE IDs using the ready-made files at [github.com/sarif-standard/taxonomies](https://github.com/sarif-standard/taxonomies). Makes findings filterable by CWE across every SARIF consumer. This is a weekend task with permanent interop payoff.
- **GitLab Code Quality JSON output** (`--format gitlab-json`, 6 fields, `md5(file+smell_type+start_line)` fingerprint) (effort: low) — reaches GitLab's enterprise base without GitHub Advanced Security ([docs.gitlab.com/ci/testing/code_quality](https://docs.gitlab.com/ci/testing/code_quality/)).
- **Official MCP Registry + Smithery listing, with a service-prefix rename.** (effort: low) Register at registry.modelcontextprotocol.io (Agentic AI Foundation governance, ~9,652 servers as of May 2026) and implement `.well-known/mcp-server-card.json` ([workos.com/blog](https://workos.com/blog/everything-your-team-needs-to-know-about-mcp-in-2026)). **Rename tools `code_health_*` → `healthy_ai_code_*`** — registry discovery uses embedding search over name+description+schema, and the generic `code_health_` prefix collides with CodeScene's identical naming. This is a breaking change; do it now while the user base is small.
- **VS Code extension bundling the server as a stdio child process** (effort: med) — VS Code MCP support is GA since July 2025 ([github.blog/changelog/2025-07-14](https://github.blog/changelog/2025-07-14-model-context-protocol-mcp-support-in-vs-code-is-generally-available/)). SonarQube for IDE already lists Claude Code/Cursor as targets; real-time IDE diagnostics are now the baseline expectation, not a bonus ([sonarsource.com/products/sonarqube/ide](https://www.sonarsource.com/products/sonarqube/ide/)).

### 2. Build the calibration data flywheel — the one moat a closed vendor cannot match (impact: high, effort: high)

This is the durable, defensible moat and the single biggest strategic differentiator vs CodeScene. Their scoring is "patented" and closed; their calibration signal is bounded by paying customers. An open tool with opt-in, privacy-preserving telemetry can accumulate a *larger* multi-language calibration corpus than any subscription product.

- The project already returns a **predicted score delta** in `code_health_auto_refactor`. The (predicted Δ vs actual Δ) pair after `applyAutoRefactor` + re-`analyzeFile` is a free, per-session calibration signal. Capture only aggregates: smell counts, score deltas, language, iteration count — **never source code**. Publish the resulting per-language smell thresholds under an open data license (CC). This creates a citation moat (researchers build on your thresholds) and a product flywheel simultaneously, mirroring Cursor's accept/reject signal ([mindstudio.ai/blog](https://www.mindstudio.ai/blog/ai-coding-models-flywheel-effect)).
- **Honest caveat:** this only works if adoption (bet #1) lands first. No users, no flywheel. Sequence accordingly.

### 3. Close the empirical-validity gap that undermines the whole value prop (impact: high, effort: high)

CodeScene cites peer-reviewed work (r=−0.58 health↔resolution-time on 30,737 files, [ar5iv.labs.arxiv.org/html/2203.04374](https://ar5iv.labs.arxiv.org/html/2203.04374); 30%+ AI defect risk on unhealthy code, [their whitepaper](https://codescene.com/hubfs/whitepapers/AI-Ready-Code-How-Code-Health-Determines-AI-Performance.pdf)). The arXiv Jan-2026 CodeHealth study validates the *category* but is Python-only competitive-programming code ([arxiv.org/abs/2601.02200](https://arxiv.org/abs/2601.02200)). This project's calibration is **Java-only (Defects4J)** per CLAUDE.md, and the `AI_READY_THRESHOLD=9.5` is stricter than every published threshold (CodeScene Green=8.0, AI-safe=9.0–9.4). That 9.5 is currently *asserted, not validated*.

- **Publish a multi-language validation** (Python/TS/Go) replicating CodeScene's methodology but cross-language — this is the academic counter to their Java-only, founder-authored 83% F-score claim ([codescene.com/blog/6x-improvement-over-sonarqube](https://codescene.com/blog/code-biomarkers/)). Extend Defects4J calibration using the 87 functional-defect datasets surveyed in 2025 (48 Java / 47 C / 34 Python, [arxiv.org/html/2504.17977v1](https://arxiv.org/html/2504.17977v1)).
- Adopt **per-language ROC-curve thresholds** over the Alves-percentile method currently implied for non-Java languages ([arxiv.org/html/2602.06831v1](https://arxiv.org/html/2602.06831v1)), and add **Expected Calibration Error** measurement at the 9.0/9.5 boundaries ([arxiv.org/abs/2504.12051](https://arxiv.org/abs/2504.12051)). Right now there is no evidence a 9.3 means anything different from 9.5.

### 4. Differentiate the engine where competitors structurally cannot follow (impact: high, effort: med)

These are genuinely new and exploit confirmed gaps in CodeScene/SonarQube/Codacy/DeepSource.

- **LLM-integration smells** (UMM, NMVP, NSM, NSO, TNES) — 60.5% of LLM-integrated OSS repos affected, 86% precision, AST-detectable, and explicitly *absent* from SonarQube ([arxiv.org/html/2512.18020](https://arxiv.org/html/2512.18020), [sonarsource.com/blog](https://www.sonarsource.com/blog/how-to-optimize-sonarqube-for-reviewing-ai-generated-code)). This is the highest-novelty, highest-confidence biomarker group available, and it fits naturally into the existing `ai-readiness/` module.
- **HallucinatedPackageImport / slopsquatting** — cross-check import nodes against cached PyPI/npm snapshots; 5.2% (commercial) to 21.7% (OSS) hallucination rate, real supply-chain attacks documented ([arxiv.org/html/2501.19012v1](https://arxiv.org/html/2501.19012v1)). Maps to OWASP A03:2025 (Supply Chain), which the project has no coverage of ([owasp.org/Top10/2025](https://owasp.org/Top10/2025/)).
- **Position an explicit `intentDebt` field** in the output schema (AiAttributedSATD, OrphanedTODO, undocumented public API). Thoughtworks Radar v34 (April 2026) names codebase cognitive debt a top concern ([thoughtworks.com/radar/techniques/codebase-cognitive-debt](https://www.thoughtworks.com/radar/techniques/codebase-cognitive-debt)); no competitor reports this as an integrated dimension. This is a framing/naming land-grab, low effort, high differentiation.

### 5. Attack the transformer gap — the project's most-cited limitation (impact: high, effort: med–high)

Mechanical fix rate is 11.8%, transformers exist only for TS/JS/PHP. This is where Roam and act101 (163 languages, 183 ops, [act101.ai](https://act101.ai/)) currently look stronger.

- **Python via `rope`** (headless `ExtractMethod`, proven MCP wrapper exists, [rope.readthedocs.io](https://rope.readthedocs.io/en/latest/library.html)) and **Go via `gopls codeaction -exec`** ([go.dev/gopls/features/transformation](https://go.dev/gopls/features/transformation)) are the two highest-ROI additions — Python is the largest untransformed Tier A language. The health scorer already locates the target function; the LLM only resolves byte offsets.
- **Guard-clause/early-return rules via ast-grep or GritQL** across all Tier A languages (effort: low) — same structural pattern everywhere, no semantic analysis needed, directly attacks `DeepNesting` (1.2) and `BrainMethod` (1.2). Note the documented constraint: ast-grep rewrites one node at a time, so extract-method needs a two-pass approach ([ast-grep.github.io/guide/rewrite-code](https://ast-grep.github.io/guide/rewrite-code.html)).
- **Add RefactoringMiner 3.0 (F1=99.7%) as a verification oracle** for transformer output ([github.com/tsantalis/RefactoringMiner](https://github.com/tsantalis/RefactoringMiner/blob/master/documentation/accuracy.md)). The project currently has *no* automated check that its TS/JS/PHP transformers are behavior-preserving — a credibility gap before any benchmark publication.

### 6. Standards/compliance as enterprise sales accelerators (impact: med, effort: low)

- **Map 28 biomarkers to ISO/IEC 5055:2021** (Security/Reliability/Performance/Maintainability) and add `--format iso5055`. Weekend effort; unlocks regulated-industry procurement ([dinmedia.de/en/draft-standard/iso-iec-dis-5055-3](https://www.dinmedia.de/en/draft-standard/iso-iec-dis-5055-3/398390910)).
- **Submit to agentaudit.dev for a public trust score** and ship a `SECURITY.md` documenting zero-exfiltration. In an ecosystem where 82% of MCP servers have path-traversal flaws, a verifiable high trust score is a concrete enterprise differentiator ([dev.to/ecap0](https://dev.to/ecap0/we-scanned-20-top-mcp-servers-for-vulnerabilities-the-results-will-shock-you-21c5)).
- **`llms-full.txt`** with all tool schemas + scoring formula + weights (effort: low) — single cached fetch instead of multi-file reads during session init.

### 7. Open-core GTM + plugin ecosystem (impact: med, effort: med–high)

- **Open-core** is the proven dev-tool playbook (HashiCorp, Grafana, SonarQube Community vs Cloud, [opencoreventures.com](https://www.opencoreventures.com/blog/open-core-is-a-misunderstood-business-model)). Keep the engine, all 28 biomarkers, and all MCP tools MIT-licensed permanently. Gate enterprise features: portfolio dashboards, ISO-5055 compliance export, CI/CD SLA enforcement, org-chart knowledge-loss reports. Price per active author **below** CodeScene Standard (€18) — target ~$12–15, free for OSS repos.
- **Biomarker plugin API** (`detect(code, ast, language) => Smell[]`, metadata with weight) — mirrors Semgrep's 2,000-rule moat. Use the SpecDetect4AI DSL (52 reusable predicates) as the blueprint. The existing single-file-per-tool registration pattern in `server.ts` and the single `analyzeByLanguage()` dispatcher mean the architecture is already close to plugin-friendly; the work is defining and stabilizing the public `BiomarkerPlugin` interface.

### Positioning summary vs each competitor

| Competitor | Their edge | Our wedge |
|---|---|---|
| **CodeScene MCP** | brand, funding, peer-reviewed, enterprise | open/auditable scoring, transparent `weights.ts`, no account, more languages, data flywheel they can't match |
| **SonarQube MCP** | enterprise footprint, IDE reach | numeric 1–10 (vs A–E), local/sync (their heavy tools disabled in Cloud), structured loop instructions, LLM-integration smells they lack |
| **DeepSource** | <5% FP claim, Report Card UX | adopt per-dimension subscores to neutralize; we add temporal + AI-native loop |
| **Qodo** | $70M, cross-repo RAG, PR review | continuous git-history-aware *per-file* score targetable by an agent; they do PR-diff review, not convergence scoring |
| **Roam / act101** | SARIF already / 163-lang transformers | scoring + calibration + loop instructions (they transform but don't score/calibrate); close the SARIF gap fast (bet #1) |

### Top 5 bets for this theme (ranked)

1. **SARIF enrichment + GitHub Code Quality Action + MCP Registry/Smithery listing with tool rename** (high impact / med effort). Distribution is the binding constraint; everything else compounds off adoption. Roam already occupies the SARIF channel — close it now.
2. **Calibration data flywheel via opt-in privacy-preserving telemetry, published openly** (high impact / high effort). The only moat structurally unavailable to a closed competitor; sequence right after bet #1 so there are users to learn from.
3. **Multi-language empirical validation + ECE measurement to ground the 9.5 threshold** (high impact / high effort). The core claim is currently asserted, not proven, and the threshold is stricter than all published evidence. Fixes a real credibility liability and feeds the academic citation moat.
4. **LLM-integration smells + slopsquatting/HallucinatedPackageImport + explicit `intentDebt` field** (high impact / med effort). AI-native biomarkers no competitor scores; lands the "best for AI-generated code" positioning with confirmed-gap evidence.
5. **Python (`rope`) + Go (`gopls`) transformers + RefactoringMiner oracle** (high impact / med–high effort). Neutralizes the most-cited engine weakness and adds the behavior-preservation verification the benchmark story needs.

---

## Appendix: research-täckning

18 dimensioner: metrics-research · competitive · mcp-protocol · token-reduction-api · agentic-loops · scoring-calibration · ai-code-smells · security-sast · ast-tooling · auto-transformers · developer-dx · behavioral-temporal · cognitive-complexity · model-selection · benchmark-methodology · strategy-moat · intent-cognitive-debt · standards-interop.

Totalt: **186 fynd**, **286 källposter**, **242 sökningar**. Fullständiga data i `appendix-findings.json` och `appendix-sources.json`.
