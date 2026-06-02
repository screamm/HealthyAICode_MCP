<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Healthy AI Code contributors.
-->

# OCHS Submission Steps

Exact instructions for submitting OCHS to OpenSSF (primary) and OWASP (parallel track).
Execute in the order shown. Items marked [PREREQ] must be done before filing the actual
submission.

---

## Track 1 — OpenSSF Sandbox

### Step 1 — Fix blocking gaps [PREREQ, ~1–2 days]

Do all of these before filing the PR:

**1a. Create SECURITY.md**

File: `SECURITY.md` in the repository root (or spec repo root if split).

Minimum content:
```
# Security Policy

## Supported Versions
| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability
Please report security vulnerabilities by emailing davidrydgren@gmail.com.
Do NOT open a public GitHub issue for security vulnerabilities.
We will acknowledge receipt within 48 hours and aim to resolve within 90 days.
```

**1b. Create MAINTAINERS.md**

File: `MAINTAINERS.md` in the repository root.

Minimum content:
```
# OCHS Maintainers

| Name | GitHub | Organisation | Role |
|------|--------|-------------|------|
| David Rydgren | @screamm | Independent | Spec author / maintainer |
```

**1c. Add SPDX headers to schema and corpus files**

Add `<!-- SPDX-License-Identifier: MIT -->` as first line of `ochs-schema.json` is not
possible (JSON). Instead, add a `"license"` field to the JSON schema root object:
```json
"license": "MIT",
"spdxLicenseIdentifier": "MIT"
```
For corpus.json (JSON), add same fields. For fixture `.ts/.py/.java/.go` files, add
`// SPDX-License-Identifier: MIT` comment at line 1.

**1d. Find a TAC or WG sponsor**

The OpenSSF TAC requires one sponsor before a project PR is filed. Options:

- Post to the OpenSSF Slack workspace (#tac channel or the Best Practices WG channel):
  https://openssf.slack.com — describe OCHS in 2–3 sentences, link the spec, and ask
  if any TAC member would be willing to sponsor.
- Attend an OpenSSF TAC meeting (held bi-weekly; agenda at
  https://github.com/ossf/tac/tree/main/meetings) and present OCHS informally to
  identify a sponsor.
- Reach out directly to TAC members whose WGs are most relevant (Best Practices WG,
  Tooling WG): https://github.com/ossf/tac#tac-members

Without a sponsor, the PR will not be merged. This step typically takes 2–6 weeks.

---

### Step 2 — Register for OpenSSF Best Practices Badge [PREREQ, ~1 week]

URL: https://www.bestpractices.dev/en/projects/new

1. Sign in with GitHub.
2. Enter the repository URL.
3. Work through the criteria checklist. Most passing-level criteria are already met
   (see requirements-checklist.md Part C). The two blocking gaps are SECURITY.md
   (done in Step 1a) and the vulnerability reporting documentation.
4. Aim for the Passing badge before filing the sandbox PR. Sandbox does not require
   the badge, but reviewers will ask about it.

---

### Step 3 — Prepare the sandbox PR [1–2 days]

The OpenSSF TAC requires a PR to their repository with a lifecycle document.

**3a. Fork the TAC repository**

URL: https://github.com/ossf/tac

```bash
git clone https://github.com/<your-fork>/tac.git
cd tac
git checkout -b ochs-sandbox-application
```

**3b. Create the lifecycle document**

File to create: `process/project-lifecycle-documents/ochs_sandbox_stage.md`

Use an existing sandbox application as a template. Good reference examples:
- `process/project-lifecycle-documents/protobom_sandbox_stage.md`
- `process/project-lifecycle-documents/openvex_for_sandbox_stage.md`

The document must answer all questions in the sandbox stage template. The
`incubation-proposal.md` in this directory contains all the content needed;
adapt it to the TAC template format.

Required sections (from OpenSSF template):
1. Project name and description
2. Alignment with OpenSSF mission
3. Is this an existing project? (Yes — provide repo URL)
4. License (MIT — LF-approved)
5. Sponsor (TAC member name — secured in Step 1d)
6. Existing resources (repo, spec, schema, validator, conformance corpus)
7. Current maintainers with org affiliations
8. Roadmap

**3c. Open the PR**

Title format (from existing examples): `[Sandbox] OCHS - Open Code Health Score`

PR body should include:
- Link to the spec document
- Link to the validator on npm
- Brief explanation of the problem OCHS solves
- Explicit acknowledgment of known gaps (single implementation, single maintainer)
- Your TAC sponsor's GitHub handle

**3d. Trigger LF IP review**

After the PR is filed, comment to request the Linux Foundation IP review:
`@ossf/tac-members — requesting LF IP/license review for this contribution.`
The review is initiated by LF staff who monitor the TAC repository.

---

### Step 4 — Respond to TAC review (~4–8 weeks after PR)

The TAC typically reviews sandbox applications in a public meeting. You may be asked to
present OCHS (10–15 minutes) at a TAC meeting. Monitor the PR for review comments
and respond promptly.

Common review questions to anticipate:
- "How does OCHS differ from OpenSSF Scorecard?" (Scorecard measures project security
  practices; OCHS measures per-file code health. Complementary, not competing.)
- "Only one implementation — is this really a standard?" (Acknowledge gap; describe
  ochs-ref-py in progress and the conformance harness as the mechanism for verification.)
- "What is the adoption plan?" (npm package, blog posts, outreach to tooling authors.)

---

### Step 5 — Post-sandbox obligations (ongoing)

After sandbox entry:
- Bi-annual updates to the TAC (GitHub issue in ossf/tac labelled "project update").
- Continue working toward Silver OpenSSF Best Practices badge (required for Incubating).
- Onboard at least 2 additional maintainers from different organisations.
- Document project meetings (even if async, use GitHub Discussions with meeting labels).

---

## Track 2 — OWASP Incubator

OWASP is a lower-barrier, faster entry than OpenSSF. Run in parallel.

### Step 1 — Create an OWASP membership account [PREREQ, ~10 min]

URL: https://owasp.org/membership/

Individual membership is free. Required to submit a project.

### Step 2 — Research existing OWASP projects [PREREQ, ~30 min]

URL: https://owasp.org/projects/

Confirm no existing OWASP project covers formula-specified file health scoring for
AI-generated code. As of June 2026:
- OWASP Code Review Guide: methodology document, not a score standard.
- OWASP Application Security Verification Standard (ASVS): verification standard for
  applications, not per-file code metrics.
- No conflict found.

### Step 3 — Submit via OWASP Contact Us [PREREQ]

URL: https://owasp.org/contact/ or the new project request form linked from
https://owasp.org/www-staff/procedures/projects

Subject: "New OWASP Project Request — Open Code Health Score (OCHS)"

Body should include:
- Your name and OWASP member email
- Project name: "OWASP Open Code Health Score" (or "OWASP OCHS")
- Project type: Standard / Documentation
- One-paragraph description (use Abstract from OCHS-v0.1.md)
- Link to existing repository
- Confirmation that you have reviewed existing OWASP projects for overlap

### Step 4 — OWASP staff creates project infrastructure (~2–4 weeks)

OWASP staff will:
- Create an OWASP email address (optional, you can decline)
- Create a GitHub repository under `OWASP/www-project-ochs` (or similar)
- Add you as project leader
- List the project on https://owasp.org/projects/ as Incubator

You will need to populate the repository with:
- `index.md` (OWASP project page template — see any existing project for format)
- Link to the canonical spec at https://github.com/screamm/Healthy-AI-Code-MCP
- Tab links for spec, schema, validator

### Step 5 — OWASP Incubator to Lab promotion (future, ~12–18 months)

When OCHS has:
- A stable v1.0 spec release
- ≥ 2 independent implementations
- Demonstrated community adoption

Submit promotion request via: https://forms.gle/Gh2Ry3vUjahu73S3A
Expected review time: 4–8 weeks.

---

## Track 3 — Pre-submission actions independent of target foundation

These improve submission quality and should be done regardless of which track is filed first.

| Action | Owner | Target date |
|--------|-------|-------------|
| Publish `ochs-validate` to npm (public) | @screamm | Before sandbox PR |
| Write "implementors guide" (how to build an OCHS-conformant tool from the spec alone) | @screamm | Before sandbox PR |
| Complete ochs-ref-py and run conformance corpus against it | @screamm | Q3 2026 |
| Publish blog post on OCHS to dev.to or OpenSSF blog | @screamm | Q3 2026 |
| Reach out to at least 2 static analysis tool authors about OCHS conformance | @screamm | Q3 2026 |
| Add `pnpm audit` / `npm audit` step to CI | @screamm | Before sandbox PR |

---

## Where to File

| Foundation | Where | URL |
|------------|-------|-----|
| OpenSSF Sandbox | PR to ossf/tac repo, file in `process/project-lifecycle-documents/` | https://github.com/ossf/tac |
| OpenSSF TAC Meetings | Attend to find sponsor; bi-weekly schedule | https://github.com/ossf/tac/tree/main/meetings |
| OpenSSF Slack | #tac, #best-practices, #tooling channels | https://openssf.slack.com |
| OpenSSF Best Practices Badge | Self-service registration | https://www.bestpractices.dev |
| OWASP New Project | Contact Us form | https://owasp.org/contact/ |
| OWASP Project Promotion | Google Form | https://forms.gle/Gh2Ry3vUjahu73S3A |
| OWASP Project Committee | Slack #project-committee | https://owasp.slack.com |
| LF IP Review | Triggered automatically by TAC PR; or email | legal@openssf.org |
