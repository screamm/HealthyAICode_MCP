<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Healthy AI Code contributors.
-->

# OCHS Submission Requirements Checklist

Maps each OpenSSF Sandbox and OWASP Incubator submission requirement to the OCHS artifact
that satisfies it, and flags items that are not yet satisfied.

Legend: ✅ Met | ⚠️ Partial | ❌ Not yet met | N/A Not applicable at this stage

---

## Part A — OpenSSF Sandbox Entry Requirements

Source: https://github.com/ossf/tac/blob/main/process/project-lifecycle.md (accessed 2026-06-02)

### A1. Mission Alignment

| Requirement | Status | Artifact / Note |
|-------------|--------|-----------------|
| Project is aligned with the OpenSSF mission (improving open source software security) | ✅ | Proposal §9: OCHS surfaces AI-specific supply-chain risks (HallucinatedPackageImport, SlopsquattingRisk), injection sinks (SqlInjectionRisk, XssRisk, CommandInjectionRisk), and credential exposure (HardcodedCredential, HardcodedApiKey) |
| Novel approach or unfulfilled need | ✅ | No existing open standard provides a formula-specified, AI-native, deterministic file health score with a loopComplete gate. Proposal §1 documents the three gaps. |

### A2. TAC or Working Group Sponsor

| Requirement | Status | Artifact / Note |
|-------------|--------|-----------------|
| One TAC sponsor OR one WG sponsor (if reporting to a WG) | ❌ | Not yet secured. Action: identify a TAC member or WG (likely Best Practices WG or Tooling WG) willing to sponsor. Required before filing the PR. |
| Sponsor agrees to attend project meetings regularly | ❌ | Follows from above. |

### A3. IP / License Due Diligence (for existing projects contributed to OpenSSF)

| Requirement | Status | Artifact / Note |
|-------------|--------|-----------------|
| Linux Foundation IP and license review | ⚠️ | License is MIT + CC BY 4.0 (spec) — both are LF-approved licenses. Formal LF review has not been initiated. Action: contact legal@openssf.org or submit through the TAC PR process which triggers review automatically. |
| All files have SPDX license headers | ⚠️ | `OCHS-v0.1.md` has SPDX header. `ochs-schema.json` has `$id` but no SPDX header. `conformance/` files have no SPDX headers. Action: add `SPDX-License-Identifier: MIT` to schema and corpus files before submission. |

### A4. Security Baseline — "Once Sandbox" Requirements

Source: https://baseline.openssf.org/ and https://github.com/ossf/tac/blob/main/process/security_baseline.md

| Requirement | Status | Artifact / Note |
|-------------|--------|-----------------|
| SECURITY.md exists in the repository | ❌ | Not present. Required. Action: create `SECURITY.md` using the OpenSSF project template. |
| Public vulnerability disclosure mechanism (email or tracker) | ❌ | No dedicated channel. Action: add GitHub Security Advisories and document in SECURITY.md. |
| Code review process documented | ⚠️ | CONTRIBUTING.md exists in the monorepo root but is not OCHS-spec specific. Action: ensure spec repo has CONTRIBUTING.md. |
| Maintainers list documented | ⚠️ | Currently implicit (single maintainer). Action: add `MAINTAINERS.md` listing current maintainer and org affiliation. |
| Basic CI / automated tests | ✅ | `packages/ochs-validate/tests/validate.test.ts` runs via vitest. The conformance corpus is machine-checkable. |
| License file present | ✅ | `LICENSE` (MIT) in repository root. |

### A5. Ongoing Sandbox Obligations

| Requirement | Status | Artifact / Note |
|-------------|--------|-----------------|
| Bi-annual updates to TAC on technical vision and progress | N/A | Obligation starts after sandbox entry. |
| Diversified contributor base (not single-vendor project) | ❌ | Currently single-maintainer. Not a blocker for Sandbox entry (only for Incubating). Must be addressed before applying for Incubating. |
| Follow security best practices per OpenSSF recommendations | ⚠️ | Partial — see A4. |

---

## Part B — OpenSSF Incubating Stage Requirements (future)

Included here as a planning reference. These are NOT required for sandbox entry.

| Requirement | Status | Artifact / Note |
|-------------|--------|-----------------|
| All sandbox requirements fulfilled | ⚠️ | See Part A gaps. |
| ≥ 3 maintainers, ≥ 2 different organisation affiliations | ❌ | 1 maintainer currently. Gap acknowledged in proposal §8.3. |
| Maintainer list publicly documented | ❌ | Follows from above. |
| Met at least 5 times (project meetings) within last calendar quarter | N/A | Clock starts after sandbox entry. |
| Contributor guide with path to maintainership | ⚠️ | Proposal §5.2 defines contributor ladder. Needs to be documented in `CONTRIBUTING.md` in the spec repo. |
| Silver OpenSSF Best Practices badge | ❌ | No badge yet. Not required for sandbox; required for incubating. |
| Minimum viable documentation for new contributors | ⚠️ | `ochs-validate/README.md` covers the validator. Spec itself is the primary doc. A "getting started for implementors" guide is missing. |

---

## Part C — OpenSSF Best Practices Badge — Passing Level

Source: https://www.bestpractices.dev/en/criteria/0 (accessed 2026-06-02)

Key passing-level criteria for the reference implementation / spec repo:

| Category | Criterion | Status | Note |
|----------|-----------|--------|------|
| Basics | Project website describes what it does | ✅ | README.md and OCHS-v0.1.md Abstract |
| Basics | Feedback/bug report mechanism documented | ⚠️ | GitHub Issues exists; not explicitly documented in README |
| Basics | Contribution guide | ⚠️ | Needs `CONTRIBUTING.md` in spec repo |
| Basics | License clearly documented | ✅ | MIT + CC BY 4.0 in spec header |
| Change control | At least one public version release | ✅ | OCHS v0.1 published 2026-06-01 |
| Change control | Version numbering scheme documented | ✅ | Appendix C of OCHS-v0.1.md |
| Reporting | Vulnerability reporting process | ❌ | SECURITY.md missing |
| Quality | Automated test suite | ✅ | vitest suite in ochs-validate; conformance corpus |
| Quality | At least one static analysis tool used | ✅ | TypeScript compiler (strict mode), ESLint via project toolchain |
| Security | No hardcoded credentials in code | ✅ | N/A for a spec; ochs-validate has no credentials |
| Security | Cryptographic functions from established libraries | N/A | ochs-validate does not perform cryptography |
| Security | Dependencies with known vulnerabilities managed | ⚠️ | pnpm audit not documented; action: add audit to CI |

---

## Part D — OWASP Incubator Submission Requirements

Source: https://owasp.org/www-committee-project/ and https://policy.owasp.org/operational/projects
(accessed 2026-06-02)

| Requirement | Status | Artifact / Note |
|-------------|--------|-----------------|
| Research existing OWASP projects for overlap | ✅ | No existing OWASP project defines a formula-specified file health score. Closest: OWASP Code Review Guide (methodology doc, not a score standard). |
| Project leader is an OWASP member or willing to join | ❌ | Action: davidrydgren@gmail.com must create an OWASP member account (free). |
| Submit via OWASP Contact Us form requesting a new project | ❌ | Not yet submitted. Action: https://owasp.org/contact/ |
| Project aligns with OWASP mission (application security) | ✅ | 8 of 55 biomarkers map to OWASP Top 10:2021 categories (proposal §10). |
| Project type declared (tool / standard / documentation / code) | ⚠️ | OCHS is a "standard" — closest OWASP type is "Documentation/Standard". Must be declared in submission. |
| Initial project artifacts exist | ✅ | Spec, schema, validator, conformance corpus. |
| OWASP Incubator projects are experimental by definition — no stability guarantee required | ✅ | v0.1 explicitly marked Draft. |

### OWASP Incubator → Lab Promotion (future)

Not required for initial submission. Documented for planning.

| Requirement | Status |
|-------------|--------|
| Stable release (v1.0.0 of spec with ≥ 2 implementations) | ❌ |
| Positive community reception (users, feedback) | ❌ |
| Open source development practices demonstrated | ⚠️ |
| Promotion requested via Google Form | N/A |

---

## Part E — Artifact Inventory

Complete map of OCHS artifacts as of 2026-06-02.

| Artifact | Path | License | Status |
|----------|------|---------|--------|
| Specification v0.1 | `docs/ochs/OCHS-v0.1.md` | MIT + CC BY 4.0 | Published |
| JSON schema | `docs/ochs/ochs-schema.json` | MIT | Published |
| Conformance corpus | `docs/ochs/conformance/corpus.json` | MIT | Published |
| Healthy fixtures (4 files) | `docs/ochs/conformance/healthy/` | MIT | Published |
| Unhealthy fixtures (4 files) | `docs/ochs/conformance/unhealthy/` | MIT | Published |
| Standalone validator CLI | `packages/ochs-validate/` | MIT | Published (npm: `ochs-validate`) |
| Reference implementation | `packages/core/` | MIT | Published (npm: `@healthy-ai-code/core`) |
| Python clean-room impl | `ochs-ref-py/` | MIT | In progress — NOT complete |
| Governance docs | `docs/ochs/governance/` | MIT | This directory |
| SECURITY.md | (repository root) | — | ❌ Missing — must be created |
| MAINTAINERS.md | (repository root or spec repo) | — | ❌ Missing — must be created |
| CONTRIBUTING.md (spec-specific) | (spec repo) | — | ❌ Missing — must be created |

---

## Part F — Gap Summary for Reviewer

Consolidated list of items a TAC or OWASP Project Committee reviewer will flag, in
priority order.

| # | Gap | Severity | Blocks Sandbox? | Blocks Incubating? |
|---|-----|----------|-----------------|-------------------|
| F1 | No TAC/WG sponsor identified | Critical | YES | YES |
| F2 | Single implementation only | Critical | No | YES |
| F3 | SECURITY.md missing | High | YES (Security Baseline) | YES |
| F4 | Single maintainer / single org | High | No | YES |
| F5 | No external adopters | High | No | No (but expected for Lab/Graduation) |
| F6 | SPDX headers incomplete | Medium | No | No (but LF IP review will flag) |
| F7 | No OpenSSF Best Practices badge | Medium | No | YES (Silver required) |
| F8 | MAINTAINERS.md missing | Medium | No (advisory) | YES |
| F9 | No pnpm audit in CI | Low | No | No |
| F10 | Java-only empirical calibration | Low | No | No (spec discloses it) |
