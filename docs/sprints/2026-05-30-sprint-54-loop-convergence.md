# Sprint 54: Loop-konvergens — Pre-Act-plan, RCI-självkritik, batchning och stoppvillkor

**Datum:** 2026-05-30
**Status:** Planerad

---

## Mål

- Emittera en helfils-plan (smell-prioritet, predikterad delta, fix-strategi per funktion) _före_ det första `code_health_auto_refactor`-anropet, enligt Pre-Act-mönstret, för att minska antalet korrektions-iterationer mitt i loopen.
- Appenda en strukturerad RCI-självkritik-prompt i `followUpInstruction` som uppmanar modellen att verifiera fria variabler, returvärden och call-site-giltighet efter varje extraheringsförslag — mål: höja pass-rate från ~45 % till ≥ 80 % på extract-method-uppgifter.
- Batcha _alla_ instanser av den tyngsta smell-typen i ett enda pass, ordnat efter marginell score-delta, för att utnyttja `√count`-kurvans avtagande avkastning maximalt.
- Implementera två CL-skydd: (a) abstain-and-validate-märkning när predikterad CS är låg, (b) explicita stoppvillkor med comment-count-invariant och rename-only = non-progress.
- Lägga git-blame-kontext (introducerande commit-diff + medsignerade funktioner) i `followUpInstruction` för `BrainMethod`, `GodClass` och `KnowledgeLoss` via den befintliga `analyzeFileWithHistory`-pipelinen.

---

## Bakgrund och motivation

### CS-taket och varför promptdesign är nästa gräns

EMNLP 2025 modellerar refaktoreringsloopen som en Markov-process med en fast övre gräns `Upp = CS / (1 − CL + CS)` — iterationer kan inte bryta sig igenom taket, bara CS och CL kan flytta det ([Geometric Dynamics of Agentic Loops, arXiv 2512.10350](https://arxiv.org/abs/2512.10350)). Projektet har redan implementerat iterationsbudget, `Δ < 0.1`-stoppnivå och effort-routing. De tre billigaste CS-höjarna som återstår är rena prompt-förändringar:

**Pre-Act:** [arXiv 2505.09970](https://arxiv.org/abs/2505.09970) (maj 2025) jämförde ReAct med Pre-Act på Almita-datasetet. GPT-4 med ReAct nådde 32 % goal completion; en finjusterad Llama 70B med Pre-Act nådde 82 %. Pre-Act genererar en helfils-plan `{tanke, handling, observation}`-tuplad för varje steg _innan_ verktyg anropas, och uppdaterar planen inkrementellt efter varje observation. Projektets `runRefactoringLoop` i `packages/core/src/refactor/refactoring-loop.ts` anropar `analyzeForAutoRefactor` direkt utan föregående helfils-planering — Pre-Act-steget saknas helt.

**RCI-självkritik:** [arXiv 2510.26480](https://arxiv.org/abs/2510.26480) (okt 2025) utvärderade RCI-prompting på Python extract-method-refaktorering. Bästa modell (Deepseek-Coder-RCI) nådde TPP = 0.829 mot ~0.45 för one-shot. RCI arbetar i tre steg: generera förslag → identifiera problem → generera förbättrad version. I refaktoreringskontext specificerar kritiksteget: kontrollera att alla fria variabler skickas som parametrar, att returvärden propageras och att call-siten kompilerar. Projektets `buildFollowUpInstruction` i `packages/core/src/refactor/follow-up-instruction.ts` innehåller `preserveNote` och `craneNote` men saknar den explicit strukturerade RCI-sekvensen.

**Batchning av tyngsta smell-typ:** `pickWorst` i `packages/core/src/refactor/smell-picker.ts` väljer den _enskilt_ värsta lukten. `√count`-kurvan säger att alla N instanser av en smell-typ ska rensas i ett pass — att rensa N=3 `ComplexMethod` ger `1.5 × √3 ≈ 2.6` poängs-återvinning mot `1.5 × √1 = 1.5` för ett enda. GitHub Copilots flytt till klustrade multi-rad-fixar rapporterade mätbara acceptansvinster ([github.blog](https://github.blog/ai-and-ml/github-copilot/60-million-copilot-code-reviews-and-counting/)).

### CL-skydd

**Abstain-and-validate:** [arXiv 2510.03217](https://arxiv.org/abs/2510.03217) (okt 2025) visade att kombinerat abstention + validering höjde precision med upp till +39 pp på riktiga buggar. Abstention exkluderar mål med låg fixbarhet; patch-validering avvisar förslag som sannolikt inte förbättrar. Projektets `stagnating`-flagga i `AutoRefactorResult` indikerar delta < 0.3 men märker inte ut när predikterad CS är strukturellt låg (t.ex. `GodClass` utan hel-klass-kontext).

**Stoppvillkor och comment-count-invariant:** [arXiv 2602.21833](https://arxiv.org/abs/2602.21833) (feb 2026, 230 Java-kodsnippets, 5 iterationer vardera) visade att strukturella förändringar koncentreras till iteration 1–2 och att LLMs utan stoppvillkor _strippar inline-kommentarer_ och _oscillerar på namnbyten_. Kommentarstripning höjer en naiv score (färre SATD-träffar) men sänker förståelighet — en Goodhart-fälla. Projektet har `deltaNote` i `followUpInstruction` men ingen faktisk räknare på kommentarrader i loopen.

### Git-blame-kontext

[HAFixAgent, arXiv 2511.01047](https://arxiv.org/abs/2511.01047) (nov 2025) injicerade blame-heuristik (introducerande commit-diff + medsignerade funktioner) i reparationsloopen och fick +38.6 % fix-rate på BugsInPy för single-file multi-hunk-buggar. Projektet kör redan `simpleGit` i `packages/core/src/temporal/method-coupling.ts` och `packages/core/src/temporal/knowledge-loss-index.ts` (som anropar `git blame --line-porcelain`). `analyzeFileWithHistory` aggregerar redan historik för `MethodTemporalCoupling`. Infrastrukturen finns — det saknas ett steg som extraherar och levererar introducerande-commit-diff i `followUpInstruction` för `BrainMethod`/`GodClass`/`KnowledgeLoss`.

---

## Arkitektur

### Nya filer

```
packages/core/src/refactor/
  pre-act-planner.ts        — buildPreActPlan(): helfils-plan med smell-prioritet,
                              predikterad Δ och fix-strategi per funktion, FÖRE
                              första auto_refactor-anropet.

  smell-batcher.ts          — batchTopSmellType(): väljer tyngsta smell-typ,
                              rangordnar alla instanser efter marginell score-delta,
                              returnerar BatchedSmellPlan[].

  blame-context.ts          — fetchBlameContext(): hämtar introducerande commit-diff
                              och medsignerade funktioner via simpleGit för en given
                              smell+funktion; returnerar BlameContext | null.

packages/core/tests/fixtures/
  unhealthy/pre-act-multi-smell.ts   — TypeScript-fil med 3 ComplexMethod + 1 BrainMethod
                                       avsedd för Pre-Act-planerings-tester.
  unhealthy/batch-same-type.ts       — Fil med 4 DeepNesting-instanser; verifierar att
                                       batchSmellType sorterar korrekt efter marginal-delta.
  healthy/comment-invariant.ts       — Fil nära 9.5 med inline-kommentarer; verifierar att
                                       comment-count-check inte triggar falskt alarm.
```

### Ändringar i befintliga filer

- **`packages/core/src/refactor/auto-refactor-analyzer.ts`**
  - `analyzeForAutoRefactor()`: lägg till valfri parameter `batchMode?: boolean`; när `true`, anropa `batchTopSmellType()` och returnera det utökade fältet `batchedPlan: BatchedSmellPlan[]` i `AutoRefactorResult`.
  - Nytt fält `manualInterventionRequired: boolean` i `AutoRefactorResult` — sätts `true` när `successLikelihood === 'hard'` OCH `stagnating === true`.
  - Utöka `AutoRefactorResult` med `preActPlanAvailable: boolean` och `blameContextSummary?: string`.

- **`packages/core/src/refactor/follow-up-instruction.ts`**
  - `FollowUpParams`: lägg till `rciEnabled: boolean`, `blameContext?: string`, `batchedSmells?: BatchedSmellPlan[]`, `commentCountBefore?: number`.
  - `buildFollowUpInstruction()`: injicera RCI-sektionen (generera → kritisera → förbättra) när `rciEnabled: true`; injicera blame-kontextblock när `blameContext` är satt; injicera batch-instruktion när `batchedSmells` har innehåll; injicera comment-count-invariant när `commentCountBefore` är satt.
  - `buildNearTargetInstruction()` och `buildStandardInstruction()`: forward:a de nya fälten.

- **`packages/core/src/refactor/refactoring-loop.ts`**
  - `executeLoop()`: kör `buildPreActPlan()` _en gång_ innan loop-iterationerna startar och lägg resultatet i `LoopState`; skicka med planen som kontext i varje `applyRefactorStep`-anrop.
  - `applyRefactorStep()`: räkna kommentarrader före och efter varje steg; bryt om ny kommentarantal < `commentCountBefore × 0.9` (toleransmarginal 10 %).
  - Ny stopplogik: om senaste stegets transformedCode skiljer sig från föregående _enbart i identifierare_ (rename-only check) → räkna som non-progress, öka stagnation-räknaren.

- **`packages/core/src/refactor/smell-picker.ts`**
  - Exportera ny funktion `groupByType(smells: Smell[]): Map<SmellType, Smell[]>` — hjälpfunktion för `smell-batcher.ts`.

- **`packages/mcp-server/src/tools/auto-refactor.ts`**
  - Exponera `batchedPlan`, `manualInterventionRequired` och `blameContextSummary` i MCP-svaret.
  - Lägg till valfri input-parameter `batchMode: boolean` (default `false`).
  - Lägg till valfri input-parameter `repoPath?: string` — skickas till `fetchBlameContext()` när smell är `BrainMethod`, `GodClass` eller `KnowledgeLoss`.

---

## Tasks

### 1. Pre-Act helfils-plan

- [ ] **[Sonnet] Skapa `packages/core/src/refactor/pre-act-planner.ts`**
  - Exportera `buildPreActPlan(code: string, language: Language, filePath: string): PreActPlan`.
  - `PreActPlan` är `{ steps: PreActStep[]; totalPredictedDelta: number; primarySmellType: SmellType }`.
  - `PreActStep` är `{ functionName: string; smellType: SmellType; marginalDelta: number; strategy: RefactoringStrategy; rationale: string }`.
  - Återanvänd `analyzeCode()` + `pickWorst()` + `SMELL_WEIGHTS` — ingen ny parsning.
  - Sortera steps fallande på `marginalDelta` (beräknas som `weight × (√n − √(n-1))`).
  - Acceptanskriterium: för `unhealthy/pre-act-multi-smell.ts` ska `steps.length ≥ 3` och `steps[0].smellType` vara `ComplexMethod` eller `BrainMethod`.

- [ ] **[Sonnet] Integrera Pre-Act-plan i `refactoring-loop.ts`**
  - I `executeLoop()`: anropa `buildPreActPlan(state.currentCode, state.language, state.filePath)` _en gång_ innan `for`-loopen; lagra som `state.preActPlan`.
  - Skicka `preActPlan` som nytt fält i `LoopState` (utöka interfacet).
  - I `applyRefactorStep()`: välj nästa smell via `state.preActPlan.steps[iteration]?.smellType` som `targetSmell` i anropet till `analyzeForAutoRefactor` — fallback till befintlig `pickWorst` om planen är slut.
  - Acceptanskriterium: `runRefactoringLoop` på `unhealthy/pre-act-multi-smell.ts` ska producera `steps` i samma ordning som Pre-Act-planens `steps`.

### 2. RCI-självkritik i followUpInstruction

- [ ] **[Sonnet] Utöka `FollowUpParams` och `buildFollowUpInstruction` i `follow-up-instruction.ts`**
  - Lägg till `rciEnabled: boolean` i `FollowUpParams`; sätt default `true` i `computeAllParts()` i `auto-refactor-analyzer.ts`.
  - Definiera `rciNote` i `assembleFollowUpNotes()`:
    ```
    RCI-VERIFY (efter att du skrivit ditt förslag):
    1. KRITIK: Lista alla fria variabler i det extraherade blocket — är de parametrar i signaturen?
    2. KRITIK: Propageras returvärden korrekt till alla call-sites inom changeScope?
    3. KRITIK: Kompilerar/typstämmer call-siten med den nya signaturen?
    4. FÖRBÄTTRA: Om något av ovanstående brister, skriv en reviderad version.
    ```
  - Appenda `rciNote` i slutet av `buildNearTargetInstruction()` och `buildStandardInstruction()` när `rciEnabled: true`.
  - Acceptanskriterium: `buildFollowUpInstruction({ ..., rciEnabled: true })` returnerar en sträng som innehåller alla tre fraserna "fria variabler", "returvärden" och "call-site".

- [ ] **[Haiku] Aktivera `rciEnabled: true` som default i `computeAllParts()` i `auto-refactor-analyzer.ts`**
  - Skicka `rciEnabled: true` till `buildFollowUpInstruction()` i det befintliga `followUpInstruction`-bygget.
  - Aktivera inte RCI för `nearTarget: true` och `successLikelihood === 'easy'` (onödig overhead på enkla fixar nära målet).
  - Acceptanskriterium: `analyzeForAutoRefactor` på en `ComplexMethod`-fil returnerar `followUpInstruction` som innehåller "RCI-VERIFY".

### 3. Batchning av tyngsta smell-typ

- [ ] **[Sonnet] Skapa `packages/core/src/refactor/smell-batcher.ts`**
  - Exportera `batchTopSmellType(smells: Smell[], functions: FunctionResult[]): BatchedSmellPlan`.
  - `BatchedSmellPlan` är `{ smellType: SmellType; instances: BatchedInstance[]; totalPredictedDelta: number }`.
  - `BatchedInstance` är `{ smell: Smell; fn: FunctionResult; marginalDelta: number; rank: number }`.
  - Algoritm: (1) hitta den SmellType med högst total vikt-penalty `w × √n`; (2) rangordna alla instanser av den typen fallande på `w × (√n − √(n-1))` där n är instansens rankning i typen; (3) returnera hela listan.
  - Återanvänd `groupByType()` från `smell-picker.ts` (ny export) och `SMELL_WEIGHTS`.
  - Acceptanskriterium: på `unhealthy/batch-same-type.ts` (4 × `DeepNesting`) ska `instances.length === 4` och `instances[0].marginalDelta > instances[3].marginalDelta`.

- [ ] **[Sonnet] Koppla batchning till `analyzeForAutoRefactor` och `follow-up-instruction.ts`**
  - I `analyzeForAutoRefactor()`: när `batchMode === true`, anropa `batchTopSmellType()` och populera `batchedPlan` i resultatet.
  - Utöka `FollowUpParams` med `batchedSmells?: BatchedInstance[]`; bygg en `batchNote` i `assembleFollowUpNotes()`:
    ```
    BATCH-PASS: fix alla ${batchedSmells.length} instanser av ${smellType} i ett pass,
    i ordning: ${batchedSmells.map(i => i.fn.name).join(', ')}.
    Fixar i ordning maximerar score-delta (√count-kurvan).
    ```
  - Acceptanskriterium: `followUpInstruction` innehåller "BATCH-PASS" och listar funktionsnamnen i rätt ordning när `batchedSmells` är populerad.

- [ ] **[Haiku] Registrera `batchedPlan` i MCP-svar i `mcp-server/src/tools/auto-refactor.ts`**
  - Lägg till `batchMode?: boolean` som optional input-parameter.
  - Exponera `batchedPlan: { smellType, instances: [{functionName, line, marginalDelta}] } | undefined` i svaret.
  - Acceptanskriterium: `pnpm --filter @healthy-ai-code/mcp-server test` passerar med det utökade svaret.

### 4. Abstain-and-validate och manualInterventionRequired

- [ ] **[Sonnet] Implementera `manualInterventionRequired`-logik i `auto-refactor-analyzer.ts`**
  - I `buildAutoRefactorResult()`: sätt `manualInterventionRequired = true` när `successLikelihood === 'hard' && stagnating === true`.
  - Sätt `manualInterventionRequired = true` även när `changeScope === 'class'` och `functionLineCount > 200` (GodClass utan tillräcklig kontext — `focusLines` täcker inte hel klass).
  - Lägg till en `manualInterventionNote` i `assembleFollowUpNotes()` som emitteras när `manualInterventionRequired: true`:
    ```
    MANUAL INTERVENTION REQUIRED: predikterad CS är för låg för mekanisk fix.
    Alternativ: (a) dela filen manuellt, (b) välj en lättare co-located smell,
    (c) acceptera nuvarande score.
    ```
  - Acceptanskriterium: `analyzeForAutoRefactor` på en `GodClass`-fil med `functionLineCount > 200` returnerar `manualInterventionRequired: true` och `followUpInstruction` innehåller "MANUAL INTERVENTION".

### 5. Stoppvillkor: comment-count-invariant och rename-only guard

- [ ] **[Sonnet] Comment-count-invariant i `refactoring-loop.ts`**
  - I `applyRefactorStep()`: räkna kommentarrader i koden _innan_ steget (`commentCountBefore`) och _efter_ transformeringen (`commentCountAfter`).
  - Kommentarräkning: matcha `//` och `/* ... */`-block med enkel regex — behöver inte vara språkexakt, bara konsistent.
  - Om `commentCountAfter < commentCountBefore * 0.9`: avvisa transformeringen (behåll `state.currentCode` oförändrad), logga att invarianten bröts, och räkna steget som non-progress.
  - Acceptanskriterium: ett test med ett transformationssteg som strippar alla kommentarer ska avvisas och `steps` ska inte innehålla det steget.

- [ ] **[Sonnet] Rename-only guard i `refactoring-loop.ts`**
  - Exportera hjälpfunktion `isRenameOnly(codeBefore: string, codeAfter: string): boolean`.
  - Algoritm: tokenisera båda versionerna (split på `\s+` och interpunktion); räkna antal icke-identiska tokens utanför identifierar-mönstret (`/^[a-zA-Z_$][a-zA-Z0-9_$]*$/`); om antalet "strukturella" ändringar < 3 och antalet identifierarbyten > 0 → returnera `true`.
  - I `applyRefactorStep()`: om `isRenameOnly(before, after)` → avvisa, räkna non-progress.
  - Acceptanskriterium: `isRenameOnly` returnerar `true` för en kod-diff som enbart byter `processData` → `handleData`, `false` för en diff som extraherar en ny funktion.

- [ ] **[Haiku] Exportera `isRenameOnly` och `commentCountBefore` i `packages/core/src/refactor/index.ts`**
  - Lägg till exporter: `isRenameOnly`, `buildPreActPlan`, `batchTopSmellType`, `fetchBlameContext`, typerna `PreActPlan`, `PreActStep`, `BatchedSmellPlan`, `BatchedInstance`, `BlameContext`.
  - Acceptanskriterium: `pnpm -r typecheck` passerar utan fel.

### 6. Git-blame-kontext för BrainMethod / GodClass / KnowledgeLoss

- [ ] **[Opus] Skapa `packages/core/src/refactor/blame-context.ts`**
  - Exportera `fetchBlameContext(filePath: string, repoPath: string, fnName: string): Promise<BlameContext | null>`.
  - `BlameContext` är `{ introducingCommitHash: string; introducingCommitMessage: string; introducingDiff: string; coChangedFunctions: string[]; authorEmail: string; ageMonths: number }`.
  - Algoritm:
    1. Anropa `git log --follow --diff-filter=A -- <filePath>` via `simpleGit.raw()` för att hitta filen's genesis-commit.
    2. Anropa `git log --format="%H %ae %s" --all -- <filePath>` och hitta den commit där `fnName` _introducerades_ (jämför funktion-ranges med `getMethodRangesAtCommit()` från befintliga `method-coupling-helpers.ts` — återanvänd utan modifikation).
    3. Hämta difftext via `git show --unified=5 <sha> -- <filePath>` och trimma till max 800 tecken kring funktionens startrad.
    4. Hämta co-ändrade filer i samma commit via `git show --stat <sha>` — returnera filnamn (max 5).
    5. Vid fel eller om repo inte finns: returnera `null` utan att kasta.
  - Acceptanskriterium: funktionen returnerar ett `BlameContext`-objekt med icke-tomma `introducingCommitHash` och `introducingDiff` när den körs mot projektets egna repository med en känd funktion.

- [ ] **[Sonnet] Integrera `fetchBlameContext` i `analyzeForAutoRefactor` och `follow-up-instruction.ts`**
  - I `computeAllParts()` i `auto-refactor-analyzer.ts`: om `candidate.type` är `BrainMethod`, `GodClass` eller `KnowledgeLoss` OCH `repoPath` finns i ett nytt optional-parameter `{ repoPath?: string }` till `analyzeForAutoRefactor()`: anropa `fetchBlameContext()` och lagra i `blameContextSummary`.
  - Utöka `FollowUpParams` med `blameContext?: string` (sammanfattning under 400 tecken av `BlameContext`).
  - Bygg `blameNote` i `assembleFollowUpNotes()`:
    ```
    GIT-KONTEXT: Funktionen introducerades i commit <sha> (<message>) för <ageMonths> månader sedan.
    Diff-utdrag: <introducingDiff, trunkerad till 300 tecken>.
    Medsignerade filer: <coChangedFunctions>.
    Använd kontexten för att förstå ursprunglig avsikt och undvika att repetera
    misstaget vid extraheringen.
    ```
  - Acceptanskriterium: `followUpInstruction` innehåller "GIT-KONTEXT" för en `BrainMethod`-smell när `repoPath` är angivet.

- [ ] **[Haiku] Exponera `repoPath`-parameter i `mcp-server/src/tools/auto-refactor.ts`**
  - Lägg till optional `repoPath?: string` i MCP-verktygets input-schema.
  - Vidarebefordra till `analyzeForAutoRefactor({ ..., repoPath })`.
  - Acceptanskriterium: MCP-verktyget accepterar `repoPath` utan typfel och `blameContextSummary` visas i svaret när repoPath är angivet.

### 7. Fixture-filer

- [ ] **[Haiku] Skapa `packages/core/tests/fixtures/unhealthy/pre-act-multi-smell.ts`**
  - TypeScript-fil med minst 3 `ComplexMethod` (CC > 10) i separata funktioner och 1 `BrainMethod`.
  - Filen ska ha health score ≤ 7.0 vid `analyzeCode()` för att Pre-Act-planen ska ha ≥ 3 steg.
  - Acceptanskriterium: `analyzeCode(code, 'typescript', filePath).smells` innehåller ≥ 4 actionable smells.

- [ ] **[Haiku] Skapa `packages/core/tests/fixtures/unhealthy/batch-same-type.ts`**
  - TypeScript-fil med exakt 4 `DeepNesting`-instanser i 4 separata funktioner.
  - Acceptanskriterium: `batchTopSmellType(smells, functions).instances.length === 4` och `smellType === 'DeepNesting'`.

- [ ] **[Haiku] Skapa `packages/core/tests/fixtures/healthy/comment-invariant.ts`**
  - TypeScript-fil med score 9.0–9.4 och ≥ 10 inline-kommentarrader; används för att verifiera att comment-count-invarianten inte triggar falskt alarm vid legitim refaktorering.
  - Acceptanskriterium: `analyzeCode()` ger 9.0 ≤ score ≤ 9.4 och regexräkning ger ≥ 10 kommentarrader.

---

## Beroenden

- **Förutsätter:** Sprint 47–50 levererade (adaptiv effort-routing, CRANE-mönstret, `deltaNote`, `iterationBudget`, `colocatedSmells`, `focusLines`, `skipCurrentCode`, `stagnating`) — alla i `follow-up-instruction.ts` och `auto-refactor-analyzer.ts`. Dessa finns i den aktuella kodbasen.
- **Förutsätter:** `getMethodRangesAtCommit()` och `simpleGit` finns i `packages/core/src/temporal/method-coupling-helpers.ts` och `packages/core/src/temporal/knowledge-loss-index.ts` — bekräftat i koden.
- **Avblockerar:** Sprint 55 (Python `rope` + Go `gopls` mekaniska transformers) — Pre-Act-planen behövs för att transformer-passerna ska köras i rätt ordning. Sprint 56 (outputSchema + diff-mode MCP-svar) — `batchedPlan`-fältet är en naturlig del av det strukturerade svaret.
- **Avblockerar inte:** `analyzeFileWithHistory` kan redan kallas asynkront; blame-kontexten är opt-in via `repoPath` och ändrar inte det synkrona `analyzeCode`-flödet.

---

## Testplan

```bash
# Kör alla core-tester (inkl. nya)
pnpm --filter @healthy-ai-code/core test

# Kör MCP-integrationstester
pnpm --filter @healthy-ai-code/mcp-server test

# Typkontroll hela monorepon
pnpm -r typecheck

# Självgranskning: kör hälsoaudit på de nya filerna
node scripts/health-audit.mjs packages/core/src/refactor/pre-act-planner.ts
node scripts/health-audit.mjs packages/core/src/refactor/smell-batcher.ts
node scripts/health-audit.mjs packages/core/src/refactor/blame-context.ts
```

Förväntade utfall:

| Test | Förväntat resultat |
|---|---|
| `batchTopSmellType` på `batch-same-type.ts` | `instances.length === 4`, sorterade fallande på `marginalDelta` |
| `buildPreActPlan` på `pre-act-multi-smell.ts` | `steps.length ≥ 3`, `steps[0].smellType` är tyngsta smell |
| `buildFollowUpInstruction({ rciEnabled: true })` | Returnerad sträng innehåller "RCI-VERIFY", "fria variabler", "returvärden" |
| `isRenameOnly` rename-diff | `true` |
| `isRenameOnly` extract-method-diff | `false` |
| Comment-invariant: transformering som strippar kommentarer | Avvisas, `steps` har ingen post för det steget |
| `manualInterventionRequired` för `GodClass > 200 loc` | `true`, `followUpInstruction` innehåller "MANUAL INTERVENTION" |
| `fetchBlameContext` mot projektets eget repo | Icke-null `BlameContext` med `introducingDiff` för en känd funktion |
| `health-audit.mjs` på de tre nya refactor-filerna | Score ≥ 9.5 för samtliga |

---

## Tekniska beslut

1. **Pre-Act-planen byggs synkront från befintlig `analyzeCode`-analys, inte som ett separat LLM-anrop.** Pre-Act-papperet avser ett _planerings-LLM_-anrop, men projektets Pre-Act-plan är deterministisk (smell-vikt × √count → marginalDelta). Det ger reproducerbarhet och noll extra latens. Avvägning: planen saknar LLM:s semantiska förståelse av koden, men det är avsiktligt — det är ett strukturellt förhandsplaneringsverktyg, inte ett semantiskt sådant.

2. **RCI implementeras som prompt-tillägg, inte som extra API-anrop.** Att köra en separat "kritik"-modell (som originalpapered föreslår) kostar ett extra Anthropic-anrop per iteration. Att injicera RCI-instruktionen i `followUpInstruction` och låta operatörens modell självkritisera ger liknande fördelar utan extra latens eller kostnad. Avvägning: self-RCI är något svagare än dual-modell-RCI; acceptable given cost.

3. **Comment-count-invarianten använder 90 % som toleransgräns och enkel regex.** AST-baserad kommentarräkning skulle vara mer exakt men kräver per-språk-logik och är en ny beroendepunkt. Enkel regex (`//`, `/*...*/ `) är tillräcklig för att fånga avsiktlig stripping (en hel kodbas av kommentarer försvinner inte av misstag från 30 till 3). Avvägning: kan ge falskt larm om en fil lagitimately tar bort föråldrade kommentarer — 10 %-toleransen mildrar detta.

4. **`blame-context.ts` returnerar `null` tyst vid git-fel.** Blame-kontexten är opt-in och additiv — om den misslyckas (offline, grunt repo, ny fil) fortsätter loopen utan kontext. Ingen fel-kastar, ingen loop-avbrott. Avvägning: tyst degradering gör det svårare att debugga git-konfigurationsfel; en `diagnosticMessage` i `BlameContext` (inte `null`) för soft-failures vore bättre men ökar komplexiteten — kan läggas till i Sprint 55.

---

## Risker / öppna frågor

1. **Pre-Act-planens ordning mot loop-progression.** Om iterationsorden från Pre-Act-planen divergerar från den smell-prioritering som uppstår _efter_ varje transformering (loopen ändrar koden och nya smells kan uppstå), kan planen bli stale. Nuvarande design faller tillbaka på `pickWorst` när planen är slut — men inte om ett steg i mitten av planen plötsligt blivit irrelevant. Alternativ: omdisponera Pre-Act-planen efter varje iteration (`buildPreActPlan` är billig att köra om). Beslut: ta med som en post-sprint follow-up beroende på observerat beteende.

2. **Blame-kontextens latens på stora repositorier.** `git log --follow` och `git show` kan vara slow på repos med >50 000 commits och binärfiler. Befintliga `analyzeFileWithHistory`-anrop har inte stött på detta tack vare `maxCommits = 200`, men `blame-context.ts` använder inte samma cap direkt. Lägg till `--max-count=500` på `git log`-anropet som gardering.

3. **RCI-overhead i context-fönstret.** RCI-instruktionen lägger ~150–200 tokens per iteration. I en 10-iterationsloop med 200K context-fönster är det marginellt, men för Sonnet-modeller med 64K-fönster på långa filer kan det vara kännbart. Lösning på kort sikt: aktivera inte RCI när `nearTarget: true && successLikelihood === 'easy'` (redan planerat i Task 2).

4. **Rename-only guard och TypeScript-generics.** Rename-only-tokenizeraren baseras på enkel split; TypeScript-generics som `Array<T>` tokeniseras till `Array`, `<`, `T`, `>`. En refaktorering som ersätter en generics-typ är strukturell men kan se ut som rename. Falska avvisanden riskerar att stoppa legitima fixar. Lösning: undanta tokens innanför `<>` från identifierarräkningen, eller höj "strukturella ändringar"-tröskeln från 3 till 5.
