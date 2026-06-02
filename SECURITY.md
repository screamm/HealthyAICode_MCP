<!--
SPDX-License-Identifier: MIT
Copyright (c) 2024-2026 David Rydgren (screamm) and Healthy AI Code contributors.
-->

# Security Policy

## Overview

Healthy AI Code MCP is a **fully local**, zero-egress tool. The MCP server runs entirely
on the developer's own machine and makes no outbound network calls during analysis. There
is no telemetry, no account, no cloud backend, and no data leaves the user's workstation.
This design eliminates an entire class of supply-chain and data-exfiltration risks.

Despite this posture, we take security seriously. The tool processes arbitrary source code
from the user's projects, and the MCP protocol surface is a meaningful attack vector if
an adversary can influence the files being analyzed.

---

## Supported Versions

We support the most recent published version. Older versions receive no security backports.

| Version | Supported |
|---------|-----------|
| Latest (`HEAD` / current npm release) | Yes |
| All prior versions | No — please upgrade |

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

### Preferred channel

Use [GitHub Security Advisories](https://github.com/screamm/healthy-ai-code-mcp/security/advisories/new)
to file a private report. This keeps details confidential until a fix is released.

If you cannot use GitHub Security Advisories, email:

    davidrydgren@gmail.com

Include "SECURITY" in the subject line.

### What to include

- Affected component(s) and version(s)
- Steps to reproduce (minimal reproducer preferred)
- Impact assessment (what can an attacker do, and under what conditions)
- Any suggested mitigations or patches you already have

### Response timeline

| Milestone | Target |
|-----------|--------|
| Acknowledgement of report | ≤ 5 business days |
| Triage and severity assessment | ≤ 10 business days |
| Patch or mitigation plan shared with reporter | ≤ 30 days for High/Critical |
| Public advisory published | Coordinated with reporter; typically after patch release |

We ask reporters to observe **90-day coordinated disclosure** from initial report to
public disclosure, or shorter if a fix ships sooner.

---

## Security Architecture Notes

For researchers assessing the attack surface:

| Property | Detail |
|----------|--------|
| Network egress | None. No DNS lookups, no HTTP calls during analysis. |
| File system access | Read-only; analyzes files the user explicitly passes or that are in the current repo. Does not glob outside the provided path. |
| `git` subprocess | `analyzeFileWithHistory()` and temporal analytics invoke `git log` / `git show` as subprocesses with the user-supplied `repoPath`. Paths are validated against the working tree before use. |
| `tree-sitter` parsers | Third-party native `.node` binaries are bundled. Maliciously crafted source files could trigger parser bugs; we track upstream tree-sitter advisories. |
| MCP protocol | Communication is over local stdio (or local UNIX/Windows named pipe). The MCP server trusts its stdio caller (the AI host). If the AI host is compromised, the server inherits that trust level. |
| Dependency supply chain | Dependencies are locked via `pnpm-lock.yaml` and pinned to exact versions. We run `pnpm audit` in CI and in the weekly self-health routine. |

---

## Scope

In scope:

- Code execution or sandbox escape via crafted source files passed to analysis
- Path traversal in `analyzeFile()` or `analyzeFileWithHistory()`
- Dependency confusion or typosquatting in our published npm packages
  (`@healthy-ai-code/core`, `@healthy-ai-code/mcp-server`, `@healthy-ai-code/gate`,
  `ochs-validate`)
- Credential or secret leakage through analysis output

Out of scope:

- Denial-of-service by passing extremely large files (use at own risk; not a security bug)
- Bugs in the AI model's reasoning about the score output (not our surface)
- Vulnerabilities in the AI host (Claude Desktop, Cursor, etc.) that happen to expose
  our MCP server

---

## Disclosure History

No public advisories as of 2026-06-02.
