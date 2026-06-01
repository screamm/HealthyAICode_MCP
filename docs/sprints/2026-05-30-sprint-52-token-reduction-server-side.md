# Sprint 52: Token-reduktion på serversidan — deferred loading, diff-svar, strukturell re-review

**Datum:** 2026-05-30
**Status:** Planerad

---

## Mål

- Implementera deferred tool loading via Tool Search Tool (`advanced-tool-use-2025-11-20`) för ~22 icke-loop-verktyg, vilket eliminerar ~85 % av verktygsschema-overhead per request.
- Lägga till `editMode: 'patch' | 'funcRewrite' | 'fileRewrite'` i `code_health_auto_refactor` och leverera deterministiska patch-svar för TS/JS/PHP via befintliga transformrar, med adaptiv formatvalslogik inspirerad av [SWE-Edit](https://arxiv.org/abs/2604.26102).
- Implementera strukturell re-review i `code_health_review`: efter första analysen returnerar verktyget enbart `{file, functionName, byteRange, smellType, score}` per smell och levererar fokus-excerpts via det befintliga `focusLines`-fältet, istället för att re-skicka hela filtexten varje iteration.
- Koda `smells[]`-arrayen i TOON-tabellformat (headers deklareras en gång, värden som rader) med 30–60 % tokenreduktion jämfört med upprepad JSON-nyckelrepetition.
- Emittera ett score-keyed modell- och effort-routingförslag i `followUpInstruction` (Opus 4.8 `xhigh` vid score < 7, Sonnet 4.6 `medium` vid 7–9, Haiku 4.5 `low` vid score ≥ 9) för att guida klienter att sänka inference-kostnaden med ~40–51 % per session.

---

## Bakgrund och motivation

Projektet exponerar 27 MCP-verktyg i `packages/mcp-server/src/server.ts`, men en typisk refaktoreringsloop (`code_health_review` → `code_health_auto_refactor` → apply → re-review) använder bara 3–4 av dessa. Alla 27 schemadefinitioner skickas ändå med i varje request. Anthropic mätte 58 verktyg ≈ 55 K tokens som föll till ≈ 8,7 K med Tool Search Tool, och verktygsval-accuracy på Opus 4.5 steg från 79,5 % till 88,1 % ([Anthropic: Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)). Unified.to rapporterar 90–96 % reduktion av input-tokens med dynamiska toolsets vid bibehållen 100 % framgångsfrekvens ([Scaling MCP Tools with defer loading](https://unified.to/blog/scaling_mcp_tools_with_anthropic_defer_loading)).

Det konkreta API-stödet är väldefinierat: lägg till `defer_loading: true` på varje verktyg som ska sökas on-demand, inkludera `tool_search_tool_regex_20251119` eller `tool_search_tool_bm25_20251119` (söker namn, beskrivning, argumentnamn och argumentbeskrivningar) och aktivera med beta-headern `advanced-tool-use-2025-11-20`. MCP-servrar behöver inte ändra klientkod — klientapplikationen ansvarar för att skicka rätt beta-header och toollist. Serverns ansvar är att dokumentera vilka verktyg som är loop-kritiska (ej deferred) vs. utforsknings-verktyg (deferred).

`code_health_auto_refactor` returnerar idag hela filens eller funktionens text via `fullFileContent` och `currentCode`. [FuncDiff/BlockDiff-forskning](https://arxiv.org/html/2604.27296) visar att diff-format matchar eller överträffar full-rewrite-precision vid 30 %+ lägre tokenkostnad för kod > 300 tokens. [SWE-Edit](https://arxiv.org/abs/2604.26102) visar att adaptiv formatvälning ger +2,1 pp resolved rate och −17,9 % inference-kostnad simultaneously. För TS/JS/PHP där deterministiska transformrar redan finns i `packages/core/src/refactor/auto-refactor-applier.ts` (`applyEarlyReturn`, `applySimplifyConditional`, `applyExtractMethodFull`, m.fl.) kan servern leverera det exakta diff-resultatet utan att LLM behöver regenerera koden.

Strukturell re-review adresserar den dolda loop-kostnaden: `code_health_review` skickar om hela filen varje iteration. Praxis inspirerad av index-once-query-cheaply-modellen rapporterar 10× färre tokens och 2,1× färre tool calls vid 83 % svars-kvalitet ([arXiv 2603.27277](https://arxiv.org/abs/2603.27277)); JCodeMunch visar ett konkret 3 850→700 token-fall (5,5×) ([JCodeMunch](https://github.com/jgravelle/jcodemunch-mcp)).

TOON (Token-Oriented Object Notation) deklarerar nycklar en gång och stream-ar värden som rader, likt CSV — 30–60 % tokenreduktion jämfört med JSON för homogena arrays ([TOON spec](https://github.com/toon-format/toon), [InfoQ](https://www.infoq.com/news/2025/11/toon-reduce-llm-cost-tokens/)). `smells[]` är just en homogen array av objekt med samma fält (`type`, `severity`, `description`, `suggestion`, `line`, `endLine`) — ett idealfall för tabellkodning.

Score-keyed model routing: `followUpInstruction` i `packages/core/src/refactor/follow-up-instruction.ts` emitterar redan effort-hints (via `modelNote` och `successLikelihood`), men skickar inte ett explicit modell-tier-förslag keyed direkt på den aktuella poängen. Tre-tiers-routing rapporteras ge ~51 % kostnadsreduktion per session ([Augment routing guide](https://www.augmentcode.com/guides/ai-model-routing-guide)). Effort-nivåerna kostar 0,3× (low), 0,6× (medium) och 1,0× (high) i thinking-tokens ([Anthropic effort docs](https://platform.claude.com/docs/en/build-with-claude/effort)). Haiku 4.5 ($1/$5 per MTok) vs Opus 4.8 ($5/$25) ger ytterligare 5× prisreduktion för re-review-steg vid score ≥ 9,0 där bara JSON-parsning och `loopComplete`-kontroll krävs.

---

## Arkitektur

### Nya filer

```
packages/mcp-server/src/
  tool-registry.ts            — Konstant-lista: LOOP_TOOLS (ej deferred) vs DEFERRED_TOOLS (~22 verktyg);
                                 exporterar buildToolList() som returnerar rätt defer_loading-flaggor
  tools/toon-encoder.ts       — encodeToon(smells: Smell[]): string — headers + TSV-rader, lossless runt-trip
  tools/structural-cache.ts   — StructuralCache: Map<filePath, {smellIndex, firstReviewAt}>;
                                 getByteRangeExcerpt(filePath, byteRange): string

packages/core/src/refactor/
  edit-mode-selector.ts       — selectEditMode(smell, functionLineCount): 'patch'|'funcRewrite'|'fileRewrite'
                                 + buildPatchResponse(applierResult, originalCode): DiffPatch

packages/core/src/refactor/follow-up-instruction.ts
  (befintlig fil — utökas, ingen ny fil)
```

### Ändringar i befintliga filer

- **`packages/mcp-server/src/server.ts`** — Importerar och anropar `buildToolList()` från `tool-registry.ts` istället för att registrera alla verktyg med identiskt mönster. Loop-kritiska verktyg (`code_health_review`, `code_health_auto_refactor`, `code_health_auto_refactor_apply`, `code_health_score`, `pre_commit_code_health_safeguard`) registreras utan `defer_loading`; resterande ~22 verktyg (bl.a. `auditSecurity`, `analyzeBusFactor`, `analyzeArchitectureDebt`, `registerHotspots`, `registerTrendAnalysis`, `registerKnowledgeMap`, `registerMethodCoupling`, `registerAiAudit`, `registerModelBenchmark`, `registerSecurityAudit`, `registerArchitectureReport`, `registerCalibrationStatus`, `registerValidateDataset`, `registerDebtGoalsTools`, `registerRefactoringBusinessCase`, `registerExplainCodeHealth`, `registerExplainProductivity`, `registerAnalyzeChangeSet`, `registerAIReadiness`) markeras med `defer_loading: true`.

- **`packages/mcp-server/src/tools/auto-refactor.ts`** — Input-schema utökas med `editMode: z.enum(['patch','funcRewrite','fileRewrite']).optional()`; `handleAutoRefactor` anropar `selectEditMode()` om `editMode` ej specificeras; för `'patch'`-läge anropas befintlig `applyAutoRefactor()` och resultatet kodas som ett unified-diff-format objekt i svaret istället för `fullFileContent`; `buildHealthyResponse` påverkas ej.

- **`packages/mcp-server/src/tools/code-health-review.ts`** — Importerar `StructuralCache` från `structural-cache.ts`; efter första review-anropet på en fil lagras smell-indexet i cachen; vid efterföljande anrop av samma fil returneras `byteRanges[]` per smell istället för `summary` med full text; befintliga `formatReviewSummary` och `buildNextAction` i `shared.ts` används fortfarande för första-anropet.

- **`packages/mcp-server/src/tools/shared.ts`** — `formatReviewSummary` utökas med en valfri `useToon: boolean`-flagga; om true anropar den `encodeToon(result.smells)` istället för den befintliga text-loop; inga ändringar i `buildNextAction`-logiken.

- **`packages/core/src/refactor/follow-up-instruction.ts`** — `FollowUpParams` utökas med `currentScore: number`; `buildFollowUpInstruction` lägger till ett `suggestedModel`-fält i den returnerade strängen baserat på score-trösklarna (`< 7.0` → `claude-opus-4-8 effort:xhigh`, `7.0–8.99` → `claude-sonnet-4-6 effort:medium`, `≥ 9.0` → `claude-haiku-4-5 effort:low`); `modelNote`-fältet som redan finns i `FollowUpParams` används av det nya routing-blocket.

- **`packages/core/src/refactor/auto-refactor-analyzer.ts`** — Skickar `currentScore` till `buildFollowUpInstruction` via den utökade `FollowUpParams`-typen; exporterar `selectEditMode` re-export från `edit-mode-selector.ts`.

---

## Tasks

### 1. Deferred tool loading — tool-registry

- [ ] **[Sonnet] Skapa `packages/mcp-server/src/tool-registry.ts`**
  - Definiera `LOOP_TOOLS: readonly string[]` = de 5 loop-kritiska verktygsnamnen som ska vara omedelbart tillgängliga.
  - Definiera `DEFERRED_TOOLS: readonly string[]` = de ~22 utforsknings-/analys-verktyg som ska markeras `defer_loading: true`.
  - Exportera `getDeferredToolNames(): readonly string[]` för testbarhet.
  - Dokumentera i JSDoc vilket beta-header klienten måste skicka (`advanced-tool-use-2025-11-20`) och vilka två tool-search-varianter som stöds (`tool_search_tool_regex_20251119`, `tool_search_tool_bm25_20251119`).
  - **Acceptanskriterium:** `getDeferredToolNames().length` returnerar exakt 22 och innehåller inte något av de 5 loop-kritiska verktygen.

- [ ] **[Haiku] Uppdatera `packages/mcp-server/src/server.ts`**
  - Importera `DEFERRED_TOOLS` från `tool-registry.ts`.
  - Alla befintliga `register*`-anrop bevaras; lägg till ett post-registration-steg som itererar `server.listTools()` och sätter `defer_loading: true` på verktyg vars namn finns i `DEFERRED_TOOLS`.
  - Alternativt: om MCP SDK exponerar en `deferTool(name: string)` eller liknande — använd den; annars dokumentera hur patchen appliceras på det registrerade verktygs-objektet.
  - **Acceptanskriterium:** `pnpm build` lyckas; en manuell inspektion av den genererade tool-listan visar att exakt 22 verktyg har `defer_loading: true`.

- [ ] **[Sonnet] Integrationstest för tool-registry**
  - Ny testfil `packages/mcp-server/tests/integration/tool-registry.test.ts`.
  - Verifierar att `LOOP_TOOLS` och `DEFERRED_TOOLS` är disjunkta mängder.
  - Verifierar att totala antalet verktyg (union) matchar antalet `register*`-anrop i `server.ts`.
  - **Acceptanskriterium:** `pnpm --filter @healthy-ai-code/mcp-server test` passerar.

### 2. editMode — adaptiv diff/patch-respons i auto-refactor

- [ ] **[Sonnet] Skapa `packages/core/src/refactor/edit-mode-selector.ts`**
  - Exportera `selectEditMode(smellType: SmellType, functionLineCount: number): 'patch' | 'funcRewrite' | 'fileRewrite'`.
  - Logik: `'patch'` för `MagicNumber`, `HardcodedCredential`, `HardcodedApiKey`, `early_return`-strategi och funktioner < 20 rader; `'funcRewrite'` för `ComplexMethod`, `BrainMethod`, `DeepNesting`, `BumpyRoad` med funktioner 20–150 rader; `'fileRewrite'` för `GodClass` eller funktioner > 150 rader.
  - Exportera `buildPatchDiff(original: string, transformed: string, filePath: string): string` som genererar ett minimalt unified diff-format (tre context-rader) från två strängar via radbaserad jämförelse — inga externa beroenden.
  - **Acceptanskriterium:** Enhetstester verifierar alla tre grenar och att `buildPatchDiff` producerar ett parsbart unified-diff-format (header `--- a/`, `+++ b/`, `@@ -N,M +N,M @@`).

- [ ] **[Sonnet] Uppdatera `packages/mcp-server/src/tools/auto-refactor.ts`**
  - Lägg till `editMode: z.enum(['patch','funcRewrite','fileRewrite']).optional()` i input-schemat med description om de tre lägena.
  - I `handleAutoRefactor`: om `editMode === 'patch'` och språket är TS/JS/PHP — anropa befintlig `applyAutoRefactor(code, refactorResult)` från `@healthy-ai-code/core`, beräkna diff via `buildPatchDiff`, returnera `{editMode: 'patch', diff, changes, strategy}` istället för `fullFileContent`.
  - Om `editMode` ej anges, anropa `selectEditMode(refactorResult.smell.type, lineCount)` för automatisk val.
  - Fallback: om `editMode === 'patch'` men språket är ej TS/JS/PHP, sätt `editMode = 'funcRewrite'` automatiskt och returnera `currentCode`-utdraget som vanligt.
  - **Acceptanskriterium:** Manuellt anrop med `{filePath: "<ts-fil med MagicNumber>", editMode: "patch"}` returnerar ett `diff`-fält utan `fullFileContent`; anrop utan `editMode` väljer rätt läge baserat på smell.

- [ ] **[Haiku] Lägg till fixtures för patch-läge**
  - `packages/core/tests/fixtures/unhealthy/magic-number-patch.ts` — en kort TypeScript-funktion (< 20 rader) med tre magic numbers.
  - `packages/core/tests/fixtures/healthy/magic-number-patch-fixed.ts` — samma funktion med konstanter introducerade.
  - Lägg till enhetstest i `packages/core/tests/` som verifierar att `buildPatchDiff(unhealthy, healthy, 'magic-number-patch.ts')` producerar ett diff som applicerat på `unhealthy` ger `healthy`.
  - **Acceptanskriterium:** `pnpm --filter @healthy-ai-code/core test` passerar med de nya fixturerna.

### 3. Strukturell re-review — byteRange-only svar

- [ ] **[Sonnet] Skapa `packages/mcp-server/src/tools/structural-cache.ts`**
  - Exportera klass `StructuralCache` med metoderna:
    - `recordFirstReview(filePath: string, smells: Smell[], score: number): void` — sparar indexet och timestamps.
    - `hasReview(filePath: string): boolean` — returnerar true om filen setts tidigare i sessionen.
    - `getSmellIndex(filePath: string): SmellIndexEntry[] | undefined` — returnerar `{smellType, functionName, startLine, endLine, severity}[]`.
    - `invalidate(filePath: string): void` — anropas om filen ändrats (baserat på mtime jämförelse).
  - Singleton-export: `export const structuralCache = new StructuralCache()`.
  - Max 200 entries (LRU-eviction, analogt med `rangesCache` i `method-coupling-helpers`).
  - **Acceptanskriterium:** Enhetstester verifierar `hasReview`, `getSmellIndex` och LRU-eviction vid 201 entries.

- [ ] **[Sonnet] Uppdatera `packages/mcp-server/src/tools/code-health-review.ts`**
  - Importera `structuralCache` från `structural-cache.ts`.
  - I `handleCodeHealthReview`: om `structuralCache.hasReview(filePath)` och filen inte ändrats (kontrollera `fs.stat(filePath).mtimeMs` mot cachat värde):
    - Returnera ett komprimerat svar: `{score, category, loopComplete, smellIndex: cache.getSmellIndex(filePath), cacheHit: true, note: "Re-review: returnerar byteRange-index, inte full text. Anropa med focusLines för specifikt utdrag."}`.
    - Utelämna `summary` (den text-tunga sammanfattningen) och `issues`-arrayen med full text.
  - Vid första anropet: anropa befintlig `analyzeFile`/`analyzeFileWithHistory`, kör `structuralCache.recordFirstReview(...)`, returnera fullständigt svar som tidigare.
  - Invalidera cache om `filePath` sett ett `repoPath`-argument ändrats, eller om mtime skiljer sig.
  - **Acceptanskriterium:** Andra anropet på samma oförändrade fil returnerar `cacheHit: true` och saknar `summary`-fältet; `score` och `loopComplete` är korrekta.

- [ ] **[Haiku] Integrationstest för strukturell re-review**
  - `packages/mcp-server/tests/integration/structural-cache.test.ts` — anropa `handleCodeHealthReview` på samma fixture-fil två gånger; verifiera att andra anropet har `cacheHit: true` och att tokenstorleken på svaret (JSON.stringify-längd) är < 30 % av första svarets storlek.
  - **Acceptanskriterium:** Testet passerar och loggar de två svarsstorlekar för manuell verifikation.

### 4. TOON-kodning av smells[]-arrayen

- [ ] **[Sonnet] Skapa `packages/mcp-server/src/tools/toon-encoder.ts`**
  - Exportera `encodeToon(smells: Smell[]): string` som producerar tabellkodad text:
    ```
    |type|severity|line|endLine|description|suggestion|
    |ComplexMethod|high|12|45|Cyclomatic complexity 18|Extract …|
    |DeepNesting|medium|22|31|Nesting depth 5|Apply early return …|
    ```
  - Kolumnerna är de sex fälten i `Smell`-typen som exponeras i `code-health-review`-svaret.
  - Exportera `decodeToon(toon: string): Partial<Smell>[]` för round-trip-testning.
  - Escape `|` i värden med `\|`.
  - **Acceptanskriterium:** `decodeToon(encodeToon(smells))` är djupt lika med ursprungsarrayen för alla testfall; `encodeToon` av 10 smells producerar < 60 % av JSON.stringify-storleken.

- [ ] **[Haiku] Integrera TOON i `shared.ts` och `code-health-review.ts`**
  - Lägg till parameter `responseFormat: 'json' | 'toon'` (default `'json'`) i `formatReviewSummary`-signaturen i `shared.ts`.
  - Om `responseFormat === 'toon'`: ersätt `issues: result.smells` med `issuesToon: encodeToon(result.smells)` i `ToolResponse`-objektet som byggs i `handleCodeHealthReview`.
  - Lägg till valfritt input-parameter `responseFormat: z.enum(['json','toon']).optional()` i `code-health-review.ts` input-schema.
  - **Acceptanskriterium:** Anrop med `{filePath: "...", responseFormat: "toon"}` returnerar `issuesToon` som en tabellkodad sträng och saknar `issues`-fältet.

- [ ] **[Haiku] Fixture och enhetstest för TOON-encoder**
  - `packages/core/tests/fixtures/toon-smells-input.json` — en array med 8 smells av blandade typer.
  - Enhetstest `packages/mcp-server/tests/unit/toon-encoder.test.ts`:
    - Verifierar att output innehåller exakt en header-rad.
    - Verifierar att antalet data-rader = `smells.length`.
    - Verifierar round-trip `decodeToon(encodeToon(smells))`.
    - Verifierar token-reducering (rå teckenlängd < 60 % av JSON.stringify-längd) för 8+ smells.
  - **Acceptanskriterium:** Alla fyra assertions passerar.

### 5. Score-keyed modell- och effort-routing i followUpInstruction

- [ ] **[Sonnet] Uppdatera `FollowUpParams` och `buildFollowUpInstruction` i `packages/core/src/refactor/follow-up-instruction.ts`**
  - Lägg till `currentScore: number` i `FollowUpParams`-interfacet.
  - Lägg till intern hjälpfunktion `resolveModelTier(score: number): {model: string; effort: string}`:
    - `score < 7.0` → `{model: 'claude-opus-4-8', effort: 'xhigh'}` (djup omstrukturering)
    - `7.0 ≤ score < 9.0` → `{model: 'claude-sonnet-4-6', effort: 'medium'}` (standardrefaktorering)
    - `score ≥ 9.0` → `{model: 'claude-haiku-4-5', effort: 'low'}` (enkel re-review, loopComplete nära)
  - Lägg till `suggestedModel: {model, effort, rationale}`-blocket i slutet av den genererade instruktionssträngen, i JSON-format inom `<model_routing>`-tagg för maskinläsbarhet.
  - Det befintliga `modelNote`-fältet i `FollowUpParams` används fortfarande men bör nu konsumera `resolveModelTier(currentScore).model`.
  - **Acceptanskriterium:** Enhetstester verifierar att score 5.0 → Opus `xhigh`, score 8.0 → Sonnet `medium`, score 9.5 → Haiku `low`; strängen innehåller `<model_routing>` och validerar som JSON inom taggen.

- [ ] **[Haiku] Skicka `currentScore` från `auto-refactor-analyzer.ts` till `buildFollowUpInstruction`**
  - I `packages/core/src/refactor/auto-refactor-analyzer.ts`: identifiera anropet till `buildFollowUpInstruction(...)` och lägg till `currentScore: healthResult.score` i params-objektet.
  - Uppdatera TypeScript-typerna så att kompileringsfel uppstår om fältet saknas.
  - **Acceptanskriterium:** `pnpm -r typecheck` passerar utan fel; manuellt anrop av `code_health_auto_refactor` på en fil med score 6.5 visar `claude-opus-4-8` i routing-blocket.

- [ ] **[Haiku] Enhetstest för score-routing i follow-up-instruction**
  - `packages/core/tests/unit/follow-up-instruction.test.ts` (utöka befintliga tester om de finns, annars ny fil):
    - Test 1: `currentScore: 5.0` → output innehåller `"model":"claude-opus-4-8"` och `"effort":"xhigh"`.
    - Test 2: `currentScore: 8.5` → output innehåller `"model":"claude-sonnet-4-6"` och `"effort":"medium"`.
    - Test 3: `currentScore: 9.2` → output innehåller `"model":"claude-haiku-4-5"` och `"effort":"low"`.
    - Test 4: Gränsfall `currentScore: 7.0` → Sonnet (ej Opus).
    - Test 5: Gränsfall `currentScore: 9.0` → Haiku (ej Sonnet).
  - **Acceptanskriterium:** Alla fem tester passerar.

### 6. Dokumentation och CLAUDE.md-korrigeringar

- [ ] **[Haiku] Uppdatera `CLAUDE.md` — stale-referens och deferred loading-dokumentation**
  - Ta bort eller korrigera den stale `budget_tokens`-referensen i "API Usage Tips"-sektionen (ger 400-fel på Opus 4.7/4.8; ersätt med `thinking: {type: 'adaptive'}` + `effort`).
  - Lägg till ett nytt stycke "Deferred tool loading" som förklarar beta-headern `advanced-tool-use-2025-11-20`, de två tool-search-varianterna (`tool_search_tool_regex_20251119`, `tool_search_tool_bm25_20251119`) och att loop-kritiska verktyg ej är deferred.
  - Lägg till ett stycke om `editMode`-parametern i `code_health_auto_refactor`.
  - **Acceptanskriterium:** `budget_tokens` förekommer inte längre i CLAUDE.md API-sektionen; de nya sektionerna är < 200 ord totalt.

---

## Beroenden

**Måste vara klart innan Sprint 52 startar:**
- Sprint 32 (auto-refactor-applier, `applyAutoRefactor`, `analyzeForAutoRefactor`) — levererat och i master.
- `packages/core/src/refactor/follow-up-instruction.ts` med `FollowUpParams`-interfacet — befintligt.
- `packages/mcp-server/src/tools/shared.ts` med `formatReviewSummary` — befintligt.

**Extern förutsättning (klient-ansvar, ej MCP-server):**
- Klienter som vill utnyttja deferred loading måste skicka beta-header `anthropic-beta: advanced-tool-use-2025-11-20` och inkludera `tool_search_tool_regex_20251119` eller `tool_search_tool_bm25_20251119` i sin tools-lista. MCP-servern ändrar inga klientinstruktioner.

**Vad Sprint 52 låser upp:**
- Sprint 53 (outputSchema på `code_health_review` och `code_health_auto_refactor`) — TOON-formatet och byteRange-svaret kan kodas i ett maskinläsbart `outputSchema` som aktiverar Anthropics structured-outputs constrained decoding och 24h schema-cache.
- Sprint 54 (Python rope-transformrar, Go gopls) — `editMode: 'patch'`-infrastrukturen är grunden för deterministiska patch-svar från rope/gopls.

---

## Testplan

```bash
# 1. Typkontroll av alla paket
pnpm -r typecheck

# 2. Enhetstester — core-paket
pnpm --filter @healthy-ai-code/core test

# 3. Enhetstester — mcp-server-paket
pnpm --filter @healthy-ai-code/mcp-server test

# 4. Bygge av alla paket
pnpm build

# 5. Självaudit — verifiera att serverkoden har hög hälsopoäng
node scripts/health-audit.mjs

# 6. Manuell verifiering av deferred loading
#    Inspektera att server-konfigurationen listar rätt antal deferred tools:
node -e "
const { DEFERRED_TOOLS, LOOP_TOOLS } = require('./packages/mcp-server/dist/tool-registry.js');
console.log('Loop tools:', LOOP_TOOLS.length);
console.log('Deferred tools:', DEFERRED_TOOLS.length);
const overlap = LOOP_TOOLS.filter(t => DEFERRED_TOOLS.includes(t));
console.log('Overlap (bör vara 0):', overlap.length);
"
# Förväntat: Loop tools: 5, Deferred tools: 22, Overlap: 0

# 7. Manuell verifiering av editMode patch
#    Kräver en fil med MagicNumber-smell (score < 9.5)
node -e "
const { handleAutoRefactor } = require('./packages/mcp-server/dist/tools/auto-refactor.js');
handleAutoRefactor({ filePath: 'packages/core/tests/fixtures/unhealthy/magic-number-patch.ts', editMode: 'patch' })
  .then(r => {
    const parsed = JSON.parse(r.content[0].text);
    console.log('editMode:', parsed.editMode); // förväntat: 'patch'
    console.log('har diff:', 'diff' in parsed); // förväntat: true
    console.log('saknar fullFileContent:', !('fullFileContent' in parsed)); // förväntat: true
  });
"

# 8. Manuell verifiering av TOON-kodning
node -e "
const { encodeToon, decodeToon } = require('./packages/mcp-server/dist/tools/toon-encoder.js');
const smells = require('./packages/core/tests/fixtures/toon-smells-input.json');
const toon = encodeToon(smells);
const json = JSON.stringify(smells);
console.log('TOON-längd:', toon.length, 'JSON-längd:', json.length);
console.log('Reduktion:', Math.round((1 - toon.length / json.length) * 100) + '%');
// Förväntat: reduktion >= 30%
"

# 9. Manuell verifiering av score-routing
node -e "
const { buildFollowUpInstruction } = require('./packages/core/dist/refactor/follow-up-instruction.js');
const result = buildFollowUpInstruction({
  nearTarget: false, strategyLabel: 'extract_method', modelNote: '', successLikelihood: 'medium',
  skipCurrentCode: false, focusLines: undefined, changeScope: 'function',
  iterationBudget: 5, outputMode: 'full', currentScore: 6.5
});
const match = result.match(/<model_routing>([\s\S]+?)<\/model_routing>/);
if (match) {
  const routing = JSON.parse(match[1]);
  console.log('model:', routing.model); // förväntat: claude-opus-4-8
  console.log('effort:', routing.effort); // förväntat: xhigh
}
"
```

**Nya testfixtures** (skapas som del av taskar ovan):
- `packages/core/tests/fixtures/unhealthy/magic-number-patch.ts`
- `packages/core/tests/fixtures/healthy/magic-number-patch-fixed.ts`
- `packages/core/tests/fixtures/toon-smells-input.json`

**Förväntade testresultat:**
- `pnpm -r typecheck` — noll fel.
- `pnpm --filter @healthy-ai-code/core test` — alla befintliga tester gröna + nya tester för `edit-mode-selector`, `follow-up-instruction` (5 routing-tester), `buildPatchDiff` round-trip.
- `pnpm --filter @healthy-ai-code/mcp-server test` — alla befintliga tester gröna + `tool-registry` (disjunktions-test), `structural-cache` (cacheHit-test, LRU-test), `toon-encoder` (round-trip + reduktionstest).
- `node scripts/health-audit.mjs` — alla nya filer ska nå ≥ 9.0 (gärna ≥ 9.5) vid audit.

---

## Tekniska beslut

1. **Deferred loading implementeras som en server-side markering, inte som klientkod.** MCP-servern ansvarar för att deklarera `defer_loading: true` på rätt verktyg; klienten ansvarar för beta-header och tool-search-verktyg. Detta håller server och klient avkopplade och innebär inga breaking changes för befintliga klienter som inte skickar beta-headern — de får alla 27 verktyg som tidigare.

2. **`buildPatchDiff` implementeras utan externa beroenden** (inga `diff`/`jsdiff`-paket). En radbaserad implementation med context-rader räcker för de relativt korta funktioner som sprint 52 hanterar (< 150 rader). Trade-off: ett traditionellt diff-bibliotek hanterar context-komprimering och edge-cases bättre, men introducerar ett transitivt beroende. Om patch-svar skalas upp till filer > 500 rader bör ett etablerat bibliotek omprövas i Sprint 54.

3. **`StructuralCache` lever i minnesprocessen** (ingen persistens). En sessionsgräns är acceptabel här — cache-fördelen är per refaktoreringsloop, inte cross-session. LRU-max på 200 entries speglar `rangesCache` i `method-coupling-helpers.ts` och förhindrar minnesläckor på stora kodbasanalyser.

4. **TOON-encoder levereras i `mcp-server`-paketet, inte i `core`** (till skillnad från övrig analys-logik). Motivering: TOON är ett presentationslager-val specifikt för MCP-svar; core-paketet ska förbli format-agnostiskt. Om `toon-encoder` senare visar sig användbar utanför MCP-kontexten kan den lyftas till core i en separat PR.

5. **Score-routing emitteras som råd, inte enforcement.** `followUpInstruction` föreslår en modell och ett effort-värde via `<model_routing>`-taggen men tvingar inte klienten att följa det. Operators som alltid kör Opus 4.8 påverkas funktionellt inte. Trade-off: ett hårdare enforcement (t.ex. via ett separat API-fält med typ `ModelRoutingHint`) skulle kräva ett `outputSchema`-ändringsarbete som är planerat till Sprint 53.

---

## Risker / öppna frågor

1. **MCP SDK exponerar kanske inte `defer_loading` direkt.** `McpServer`-klassen från `@modelcontextprotocol/sdk` är den enda registreringspunkten som används idag (se `server.ts`). Om SDK:n inte vidarebefordrar okända fält i tool-definitionen till Anthropic-API:et kan deferred loading behöva implementeras via ett raw HTTP-lager eller en SDK-uppdatering. Risknivå: medium. Mitigation: verifiera med ett isolerat proof-of-concept mot Anthropic API direkt innan Sprint 52 startar.

2. **byteRange-index i strukturell re-review kräver stabila radnummer.** Om en fil ändras mellan första review och re-review kan cachade `startLine`/`endLine`-värden peka fel. Mtime-jämförelsen i `StructuralCache.hasReview` minskar risken men är inte atomär. Risknivå: låg (loopens normala flöde är review → refactor → re-review på samma fil utan extern ändring). Mitigation: `invalidate(filePath)` kan anropas explicit av `auto-refactor-apply`-verktyget efter varje apply.

3. **TOON-formatet är inte standardiserat.** Tabellformatet som används här är inspirerat av TOON-specen ([github.com/toon-format/toon](https://github.com/toon-format/toon)) men implementeras som en subset. Om en klient inte förstår TOON kan det orsaka parsningsfel. Mitigation: `responseFormat`-parametern defaultar till `'json'` — TOON är opt-in. Dokumentera tydligt att `issuesToon` och `issues` är ömsesidigt uteslutande.

4. **Score-routing för Haiku 4.5 vid score ≥ 9.0 kan vara för aggressivt.** Om `loopComplete`-kontrollen kräver att Haiku tolkar ett komplext diff-resultat kan en lättvikts-modell missa edge-cases och felaktigt rapportera `loopComplete: true`. Risknivå: låg (re-review-steget är en ren JSON-analys av score-talet, inte kreativt resonerande). Öppen fråga: bör tröskeln höjas till score ≥ 9.3 för Haiku för att ge en extra säkerhetsmarginal? Ta beslut baserat på manuell verifiering i Sprint 52-review.
