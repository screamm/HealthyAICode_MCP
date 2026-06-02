# Behaviour-Equivalence Verification — Design Note

**Status:** design (pre-implementation). Companion to `code_health_verify_refactor`.
**Date:** 2026-06-02.
**Author:** `design-setup` build agent.
**Scope owner:** the "behaviour-equivalence" empty category in
`claudedocs/2026-06-01-win-by-margin.md` (Spel 1).

---

## 0. Honesty preamble (read first)

This note designs a verification layer that decides whether an LLM refactoring
**preserved observable behaviour**. It must do exactly one thing well: **flag
genuine divergence and never false-flag a genuinely-equivalent refactoring.** The
moment it cries wolf on a correct extract-method, operators stop trusting it and
the category advantage is gone.

Three honesty constraints govern every decision below:

1. **No overclaim of language coverage.** Dynamic equivalence is feasible *only*
   for languages we can actually execute in a controlled sandbox with
   nondeterminism neutralised. Today that is **TypeScript/JavaScript and Python**.
   The other ~44 languages get **static-equivalence advisory only** and must be
   labelled as such in every output. We never claim "all 46 languages proven safe."
2. **A verdict of `PASS` is bounded, not absolute.** Differential execution proves
   "no divergence observed over N synthesised inputs," not "equivalent for all
   inputs." Equivalence of arbitrary programs is undecidable (Rice's theorem). The
   verdict wording reflects this.
3. **Numbers in this repo are real runs or they are labelled as targets.** The
   only measured number that exists today is the spike's 100 % detection / 0 % FP
   on a **hand-built 21-pair corpus** (`scripts/spikes/behavior-equiv/`), which
   measures *mechanism feasibility*, not field accuracy. Field detection on unseen
   LLM output is unmeasured and will be lower.

### Environment facts verified this session (2026-06-02)

| Fact | Result | How verified |
|---|---|---|
| `hypothesis` installed & callable | **6.155.1** | `python -c "import hypothesis"` on host (Win, py 3.10.11) |
| `atheris` on native Windows | **FAILS to build** (`WinError 193`, native libFuzzer/clang build) | `pip install atheris` errored building wheel |
| `atheris` in Linux container | **3.0.0, importable** | `docker run python:3.11-slim … import atheris` → `atheris OK` |
| Docker available | **26.0.0, running** | `docker ps` |
| WSL distros present | Ubuntu (stopped), kali (stopped), docker-desktop | `wsl -l -v` |

**Consequence for architecture:** the Python dynamic path (atheris coverage-guided
fuzzing) **cannot run in-process on a Windows host**. It must run inside a Linux
execution environment (Docker container, CI Linux runner, or WSL Ubuntu). The
TS/JS path runs natively under Node (already proven by the spike). The Hypothesis
path is cross-platform. This is a real deployment constraint, not a detail — see
§4 and §6.

### Web-research step — could not complete this session

The task asked for a fresh 2026 web search on differential-execution best practice.
**Every `WebSearch`/`WebFetch` call this session returned HTTP 529 (Anthropic-side
overload); `status.claude.com` itself returned 200, confirming the overload is in
the model's web tool, not the network.** The design below therefore draws on:
(a) material already verified *in this repository* (the spike, its README, the
35-pair manifest, both arXiv citations), and (b) established prior-knowledge field
practice. **Items not freshly web-confirmed this session are tagged `[prior-knowledge]`.**
A follow-up pass should re-run the searches when the web tool recovers and reconcile
any 2026-specific guidance; nothing below should be presented externally as
"2026-verified best practice" until that pass is done.

---

## 1. Problem statement

Given a `before` code unit and an `after` code unit (the LLM's refactoring),
decide whether `after` is **observably equivalent** to `before`. The gate consumes
this verdict to **block** a refactoring that silently changed behaviour — the case
that an absent or weak existing test suite would miss.

Motivating evidence (in-repo citations, not re-fetched this session):
- arXiv **2602.15761** — "A Differential Fuzzing-Based Evaluation of Functional
  Equivalence in LLM-Generated Code Refactorings" — reports LLMs produce **19–35 %
  functionally non-equivalent refactorings**, and **~21 % of those breaks are missed
  by the datasets' existing test suites**. Method: Atheris coverage-guided fuzzing,
  ~1000 inputs/program, comparing outputs across all inputs.
- arXiv **2502.18454** — LLM-based equivalence *verification* is unreliable; this is
  why our approach is **execution-based**, not "ask an LLM if it's equivalent."

Why the category is structurally empty (per win-by-margin §"Spel 1"): no commercial
product combines characterization-test synthesis + differential fuzzing + a
**blocking gate** for untested multi-language code. Diffblue Cover is Java-only and
makes no equivalence claim.

---

## 2. The inverted test order (golden-master / characterization) `[prior-knowledge]`

Standard TDD writes the test **first**, then the implementation must satisfy it.
Behaviour-equivalence inverts this, following Michael Feathers' **characterization
testing** (a.k.a. golden-master) from *Working Effectively with Legacy Code*:

```
Normal TDD:           write test (intent)  →  write code to pass it
Characterization:     take EXISTING code (before)  →  observe what it actually does
                      →  pin that behaviour as the oracle  →  run AFTER against it
```

The `before` version **is** the specification. We do not need a human-written spec
or pre-existing tests — we synthesise inputs, run `before` to capture a *golden
master* of outputs, then run `after` on the identical inputs and compare. Any
observable difference is a **divergence**. This is exactly the order the spike
already implements: "The harness never sees the injected bug or expected outputs —
only the `before` signature shape."

This inversion is the crux of the category and the opposite of Diffblue's order
(Diffblue writes tests to characterise current code for *future* protection; we
generate from `before` and immediately replay on `after` to *gate the change*).

---

## 3. Verdict model: PASS / DIVERGENCE / UNVERIFIED

Three verdicts. The middle one blocks; the outer two never block on their own.

| Verdict | Meaning | Gate action |
|---|---|---|
| **PASS** | N synthesised inputs ran on both sides under neutralised nondeterminism; **no observable difference**. Bounded claim: "no divergence over N inputs," not "equivalent ∀ inputs." | allow (advisory note records N + coverage) |
| **DIVERGENCE** | ≥1 input produced a different observable: different return value (beyond float tolerance), different thrown-exception type, or different observed side-effect ordering. A **minimised counterexample** is attached. | **block** (this is the whole point) |
| **UNVERIFIED** | Could not establish a sound dynamic check: unsupported language, non-self-contained unit (external IO/DB/network/global state we can't sandbox), could not synthesise inputs from the signature, atheris unavailable on this host, or timeout. | **do not block on equivalence grounds**; emit static-equivalence advisory + reason |

Critical rule: **UNVERIFIED must never masquerade as PASS.** Silently downgrading
"couldn't check" to "looks fine" is how you ship a break. UNVERIFIED is loud and
names its reason. The gate's blocking decision for UNVERIFIED units falls back to
the existing delta-gate (smell-based) plus the static-equivalence advisory — it
does not claim behavioural safety.

False-positive avoidance (the trust-killer) is handled structurally:
- divergence requires an **actual differing observation**, never a heuristic guess;
- both sides see **identical** frozen clock / seed / environment, so a difference
  cannot be caused by the harness;
- floats compare with tolerance; collection ordering is canonicalised (§5) so
  legitimately-equivalent refactors (e.g. switch→map, loop→reduce) do not trip.

---

## 4. Architecture

```
                       code_health_verify_refactor(before, after, language)
                                          │
                    ┌─────────────────────┼───────────────────────┐
                    │ 1. classify language & unit                  │
                    │    self-contained pure unit? IO/global?      │
                    └─────────────────────┬───────────────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │ TS/JS                        │ Python                       │ other ~44 langs
            ▼                              ▼                              ▼
   ┌───────────────────┐       ┌──────────────────────────┐    ┌──────────────────────┐
   │ Node sandbox       │       │ Linux sandbox (REQUIRED)  │    │ STATIC advisory only  │
   │ (native, proven)   │       │ Docker / WSL / CI-linux   │    │ (no execution)        │
   │ fast-check or seeded│      │ atheris coverage-guided   │    │ AST diff: detect      │
   │ synthesis           │      │ + Hypothesis from_type    │    │ "risky" edits         │
   └─────────┬─────────┘       └────────────┬─────────────┘    └──────────┬───────────┘
             │                              │                              │
             └──────── input synthesis from BEFORE signature ─────────────┘
                                          │
                       2. run BEFORE → golden master (outputs + thrown + effects)
                       3. run AFTER on identical inputs under identical frozen env
                       4. compare with float-tolerance + canonical ordering
                       5. on first diff → minimise counterexample
                                          │
                                          ▼
                            PASS / DIVERGENCE / UNVERIFIED  (+ synthesised tests as artifact)
```

### 4.1 Input synthesis (deriving the input domain from a signature)

The only thing read from `before` is its **signature shape** — never the bug, never
expected outputs.

- **TS/JS:** parse parameter list + (if present) TS type annotations. Map types →
  generators. `fast-check` arbitraries `[prior-knowledge]` for typed params; fall
  back to the spike's seeded `argSpec` shape generators for untyped JS.
- **Python:** read the function's annotations / signature via `inspect.signature`
  and feed **Hypothesis** `st.from_type(...)` / `@given(... )` with `infer`
  `[prior-knowledge]` to derive strategies from type hints. For un-annotated params,
  fall back to a union of common strategies (ints incl. boundaries, floats, str,
  lists, dicts, None).
- **Edge biasing is mandatory.** The spike's #1 honest finding: uniform random
  *under-samples boundaries* and missed an off-by-one until a `boundaryInt`
  generator was added. Both generators must inject min/max/0/±1, empty/singleton
  collections, `None`/`undefined`, `''`/`0`/`NaN`. Hypothesis does much of this by
  construction; fast-check needs explicit edge arbitraries.
- **Coverage-guided amplification (Python):** atheris mutates inputs toward
  unexplored branches, reaching divergence-revealing inputs that blind random
  sampling misses (this is precisely why arXiv 2602.15761 used it). Available only
  on the Linux path (§0).

### 4.2 Observation model

An "observable" for one input is the tuple:
`(return value | thrown exception type, observed side-effect trace)`.
A **value vs thrown** mismatch is a divergence (catches `ts-10-exception-swallow`,
`py-07-dict-default`). Side-effect ordering is observed via instrumented stubs
(catches `py-10-reordered-sideeffect`). Args are **deep-copied per call** so the two
sides never share state and mutation bugs surface (`ts-09-mutation-vs-copy`,
`py-03-mutable-default`).

### 4.3 Synthesised tests as a returned artifact

Per the win-by-margin acceptance criterion, the synthesised characterization tests
(input vectors + golden-master outputs) are **returned to the caller as an artifact**
— runnable `vitest`/`pytest` files. This makes the verdict auditable (operators can
re-run) and turns the gate into a test-generator side-benefit. This is the
externally-visible differentiator vs. a black-box "trust me, it's equivalent."

---

## 5. Nondeterminism-neutralisation strategy

A divergence is only trustworthy if **the only thing that changed is the code**.
Every other source of variation must be pinned identically on both sides. `[prior-knowledge]`

| Source | Neutralisation |
|---|---|
| **Time/clock** | Freeze to a fixed instant on both sides. TS: stub `Date.now`/`Date`/`performance.now`. Python: pin `time.time`/`time.monotonic`/`datetime.now` (e.g. monkeypatch or `freezegun`-style). Spike already pins `Date.now` (TS) and `time.time` (Py). |
| **Randomness** | Seed identically. TS: replace `Math.random` with a seeded PRNG (spike uses mulberry32). Python: seed `random.Random(SEED)`, set `PYTHONHASHSEED` fixed, seed numpy if present. Same seed both sides. |
| **Hash/dict/set ordering** | Fix `PYTHONHASHSEED`; **canonicalise** before comparison — sort dict keys, sort sets, normalise to an order-independent structure so `switch→map`/`loop→comprehension` reorderings are not false divergences. |
| **Floating point** | Compare with tolerance (relative + absolute epsilon), not strict equality. Treat `NaN==NaN` as equal for comparison. Strict JSON equality (spike's stub) is **insufficient** for production and is a known FP risk. |
| **IO / filesystem / network / DB / env** | If the unit touches these, it is **not self-contained** → verdict `UNVERIFIED` (we do not fake-equivalence what we can't sandbox). A later phase may add recorded-IO replay; v1 declines honestly. |
| **Concurrency / async scheduling** | Pin event-loop/scheduler where feasible; if observably scheduling-dependent → `UNVERIFIED`. (Note: `ts-08-async-await-drop` is detectable because the *return shape* differs — `Promise<T>` vs `T` — independent of scheduling.) |
| **Object identity / memory addresses** | Compare by structural value, never by identity/`repr` containing addresses. |
| **Process/host variation** | Run both sides in the **same** process+env+seed within a single invocation; never compare across hosts. |

If any source cannot be pinned for a given unit, the honest move is `UNVERIFIED`,
not a guessed `PASS`.

---

## 6. Honest scope: dynamic vs static-only advisory

| Tier | Languages | Method | Verdicts available |
|---|---|---|---|
| **Dynamic equivalence** | **TypeScript, JavaScript** | Node sandbox, seeded synthesis + edge biasing, frozen env | PASS / DIVERGENCE / UNVERIFIED |
| **Dynamic equivalence** | **Python** | **Linux** sandbox (Docker/WSL/CI), atheris + Hypothesis | PASS / DIVERGENCE / UNVERIFIED — **UNVERIFIED on a Windows host without a Linux sandbox** |
| **Static advisory only** | the other ~44 supported languages | AST-level diff heuristics (flag risky edit shapes: operator swaps, dropped guards, boundary changes) — **never** a behavioural PASS | static `advisory` note only; behavioural verdict is always `UNVERIFIED` |

Phasing (aligned to win-by-margin 90-day plan):
- **v1 (now):** TS/JS dynamic + Python dynamic-on-Linux. Measure against the
  35-pair in-repo corpus (`packages/core/tests/fixtures/behavior-equiv/manifest.json`)
  and the labelled break set from arXiv 2602.15761. Ship synthesised tests as artifact.
- **Static advisory** for all other languages from day one, clearly labelled.
- **Later:** recorded-IO replay for non-pure units; type-driven synthesis depth;
  class/multi-function units.

**Go/no-go rule (unchanged from spike):** if measured detection on the corpus is
**< 80 %** (or FP > 10 %), do **not** ship a blocking dynamic gate — ship
**static-equivalence advisory only** and say so plainly. Do not let a blocking
gate go GA below the bar.

---

## 7. Open risks (honest)

1. **Field accuracy ≠ corpus accuracy.** 100 % on a hand-authored 21-pair corpus is
   mechanism feasibility. Unseen LLM output will be lower; the v1 GA bar (≥80 % silent-
   break detection) must be met on a corpus the author did *not* hand-tune against.
2. **Python's Linux-only dynamic path** complicates a Windows-first developer
   experience. Mitigation: ship the Python verifier as a containerised step the gate
   shells into; on a Windows host without Docker/WSL, Python units return `UNVERIFIED`
   (honest) rather than silently skipping.
3. **Self-contained-unit assumption** excludes most real cross-file refactors. v1
   honestly declines (`UNVERIFIED`) rather than pretending.
4. **Edge-case synthesis is the dominant accuracy lever** (spike finding #2). Under-
   biased generators silently lower detection; this needs continuous corpus-driven tuning.
5. **2026 best-practice reconciliation outstanding** (§0) — re-run web research before
   any external "state-of-the-art" claim.

---

## 8. Acceptance for the implementation that follows this note

- `code_health_verify_refactor` returns one of PASS / DIVERGENCE / UNVERIFIED with a
  minimised counterexample on DIVERGENCE and a named reason on UNVERIFIED.
- Synthesised characterization tests returned as a runnable artifact.
- Measured ≥ 80 % silent-break detection **and** ≤ 10 % FP on the 35-pair corpus,
  on real runs (TS/JS native + Python on Linux). Below bar → static-advisory-only.
- Every output names its tier; no output claims behavioural safety for static-only
  languages. typecheck + tests stay green.
