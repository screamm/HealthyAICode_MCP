# Sprint 56: Anti-gaming och kontextmedveten scoring

**Datum:** 2026-05-30
**Status:** Planerad

---

## Mål

- Stänga de kända gameability-luckorna i `score = 10 − Σ(weight × √count)` så att 9.5-målet inte är nåbart via mekanisk koduppdelning eller test-artefakter
- Lägga till kontextmedvetenhet (arkitekturroll, test-/produktionssär, churn-hotspots) som grund för att skilja ut filer med legitimt hög komplexitet från genuint problematiska filer
- Exponera per-dimension subscores (Security / Complexity / Maintainability / Duplication) i verktygssvaret — utan att ändra scoringsformeln — för att ge loopen ett tydligare angreppsmål
- Lägga bot-commit-filtret som prerequisite till churn-viktning, så att Dependabot/Renovate-commits inte artificiellt pumpar upp hotspot-poängen

---

## Bakgrund och motivation

Roadmap-dokumentet (`claudedocs/2026-05-30-world-class-research-roadmap.md`, avsnitt "Reaching >9.6 on everything — A. Make the target defensible") identifierar tre scoreningsfel som riskerar att göra 9.5-målet till ett rörligt mål snarare än ett meningsfullt ingenjörsmått:

**1. Split-to-evade (Goodhart-effekten)**
Scoringsformeln bestraffar `ComplexMethod` med `1.5 × √count`. En funktion med CC=20 ger 1.5 poängs avdrag. Om AI-assistenten extraherar tre hjälpmetoder som var och en har CC=3 (under tröskeln 15) försvinner luktarna och poängen stiger — men komplexiteten förflyttades, den eliminerades inte. [Goodhart's Law in Software Engineering](https://codepulsehq.com/guides/goodharts-law-engineering-metrics) dokumenterar detta antimönster och rekommenderar kompenserande indikatorer. Utan ett `SplitResidue`-skydd kan loopen konvergera till 9.5 på filer som i praktiken blivit svårare att förstå.

**2. Co-occurrence-underviktning**
Den additiva modellen behandlar `GodClass` och `BrainMethod` på samma fil som oberoende. Imran et al. (2025) i [IET Software](https://ietresearch.onlinelibrary.wiley.com/doi/full/10.1049/sfw2/5579438) visar att co-förekomsten av luktpar har signifikant inverkan på kohesion och storlek — de dimensioner som är relevanta för just GodClass+BrainMethod-paret. Roadmapen rekommenderar 1.2× multiplikator på den tyngre lukten vid kohesion/storlek-par på samma fil.

**3. ComplexMethod-vikten är binär och driver over-fragmentation**
Flat vikt 1.5 gäller oavsett om CC är 16 eller 80. Forskning (dl.acm.org/doi/10.1016/j.jss.2022.111561) visar att CC-metriskans prediktiva förmåga inte är linjär. AI-reasoning-sweet-spot är CC≈10, inte CC=1 ([arxiv.org/abs/2601.21894](https://arxiv.org/abs/2601.21894)) — extremt låg CC skadar faktiskt LLM:s förmåga att förstå koden via cross-file reasoning. Threshold-gating (1.0 vid CC 15–24, 1.5 vid CC≥25) och ett `FragmentedCode`-skydd (CC=1, single caller) förhindrar att loopen driver mot mikro-metod-sprawl.

**4. Arkitekturrollsvariansen är oreglerad (SATT)**
[IEEE 7781795](https://ieeexplore.ieee.org/document/7781795/) (Palomba et al., SATT-modellen) visar att smellens svårighetsgrad varierar med arkitektonisk roll: GodClass i en kontrollerklass är ett förväntad mönster i MVC-ramverk; i en domänentitet är det ett allvarligt designproblem. Utan rollmedvetenhet har vissa filer ett strukturellt oreachable 9.5-tak och loopen bränner iterationer mot en vägg den inte kan runda.

**5. Säkerhetslukt i testkontext räknas som fullvikt**
En `SqlInjectionRisk` i en mock-databas-hjälpare i testmappen bestraffas identiskt med en i en request-handler. [Konvu reachability-analys](https://konvu.com/solutions/reachability-analysis) rapporterar 90–95% brusreduktion via reachability-filtrering. [SAST false positive-forskning](https://www.pixee.ai/blog/sast-false-positives-reduction) visar att SAST utan kontextfilter producerar 91% brus. Att tillämpa 0.3–0.5× på testkontext är en scoreaccuracy-fix, inte ett regelundantag.

**6. Churn-viktning kräver bot-filter som prerequisite**
[arXiv 2602.13170](https://arxiv.org/html/2602.13170) (Muzammil et al., "Source Code Hotspots") visar att en stor andel av hotspot-redigeringar härrör från automatiserade konton (Dependabot, Renovate, release-bots). Utan filtrering på `committer` / `author` name-mönster (t.ex. `[bot]`, `dependabot`, `renovate`) förstärker churn-viktningen automations-brus snarare än ingenjörsskuld. Bot-filtret är en prerequisite med låg insats som förbättrar alla befintliga churn-baserade analyser.

**7. Subscores saknas helt**
DeepSource organiserar fynd i fem dimensioner (Security, Reliability, Complexity, Hygiene, Coverage) och exponerar dessa per PR. Roadmapen konstaterar att subscores inte kräver formulärändring — det är en exponering av redan beräknade viktsummor. Subscorerna ger loopen ett tydligare angreppsmål och gör `followUpInstruction` mer precis.

---

## Arkitektur

### Nya filer

```
packages/core/src/scoring/
  context-weights.ts          — FileScoringContext, roleFromPath(), testContextMultiplier(), churnMultiplier()
  co-occurrence.ts            — coOccurrenceMultiplier(), COHESION_SIZE_PAIRS (const)
  split-residue.ts            — detectSplitResidue(): Smell[] — privat-metod-heuristik
  subscores.ts                — computeSubscores(): DimensionSubscores — summerar vikter per dimension

packages/core/tests/fixtures/unhealthy/
  split-residue-fixture.ts    — >3 privata metoder, single-caller, CC>2 var
  fragmented-code-fixture.ts  — massa CC=1 single-caller-metoder (guard mot over-fragmentation)

packages/core/tests/fixtures/healthy/
  controller-god-class.ts     — GodClass i /controllers/-sökväg ska inte ge fullt avdrag (SATT)
  test-sql-injection.ts       — SqlInjectionRisk i testkontext ska reduceras 0.4×
```

### Ändringar i befintliga filer

- **`packages/core/src/scoring/scorer.ts`** — `calculateScore()` utökas till att acceptera ett valfritt `FileScoringContext`-argument; anropar `coOccurrenceMultiplier()`, `testContextMultiplier()`, `churnMultiplier()`, och threshold-gated ComplexMethod-vikt; kallar `detectSplitResidue()` och lägger in Smell-listan i resultatet. Returnerar nu också `subscores: DimensionSubscores` via `calculateScoreWithContext()`.
- **`packages/core/src/scoring/weights.ts`** — Lägger till `SplitResidue: 0.5` och `FragmentedCode: 0.3` i `SMELL_WEIGHTS`; `ComplexMethod` behåller 1.5 som maxvikt men appliceras nu threshold-gated i scorer.
- **`packages/core/src/types.ts`** — Lägger till `SplitResidue` och `FragmentedCode` i `SmellType`-unionen; lägger till `DimensionSubscores`-interface och `subscores?: DimensionSubscores` i `HealthResult`.
- **`packages/core/src/index.ts`** — Re-exporterar `FileScoringContext`, `DimensionSubscores`, `computeSubscores`, `roleFromPath`.
- **`packages/mcp-server/src/tools/code-health-review.ts`** — Lägger till `subscores`-fält i verktygssvaret när `calculateScoreWithContext()` används; läser hotspot-data från git om `repoPath` är känt.
- **`packages/core/src/temporal/hotspot-helpers.ts`** — `scoreFiles()` filtrerar bot-commits innan churn-aggregering via `isBotCommit(authorEmail, committerName)`.
- **`packages/core/src/temporal/code-churn.ts`** — `analyzeCodeChurn()` skickar råa commit-data genom `filterBotCommits()` från `hotspot-helpers.ts` innan churn-rate räknas.

---

## Tasks

### A. Split-residue-detektor (anti-gaming: extract-to-evade)

- [ ] **[Sonnet] Skapa `packages/core/src/scoring/split-residue.ts`**
  - Implementera `detectSplitResidue(functions: FunctionResult[], fileSmells: Smell[]): Smell[]`
  - Logik: räkna privata metoder (namnprefix `_` eller `#` i TS/JS/Python, `private` i Java/Kotlin/C#) med CC>2 som anropas av exakt en annan metod i filen
  - Triggar när >3 sådana metoder hittas; producerar en `SplitResidue`-Smell på radnumret för den vanligaste caller-metoden
  - Ska *inte* trigga när privata metoder anropas från multipla callers (legitim extraktion) eller när CC≤2 (genuint triviala hjälpfunktioner)
  - Acceptanskriterium: `split-residue-fixture.ts` (>3 privata single-caller CC>2-metoder) ger exakt en `SplitResidue`-Smell; `pure-functions.ts` (healthy) ger noll

- [ ] **[Haiku] Lägg till `SplitResidue: 0.5` och `FragmentedCode: 0.3` i `packages/core/src/scoring/weights.ts`**
  - `SplitResidue` vikt 0.5 — jämförbart med `LargeFile` (0.3) och `ComplexConditional` (0.5); avsiktligt lägre än `ComplexMethod` för att inte dubbelbestraffa när splitten var partiellt legitim
  - `FragmentedCode` vikt 0.3 — advisory, låg vikt för att signalera utan att blockera loopen
  - Lägg till i `SmellType`-unionen i `packages/core/src/types.ts`
  - Acceptanskriterium: `pnpm -r typecheck` passerar efter ändringen

- [ ] **[Sonnet] Skapa `packages/core/tests/fixtures/unhealthy/split-residue-fixture.ts`**
  - En TypeScript-klass med fyra privata hjälpmetoder (`_helperA`, `_helperB`, `_helperC`, `_helperD`) med CC=3 var, var och en anropad av exakt en publik metod `processAll()`
  - Skapa även `packages/core/tests/fixtures/unhealthy/fragmented-code-fixture.ts` — en fil med tio metoder med CC=1 och <3 LLOC var, alla anropade av en enda orkestreringsmetod
  - Skriv enhetstester i `packages/core/tests/split-residue.test.ts` som verifierar: (a) `split-residue-fixture.ts` → `SplitResidue`-Smell, (b) `fragmented-code-fixture.ts` → `FragmentedCode`-Smell, (c) `healthy/pure-functions.ts` → inga av dessa lukar
  - Acceptanskriterium: `pnpm --filter @healthy-ai-code/core test` passerar

### B. Co-occurrence-multiplikator (GodClass + BrainMethod)

- [ ] **[Opus] Skapa `packages/core/src/scoring/co-occurrence.ts`**
  - Definiera `const COHESION_SIZE_PAIRS: Array<[SmellType, SmellType]>` = `[['GodClass', 'BrainMethod']]` som startuppsättning; designa för enkel utvidgning
  - Implementera `coOccurrenceMultiplier(smells: Smell[]): Map<SmellType, number>` — returnerar en Map där varje lukttyp mappar till sin multiplikator (default 1.0; 1.2 vid kohesion/storlek-samförekomst)
  - Logik: om fil innehåller minst ett element ur ett `COHESION_SIZE_PAIRS`-par, applicera 1.2× på den tyngsta vikten i paret (d.v.s. `GodClass` 1.5 → 1.8 effektivt); det lättare elementet i paret (BrainMethod 1.2) förblir oförändrat
  - Motivering: Imran et al. [IET Software 2025](https://ietresearch.onlinelibrary.wiley.com/doi/full/10.1049/sfw2/5579438) visar signifikant kohesions- och storlekseffekt av co-förekomst; 1.2× är en konservativ tolkning för att undvika överkalibrering
  - Acceptanskriterium: en fil med både GodClass och BrainMethod-Smell ska ge score ≤ (fil med enbart GodClass) vid identisk baslinje; enhetster verifierar multiplikatorn isolerat

- [ ] **[Sonnet] Integrera `coOccurrenceMultiplier()` i `calculateScore()` i `packages/core/src/scoring/scorer.ts`**
  - Anropa `coOccurrenceMultiplier(smells)` efter `countsByType`-beräkning; skala varje vikts bidrag med returvärdet från multiplikatorn
  - Säkerställ att kalibrerade vikter från `getWeights()` fortfarande används som bas och att multiplikatorn appliceras multiplicativt ovanpå
  - Acceptanskriterium: befintliga filer som enbart har GodClass eller enbart BrainMethod ska ge identiska poäng som före ändringen; testfixtur med båda ska ge lägre poäng

### C. Threshold-gated ComplexMethod-vikt + FragmentedCode-guard

- [ ] **[Sonnet] Implementera threshold-gating för ComplexMethod i `packages/core/src/scoring/scorer.ts`**
  - Definiera lokala konstanter `COMPLEX_METHOD_THRESHOLD_LOW = 15`, `COMPLEX_METHOD_THRESHOLD_HIGH = 25`, `WEIGHT_LOW = 1.0`, `WEIGHT_HIGH = 1.5`
  - Innan viktsökning: inspektera `metricValue` (CC) på varje `ComplexMethod`-Smell; använd 1.0 om CC i [15, 24], 1.5 om CC≥25
  - Om `metricValue` saknas (legacy-data): fall back till 1.5 (konservativ)
  - Logik kräver att `Smell.metricValue` är satt av respektive analyzer — verifiera att `packages/core/src/analyzers/typescript.ts`, `python.ts`, `java.ts`, `go.ts` sätter `metricValue: cyclomaticComplexity` på `ComplexMethod`-Smells
  - Acceptanskriterium: fil med en funktion CC=20 ska ge score ~0.1 högre än före; fil med CC=30 ska ge oförändrad poäng

- [ ] **[Sonnet] Implementera `FragmentedCode`-detektion i `packages/core/src/scoring/split-residue.ts`**
  - Lägg till `detectFragmentedCode(functions: FunctionResult[]): Smell[]`
  - Trigger: funktion med CC=1, längd<4 LLOC, och exakt en anropare i filen (kräver call-graph-heuristik: sök efter `functionName(` i filens övriga kod)
  - Triggar när ≥8 sådana funktioner finns i samma fil — ett högt tröskelvärde för att undvika falska positiver på verklig utility-kod
  - Acceptanskriterium: `fragmented-code-fixture.ts` (10 CC=1 single-caller-metoder) → `FragmentedCode`-Smell; `healthy/array-utils.ts` (genuine utilities med multipla callers) → inga

### D. Roll-medvetna vikter (SATT)

- [ ] **[Opus] Skapa `packages/core/src/scoring/context-weights.ts`**
  - Definiera `type ArchitectureRole = 'controller' | 'service' | 'entity' | 'util' | 'test' | 'unknown'`
  - Implementera `roleFromPath(filePath: string): ArchitectureRole` via regex-matchning mot sökvägsdelar:
    - `controller` — `/controller(s)?/`, `*Controller.*`, `*Handler.*`, `*Router.*`
    - `service` — `/service(s)?/`, `*Service.*`, `*Manager.*`, `*Facade.*`
    - `entity` — `/model(s)?/`, `/entity/`, `/domain/`, `*Entity.*`, `*Model.*`
    - `util` — `/util(s)?/`, `/helper(s)?/`, `/lib/`, `*Utils.*`, `*Helper.*`
    - `test` — `/__tests__/`, `/test(s)?/`, `*.test.*`, `*.spec.*`, `*_test.go`, `*Test.*`
    - Annars `unknown`
  - Implementera `roleWeightMultiplier(role: ArchitectureRole, smellType: SmellType): number`
    - `controller` + `GodClass` → 0.75 (orkestratorfacader förväntas vara stora)
    - `controller` + `BrainMethod` → 0.80
    - `util` + `GodClass` → 0.85 (utility-samlare är ofta avsiktligt breda)
    - `entity` + `GodClass` → 1.20 (entiteter ska vara fokuserade; extra strikt)
    - `entity` + `DataClumps` → 1.15
    - `service` + `FeatureEnvy` → 1.20 (servicelagrets primärsjuka)
    - Alla andra kombinationer → 1.0
    - Motivering: Palomba et al. [IEEE 7781795](https://ieeexplore.ieee.org/document/7781795/) SATT-modellen; ±20–30% är konservativt jämfört med deras empiriska spann
  - Definiera `interface FileScoringContext { filePath: string; role: ArchitectureRole; isTestContext: boolean; churnMultiplier: number }`
  - Exportera `buildFileScoringContext(filePath: string, churnRate?: number): FileScoringContext`
  - Acceptanskriterium: `roleFromPath('src/controllers/UserController.ts')` → `'controller'`; `roleFromPath('src/models/User.ts')` → `'entity'`; enhetstester täcker alla roller

- [ ] **[Sonnet] Integrera SATT-multiplikatorer i `calculateScore()` i scorer.ts**
  - Skapa alternativ entry point `calculateScoreWithContext(smells: Smell[], context: FileScoringContext, language?: string): { score: number; subscores: DimensionSubscores }` som anropar befintlig `calculateScore`-logik med roll- och kontext-viktning
  - Läs `FileScoringContext` i MCP-verktyget `code-health-review.ts` via `buildFileScoringContext(filePath)`
  - Bakåtkompatibilitet: `calculateScore(smells, language)` behåller sin nuvarande signatur oförändrad
  - Acceptanskriterium: `controller-god-class.ts`-fixtur (GodClass i controllers/-sökväg) ska ge score ≥ 0.1 högre än identisk fil i `models/`-sökväg

- [ ] **[Haiku] Skapa `packages/core/tests/fixtures/healthy/controller-god-class.ts`**
  - En TypeScript-klass med >20 publika metoder (GodClass-trigger) i en sökväg som inkluderar `controllers`
  - Skapa `packages/core/tests/fixtures/unhealthy/entity-god-class.ts` — identisk struktur men i `models/`-sökväg
  - Verifiera i enhetster att `buildFileScoringContext()` ger rätt roll och att poängdifferensen är ≥ 0.1 enheter
  - Acceptanskriterium: testerna passerar och `pnpm --filter @healthy-ai-code/core test` är grönt

### E. Test-kontext reachability-filter för säkerhetslukar

- [ ] **[Sonnet] Implementera `testContextMultiplier()` i `packages/core/src/scoring/context-weights.ts`**
  - `testContextMultiplier(role: ArchitectureRole, smell: Smell): number`
  - Returnerar 0.4× för säkerhetslukar (`SqlInjectionRisk`, `XssRisk`, `CommandInjectionRisk`, `HardcodedCredential`, `HardcodedApiKey`, `UnsafeDeserialization`, `PathTraversalRisk`) när `role === 'test'`
  - Kompletterande heuristik: om `Smell.description` innehåller `string literal` eller argument-token till sänkan är en sträng-literal → applicera 0.5× även utanför testkontext (reducerar false positiver för fasta konfigurationsanrop)
  - Motivering: [Konvu reachability](https://konvu.com/solutions/reachability-analysis) (90–95% brusreduktion), [Pixee SAST research](https://www.pixee.ai/blog/sast-false-positives-reduction) (91% noise reduction)
  - Acceptanskriterium: `test-sql-injection.ts`-fixtur i tests/-mapp ska ge score ≥ 9.0 (väsentligt höjd jämfört med nuläget)

- [ ] **[Haiku] Skapa `packages/core/tests/fixtures/healthy/test-sql-injection.ts`**
  - TypeScript-testfil med mock-SQL i testkontextmönster (sökväg `__tests__/`) innehållande strängliteraler som `sql.query("SELECT * FROM users WHERE id = ?", [userId])` — typisk testhjälpare
  - Komplettera med `packages/core/tests/fixtures/unhealthy/prod-sql-injection.ts` — identisk sänka men utan testmönster i sökväg, ska ge fullt SqlInjectionRisk-straff
  - Acceptanskriterium: testkontext-filen ger score ≥ 9.0, produktionsfilen ger score ≤ 7.5

### F. Churn-viktade straff + bot-commit-filter

- [ ] **[Sonnet] Implementera `isBotCommit()` och `filterBotCommits()` i `packages/core/src/temporal/hotspot-helpers.ts`**
  - `isBotCommit(authorName: string, authorEmail: string, committerName: string): boolean`
  - Matchningsstrategi (case-insensitive): `[bot]` suffix, exakt match mot `dependabot`, `renovate`, `github-actions`, `semantic-release`, `release-drafter`; email-domain `noreply.github.com`
  - `filterBotCommits<T extends { authorName: string; authorEmail: string; committerName: string }>(commits: T[]): T[]` — generisk för återanvändning
  - Uppdatera `scoreFiles()` i `hotspot-helpers.ts` att anropa `filterBotCommits()` innan commit-aggregering
  - Uppdatera `analyzeCodeChurn()` i `code-churn.ts` att filtrera bot-commits från `git log --numstat`-output; `simple-git`-loggarna inkluderar `author_name` och `author_email` via `--format=%an|%ae`
  - Motivering: [arXiv 2602.13170](https://arxiv.org/html/2602.13170) visar att bot-genererade redigeringar utgör en väsentlig andel av hotspot-historiken; exakt procenttal varierar per repo men effekten är systematisk
  - Acceptanskriterium: `analyzeCodeChurn()` med ett test-repo där hälften av commits är från `dependabot[bot]` returnerar ≤ 50% av churn-rate jämfört med utan filter

- [ ] **[Sonnet] Implementera `churnMultiplier()` i `context-weights.ts` och integrera i scorer**
  - `churnMultiplier(churnRate: number): number` — returnerar 1.0 vid churnRate<40, 1.2 vid 40–79, 1.5 vid ≥80 (speglar befintliga `MEDIUM_CHURN`/`HIGH_CHURN`-trösklar i `code-churn.ts`)
  - Multiplier appliceras på *alla* smells i filen (inte enbart churn-smellen) när `FileScoringContext.churnMultiplier > 1.0`
  - Churn-multiplikatorn aktiveras bara om `analyzeFileWithHistory()` används (analogt med hur `MethodTemporalCoupling` bara tillkommer via den entry-punkten) — dokumentera detta i JSDoc
  - Motivering: [ScienceDirect 2025](https://www.sciencedirect.com/science/article/abs/pii/S2590118425000590) (combined evolutionary+structural metrics beat structural-only for defect prediction)
  - Acceptanskriterium: fil med hög churn (>80%) och GodClass ska ge score ≥ 0.2 lägre än identisk fil med låg churn

### G. Per-dimension subscores

- [ ] **[Sonnet] Skapa `packages/core/src/scoring/subscores.ts`**
  - Definiera `interface DimensionSubscores { security: number; complexity: number; maintainability: number; duplication: number; overall: number }` — alla värden 0.0–10.0
  - Implementera `computeSubscores(smells: Smell[], baseScore: number): DimensionSubscores`
  - Dimensionskategorisering (statisk map):
    - `security`: `SqlInjectionRisk`, `XssRisk`, `CommandInjectionRisk`, `HardcodedCredential`, `HardcodedApiKey`, `UnsafeDeserialization`, `PathTraversalRisk`, `DependencyVulnerability`
    - `complexity`: `ComplexMethod`, `DeepNesting`, `BumpyRoad`, `BrainMethod`, `CognitiveComplexity`, `ComplexConditional`, `SplitResidue`, `FragmentedCode`
    - `maintainability`: `GodClass`, `FeatureEnvy`, `DataClumps`, `LowMaintainability`, `LargeFile`, `LargeMethod`, `LongParameterList`, `MessageChain`, `PrimitiveObsession`, `SATD`, `DocumentationDebt`, `IntentClarity`, `KnowledgeLoss`, `ArchitectureDebt`, `CodeChurn`, `MethodTemporalCoupling`
    - `duplication`: `StyleInconsistency` (placeholder; DuplicateCode-biomarkören finns ej ännu)
  - Varje dimensionsscore beräknas som `10.0 − Σ(weight × √count)` för lukar inom dimensionen, clampat till [1.0, 10.0]
  - `overall` sätts till `baseScore` (samma som det aggregerade svaret)
  - Acceptanskriterium: fil med enbart säkerhetslukar ska ha `security < 9.0` och `complexity === 10.0`; enhetstester verifierar gränsfall

- [ ] **[Haiku] Lägg till `subscores` i `HealthResult` och MCP-svaret**
  - Lägg till `subscores?: DimensionSubscores` som valfritt fält i `HealthResult`-interfacet i `packages/core/src/types.ts`
  - Uppdatera `calculateScoreWithContext()` i `scorer.ts` att returnera `{ score, subscores }` tupel
  - Uppdatera `packages/mcp-server/src/tools/code-health-review.ts` att inkludera `subscores` i JSON-svaret när kontextberäkning är aktiv
  - Exportera `DimensionSubscores` och `computeSubscores` från `packages/core/src/index.ts`
  - Acceptanskriterium: `pnpm -r typecheck` passerar; integration-test i `packages/mcp-server/tests/integration/` verifierar att `subscores`-fältet finns i verktygssvaret

### H. Anslutning och integrationstest

- [ ] **[Sonnet] Skriv integrationstester för hela scoring-pipelinen med kontext**
  - Skapa `packages/core/tests/context-scoring.test.ts`
  - Testa: (a) SplitResidue triggar och adderas till score, (b) co-occurrence-multiplier aktiveras vid GodClass+BrainMethod, (c) SATT-roll sänker GodClass-vikten i controller-kontext, (d) test-kontext reducerar SqlInjectionRisk, (e) churn-multiplier ökar alla luktars bidrag, (f) subscores summerar rätt
  - Använd syntetiska `Smell[]`-arrays (ingen disk-I/O krävs för unit-delarna)
  - Acceptanskriterium: `pnpm --filter @healthy-ai-code/core test` 100% grönt

- [ ] **[Haiku] Uppdatera `packages/core/src/index.ts` med alla nya exporter**
  - `FileScoringContext`, `ArchitectureRole`, `DimensionSubscores` (typer)
  - `buildFileScoringContext`, `roleFromPath`, `computeSubscores`, `calculateScoreWithContext` (funktioner)
  - `detectSplitResidue`, `detectFragmentedCode` (funktioner)
  - Acceptanskriterium: `pnpm -r typecheck` passerar; inga breaking changes i befintlig API-yta

---

## Beroenden

**Måste levereras innan Sprint 56:**
- Sprint 28 (säkerhetslukar): `SqlInjectionRisk`, `XssRisk` m.fl. är definierade i `SMELL_WEIGHTS` — redan klart
- Sprint 32 (auto-refactor): `Smell.metricValue` behöver vara satt av analyzers för threshold-gating — verifiera att TypeScript/Python/Java/Go-analyzers sätter `metricValue: cyclomaticComplexity` på `ComplexMethod`-Smells

**Sprint 56 unblocks:**
- Sprint 57 (om planerad): Pre-Act planning med dimension-awareness — `followUpInstruction` kan nu specificera vilken *dimension* (Security/Complexity) som dominerar
- RCI-integration: churn-kontexten i `FileScoringContext` ger loopen information om huruvida en fil är ett hotspot och om extra iterationer är motiverade
- Threshold-validering (Sprint 26-uppföljning): subscorerna ger mer granulär data för ECE-beräkning per dimension

---

## Testplan

```bash
# Bygg alla paket
pnpm build

# TypeScript-kontroll av alla paket
pnpm -r typecheck

# Enhetstester för core (inkl. nya scoring-tester)
pnpm --filter @healthy-ai-code/core test

# MCP-server-tester (integration)
pnpm --filter @healthy-ai-code/mcp-server test

# Kör hela testsviten
pnpm test

# Självaudit mot projektets egna filer (förväntat: score ≥ 9.0 på merparten)
node scripts/health-audit.mjs
```

**Förväntade utfall:**

| Test | Förväntat resultat |
|---|---|
| `split-residue-fixture.ts` via `analyzeCode()` | `SplitResidue`-Smell, score < 9.0 |
| `fragmented-code-fixture.ts` via `analyzeCode()` | `FragmentedCode`-Smell |
| `healthy/pure-functions.ts` | Inga `SplitResidue` eller `FragmentedCode` |
| `controller-god-class.ts` via `calculateScoreWithContext()` | Score ≥ 0.1 högre än entity-varianten |
| `test-sql-injection.ts` (i `__tests__/`-sökväg) | Score ≥ 9.0, `SqlInjectionRisk` vikt 0.4× |
| `prod-sql-injection.ts` (normalproduktion) | Score ≤ 7.5, full vikt |
| Fil med GodClass + BrainMethod | Score ≤ (enbart GodClass) − 0.05 |
| Fil med CC=20 ComplexMethod | Score 0.1 högre än nuläge |
| `pnpm -r typecheck` | Inga TypeScript-fel |

**Nya fixtures som ska skapas:**
- `packages/core/tests/fixtures/unhealthy/split-residue-fixture.ts`
- `packages/core/tests/fixtures/unhealthy/fragmented-code-fixture.ts`
- `packages/core/tests/fixtures/unhealthy/entity-god-class.ts`
- `packages/core/tests/fixtures/unhealthy/prod-sql-injection.ts`
- `packages/core/tests/fixtures/healthy/controller-god-class.ts`
- `packages/core/tests/fixtures/healthy/test-sql-injection.ts`

---

## Tekniska beslut

1. **`calculateScore()` förblir oförändrad; ny `calculateScoreWithContext()` är tillägg.** Bakåtkompatibilitet prioriteras: alla befintliga anrop via `analyzeCode()` / `analyzeFile()` går igenom befintlig signatur. Kontextpipelinen aktiveras via `analyzeFileWithHistory()` (analogt med `MethodTemporalCoupling`). Trade-off: MCP-verktyget `code-health-review.ts` måste explicit välja vilken entrypoint att använda; vi sätter `calculateScoreWithContext()` som default i reviewverktyget men dokumenterar att subscores kräver `filePath` (för rollhärledning).

2. **SATT-roll härleds från sökväg, inte AST.** AST-baserad rollklassificering (t.ex. detektera att en klass annoterad med `@RestController`) är mer korrekt men kräver framework-specifik logik för Java/Spring, Python/FastAPI, TS/Express m.fl. Sökvägsbaserad heuristik täcker ~80% av reella fall med minimalt underhåll. Falskt positiva (t.ex. en `ServiceLocator` i utility-mappen) hanteras av att rollmultiplern är modest (±20–25%).

3. **Bot-commit-filtret är en fast lista, inte ML-baserat.** En konfigurerbar allowlist/blocklist riskerar att bli fragmenterad. Den fasta listan (`dependabot`, `renovate`, `[bot]`-suffix, `noreply.github.com`) täcker de dominerande source och är konsistent med hur CodeScene och andra verktyg hanterar automations-commits. Listan exponeras som en exporterbar konstant `BOT_AUTHOR_PATTERNS` för enkel extension.

4. **Co-occurrence-multiplikatorn är 1.2× på ett par, inte kumulativt.** En fil med tre co-occurrence-par (hypotetiskt) skulle annars ge `1.2³`-multiplikator vilket är överkalibrerat och ovaliderat. Nuvarande design: max en multiplikator per fil (den starkaste aktiverade paren avgör). Kan utvidgas när empirisk validering (Sprint 26-uppföljning) ger mer granulär data.

5. **`Smell.metricValue` som bärare av CC-värde till threshold-gating.** Alternativet är att skicka raw `FunctionResult[]` till scorer. Det nuvarande valet håller scorer-interfacet snävt (tar bara `Smell[]`) och återanvänder ett befintligt fält. Kräver att alla Tier A-analyzers sätter `metricValue` på `ComplexMethod`-Smells — verifiera i sprint-scope.

---

## Risker och öppna frågor

1. **`metricValue` är inte satt konsekvent av alla analyzers.** Om Python/Java/Go-analyzers inte sätter `metricValue: cyclomaticComplexity` på `ComplexMethod`-Smells faller threshold-gating tillbaka till 1.5 (konservativt korrekt men inte produktförbättrande). Kontrollera `python.ts`, `java.ts`, `go.ts` tidigt i sprint — om fältet saknas är det en separat patch-uppgift som inte ska blocka övriga tasks.

2. **Sökvägsbaserad rollklassificering ger falska positiver vid icke-konventionella projekstrukturer.** Monorepos utan `controllers/`-mapp, funktionella arkitekturer utan lager-separation, och Python-projekt med flat layout (`src/*.py`) ger `unknown`-roll och får neutral viktning. Detta är acceptabelt men bör kommuniceras i dokumentationen och idealt i `followUpInstruction`.

3. **Churn-multiplikatorn ändrar poängskalan på ett sätt som inte är kalibrerat mot defektdata.** 1.2×/1.5× är motiverade av att kombinerade evolutionära + strukturella metrics slår strukturella-only (ScienceDirect 2025), men de exakta värdena saknar empirisk ground truth för detta projekts viktformula. Risken är att churn-viktat straff driver loopen att prioritera hotspot-filer för refaktorering, vilket är avsett, men att straffet är överdimensionerat för filer med legitimt hög historisk aktivitet (t.ex. en aktivt förbättrad core-modul). Rekommendation: aktivera multiplicatorn bara via `analyzeFileWithHistory()` (som kräver git-access) och exponera `churnMultiplierApplied: boolean` i `HealthResult`.

4. **Co-occurrence-multiplikatorn samverkar med calibrated weights.** Om `useCalibratedThresholds: true` och Java-kalibrering ger en lägre GodClass-vikt, appliceras multiplikatorn ovanpå den kalibrerade vikten. Det är matematiskt korrekt men kan ge oanade effekter om kalibrerade vikter och co-occurrence-multiplikatorn drar åt olika håll. Begränsa co-occurrence-effekten till att aldrig överstiga `originalWeight × 1.3` som tak för att förhindra extrema utfall.
