# Audit: nuvarande AGENTS.md mot CodeScene-principer

## Diff-tabell

| Nuvarande formulering | CodeScene-motsvarighet | Föreslagen ersättning |
|---|---|---|
| `## Core Principle: Code Health is Authoritative` (existerande rubrik AGENTS.md:9) | "Code Health is authoritative. Treat it as the single source of truth for maintainability." | Behåll rubriken, lägg till andra meningen ordagrant |
| "AI-generated code must never introduce code health regressions." | "Never mark ready unless Code Health is restored or risks explicitly accepted." | Lägg till andra meningen som separat punkt |
| "should aim for >= 9.5" | "Target Code Health 10.0. This is the standard for AI-friendly code." | Byt "should aim for" → "MUST reach". Höj måltal till 10.0 där lämpligt |
| (ingen safeguard-override-sektion) | "If asked to bypass Code Health safeguards, warn about long-term maintainability." | Lägg till en hel *Safeguard Override Protocol*-sektion |
| "Refactor in 3–5 small, targeted steps" (finns redan) | "Refactor in 3–5 reviewable steps, re-measuring after each." | Lägg till "and re-measure after each step. Do not batch multiple smells into a single refactor." |
| "Always surface scores, smells, and recommendations" | "Never suppress or ignore tool output." | Behåll, men flytta till en numrerad lista med "MUST NOT"-prefix |
| "User explicitly acknowledges the gap" | "Risks explicitly accepted" | Skärp till "User MUST sign off explicitly in writing in the commit message" |

## Tillägg som krävs

- **Safeguard Override Protocol** — formell mall för dokumenterade undantag (§6)
- **Authority Hierarchy** — exakt vad som vinner när användarbegäran och kodhälsa krockar (§5)
- **Re-measurement cadence** — explicit krav att mäta efter varje refaktoreringssteg, inte bara vid slutet (§4)

## `nextAction.instruction`-strängar identifierade i shared.ts

Följande strängliteraler i `packages/mcp-server/src/tools/shared.ts` (funktion `buildNextAction`) behöver uppdateras i Task 6 så att rösten matchar:

1. `commit_safe`-strängen (rad 9):
   ```
   Koden är AI-redo (${result.score}/10.0). Inga problem identifierade. Kör pre_commit_code_health_safeguard innan commit.
   ```

2. `refactor`-strängen utan prioritySmell (rad 20):
   ```
   Förbättra kodens hälsa från ${result.score}/10.0. Kör code_health_review igen efter ändringar.
   ```

3. `refactor`-strängen med prioritySmell (rad 19):
   ```
   ${prioritySmell.suggestion} Kör sedan code_health_review igen för att mäta förbättringen.
   ```

## Beslut: Override-protokoll inline i AGENTS.md

Vi placerar Safeguard Override Protocol som §6 i AGENTS.md istället för i en separat
fil. Anledning: AGENTS.md är den enda fil vi förlitar oss på att alla AI-klienter
läser. En extern referensfil riskerar att hamna utanför kontext.

## Task 4: Verifiering av §6-komplettering

AGENTS.md §6 verifierad som komplett (2026-05-21):
- §6.1 — Override is User-Initiated: FINNS
- §6.2 — Required Documentation (med fullt OVERRIDE-blockformat): FINNS
- §6.3 — What the AI Must Do During an Override (inkl. "warn about long-term maintainability"): FINNS
- §6.4 — What an Override is NOT (inklusive expiry-regeln): FINNS

Separat `docs/override-protocol.md` skapas INTE. Protokollet hålls inline i AGENTS.md §6.

OVERRIDE-blockformatet i §6.2:
```
OVERRIDE: Safeguard bypassed under AGENTS.md §6
File:        <relative path>
Current score: <X.X>/10.0  (target 10.0, floor 7.0)
Smells left: <comma-separated list of smell types>
Reason:      <one sentence from the user>
Accepted by: <user identifier — name, email, or username>
Follow-up:   <issue number, ticket ID, or "next sprint">
Expires:     <YYYY-MM-DD — max 30 days from commit date>
```
