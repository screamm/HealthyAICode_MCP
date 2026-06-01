# Sprint 60: Kalibrerings-flywheel, plugin-ekosystem och open-core

**Datum:** 2026-05-30
**Status:** Planerad

---

## Mål

- Implementera opt-in, integritetsskyddad telemetri som samlar in aggregerade kalibreringssignaler (predicted vs actual score-delta per `applyAutoRefactor`-pass) och publicerar resultaten som öppna per-språk-trösklar under CC-licens — den enda moat en stängd konkurrent som CodeScene strukturellt inte kan replikera i OSS-skala.
- Stabilisera ett publikt `BiomarkerPlugin`-API (`detect(code, ast, language): Smell[]` + viktmetadata) så att externa bidragsgivare kan registrera egna biomarkörer utan att modifiera kärnkällan — speglar Semgreps regelekosystem men med stark typning och integrerat i det befintliga `analyzeByLanguage`-flödet.
- Formalisera open-core-gränsen: engine + 28 biomarkörer + alla 24 MCP-verktyg förblir MIT-licensierade permanent; enterprise-lager (portfolio-dashboards, ISO 5055-export, CI/CD SLA-enforcement) dokumenteras tydligt som kommersiell uppbyggnad ovanpå den fria kärnan.
- Designa och dokumentera en reprocuderbar benchmark-metodologi (SWE-bench-stil, RefactoringMiner-oracle) för att mäta hur väl det egna transformerflödet presterar på verkliga refaktoreringsfalls — ger en defensibel empirisk grund för threshold-påståenden och en publicerbar eval-design.

---

## Bakgrund och motivation

### Flywheel-moaten

Roadmapen identifierar kalibrerings-dataflywheeln som den enda strukturellt försvarbara fördelen gentemot CodeScene MCP (€8/mån, 25+ biomarkörer, 9.5 AI-ready-tröskel, peer-reviewed): *"Their scoring is 'patented' and closed; their calibration signal is bounded by paying customers. An open tool with opt-in, privacy-preserving telemetry can accumulate a larger multi-language calibration corpus than any subscription product."* ([roadmappen, strategi bet #2](../2026-05-30-world-class-research-roadmap.md))

Cursor-fallet visar mönstret i praktiken: varje accept/reject-signal på ett kodförslag blir en träningssignal som finjusterar modellen på verkliga kodningsbeslut ([MindStudio, AI coding models flywheel effect](https://www.mindstudio.ai/blog/ai-coding-models-flywheel-effect)). Den analoga signalen för detta projekt är `predictedScoreDelta` (som redan beräknas i `analyzeForAutoRefactor`) kontra faktisk score efter `applyAutoRefactor` + `analyzeFile`. Signalen finns — det saknas en pipeline för att samla in den och publicera kalibreringslärdomarna.

Integritetskravet är hårt: **aldrig källkod** i telemetrin. Bara aggregat — smell-typ, språk, predikterat delta, faktiskt delta, antal iterationer. Differentiell integritet (lokal randomisering på klienten) är standardmönstret för sådana verktyg ([arXiv 2507.06350, Privacy-Preserving Telemetry Scheme](https://arxiv.org/html/2507.06350v1)). Brave P3A är ett välkänt praktiskt exempel: produktanalytik samlas in som aggregerade, icke-identifierande mätvärden utan att skicka data till tredje part.

### Plugin-ekosystemet

Roadmapen pekar ut Semgreps 2 000-regelmoat som förebilden och SpecDetect4AI-DSL:en (52 återanvändbara predikater) som ritning ([roadmappen, strategi bet #7](../2026-05-30-world-class-research-roadmap.md); [arXiv 2509.20491, SpecDetect4AI](https://arxiv.org/pdf/2509.20491)). Det befintliga arkitekturmönstret — ett `LANGUAGE_DISPATCH`-objekt i `analyzeByLanguage()` och one-file-per-tool-registrering i `server.ts` — är redan nära plugin-vänligt. Det saknas ett stabilt offentligt gränssnitt och ett registreringsflöde som inte kräver patchar mot kärnkällan.

### Open-core-gränsen

Open-core är det beprövade affärsuppläget för dev-tools (HashiCorp, Grafana, SonarQube Community vs Cloud). Målet är explicit: engine + alla biomarkörer + alla MCP-verktyg förblir MIT permanent, enterprise-lager prissätts under CodeScene Standard (€18/mån per repo) och är gratis för OSS-repos ([opencoreventures.com OCV Handbook](https://handbook.opencoreventures.com/open-core-business-model/)). Det krävs ingen ny kod i detta sprint — det krävs tydlig dokumentation, LICENSE-filer och ett design-beslut om vad som placeras var.

### Benchmark-metodologin

SWE-Refactor ([arXiv 2602.03712](https://arxiv.org/html/2602.03712v1)) extraherar 1 099 rena refaktoreringsfalls från 18 Java-projekt via RefactoringMiner (99 % precision / 94 % recall) + PurityChecker (95 % precision / 88 % recall). Bästa LLM-prestation är 41,6 % (DeepSeek-V3) på atomära refaktoreringar, 39,4 % på sammansatta. Detta är oracle-graden för en trovärdig eval-design. Det egna transformerflödet (TS/JS/PHP i dag) har ingen motsvarande oracle — en credibility gap som måste stängas innan threshold-påståenden kan publiceras. RefactoringMiner 3.0 (F1=99,7 %) är den naturliga verifikations-orakeln ([github.com/tsantalis/RefactoringMiner](https://github.com/tsantalis/RefactoringMiner/blob/master/documentation/accuracy.md)).

### Tröskeln och ECE

`AI_READY_THRESHOLD = 9.5` i `packages/core/src/scoring/weights.ts` är strängare än alla publicerade klipp-nivåer: CodeScene Code Red-studien (r=−0,58 mot issue-resolution-tid, 30 737 filer) sätter grön tröskel på **8,0** ([ar5iv.labs.arxiv.org/html/2203.04374](https://ar5iv.labs.arxiv.org/html/2203.04374)); CodeScenes agentic-benchmark 2026 sätter AI-reliability-klippan på **9,4**. JIT-defektmodeller är 2–35 % felkalibrerade (Expected Calibration Error) utan empirisk validering ([arXiv 2504.12051](https://arxiv.org/abs/2504.12051)). Telemetri-pipelinen ger den data som behövs för att antingen bekräfta 9,5 eller justera ner till 9,4 — ett beslut som kan eliminera hela iterationer i loopen.

---

## Arkitektur

### Nya filer

```
packages/core/src/
  telemetry/
    types.ts                    — TelemetryEvent, AggregateCalibrationRecord (inga fält med källkod)
    collector.ts                — collectDelta(predicted, actual, language, smellType, iterations): void
    aggregator.ts               — flushAggregates(): AggregateCalibrationRecord[] (per-session batching)
    privacy.ts                  — applyLocalDifferentialPrivacy(value, epsilon): number (randomisering)
    telemetry-exporter.ts       — exportToCsv(records, outputPath): Promise<void> (opt-in, lokal fil)
    index.ts                    — re-export av publikt telemetri-API

  plugins/
    plugin-types.ts             — BiomarkerPlugin interface, PluginMetadata, PluginRegistry type
    plugin-registry.ts          — registerPlugin(), unregisterPlugin(), getActivePlugins()
    plugin-runner.ts            — runPlugins(code, ast, language): Smell[] (anropas från analyzeByLanguage)
    index.ts                    — re-export av plugin-API

packages/core/tests/fixtures/
  plugins/
    example-plugin-healthy.ts   — fixture: plugin som inte detekterar något (grön)
    example-plugin-unhealthy.ts — fixture: plugin som genererar en smell med känd vikt

packages/mcp-server/src/tools/
  telemetry-status.ts           — MCP-verktyg: code_health_telemetry_status (visa nuläge + ge samtycke)
  plugin-list.ts                — MCP-verktyg: code_health_plugin_list (lista aktiva plugins)

docs/
  open-core.md                  — Officiell gränsdragning MIT-kärna vs enterprise-lager
  benchmark-methodology.md      — Reprocuderbar eval-design: insamling, oracle, validitetshot, metriker
  calibration/
    per-language-thresholds.md  — Publicerade per-språk-trösklar (CC BY 4.0)
```

### Ändringar i befintliga filer

- **`packages/core/src/analyzers/index.ts`** — `analyzeByLanguage()` anropar `runPlugins(code, ast, language)` efter den ordinarie dispatch-tabellen och appendar returnerade smells till resultatet. Inga ändringar i `LANGUAGE_DISPATCH`-objektet.
- **`packages/core/src/index.ts`** — Exporterar `BiomarkerPlugin`, `PluginMetadata`, `registerPlugin`, `unregisterPlugin`, `collectDelta`, `flushAggregates` och tillhörande typer.
- **`packages/core/src/refactor/auto-refactor-analyzer.ts`** — `buildAutoRefactorResult()` anropar `collectDelta()` med `predictedScoreDelta` som redan beräknas; faktisk delta skickas in av kalleraren (MCP-lagret) efter `applyAutoRefactor` + ny `analyzeFile`.
- **`packages/mcp-server/src/tools/auto-refactor-apply.ts`** — Efter att ha tillämpat en patch och kört `analyzeFile` på nytt, beräknas faktisk delta och skickas via `collectDelta()` om telemetri är aktiverad.
- **`packages/mcp-server/src/server.ts`** — Registrerar `registerTelemetryStatus` och `registerPluginList`.
- **`packages/core/src/scoring/weights.ts`** — Inga vikt-ändringar; sprint 60 tillför inga nya SmellType (plugin-smells bär sin vikt i `PluginMetadata`).
- **`packages/core/src/types.ts`** — Inget nytt `SmellType` i denna sprint; plugin-genererade smells använder befintliga typer eller en generisk `'PluginSmell'` escape-hatch om plugin-registret tillåter det (tekniskt beslut, se nedan).
- **`CLAUDE.md`** — Uppdaterar "Architecture Decisions"-sektionen med telemetri-pipeline och plugin-API. Korrigerar stale `budget_tokens`-referensen (ersätts med `thinking: {type: 'adaptive'} + effort`).
- **`LICENSE`** — Bekräftar MIT; enterprise-lager dokumenteras i `docs/open-core.md`.

---

## Tasks

### 1. Integritetsskyddad telemetri-pipeline

- [ ] **[Sonnet] `packages/core/src/telemetry/types.ts` — definiera TelemetryEvent och AggregateCalibrationRecord**
  - `TelemetryEvent`: `{ smellType: SmellType; language: Language; predictedDelta: number; actualDelta: number; iterations: number; timestamp: number }` — inga kodsträngar, inga filsökvägar.
  - `AggregateCalibrationRecord`: `{ smellType: SmellType; language: Language; sampleCount: number; meanPredictedDelta: number; meanActualDelta: number; meanAbsError: number; p50Error: number; p90Error: number }`.
  - Acceptanskriterium: TypeScript-kompilering utan fel; inga fält med stränginnehåll utöver `smellType` och `language` (verifieras med grep i CI).

- [ ] **[Sonnet] `packages/core/src/telemetry/collector.ts` och `privacy.ts` — samla in och randomisera**
  - `collectDelta(event: TelemetryEvent): void` — buffrar event i en modul-lokal array, max 10 000 poster (FIFO-drop).
  - `applyLocalDifferentialPrivacy(value: number, epsilon: number): number` — adderar Laplace-brus med skala `1/epsilon`; defaultvärde `epsilon = 1.0` (måttlig integritet, kalibrering fortfarande användbar).
  - Telemetri är **opt-out som standard**: `getConfig().telemetryEnabled` (boolean, default `false`) styr om `collectDelta` faktiskt lagrar något.
  - Acceptanskriterium: enhetstester visar att output-fördelningen för 10 000 körningar har rätt Laplace-form; ingen lagring sker om `telemetryEnabled === false`.

- [ ] **[Sonnet] `packages/core/src/telemetry/aggregator.ts` och `telemetry-exporter.ts` — aggregera och exportera**
  - `flushAggregates(): AggregateCalibrationRecord[]` — beräknar mean, MAE, p50, p90 per `(smellType, language)`-kombination och rensar bufferten.
  - `exportToCsv(records, outputPath)` — skriver CSV-fil lokalt; anropas enbart explicit av operatören, inte automatiskt.
  - Acceptanskriterium: `flushAggregates()` returnerar korrekta aggregat för en syntetisk testbuffert med 100 kända events; CSV-export-test verifierar att inga extra fält skrivs.

- [ ] **[Haiku] `packages/mcp-server/src/tools/telemetry-status.ts` — MCP-verktyg**
  - Registrerar `code_health_telemetry_status` med input-schema `{ action: 'status' | 'enable' | 'disable' | 'flush' }`.
  - `status`: returnerar `{ enabled: boolean; bufferedEvents: number; oldestEventMs: number }`.
  - `flush`: anropar `flushAggregates()` och `exportToCsv()` till en konfigurerbar sökväg.
  - Acceptanskriterium: integration-test verifierar att `enable`→`disable` ändrar `getConfig().telemetryEnabled`; `flush` producerar en fil med korrekt CSV-huvud.

- [ ] **[Sonnet] `packages/mcp-server/src/tools/auto-refactor-apply.ts` — anslut faktisk delta till telemetri**
  - Efter att ha kört `analyzeFile()` på den modifierade koden, beräkna `actualDelta = newScore - oldScore`.
  - Anropa `collectDelta({ smellType, language, predictedDelta, actualDelta, iterations, timestamp: Date.now() })` om telemetri är aktiverat.
  - Acceptanskriterium: integration-test med ett känt fixture-par (unhealthy→healthy) verifierar att `collectDelta` anropas med rätt `actualDelta` (± 0,1).

### 2. Publicering av per-språk-trösklar under CC-licens

- [ ] **[Sonnet] `docs/calibration/per-language-thresholds.md` — strukturerat tröskeldokument**
  - Tabellformat: `| Språk | GreenThreshold | AiReadyThreshold | SmellType | EmpiricalBasis | SampleCount | ConfidenceInterval |`.
  - Inledande version täcker Java (Defects4J, befintlig kalibrering via `loadCalibration()`), Python (syntestiskt benchmark), TypeScript (syntestiskt benchmark). Övriga språk markeras `preliminary`.
  - Licens-huvud: `© 2026 Healthy AI Code contributors — CC BY 4.0`.
  - Acceptanskriterium: dokumentet existerar, kan parsas som Markdown-tabell, innehåller exakta värden från `calibration-loader.ts` för Java.

- [ ] **[Haiku] Automation: `scripts/publish-thresholds.mjs` — generera tröskeltabellen från körtids-aggregat**
  - Läser `AggregateCalibrationRecord[]` från en lokal CSV (producerad av `exportToCsv`), beräknar förslag på reviderade trösklar (mean actualDelta per smellType per språk), skriver ut en diff mot befintliga trösklar i `per-language-thresholds.md`.
  - Körs manuellt av underhållare, inte i CI.
  - Acceptanskriterium: scriptet är körbart med `node scripts/publish-thresholds.mjs --input path/to/telemetry.csv --dry-run` och producerar läsbar utdata utan att skriva filer.

### 3. BiomarkerPlugin-API

- [ ] **[Opus] `packages/core/src/plugins/plugin-types.ts` — stabilisera publikt interface**
  - `BiomarkerPlugin`:
    ```typescript
    export interface BiomarkerPlugin {
      readonly name: string;
      readonly version: string;
      readonly metadata: PluginMetadata;
      detect(code: string, language: Language, filePath?: string): Smell[];
    }
    export interface PluginMetadata {
      supportedLanguages: Language[] | 'all';
      smellWeights: Partial<Record<string, number>>;  // smell-typ-sträng → vikt
      description: string;
      author: string;
      license: string;
    }
    ```
  - Designbeslut: plugins deklarerar sina vikter i `PluginMetadata.smellWeights`; `calculateScore()` i `scorer.ts` slår upp pluginvikter som fallback om `SmellType` inte finns i `SMELL_WEIGHTS`. Smells med okänd typ kräver att plugin-registret har registrerat vikten — annars vikt 0 och varning.
  - Acceptanskriterium: interface exporteras utan breaking changes till befintliga `SmellType`; TypeScript strict-mode kompilerar utan fel.

- [ ] **[Sonnet] `packages/core/src/plugins/plugin-registry.ts` och `plugin-runner.ts`**
  - `registerPlugin(plugin: BiomarkerPlugin): void` — validerar att `name` är unikt, att `smellWeights` inte använder reserverade kärnnamn (whitelist-check), och lagrar i en modul-lokal Map.
  - `unregisterPlugin(name: string): boolean`.
  - `runPlugins(code: string, language: Language, filePath?: string): Smell[]` — anropar enbart plugins med matchande `supportedLanguages`; fångar throws per plugin och loggar till stderr utan att kasta vidare (isoleringsgaranti).
  - Acceptanskriterium: enhetstester verifierar att (a) ett plugin som kastar inte stoppar analysen av andra plugins, (b) ett plugin med `supportedLanguages: ['python']` inte anropas för TypeScript-filer, (c) registrering av ett plugin med befintligt `name` ger `Error`.

- [ ] **[Sonnet] `packages/core/src/analyzers/index.ts` — integrera plugin-runner i `analyzeByLanguage()`**
  - Lägg till anrop `const pluginSmells = runPlugins(code, language, filePath)` efter den ordinarie dispatch och appendar till `smells`-arrayen i `AnalyzerOutput`.
  - Om `getActivePlugins().length === 0` hoppas anropet över (noll overhead för baskonfiguration).
  - Acceptanskriterium: integration-test registrerar ett testplugin, kör `analyzeCode()` och verifierar att plugin-smells syns i `HealthResult.smells`; avregistrering tar bort dem.

- [ ] **[Haiku] `packages/mcp-server/src/tools/plugin-list.ts` — MCP-verktyg**
  - Registrerar `code_health_plugin_list` (inga inputs), returnerar `{ plugins: Array<{ name, version, supportedLanguages, description, author, license }> }`.
  - Acceptanskriterium: verktyget returnerar tom array vid inga registrerade plugins; registreras korrekt i `createServer()` i `server.ts`.

- [ ] **[Sonnet] Fixtures för plugin-API: `packages/core/tests/fixtures/plugins/`**
  - `example-plugin-healthy.ts` — ett BiomarkerPlugin som alltid returnerar `[]`; används i enhetstester för att verifiera noll-overhead-väg.
  - `example-plugin-unhealthy.ts` — ett BiomarkerPlugin som returnerar en `Smell` med `type: 'ComplexMethod'` på rad 1, vikt 1.5 (matchar befintlig kärna för prediktabel scoring); används för att verifiera att score-påverkan är korrekt.
  - Acceptanskriterium: `analyzeCode()` på `example-plugin-unhealthy.ts`-fixture med det entsprechande plugin registrerat ger score < 10.0.

### 4. Open-core-gränsdragning

- [ ] **[Sonnet] `docs/open-core.md` — formell gränsdragning**
  - Sektion "MIT-kärna (permanent)": lista alla 24 MCP-verktyg i `server.ts`, engine (`analyzeCode`, `analyzeFile`, `analyzeFileWithHistory`), alla 28+ biomarkörer, `runRefactoringLoop`, plugin-API, telemetri-pipeline.
  - Sektion "Enterprise-lager (kommersiell uppbyggnad)": portfolio-dashboards (analys av N repos med aggregerad vy), ISO 5055-export (`--format iso5055`, se roadmap strategi bet #6), CI/CD SLA-enforcement (blockera merge om score < tröskel, requires webhook), kunskapsloss-rapporter per org-diagram.
  - Sektion "Prissättning och OSS-undantag": gratis för repos med offentlig licens; betald per aktiv author-månad under CodeScene Standard (€18).
  - Acceptanskriterium: dokumentet existerar och listar samtliga verktyg i `server.ts` exakt (Haiku verifierar via grep).

- [ ] **[Haiku] Kontrollera att inga MIT-skyddade filer refererar enterprise-features**
  - Kör grep på `packages/core/src/` och `packages/mcp-server/src/` efter strängar som `'enterprise'`, `'iso5055'`, `'portfolio'` och verifiera att inga sådana finns (dokumenteras i CI-kommentaren till detta task).
  - Acceptanskriterium: grep returnerar noll träffar i källkoden; enterprise-references finns enbart i `docs/`.

### 5. Benchmark-metodologi

- [ ] **[Opus] `docs/benchmark-methodology.md` — reprocuderbar eval-design**
  - **Insamling**: Extrahera rena refaktoreringsfalls från GitHub-repos via RefactoringMiner 3.0 (F1=99,7 % per [dokumentation](https://github.com/tsantalis/RefactoringMiner/blob/master/documentation/accuracy.md)) + PurityChecker (95 % precision). Filter: kompilerar, testsvit grön, ingen blandad feature-commit (samma approach som SWE-Refactor, [arXiv 2602.03712](https://arxiv.org/html/2602.03712v1)).
  - **Oracle**: RefactoringMiner bekräftar att rätt refaktoreringstyp skett utan oavsiktliga ändringar (samma verifikation-oracle som SWE-Refactor).
  - **Metriker**: (1) Compilation success rate. (2) Test-suite pass rate. (3) RefactoringMiner AST-verifiering (ja/nej). (4) Score-delta (predicted vs actual, MAE). (5) CodeBLEU (textlig + strukturell likhet med human-refactored ground truth).
  - **Validitetshot** (obligatoriskt avsnitt): (a) Java-bias: RefactoringMiner är Java-only — Python/TS-falls kräver alternativa oracles (Rope för Python, ts-morph för TS). (b) Selection bias: projekt som väljer att använda refaktorerings-commits är inte representativa för alla kodbaser. (c) Goodhart-trap: score-optimering utan beteendepreservering uppfyller inte benchmarkens krav — kompilerings + testsuite är det faktiska godkännandekriteriet. (d) LLM-contaminering: benchmark-instanser bör komma från repos med commits efter träningsdatans cutoff.
  - **Reproducerbarhet**: Alla steg ska köras med `node scripts/run-benchmark.mjs --corpus path/to/corpus.jsonl --outputDir results/` utan manuella steg.
  - Acceptanskriterium: dokumentet innehåller ett konkret exempel-run med ett syntetiskt mini-corpus (3 instanser) som verifieras i CI med `pnpm --filter @healthy-ai-code/core test -- --testPathPattern=benchmark`.

- [ ] **[Sonnet] `packages/core/tests/integration/benchmark-eval.test.ts` — smoke-test för eval-pipeline**
  - Läser 3 syntetiska benchmark-instanser (TypeScript, format: `{ before: string; after: string; refactoringType: string; language: Language }`).
  - Kör `analyzeCode(before)` och `analyzeCode(after)`, verifierar att `after.score > before.score`.
  - Kör `analyzeForAutoRefactor(before)` och verifierar att `refactoringStrategy` matchar `refactoringType` i fixture.
  - Acceptanskriterium: `pnpm --filter @healthy-ai-code/mcp-server test -- --testPathPattern=benchmark-eval` passerar; inga externa nätverksanrop.

- [ ] **[Haiku] `packages/core/tests/fixtures/benchmark/` — syntetiska benchmark-instanser**
  - `instance-extract-method.json`: TypeScript-funktion med `ComplexMethod`-lukt (CC > 15) som before; manuellt refaktorerad version som after.
  - `instance-early-return.json`: TypeScript-funktion med `DeepNesting` som before; guard-clause-version som after.
  - `instance-god-class.json`: TypeScript-klass med `GodClass`-lukt som before; uppdelad version som after.
  - Acceptanskriterium: alla tre instanser har `after.score >= before.score + 0.5`; verifieras av smoke-testet ovan.

### 6. CLAUDE.md — korrigera stale dokumentation

- [ ] **[Haiku] Uppdatera `CLAUDE.md` — API Usage Tips-sektionen**
  - Ta bort `budget_tokens`-referensen; ersätt med `thinking: {type: 'adaptive'} + effort` (Opus 4.7/4.8 kastar 400-fel vid manuell `budget_tokens`, enligt roadmappen).
  - Ta bort beta-header-kravet för fine-grained tool streaming (GA på Sonnet 4.6+, ingen header krävs).
  - Lägg till sektion "Telemetri och plugin-API" som pekar på `docs/open-core.md` och `packages/core/src/plugins/plugin-types.ts`.
  - Acceptanskriterium: grep på `budget_tokens` i `CLAUDE.md` returnerar noll träffar efter ändringen.

---

## Beroenden

**Förutsätter landad funktionalitet:**
- Sprint 32 (`analyzeForAutoRefactor`, `applyAutoRefactor`, `predictedScoreDelta`) — redan levererat; telemetri-pipelinen beror direkt på `AutoRefactorResult.predictedScoreDelta`.
- Sprint 28 (security-smells, `SmellType`-union) — redan levererat; plugin-API måste inte krocka med befintliga SmellType-namn.

**Vad detta unblocks:**
- En fungerande telemetri-pipeline och öppna per-språk-trösklar ger den empiriska grunden för sprint 61 (multi-språk ECE-validering och threshold re-anchoring).
- Plugin-API:et möjliggör att SpecDetect4AI LLM-integration-smells (UMM, NMVP, NSM, NSO, TNES) implementeras som ett externt plugin i en nästkommande sprint utan kärnpatchar.
- Benchmark-metodologidokumentet är en förutsättning för att publicera en trovärdig prestandajämförelse mot CodeScene och SWE-Refactor.

---

## Testplan

```bash
# Bygg alla paket
pnpm build

# Typkontroll
pnpm -r typecheck

# Kör alla core-tester (inkl. nya telemetri- och plugin-enhetstester)
pnpm --filter @healthy-ai-code/core test

# Kör enbart MCP-integration-tester (inkl. telemetry-status och plugin-list verktyg)
pnpm --filter @healthy-ai-code/mcp-server test

# Kör benchmark smoke-test explicit
pnpm --filter @healthy-ai-code/mcp-server test -- --testPathPattern=benchmark-eval

# Self-audit efter ändringarna (verifierar att CLAUDE.md-modifieringen inte sänkt något)
node scripts/health-audit.mjs

# Smoke-test telemetri: aktivera, kör ett auto-refactor-apply, flush
# (manuellt, ingen CI-automatik i detta sprint)
```

**Förväntade utfall:**
- `pnpm -r typecheck` — noll TypeScript-fel med `strict: true`.
- `pnpm --filter @healthy-ai-code/core test` — befintliga tester fortsätter gröna; nya tester (telemetri-aggregering, plugin-isolering, plugin-scoring) passerar.
- `pnpm --filter @healthy-ai-code/mcp-server test` — `code_health_telemetry_status` och `code_health_plugin_list` registreras korrekt och returnerar rätt JSON-struktur.
- Benchmark smoke-test — 3 fixtures, alla `after.score > before.score`.
- `node scripts/health-audit.mjs` — projektets egna filer uppnår ≥ 9.5 (inga regressioner inför självaudit).

**Nya fixtures under `packages/core/tests/fixtures/`:**
- `plugins/example-plugin-healthy.ts` — alltid tom smell-lista.
- `plugins/example-plugin-unhealthy.ts` — returnerar ett `ComplexMethod`-smell på rad 1.
- `benchmark/instance-extract-method.json`
- `benchmark/instance-early-return.json`
- `benchmark/instance-god-class.json`

---

## Tekniska beslut

1. **Telemetri opt-out som default, inte opt-in.** Beslutet är att `telemetryEnabled` är `false` om inte operatören explicit sätter det. Alternativet (opt-in-prompt vid första körning) är implementeringsmässigt enklare men kräver interaktivitet som inte passar en MCP-server. Nackdel: lägre datainsamlingstakt initialt; fördel: inget GDPR-problem och ingen förväntning att hantera.

2. **Plugin-smells får använda befintliga SmellType-strängar, inte en separat union.** Detta undviker att `SMELL_WEIGHTS` behöver ändras varje gång ett plugin registreras. En plugin som returnerar `type: 'ComplexMethod'` scorer korrekt med befintlig vikt. Plugins som vill introducera helt nya smell-typer måste deklarera vikten i `PluginMetadata.smellWeights` och `calculateScore()` måste utökas med en plugin-vikts-lookup. Avvägning: mer flexibelt för plugin-författare, men riskerar namnkollision — registrets whitelist-check på reserverade namn minskar risken.

3. **Benchmark-metodologin är Java-first (RefactoringMiner-oracle) med planerad utökning till TypeScript.** RefactoringMiner 3.0 har dokumenterat F1=99,7 % för Java. Python och TypeScript saknar en lika stark oracle — `rope` och `ts-morph` kan bekräfta att syntax är korrekt men inte att det var rätt refaktoreringstyp. Beslutet är att dokumentera detta som validitetshot snarare än att blockera publiceringen av metodologin.

4. **Open-core-gränsen är ett dokumentationsbeslut i detta sprint, inte kod.** Inga feature-flags, inga runtime-checks. Enterprise-filer existerar inte i källkoden ännu. Alternativet (sätta en runtime-feature-gate direkt) kräver ett licensvalideringssystem som är out-of-scope. Nackdel: inget tekniskt skydd mot fork som plockar upp enterprise-beskrivna features gratis. Fördel: zero complexity, och förtroende-signalvärdet av ett tydligt dokument är tillräckligt på denna mognadsnivå.

5. **Lokalt differentiell integritet med epsilon = 1,0 som default.** Epsilon-värdet styr avvägningen mellan integritet (lågt ε) och kalibreringsnoggrannhet (högt ε). Epsilon 1,0 är standardvärdet i litteraturen (Brave P3A, Apple iOS) för produkttelemetri. Kalibreringssignalen (delta-error) är tillräckligt grof för att klara detta brus-niveau utan att förstöra statistiken. Operatörer med full kontroll kan sätta `epsilon: Infinity` för att stänga av bruset helt.

---

## Risker och öppna frågor

1. **Ingen adoption → ingen flywheel.** Telemetri-pipelinen är meningslös utan tillräckligt många aktiva installationer. Roadmappen är explicit: SARIF-integration och MCP Registry-listing (strategi bet #1) måste landa innan flywheel-effekten kan mätas. Detta sprint levererar infrastrukturen; data uppstår enbart om distribution-sprints levereras parallellt.

2. **Plugin-API stabilitet.** `BiomarkerPlugin`-interfacet är en offentlig kontrakt. Breaking changes (t.ex. att lägga till ett obligatoriskt `init()`-anrop) påverkar externa plugin-författare. En `version`-fält i `PluginMetadata` och en `PLUGIN_API_VERSION`-konstant exporterad från `plugin-types.ts` ger ett migrations-spår — men det kräver ett explicit kompatibilitetsåtagande som underhållarna måste följa. Öppen fråga: ska plugin-API:et ha en separat semver-version från paket-versionen?

3. **RefactoringMiner är Java-only.** Benchmark-metodologin är trovärdig för Java-falls; TypeScript och Python-falls saknar en lika stark oracle. Beslutet att dokumentera detta som validitetshot är korrekt men innebär att prestandajämförelsen mot CodeScene (som också är Java-centrerad) inte täcker projektets bredaste styrka (41 språk). En ts-morph-baserad oracle för TypeScript är en rimlig nästa fas.

4. **Epsilon-parametern är inte granskad av en privacy-expert.** Epsilon 1,0 är ett välkänt industri-standardvärde, men lokaliseringen av Laplace-bruset (lokal differentiell integritet vs central) och säkerheten i aggregeringspipelinen är inte formellt verifierade. Om telemetri-data ska publiceras öppet krävs en mer rigorös analys. Rekommendation: publicera råaggregat (inte individual events) och kräv att minst 100 samplecount per cell finns innan en cell exponeras i `per-language-thresholds.md`.
