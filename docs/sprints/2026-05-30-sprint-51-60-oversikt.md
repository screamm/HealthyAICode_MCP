# Sprintplan 51-60: Världens bästa kodhälso-MCP
**Datum:** 2026-05-30
**Status:** Planerad
**Källa:** claudedocs/2026-05-30-world-class-research-roadmap.md (242 sökningar, 186 fynd)

---

## Översikt

Sprint 51-60 operationaliserar det forskningsbaserade roadmap-dokumentet längs fyra axlar: (1) API-korrekthet och MCP-speckompatibilitet (S51-52), (2) höjd fix-frekvens via bättre transformers och loopstrategi (S53-54), (3) empirisk förankring av 9.5/9.6-tröskeln och motstånd mot score-gaming (S55-56), samt (4) utökat biomarkörtäckning, distribution och ett kalibrerings-flywheel som gör verktyget självförbättrande över tid (S57-60). Tillsammans rör de sig från "fungerande MCP-server" till ett defensivt vallgrävt ekosystem med plugin-API, telemetri, IDE-integration och öppen benchmarkmetodik.

---

## Beroendegraf

```
S51 (outputSchema, API-fixes)
  └── S52 (deferred loading, diff-svar)          # S51:s strukturerade output krävs för S52:s token-budget
        └── S54 (loop-konvergens)                 # token-besparingar möjliggör fler loop-iterationer

S53 (transformers: rope/gopls/ast-grep)
  └── S54 (loop-konvergens)                       # fler transformertyper ger Pre-Act-plan bättre val

S55 (trösklar, ECE, holdout)
  └── S56 (anti-gaming, kontextscoring)           # vet vi var 9.5 sitter, kan vi vakta det bättre
        └── S57 (AI-native biomarkörer)           # tiered AI-gate bygger på valida trösklar
              └── S58 (OWASP + clone-detektion)   # utökat biomarkörtäckning

S59 (distribution: SARIF, registry, IDE)
  └── S60 (flywheel: telemetri, plugin-API, benchmark)  # adoption ger telemetridata; telemetri driver kalibrering
```

**Noteringar:** S51 är grundplattan — outputSchema-ändringarna påverkar alla efterföljande integrationstester. S55 är grinden för att eventuellt höja AI_READY_THRESHOLD till 9.6; flytta inte den konstanten innan S55-data finns. S59 bör föregå S60 eftersom registreringsnamnet (`healthy_ai_code_*`) påverkar telemetri-event-namnrymden.

---

## Sprintarna

| Sprint | Titel | Fokus | Tasks | Relativ insats | Fil |
|--------|-------|-------|-------|----------------|-----|
| [51](2026-05-30-sprint-51-api-fixes-output-schema.md) | API-korrigeringar & outputSchema-grund | Rätta budget_tokens-bugg, cache TTL, effort-mappning; lägg till structuredContent på review och auto-refactor | 12 | Medel | sprint-51 |
| [52](2026-05-30-sprint-52-token-reduction-server-side.md) | Token-reduktion på serversidan | Deferred tool loading, diff-format på refaktoreringsvar, strukturell re-review med TOON | 16 | Hög | sprint-52 |
| [53](2026-05-30-sprint-53-transformer-expansion.md) | Transformer-expansion | Python rope, Go gopls, ast-grep tidig-retur, RefactoringMiner-oracle | 17 | Hög | sprint-53 |
| [54](2026-05-30-sprint-54-loop-convergence.md) | Loop-konvergens | Pre-Act-plan, RCI-självkritik, smell-batcher, stoppvillkor, git-blame-kontext | 17 | Hög | sprint-54 |
| [55](2026-05-30-sprint-55-threshold-validation-ece.md) | Tröskelvalidering & ECE | ECE-modul, per-språk ROC-trösklar, holdout-corpus för att empiriskt förankra 9.5/9.6 | 15 | Medel | sprint-55 |
| [56](2026-05-30-sprint-56-anti-gaming-context-aware-scoring.md) | Anti-gaming och kontextmedveten scoring | SplitResidue, co-occurrence-multiplikator, roll-medvetna vikter, churn-viktade straff, subscores | 18 | Hög | sprint-56 |
| [57](2026-05-30-sprint-57-ai-native-biomarkers.md) | AI-native biomarkörer | LLM-integrationslukter, slopsquatting, AiAttributedSATD, intentDebt, ComplexityMassConcentration | 18 | Hög | sprint-57 |
| [58](2026-05-30-sprint-58-security-biomarkers-owasp-2025.md) | Säkerhetsbiomarkörer (OWASP 2025) | SSRF, osäker deserialisering, kryptomisbruk, undantagsantipatterns, async-antipatterns, kodklonar | 17 | Medel | sprint-58 |
| [59](2026-05-30-sprint-59-distribution-sarif-registry-ide.md) | Distribution | SARIF-berikning för GitHub/GitLab, MCP-registry, VS Code-integration, ISO 5055-mappning | 16 | Medel | sprint-59 |
| [60](2026-05-30-sprint-60-calibration-flywheel-plugin-ecosystem.md) | Kalibrerings-flywheel & open-core | Telemetri-pipeline med differential privacy, plugin-API, per-språk trösklar, benchmark-metodologi | 18 | Hög | sprint-60 |

**Total:** 164 tasks.

---

## Viktig avvägning

Den starkaste externa kalibreringssignalen (CodeScene Code Red-studie) sätter grönt golv vid score 8.0 och "AI-pålitligt" runt 9.4, med r = -0.58 mot defektfrekvens. Det innebär att 9.5 är försvarsbart som mål, men 9.6 saknar publicerat empiriskt stöd som universellt tröskelvärde. Sprint 55 levererar infrastruktur (ECE, per-språk ROC, holdout-corpus) för att mäta om 9.5 faktiskt sammanfaller med ett observerbart kvalitetskliff i projektets egna data. Innan de mätningarna finns bör AI_READY_THRESHOLD inte höjas till 9.6 — det vore att låsa ett värde utan bevis. Om S55-data visar att 9.3 och 9.6 är urskiljer samma defektmönster finns heller ingen anledning att byta.

---

## Rekommenderad ordning

1. **S51** — Rätta API-buggar och lägg outputSchema-grunden. Blockar allt annat eftersom integrationstester mot fel API slösar tid.
2. **S52** — Token-reduktion på serversidan. Billig att köra rätt efter S51 när strukturen är fastlagd; ger omedelbar kostnadsnytta för alla följande loop-tester.
3. **S55** — Kör tröskelvärdesvalideringen tidigt, parallellt med eller omedelbart efter S52. Resultaten styr om S56/S57 behöver anpassa vikter eller gate-värden.
4. **S53** — Transformer-expansion. Kan köras parallellt med S55 eftersom den inte beror på tröskeldata; utökar fix-repertoaren inför S54.
5. **S54** — Loop-konvergens. Bygger direkt på S52 (token-budget), S53 (fler transformers) och gynnas av S55 (vet vad som räknas som konvergerat).
6. **S56** — Anti-gaming. Bygger på S55-trösklar och skyddar det vi lärt oss om vad 9.5 faktiskt innebär.
7. **S57** — AI-native biomarkörer. Tiered AI-gate kräver valida trösklar från S55; LLM-integrationslukter är oberoende av S56 men delar types.ts med det.
8. **S58** — Säkerhetsbiomarkörer. Utvidgar biomarkörtäckning utan beroende på S57; kan köras parallellt men delar fixture-infrastruktur.
9. **S59** — Distribution. Adoption är meningslös utan stabil scoring (S55-58); SARIF-berikning och registry-namnrymd bör vara låst innan telemetri samlar in data.
10. **S60** — Flywheel och open-core. Sist eftersom telemetri-pipelinen kräver att distributionskanalerna (S59) är på plats, och plugin-API:t är robustare när biomarkörtäckningen (S57-58) är komplett.
