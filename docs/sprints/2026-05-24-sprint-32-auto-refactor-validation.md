# Sprint 32: Auto-refaktorering + Empirisk validering

**Datum:** 2026-05-24
**Status:** Levererat

---

## Mål

Stänga de två kritiska gapen mot CodeScene:

1. **Auto-refaktorering** (`code_health_auto_refactor`) — ge AI-assistenten exakta, handlingsbara refaktoreringsinstruktioner för den värsta lukten i en fil
2. **Empirisk metrisk-validering** (`code_health_validate_against_dataset`) — bevisa att hälsopoängen korrelerar med kända buggdata via Pearson/Spearman/AUROC

---

## Bakgrund och motivation

### Gapet mot CodeScene

CodeScene levererar **Automated Code Evolution (ACE)**: ett system som kombinerar statisk analys med LLM-genererade refaktoreringssuggestioner. Deras **CodeHealth™**-metrik är peer-reviewed och validerad mot buggar i open-source-projekt.

Vi stänger båda dessa gap i Sprint 32, med en central arkitektonisk skillnad:

| Egenskap | CodeScene ACE | Healthy AI Code (Sprint 32) |
|---|---|---|
| Refaktoreringsmotor | Proprietär LLM (inlåst) | Användarens egen AI-modell (Claude, GPT-4, etc.) |
| Modell-agnosticism | Nej | Ja — fungerar med alla AI-verktyg |
| Valideringsmetod | Intern, proprietär | Öppen: Defects4J JSON + syntetiskt benchmark |
| AUROC-rapportering | Ej exponerat via API | Returneras direkt via MCP-verktyget |
| Offline-drift | Begränsad | Fullt offline (syntetiskt benchmark) |

**Styrkan i vår approach:** Eftersom refaktoreringen sker via AI-assistentens egna fil-redigeringsförmågor (inte via en inbyggd LLM) är systemet starkare och inte inlåst i en specifik modell. Instruktionerna är tillräckligt precisa för att vilken AI-modell som helst ska kunna genomföra dem korrekt.

---

## Arkitektur

### Nya filer

```
packages/core/src/
  refactor/
    smell-instructions.ts     — 8 lukt-typer → RefactoringTemplate (strategi + steg-för-steg-instruktioner)
    auto-refactor-analyzer.ts — Orchestrator: analyzeForAutoRefactor()
    index.ts                  — Re-exporterar AutoRefactorResult, RefactoringStrategy

  validation/
    correlation.ts            — Pearson, Spearman, AUROC (inga externa beroenden)
    dataset-runner.ts         — BugRecord, ValidationReport, runValidation(), buildRecordsFromDirectory()
    defects4j-loader.ts       — loadDefects4JFromJson(), createSyntheticBenchmark()
    index.ts                  — Samlad re-export av validation-modulen

packages/mcp-server/src/tools/
  auto-refactor.ts             — MCP: code_health_auto_refactor
  auto-refactor-builders.ts    — Byggare: ReadyFileState, buildRefactorResponse(), buildInstructions()
  validate-dataset.ts          — MCP: code_health_validate_against_dataset
```

### Ändringar i befintliga filer

- `packages/core/src/index.ts` — Exporterar `analyzeForAutoRefactor`, `runValidation`, `loadDefects4JFromJson`, `createSyntheticBenchmark`, `detectLanguage`, `pearsonCorrelation`, `spearmanCorrelation`, `computeAUROC`, och typer `BugRecord`, `ValidationReport`, `Defects4JEntry`, `AutoRefactorResult`, `RefactoringStrategy`
- `packages/mcp-server/src/server.ts` — Registrerar `registerAutoRefactor` och `registerValidateDataset`
- `server.json` — Lägger till `code_health_auto_refactor` och `code_health_validate_against_dataset` i verktygs-katalogen

---

## Tasks

### Auto-refaktorering

- [x] **[Sonnet] `packages/core/src/refactor/smell-instructions.ts`**
  - 8 lukt-typer med RefactoringTemplate: `extract_method`, `early_return`, `introduce_parameter_object`, `split_at_seam`, `extract_chunks`, `simplify_conditional`, `inline_variable`
  - Varje mall inkluderar steg-för-steg-instruktioner, skeleton-kod och förväntad score-förbättring (1.0–3.0 poäng)

- [x] **[Sonnet] `packages/core/src/refactor/auto-refactor-analyzer.ts`**
  - `analyzeForAutoRefactor(filePath)` — orchestrator som analyserar filen, väljer värsta lukten, och returnerar `AutoRefactorResult`
  - Returnerar `refactoringNeeded: false` om score ≥ 9.5 (AI-redo)

- [x] **[Haiku] `packages/mcp-server/src/tools/auto-refactor.ts`**
  - MCP-verktyg: `code_health_auto_refactor`
  - Input: `filePath` (required), `language` (optional), `targetSmell` (optional)
  - Output: `refactoringNeeded`, `primaryTarget`, `refactoringInstructions`, `codeContext`, `fullFileContent`, `nextStep`
  - Returnerar BumpyRoad-specifika chunk-extrakt-instruktioner när `chunkRanges` finns

### Empirisk validering

- [x] **[Sonnet] `packages/core/src/validation/correlation.ts`**
  - `pearsonCorrelation(x, y)` — Pearson r, noll-varians-säker
  - `spearmanCorrelation(x, y)` — Spearman ρ via densrank + Pearson
  - `computeAUROC(scores, labels)` — Wilcoxon-Mann-Whitney-statistik; konvention: lägre hälsoscore = fler buggar

- [x] **[Sonnet] `packages/core/src/validation/dataset-runner.ts`**
  - `BugRecord` och `ValidationReport` — typdefinitioner
  - `runValidation(records)` — kör pipeline: analyzeCode → korrelationsberäkning → rapport
  - `buildRecordsFromDirectory(dir)` — git log heuristik: filer med "fix"/"bug" i commit-meddelanden märks som buggy
  - Inkluderar `collectSourceFiles()` med rekursiv katalogscanning

- [x] **[Haiku] `packages/core/src/validation/defects4j-loader.ts`**
  - `loadDefects4JFromJson(path)` — laddar Defects4J-format JSON (async, `Defects4JEntry[]`)
  - `createSyntheticBenchmark()` — inbyggt benchmark: 5 buggy TypeScript-funktioner med kända lukter + 5 rena funktioner

- [x] **[Haiku] `packages/mcp-server/src/tools/validate-dataset.ts`**
  - MCP-verktyg: `code_health_validate_against_dataset`
  - Tre lägen: syntetiskt benchmark, Defects4J JSON, directory-heuristik
  - Output: AUROC, Pearson-r, Spearman-ρ, medelvärdes-separation, per-fil-resultat, rekommendation

- [x] **[Haiku] `server.json` + `server.ts` registrering**
  - `code_health_auto_refactor` och `code_health_validate_against_dataset` lagda till i server.json
  - Båda verktygen registrerade i `createServer()` i server.ts

---

## Jämförelsetabell mot CodeScene ACE

| Dimension | CodeScene ACE | Healthy AI Code Sprint 32 |
|---|---|---|
| Luktdetektering | 10+ lukt-typer | 8 lukt-typer (ComplexMethod, BrainMethod, DeepNesting, BumpyRoad, LargeMethod, LongParameterList, ComplexConditional, generisk) |
| Refaktoreringsinstruktioner | LLM-genererade | Template-baserade + BumpyRoad chunk-ranges |
| AI-modell | CodeScene intern | Användares egen modell (valfri) |
| Offline-drift | Begränsad | Fullt offline |
| Validerings-API | Ej offentligt | MCP-verktyg med AUROC/Pearson/Spearman |
| Syntetiskt benchmark | Nej | Ja (5+5 TypeScript-funktioner) |
| Defects4J-kompatibilitet | Intern | JSON-format, öppet |
| Git-history proxy | Intern | `git log --grep=fix/bug` |

---

## Statistiska mätetal

### AUROC-konvention
- 0.5 = slumpmässig klassificering
- 0.65+ = meningsfull separation (kvalitetsgräns)
- 0.75+ = stark validering

**Förväntad AUROC med syntetiskt benchmark:** ≥ 0.80 (bugg-filer innehåller avsiktliga smells som sänker score med 2–4 poäng)

### Pearson-r-konvention
- > 0.3 = svag men meningsfull korrelation (gräns för meningsfullhet)
- > 0.5 = måttlig korrelation
- > 0.7 = stark korrelation

---

## Testplan

```bash
# 1. TypeScript-kompilering
cd packages/core && pnpm typecheck
cd packages/mcp-server && pnpm typecheck

# 2. Enhetstest
cd packages/core && pnpm test
cd packages/mcp-server && pnpm test

# 3. Manuell validering via MCP (syntetiskt benchmark)
# Kör: code_health_validate_against_dataset { useSyntheticBenchmark: true }
# Förväntat: auroc >= 0.75, healthSeparation >= 2.0, pearsonR >= 0.5

# 4. Auto-refaktorering
# Kör: code_health_auto_refactor { filePath: "<fil med låg score>" }
# Förväntat: refactoringNeeded: true, primaryTarget med konkreta steg-instruktioner

# 5. server.json validering
node -e "require('./server.json'); console.log('JSON valid')"
```

---

## Tekniska beslut

1. **Inga externa statistik-beroenden** — correlation.ts implementerar Pearson, Spearman och AUROC från scratch. Motivering: inga npm-beroenden för rena matematiska operationer, fullt testbara, noll transitivt beroende-risk.

2. **Template-baserade instruktioner istället för LLM-genererade** — Refaktoreringsinstruktionerna är deterministiska och reproducerbara. LLM-variation i instruktionerna introducerar brus som gör det svårt att mäta förbättringar. Instruktionerna är dock tillräckligt specifika för att en LLM ska kunna genomföra dem korrekt.

3. **Asynkron `loadDefects4JFromJson`** — Datasets kan vara stora. Async I/O undviker att blockera Node.js event loop.

4. **Git-heuristik via `execFile` (child_process)** — Undviker `simple-git` som ett direkt beroende i mcp-server. `simple-git` används fortfarande i `packages/core` för övriga temporala analyser.
