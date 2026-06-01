# EU AI Act Article 12: Record-Keeping — Mapping to `code_health_attest`

**Scope:** How the `code_health_attest` tool output maps to the logging obligations under Regulation (EU) 2024/1689
(EU AI Act) Article 12, and how it relates to AI-BOM/CycloneDX attestation artefacts.

**Audience:** Compliance officers, deployers of AI coding assistants, and engineers integrating this MCP server
into regulated software-development workflows.

**Honest framing from the outset:** `code_health_attest` output is *controls evidence* — a timestamped,
deterministic record of code health at a point in time. It is **not** a risk-prediction system, a
conformity-assessment body, or a substitute for the Annex IV technical documentation that providers must prepare
under Article 11. Claims in this document are scoped accordingly.

---

## 1. Regulatory Timeline (as of 1 June 2026)

| Date | Event | Source |
|---|---|---|
| 1 Aug 2024 | EU AI Act (Regulation 2024/1689) entered into force | [Official Journal L 2024/1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401689) |
| 2 Feb 2025 | Prohibited AI practices (Art. 5) applicable | [EU AI Act implementation timeline](https://artificialintelligenceact.eu/implementation-timeline/) |
| 2 Aug 2025 | GPAI model obligations (Chapter V) applicable; Codes of Practice required | [Implementation timeline](https://artificialintelligenceact.eu/implementation-timeline/) |
| **2 Aug 2026** | **High-risk AI system obligations (Chapter III, incl. Art. 12) fully applicable; enforcement begins** | [EU AI Act Service Desk timeline](https://ai-act-service-desk.ec.europa.eu/en/ai-act/timeline/timeline-implementation-eu-ai-act) |
| 2 Aug 2026 | Commission enforcement powers for GPAI providers activate (one-year adjustment period ends) | [Enforcement of Chapter V](https://artificialintelligenceact.eu/enforcement-of-chapter-v-under-the-eu-ai-act/) |
| 2 Aug 2027 | Pre-Aug-2025 GPAI models must comply; Art. 6(1) high-risk obligations activate | [Implementation timeline](https://artificialintelligenceact.eu/implementation-timeline/) |

The Digital Omnibus proposal (Nov 2025) offers a maximum 16-month extension (backstop: 2 Dec 2027) for Annex III
systems, conditional on harmonised standards being available. No harmonised standards have been cited in the
Official Journal as of Jun 2026.

---

## 2. Article 12 Text (Regulation 2024/1689)

The normative text is reproduced here for reference. Emphasis added.

> **Art. 12(1):** "High-risk AI systems shall **technically allow** for the **automatic recording** of events
> (logs) **over the lifetime** of the system."

> **Art. 12(2):** "The logging capabilities shall ensure a level of traceability of the AI system's functioning
> throughout its lifetime that is appropriate to the intended purpose of the system.
> In particular, the logging capabilities shall enable the monitoring of the operation of the high-risk AI system
> with respect to the occurrence of situations that may result in the AI system presenting a risk within the
> meaning of Article 79(1), and facilitate the post-market monitoring referred to in Article 72, and the
> monitoring of the operation of high-risk AI systems referred to in Article 26(5)."

> **Art. 12(3):** [Biometric identification systems only — prescribes minimum log fields for that specific
> Annex III point 1(a) system type. Not reproduced here; does not apply to code-health tooling.]

Source: [Article 12, artificialintelligenceact.eu](https://artificialintelligenceact.eu/article/12/)
and [AI Act Service Desk](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-12)

**Three mandatory properties derived from the text:**

| Property | Regulatory basis | What it requires |
|---|---|---|
| **Technically** | Art. 12(1) | Logging capability built into the system; manual export processes or human-periodic review do NOT satisfy the requirement |
| **Automatic** | Art. 12(1) | Events captured without operator intervention as they occur; scheduled or human-triggered captures are insufficient |
| **Lifetime** | Art. 12(1) | From initial deployment through decommissioning; logging must be active from day one |

Source: [FireTail — Article 12 and the Logging Mandate](https://www.firetail.ai/blog/article-12-and-the-logging-mandate-what-the-eu-ai-act-actually-requires)

---

## 3. Responsibility: Provider vs Deployer

Article 12 places the *capability* obligation on **providers** (those who place high-risk AI systems on the
market). Deployer obligations under **Art. 26(5)** require that the deployer ensures logs are generated,
retained, and accessible in analysis-suitable formats, and verifies that third-party AI systems comply.

In the context of an AI coding-assistant workflow:

| Actor | Role in context | Art. 12 obligation |
|---|---|---|
| **AI model vendor** (e.g. Anthropic, GitHub) | Provider of the AI system that generates code | Must build in technical logging capability |
| **Enterprise deploying the AI assistant** | Deployer | Must ensure logs are generated and retained; may not be able to satisfy Art. 26(5) if vendor doesn't expose them |
| **This MCP server (Healthy AI Code)** | Tooling layer that scores the *output* of the AI system | Not itself a high-risk AI system under Annex III; its `code_health_attest` output can serve as **controls evidence** in the deployer's compliance dossier |

**Honest scope limitation:** This MCP server is not classified as a high-risk AI system under Annex III
(it performs static code analysis, not decisions affecting individuals' rights or safety). It therefore has **no
direct Art. 12 obligation**. Its value is as a supplemental logging mechanism for deployers who need to
demonstrate oversight of AI-generated code entering their codebase.

---

## 4. What `code_health_attest` Outputs (planned tool, target: before 2 Aug 2026)

`code_health_attest` is the MCP tool that produces a signed attestation record for a file at analysis time.
Its planned output schema:

```jsonc
{
  "schemaVersion": "1.0",
  "timestamp": "2026-07-15T10:22:34.123Z",        // ISO 8601 UTC — Art. 12 "event time"
  "toolName": "@healthy-ai-code/mcp-server",
  "toolVersion": "x.y.z",                          // pinned semver
  "toolHash": "sha256:...",                         // SHA-256 of the installed package
  "filePath": "/repo/src/auth/login.ts",
  "fileHash": "sha256:...",                         // SHA-256 of file content at analysis time
  "language": "typescript",
  "score": 8.4,
  "thresholdPassed": false,                         // score >= AI_READY_THRESHOLD (9.5)
  "smells": [
    { "type": "ComplexMethod", "line": 42, "weight": 1.5 }
  ],
  "scoringFormula": "10 - sum(weight * sqrt(count)) ; floor 1.0",
  "thresholds": {
    "aiReady": 9.5,
    "healthy": 9.0,
    "problematic": 6.0
  },
  "signature": "..."                                // HMAC-SHA256 over canonical JSON, key from env
}
```

**Retention:** Callers are responsible for persisting attestation records. The tool emits; it does not store.
The 6-month minimum retention required under Art. 26(6) must be implemented in the calling pipeline
(CI/CD log, append-only store, SIEM).

---

## 5. Requirement-to-Field Mapping Table

This table maps each normative Art. 12 / Art. 26(5) logging requirement to the corresponding
`code_health_attest` output field. The "evidence class" column distinguishes between what the field
*directly proves* vs. what it supports.

| # | Regulatory requirement | Source | `code_health_attest` field(s) | Evidence class | Gap / limitation |
|---|---|---|---|---|---|
| 1 | Events recorded **automatically** (not manually triggered) | Art. 12(1) | Tool is invoked by CI hook or PreToolUse hook — not by a human operator | Controls evidence (process) | Integrator must configure automatic invocation; the tool alone does not enforce this |
| 2 | Recording over the **lifetime** of the system | Art. 12(1) | `timestamp` (ISO 8601 UTC per event); tool is stateless — record-per-invocation pattern | Controls evidence (temporal) | Long-term retention must be handled outside the tool (6-month minimum per Art. 26(6)) |
| 3 | **Identity** of the AI system being monitored | Art. 12(2) | `toolName`, `toolVersion`, `toolHash` | Controls evidence (system identity) | Identifies the *scorer*, not the AI model that generated the code; AI model identity must come from a separate log (model card, API response header) |
| 4 | **Input data** traceability | Art. 12(2), Art. 26(5) | `filePath`, `fileHash` (SHA-256 of content at analysis time) | Controls evidence (input traceability) | Only hashes the file, not the AI prompt or the generative model's version; full input traceability requires upstream logging by the AI provider |
| 5 | **Output / decision** record | Art. 12(2) | `score`, `thresholdPassed`, `smells[]` | Controls evidence (output record) | Score is a deterministic quality metric, not a decision affecting a natural person; not "high-risk" in the Art. 3(1) sense |
| 6 | **Risk identification** traceability (situations presenting risk per Art. 79(1)) | Art. 12(2) | `smells[]` with `type` and `weight`; `thresholdPassed: false` where score < 9.5 | Controls evidence (risk signal) | Identifies structural code risk (complexity, injection patterns, credential exposure); does NOT predict logical bugs or runtime failures — AUROC 0.495 against Defects4J (chance-level); do not represent as a bug-risk predictor |
| 7 | **Post-market monitoring** support (Art. 72) | Art. 12(2) | `timestamp` + `fileHash` enable delta-series; time-series of scores over versions supports trend analysis | Controls evidence (monitoring support) | Only meaningful if records are persisted and queried longitudinally; the tool produces point-in-time snapshots |
| 8 | **Deployer monitoring** (Art. 26(5)) | Art. 26(5) | Full JSON blob constitutes a machine-readable audit record importable into SIEM / compliance tooling | Controls evidence (audit record) | Deployer must implement the retention store, access controls, and immutability layer |
| 9 | **Tamper-evidence** | Art. 12(2) (implicit — "appropriate traceability") | `signature` (HMAC-SHA256 over canonical JSON); `fileHash` detects content changes post-attestation | Controls evidence (integrity) | HMAC key management is the integrator's responsibility; a lost or rotated key breaks verification chain |
| 10 | **Transparency to deployer** (Art. 13) | Art. 13 | `scoringFormula`, `thresholds` — formula is fully disclosed in every record | Controls evidence (transparency) | Does not cover AI model internals (black-box LLM); only covers the health-scoring layer |
| 11 | **Retention period** ≥ 6 months | Art. 26(6) | Not handled by the tool — tool emits, caller retains | Gap | Caller must persist records to durable storage with ≥ 6-month TTL |
| 12 | **Human oversight** events (Art. 14) | Art. 14(5) | Not captured — the tool has no concept of "human reviewed and overrode" | Gap | Integrators who want to log human override events must add a separate field when calling the tool or augment the record |

**Summary of gaps:** The tool covers rows 1–10 under the "controls evidence" class. Rows 11–12 are
**not covered** and must be addressed by the deployer's integration layer. No field in this tool constitutes
a *conformity assessment* under Art. 43 — that requires a notified body.

---

## 6. What "Controls Evidence" Means (vs. Risk Prediction)

A recurring theme in EU AI Act compliance practice is the distinction between:

- **Controls evidence:** a record that a control was applied at a specified time with a specified outcome.
  This is what `code_health_attest` produces.
- **Risk prediction:** a claim that the AI system poses a quantified probability of harm to natural persons.
  This is what Annex III risk-category assessment and conformity assessment under Art. 43 produce.

`code_health_attest` output is exclusively in the first category. Deployers must **not** present it as
evidence that code is "safe", "correct", or "compliant" in the Art. 43 sense. Correct framing:

> "Our CI pipeline invokes `code_health_attest` on every AI-generated code change. Records are retained for
> 12 months in our append-only audit log. A `thresholdPassed: true` result (score ≥ 9.5) indicates the file
> met our internal maintainability gate at time of merge. This is a process control, not a safety guarantee."

This framing is consistent with the guidance in [isms.online's Art. 12 analysis](https://www.isms.online/iso-42001/eu-ai-act/article-12/)
that "retroactive bulk logging or 'stitching' after the fact is explicitly insufficient" and that logging
must occur "as it happens."

---

## 7. AI-BOM / CycloneDX Integration

### 7.1 Where `code_health_attest` fits in a CycloneDX BOM

CycloneDX 1.7 (ECMA-424, published 10 Dec 2025) supports a `machine-learning-model` component type and
a `declarations` section for conformance attestations. Source:
[CycloneDX Specification Overview](https://cyclonedx.org/specification/overview/)

`code_health_attest` output maps to two places in a CycloneDX ML-BOM document:

**A. As a component property on the tool itself:**

```json
{
  "type": "machine-learning-model",
  "name": "@healthy-ai-code/mcp-server",
  "version": "x.y.z",
  "properties": [
    { "name": "healthy-ai-code:lastAttestScore", "value": "8.4" },
    { "name": "healthy-ai-code:thresholdPassed", "value": "false" },
    { "name": "healthy-ai-code:attestTimestamp", "value": "2026-07-15T10:22:34Z" },
    { "name": "healthy-ai-code:fileHash", "value": "sha256:..." }
  ]
}
```

**B. As an attestation / evidence block in `declarations`:**

```json
{
  "declarations": {
    "attestations": [
      {
        "summary": "Code health gate passed at AI_READY_THRESHOLD 9.5",
        "assessor": { "organization": { "name": "Deployer CI pipeline" } },
        "map": [
          {
            "requirement": { "text": "EU AI Act Art. 12 — automatic event logging" },
            "claims": [ { "text": "code_health_attest invoked automatically by PreToolUse hook" } ],
            "evidence": [
              {
                "description": "Attestation record JSON with timestamp, fileHash, score, smells",
                "data": "eyJ0aW1lc3RhbXAiOiAiMjAyNi0wNy0xNVQxMDoyMjozNCJ9..."
              }
            ]
          }
        ]
      }
    ]
  }
}
```

The `declarations` structure and `attestations` array are part of the CycloneDX 1.6+ specification.
Source: [CycloneDX Specification Overview](https://cyclonedx.org/specification/overview/)

### 7.2 What an AI-BOM for the overall workflow should contain

Per EU AI Act Art. 11 + Annex IV, and the CycloneDX ML-BOM field set documented in
[agentmodeai.com — AI-BOM 2026](https://agentmodeai.com/ai-bill-of-materials-supply-chain-disclosure/),
a deployer operating an AI coding assistant workflow needs a BOM that includes:

| BOM section | Source of data | Covered by `code_health_attest`? |
|---|---|---|
| AI model name and version | API response header / model card | No — upstream |
| Training-data provenance | Model provider's model card | No — upstream |
| Evaluation datasets | Model provider's documentation | No — upstream |
| Inference-time guardrails (system prompt) | Deployer's configuration | No |
| Fine-tuning layers | Model provider | No — upstream |
| Third-party library dependencies of the tool | `package.json` / SBOM | Partial — version in `toolVersion` |
| **Code health score at merge** | `code_health_attest` | **Yes** |
| **Smell types and weights** | `code_health_attest` | **Yes** |
| **Threshold gate result** | `code_health_attest` | **Yes** |
| Human-review override events | Deployer audit log | No — gap identified in §5 row 12 |

`code_health_attest` covers the last three rows and is the only field in this BOM that is generated
*automatically* by an open, deterministic formula. The upstream rows depend on the AI provider.

### 7.3 SARIF export

The existing `auditSecurity` / `formatAsSarif` export in `packages/core/src/security/index` already
produces SARIF 2.1.0 output. The `code_health_attest` attestation record can be embedded in SARIF as a
`run.properties` extension or included as a separate SARIF run alongside the security findings. This allows
integration into GitHub Advanced Security, Azure DevOps, and any SARIF-aware SIEM.

---

## 8. Integration Checklist for Deployers

The following steps are necessary to satisfy Art. 12 / Art. 26(5) using `code_health_attest`. Steps marked
**[tool]** are handled by the MCP tool; steps marked **[integrator]** must be implemented by the deployer.

- **[tool]** Attestation record is produced with timestamp, fileHash, score, smells, toolVersion, toolHash.
- **[tool]** `signature` field provides tamper-evident HMAC-SHA256 over the canonical JSON.
- **[tool]** `scoringFormula` and `thresholds` are disclosed in every record (Art. 13 transparency).
- **[integrator]** Configure automatic invocation via Claude Code `PreToolUse` hook or CI step — not manual.
- **[integrator]** Persist records to durable append-only storage (e.g., CloudWatch, Azure Monitor, S3 + Object Lock).
- **[integrator]** Enforce 6-month minimum retention (Art. 26(6)); 12 months recommended for M&A and insurance.
- **[integrator]** Protect log integrity: independent security from the system being logged, access controls.
- **[integrator]** Add a human-override field when a reviewer approves code that did not pass the gate.
- **[integrator]** Emit AI model identity (model name, version, API call ID) alongside the attestation record.
- **[integrator]** Include attestation records in your Annex IV technical documentation package.

---

## 9. What This Tool Cannot Claim

To prevent compliance misrepresentation, the following claims are out of scope:

| Claim | Reason it is out of scope |
|---|---|
| "This tool provides Art. 43 conformity assessment" | Conformity assessment requires a notified body or self-assessment under Annex VI; this is a CI tool |
| "A score of 9.5+ means the code is safe" | Safety in the Art. 3(1) sense concerns harm to natural persons; code health measures maintainability |
| "This tool predicts runtime bugs" | AUROC 0.495 against Defects4J (chance-level); do not use for bug-risk claims |
| "This satisfies Art. 12 by itself" | Art. 12 requires the AI system itself to log; this tool logs the score of the system's *output* |
| "Validated across all 46 supported languages" | Empirical calibration is complete only for Java (Defects4J + MLCQ); other languages are unvalidated against external labels |

---

## 10. Source References

All URLs verified 1 June 2026.

- Regulation (EU) 2024/1689 (EU AI Act) — Official Journal: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=OJ:L_202401689
- Article 12 full text — artificialintelligenceact.eu: https://artificialintelligenceact.eu/article/12/
- Article 12 — AI Act Service Desk (official EC): https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-12
- Implementation timeline — artificialintelligenceact.eu: https://artificialintelligenceact.eu/implementation-timeline/
- Implementation timeline — AI Act Service Desk: https://ai-act-service-desk.ec.europa.eu/en/ai-act/timeline/timeline-implementation-eu-ai-act
- Enforcement of Chapter V (GPAI): https://artificialintelligenceact.eu/enforcement-of-chapter-v-under-the-eu-ai-act/
- Article 11 technical documentation: https://artificialintelligenceact.eu/article/11/
- Annex IV technical documentation: https://artificialintelligenceact.eu/annex/4/
- FireTail — Article 12 logging mandate analysis: https://www.firetail.ai/blog/article-12-and-the-logging-mandate-what-the-eu-ai-act-actually-requires
- isms.online — Art. 12 implementation guide: https://www.isms.online/iso-42001/eu-ai-act/article-12/
- TrueScreen — Art. 12 record-keeping requirements: https://truescreen.io/insights/ai-act-record-keeping-requirements/
- CycloneDX Specification Overview (v1.7): https://cyclonedx.org/specification/overview/
- CycloneDX v1.6 JSON Reference: https://cyclonedx.org/docs/1.6/json/
- CycloneDX GitHub repository: https://github.com/cyclonedx/specification
- agentmodeai.com — AI-BOM procurement 2026: https://agentmodeai.com/ai-bill-of-materials-supply-chain-disclosure/
- GPAI guidelines — European Commission: https://digital-strategy.ec.europa.eu/en/policies/guidelines-gpai-providers

---

*This document was authored 1 June 2026. Regulatory text is accurate as of that date. Harmonised standards
for Art. 11/12 had not yet been published in the Official Journal; check for updates at
https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai*
