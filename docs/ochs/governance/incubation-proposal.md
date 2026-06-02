<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Healthy AI Code contributors.
Documentation text additionally licensed under CC BY 4.0.
-->

# Open Code Health Score (OCHS) — Incubation Proposal

**Submitted to:** OpenSSF TAC (primary target), OWASP Project Committee (parallel track)
**Date:** 2026-06-02
**Spec version:** OCHS v0.1
**Repository:** https://github.com/screamm/Healthy-AI-Code-MCP
**Contact:** davidrydgren@gmail.com

---

## 1. Problem Statement

AI-assisted code generation (GitHub Copilot, Claude, GPT-4, Cursor, etc.) is now the
dominant mode of software production in many teams. Adoption is fast; quality assurance
tooling is not keeping up. Three specific gaps:

1. **No common vocabulary.** Static analysis tools (SonarQube, lizard, PMD, CodeClimate,
   Semgrep) each produce proprietary scores or metric dumps. A CI pipeline that uses two
   tools produces two different numbers for the "same" quality concept. There is no
   portable, unambiguous "file health score" that any CI tool, IDE plug-in, or LLM loop
   can produce and interpret consistently.

2. **No AI-native signal.** Existing tools were designed for human-written code. They do
   not detect LLM-specific failure modes: hallucinated package imports (`HallucinatedPackageImport`),
   slopsquatting supply-chain risk (`SlopsquattingRisk`), LLM-attributed self-admitted
   technical debt (`AiAttributedSATD`), structural erosion (`ComplexityMassConcentration`),
   or LLM-integration anti-patterns (`LlmUnpinnedModel`, `LlmNoSystemMessage`, etc.).

3. **No machine-readable agentic gate.** Autonomous AI refactoring loops need a deterministic,
   boolean signal ("is this file ready for autonomous modification?"). No existing open
   standard provides the `loopComplete` field and its formula-derived threshold (≥ 9.5, or
   ≥ 9.7 when `AiAttributedSATD` is present).

OCHS addresses all three gaps with a single, open, formula-specified, reproducible score.

---

## 2. Proposed Solution

**Open Code Health Score (OCHS)** is a vendor-neutral specification for a deterministic
1–10 numeric health score for a source-code file, computed from a weighted penalty formula
applied to 55 defined biomarkers (code smells and structural findings).

**Core properties:**
- Deterministic: same source text + same OCHS version → identical score across implementations.
- Formula-specified: `score = max(1.0, 10 − Σ(weight_i × sqrt(count_i)))`.  All 55
  weights are published in the spec.
- File-local and synchronous: no network access required; no project-level context required
  for the basic score (temporal/git biomarkers are an optional addendum).
- AI-native: 14 of 55 biomarkers target AI-generated code failure modes specifically.
- ISO/IEC 25010:2023 mapped: every biomarker maps to at least one quality sub-characteristic.

**What OCHS is NOT:**
- Not a linter (it does not emit fix suggestions).
- Not a bug oracle (Appendix A.2 of the spec documents near-chance AUROC on Defects4J).
- Not a replacement for security scanners (it surfaces taint-like patterns; it is not a SAST).

---

## 3. Why a Neutral Standard, Not a Proprietary Format

History of comparable standards (CVSS for vulnerabilities, SBOM/CycloneDX for dependencies,
SARIF for static analysis results) shows that interoperability requires a specification that:

- Is not controlled by a single vendor.
- Has a governance structure that accepts contributions from competing implementors.
- Is tested via conformance suites that any implementor can run.

OCHS was designed with this in mind from the start: the spec, schema, and conformance corpus
are under MIT/CC BY 4.0; the validator (`ochs-validate`) has zero runtime dependency on the
reference implementation.

The weakness — honestly stated — is that as of June 2026 there is only one production
implementation (`@healthy-ai-code/core`). A second clean-room implementation is in progress.
Until multiple independent implementations exist and pass the conformance suite, OCHS remains
"a proprietary format with a friendly name." Incubation with a neutral foundation is the
mechanism to fix that, by attracting second and third implementors under a trust umbrella.

---

## 4. Scope

**In scope for OCHS v0.1:**
- Scoring formula, floor, and version-string requirements.
- Catalogue of 55 biomarkers with weights, detection triggers, and severity ranges.
- ISO/IEC 25010 sub-characteristic mappings.
- Conformance requirements (MUST/SHOULD/MAY).
- Language coverage tiers (A/B/C) — documented as reference guidance, not mandated.
- JSON schema for score objects.
- Conformance test corpus (fixture files + expected scores).

**Out of scope for v0.1:**
- Aggregated project-level scores (beyond what a tool may derive from file scores).
- Remediation suggestions or auto-fix formats.
- IDE integration protocols.
- Temporal/git biomarkers as mandatory (they are defined but optional in v0.1).

---

## 5. Governance Model

OCHS governance is modelled after OpenVEX / Sigstore — a lightweight meritocracy with a
small steering committee and public specification evolution.

### 5.1 Specification Ownership

The OCHS specification lives in a dedicated repository (proposed: `openssf/ochs-spec` or
`OWASP/www-project-ochs`). The repo contains:
- The versioned spec document (`OCHS-v0.1.md`, `OCHS-v0.2.md`, ...).
- The canonical JSON schema (`ochs-schema.json`).
- The conformance test corpus (`conformance/`).
- This governance documentation.

### 5.2 Steering Committee

Initial steering committee: 3–5 seats, at least 3 different organisational affiliations.

**Current maintainer:** David Rydgren (screamm) — Healthy AI Code project.

**Open seats required before incubation graduation:** 2 additional maintainers from
different organisations. This is an explicit gap to disclose (see Section 8).

Steering committee decisions:
- Biomarker additions or weight changes → require a public proposal + 60-day comment period.
- Version bumps → majority vote.
- Removal of biomarkers → supermajority (4/5).

### 5.3 Versioning Policy

```
Patch (v0.1.x): bug fixes, clarifications; no weight or formula change.
Minor (v0.x.0): new biomarkers; existing weights unchanged; scores can only decrease.
Major (v1.0.0): weight changes, formula changes, or removals; scores not comparable across major.
```

All implementations MUST include the full version string (e.g., `ochs:0.1`) in scored
output.

### 5.4 Conformance Programme

A tool claiming OCHS vX.Y conformance must:
1. Pass all fixtures in the public conformance corpus for that version.
2. Publish results of running the conformance corpus (self-attested, until a formal registry exists).

The `ochs-validate` CLI provides the test harness. The conformance corpus is versioned
alongside the spec.

### 5.5 IP Policy

- Specification text: MIT + CC BY 4.0.
- JSON schema: MIT.
- Conformance corpus (fixture files): MIT.
- Reference implementation (`@healthy-ai-code/core`): MIT (separate repo/package; not
  required for conformance).
- Contributor License Agreement: DCO (Developer Certificate of Origin) sign-off on all
  spec changes; no CLA required.

---

## 6. Maintainership

### Current maintainers

| Name | GitHub | Org | Role |
|------|--------|-----|------|
| David Rydgren | @screamm | Independent | Spec author, reference impl |

### Contributor ladder

1. **Contributor** — merged spec PR or conformance test.
2. **Reviewer** — regular reviewer of PRs, nominated by existing Reviewers.
3. **Maintainer** — steering committee seat, voting rights on spec changes; requires ≥ 3
   significant contributions + nomination + 2/3 vote of current maintainers.
4. **Emeritus** — inactive maintainer; retained for attribution.

---

## 7. Licensing

| Artifact | License |
|----------|---------|
| Specification document (`OCHS-v*.md`) | MIT + CC BY 4.0 |
| JSON schema (`ochs-schema.json`) | MIT |
| Conformance corpus | MIT |
| `ochs-validate` package | MIT |
| Reference implementation (`@healthy-ai-code/core`) | MIT |

All spec artifacts will undergo Linux Foundation IP/license due diligence as part of
OpenSSF sandbox entry (required by the TAC lifecycle process).

---

## 8. Honest Assessment of Current State

This section documents gaps that reviewers at OpenSSF TAC or OWASP will rightly flag.
It is included because we believe honest disclosure at submission time is more useful
than discovering gaps during review.

### 8.1 Single-implementation risk (CRITICAL gap)

OCHS has one production implementation (`@healthy-ai-code/core`). A second clean-room
implementation (Python, `ochs-ref-py/` in the monorepo) is in active development as of
June 2026 but is not complete. Until two independent implementations pass the conformance
corpus, OCHS cannot credibly claim standard status.

**Mitigation plan:** Complete `ochs-ref-py` and publish conformance results before or
shortly after sandbox submission. Solicit a third implementation from the community
(target: one tool author or academic researcher) within 12 months of sandbox entry.

### 8.2 No external adopters yet (HIGH gap)

No production tool outside the Healthy AI Code project has adopted OCHS as of this
writing. "Standard" requires adoption.

**Mitigation plan:** Publish OCHS to npm (`ochs-validate`) and PyPI (`ochs-validate`).
Reach out to CodeClimate, Codacy, or DeepSource developer relations. Blog post targeting
the OpenSSF community. Target: ≥ 2 external adopters within 12 months.

### 8.3 Single-maintainer governance (HIGH gap)

OpenSSF Incubating stage requires ≥ 3 maintainers from ≥ 2 organisations. We currently
have 1.

**Mitigation plan:** Identify and onboard 2 additional maintainers as part of the sandbox
period. This is a prerequisite for Incubating stage graduation, not sandbox entry.

### 8.4 No formal security policy (MEDIUM gap)

No `SECURITY.md` exists in the repository. Required for OpenSSF Best Practices Passing badge.

**Mitigation plan:** Add `SECURITY.md` with vulnerability reporting process before submission.
Template available at https://github.com/ossf/project-template.

### 8.5 Empirical validation scope is Java-only (MEDIUM gap)

AUROC 0.688 on MLCQ dataset (Java). No labelled validation data for Python, TypeScript,
or other languages. Weight calibration for non-Java languages is not empirically verified.

**Mitigation plan:** Document this gap explicitly in the spec (already done in Appendix A.5).
Plan Python/TypeScript validation using open datasets. Does not block sandbox entry but
is a known limitation.

### 8.6 No OpenSSF Best Practices badge yet (MEDIUM gap)

The `@healthy-ai-code/core` reference implementation does not yet hold an OpenSSF Best
Practices passing badge. Sandbox entry requires meeting "Security Baseline - Once Sandbox"
requirements; Incubating requires a Silver badge.

**Mitigation plan:** Register at bestpractices.dev and work toward passing badge during
sandbox period.

---

## 9. Alignment with OpenSSF Mission

OpenSSF's mission is to improve the security of open source software. OCHS contributes by:

1. **Making AI-generated code auditable.** AI-generated code introduces new security risk
   patterns (hallucinated packages, hardcoded credentials, injection sinks) that OCHS
   detects and scores, creating an auditable health record for CI pipelines.

2. **Lowering the floor for security tooling.** A simple, formula-specified score is
   easier for small projects to integrate than full SAST suites. OCHS is designed to run
   in under 100ms per file with zero network access.

3. **Interoperability.** OCHS outputs are valid SARIF-compatible through the `formatAsSarif`
   function in the reference implementation. The JSON schema enables downstream consumption
   by any tool that can read JSON.

4. **Honest empirical grounding.** The spec publishes validation results (including
   near-chance bug prediction) rather than marketing claims.

---

## 10. Alignment with OWASP Mission

OWASP focuses on application security education and tooling. OCHS aligns with OWASP by:

1. **Mapping to OWASP Top 10 patterns.** Biomarkers `SqlInjectionRisk` (A03),
   `XssRisk` (A03), `HardcodedCredential` (A02), `CommandInjectionRisk` (A03),
   `PathTraversalRisk` (A01), `UnsafeDeserialization` (A08), `DependencyVulnerability`
   (A06), and `CryptographicMisuseRisk` (A02) map directly to OWASP Top 10:2021 categories.

2. **AI-specific security focus.** `SlopsquattingRisk` and `HallucinatedPackageImport`
   address AI supply-chain threats that are not yet covered by existing OWASP tools.

3. **Open educational resource.** The biomarker catalogue with detection triggers and
   severity ranges serves as an educational reference for what to avoid in AI-assisted
   code.

OWASP is a complementary submission target. The specification can live under either or
both foundations with appropriate cross-references.

---

## 11. Resources

| Artifact | Location |
|----------|----------|
| Specification v0.1 | `docs/ochs/OCHS-v0.1.md` |
| JSON schema | `docs/ochs/ochs-schema.json` |
| Conformance corpus | `docs/ochs/conformance/corpus.json` |
| Standalone validator | `packages/ochs-validate/` |
| Reference implementation | `packages/core/` |
| Python clean-room impl (WIP) | `ochs-ref-py/` |
| Roadmap | `claudedocs/2026-06-01-path-to-world-best.md` |

---

## 12. Roadmap (12-month outlook)

| Milestone | Target |
|-----------|--------|
| `ochs-ref-py` passes full conformance corpus | Q3 2026 |
| OpenSSF Best Practices Passing badge | Q3 2026 |
| ≥ 2 external adopters documented | Q4 2026 |
| Second maintainer onboarded | Q4 2026 |
| OCHS v0.2 (Python/TS validation data, possible weight recalibration) | Q1 2027 |
| Incubating stage application (if sandbox entered in Q3 2026) | Q1 2027 |

---

*End of proposal.*
