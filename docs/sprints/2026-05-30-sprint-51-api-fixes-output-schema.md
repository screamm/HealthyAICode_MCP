# Sprint 51: API-korrigeringar & outputSchema-grund

**Datum:** 2026-05-30
**Status:** Planerad

---

## Mål

- Eliminera hård 400-bugg på Opus 4.7/4.8: ersätt stale `budget_tokens`-dokumentation i CLAUDE.md med korrekt `thinking:{type:'adaptive'}` + `effort` via `output_config`.
- Ta bort felaktig header-referens för fine-grained tool streaming (GA på Sonnet 4.6+, ingen header krävs).
- Skärpa `effort`-mappningen: reservera `max` för genuint ny kod; `xhigh` är praktiska taket i refaktoreringsloopen.
- Sätt explicit `ttl: 3600` på `cache_control` och dokumentera att föränderlig per-turn-data (effort-hint i `followUpInstruction`) måste placeras **efter** sista cache-brytpunkten — annars bustar varje turn cachen.
- Implementera `outputSchema` + `structuredContent` på `code_health_review` och `code_health_auto_refactor` per [MCP 2025-11-25-specifikationen](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — förutsättning för Anthropics strukturerade-output-cache (24h schema-cache, constrained decoding) och allt token-arbete i efterföljande sprintar.

---

## Bakgrund och motivation

Roadmap-rapporten (2026-05-30, 22 agenter, 242 sökningar) identifierade fyra korrigeringar som ska göras direkt — låg insats, hög säkerhet, en av dem är en hård bugg:

### 1. `budget_tokens`-bugg (400-fel på Opus 4.7/4.8)

CLAUDE.md:s avsnitt "Adaptive thinking effort" refererar fortfarande till `budget_tokens`-stilen för tänkekontroll. [Anthropics officiella adaptive-thinking-dokumentation](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking) slår fast:

> *On Claude Opus 4.8 and Claude Opus 4.7, adaptive thinking is the only supported thinking mode; manual `thinking: {type: "enabled", budget_tokens: N}` is no longer accepted — rejected with a 400 error.*

Korrekt API-form är:
```json
{
  "thinking": { "type": "adaptive" },
  "output_config": { "effort": "xhigh" }
}
```

`budget_tokens` är fortfarande funktionellt (men deprecated) på Opus 4.6 och Sonnet 4.6; på 4.7/4.8 returnerar det ett hårt 400-svar. Varje klient som följer nuvarande CLAUDE.md och riktar sig mot `claude-opus-4-8` bryter. [Issue öppnat i Goose](https://github.com/block/goose/issues/7293) visar att ekosystemet redan märkt detta.

### 2. Fine-grained streaming — header behövs inte längre

CLAUDE.md säger att man ska sätta `eager_input_streaming: true` som en explicit header. Roadmap-rapporten noterar: *"Nu GA på Sonnet 4.6+, ingen beta-header krävs"*. [Anthropics dokumentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming) bekräftar GA-status. Att behålla header-referensen är inte skadlig men vilseledande — klienter lägger till ett onödigt header.

### 3. `max`-effort är övermappad

Nuvarande CLAUDE.md mappar `"max"` till `score < 5`. [Effort-dokumentationen](https://platform.claude.com/docs/en/build-with-claude/effort) varnar:

> *`max` adds significant cost for marginal gain and can cause overthinking on structured-output tasks.*

Refaktoreringsloopens uppgifter är strukturerade (väldefinierade lukt-typer, mallar, konkreta byte-ranges) — inte open-ended reasoning. `xhigh` är praktiska taket; `max` bör reserveras för genuint ny kod (ingenting att ta stöd av), vilket är ett distinkt fall från en hög technical-debt-score på befintlig kod.

### 4. Prompt cache TTL och brytpunktsordning

[DEV Community-artikeln](https://dev.to/whoffagents/anthropic-silently-dropped-prompt-cache-ttl-from-1-hour-to-5-minutes-16ao) och [Anthropics prompt-caching-dokumentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) bekräftar: Anthropic ändrade standard-TTL från 1 timme till 5 minuter den 6 mars 2026. Nuvarande CLAUDE.md nämner 1h TTL konceptuellt men anger inte `ttl: 3600` explicit, vilket innebär att refaktoreringssessioner (20–60 min) nu tappar cache-träffen stille mitt i sessionen. Dessutom innehåller `followUpInstruction` en föränderlig `effort`-hint per turn — om det fältet placeras *före* sista `cache_control`-brytpunkten bustar varje nytt effort-värde cache:n. Det korrekta mönstret är att hålla all statisk data (system-prompt, verktygsscheman) i de cachade blocken och lägga per-turn-data efter sista `cache_control`.

### 5. `outputSchema` + `structuredContent` — grunden för kommande optimeringar

[MCP 2025-11-25-specifikationen](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) definierar:

- `outputSchema` som ett optional JSON Schema-fält i verktygs-definitionen
- `structuredContent` som ett JSON-objekt i tool-resultatet — servrar **MUST** returnera det om `outputSchema` finns
- För bakåtkompatibilitet **SHOULD** servrar också serialisera JSON i ett `TextContent`-block parallellt

Roadmap-rapporten (Token-usage reduction playbook, item 7) identifierar `outputSchema` som den enskilda förutsättning som låser upp:
- Anthropics [structured-outputs constrained decoding](https://docs.claude.com/en/docs/build-with-claude/structured-outputs) med 24h schema-cache på serversidan
- Diff-svar (editMode-fält) i efterföljande sprintar
- TOON-tabellformat för smell-arrayer
- Strukturell re-review (returnera bara delta mot senaste review, inte hela filen)

Verktygen `code_health_review` och `code_health_auto_refactor` returnerar idag text-JSON i ett `TextContent`-block — en ren text-sträng som modellen måste re-parsa. `ToolResponse`-typen i `packages/mcp-server/src/types.ts` och svarsstrukturen i `handleCodeHealthReview` / `handleAutoRefactor` är väldefinierade; det handlar om att exponera dem via MCP-protokollet.

---

## Arkitektur

### Nya filer

```
packages/mcp-server/src/
  schemas/
    code-health-review-output.schema.ts   — Exporterar reviewOutputSchema (JSON Schema-objekt för ToolResponse)
    auto-refactor-output.schema.ts        — Exporterar autoRefactorOutputSchema (JSON Schema-objekt för AutoRefactorResult)
```

Inga nya core-filer: all business-logik är oförändrad. Förändringarna är renodlade till MCP-lagret och CLAUDE.md.

### Ändringar i befintliga filer

- **`CLAUDE.md`** — Fyra ändringar i "API Usage Tips"-avsnittet:
  1. Ersätt `budget_tokens`-tabellen med `thinking:{type:'adaptive'}` + `output_config:{effort:...}`.
  2. Ta bort stycket om `eager_input_streaming`-headern (ersätt med not om GA-status).
  3. Skärp `effort`-tabellen: `max` → genuint ny kod (ingenting att ta stöd av); `xhigh` → praktiska taket för refaktorering av befintlig kod.
  4. Lägg till explicit `"cache_control": {"type": "ephemeral", "ttl": 3600}` i TTL-stycket + ett nytt stycke om brytpunktsordning.

- **`packages/mcp-server/src/tools/code-health-review.ts`** — `handleCodeHealthReview`:
  - Importera `reviewOutputSchema` från `schemas/code-health-review-output.schema.ts`.
  - Lägg till `outputSchema` i verktygsdefinitionen via `server.tool`-anropet.
  - Returnera `structuredContent: response` parallellt med befintligt `content: [{type:'text', text: JSON.stringify(response)}]`.

- **`packages/mcp-server/src/tools/auto-refactor.ts`** — `handleAutoRefactor`:
  - Importera `autoRefactorOutputSchema` från `schemas/auto-refactor-output.schema.ts`.
  - Lägg till `outputSchema` i verktygsdefinitionen.
  - Returnera `structuredContent` parallellt med `content`-blocket.

- **`packages/mcp-server/src/types.ts`** — Inga strukturändringar; `ToolResponse`-interfacet är korrekt och speglas direkt i `reviewOutputSchema`.

---

## Tasks

### A. CLAUDE.md — adaptive thinking (budget_tokens-bugg)

- [ ] **[Haiku] Ersätt `budget_tokens`-tabellen i CLAUDE.md med adaptive thinking**
  - Fil: `CLAUDE.md`, avsnitt "Adaptive thinking effort (`effort`) — Opus 4.x"
  - Ta bort: tabellen som implicit refererar till `thinking:{type:'enabled', budget_tokens:N}`-stilen.
  - Ersätt med: tydlig distinktion — Opus 4.7/4.8 accepterar **bara** `thinking:{type:'adaptive'}`, Opus 4.6/Sonnet 4.6 accepterar båda men `budget_tokens` är deprecated.
  - Ny `effort`-tabell ska visa API-parametern `output_config: {effort: "..."}` som separerat fält (inte inbakat i `thinking`-objektet).
  - Acceptanskriterium: ett Opus 4.8-anrop med det dokumenterade mönstret ger inte 400-svar; `budget_tokens` nämns explicit som deprecated/borttaget på 4.7/4.8.

- [ ] **[Haiku] Skärp `effort`-mappningen i CLAUDE.md**
  - Fil: `CLAUDE.md`, samma avsnitt.
  - Nuvarande rad: `successLikelihood: "hard" AND score < 5` → `"max"`.
  - Ny logik: `"max"` reserveras för genuint ny kod (inga befintliga mönster att stödja sig på, t.ex. greenfield-moduler). I refaktoreringsloopen är taket `"xhigh"` — även vid `score < 5` handlar det om befintlig strukturerad kod med väldefinierade lukttyper.
  - Lägg till en kolumn "Motivering" i tabellen som förklarar cost/benefit för varje nivå.
  - Acceptanskriterium: tabellen innehåller inte `"max"` för score-baserade villkor utan bara för genuint-ny-kod-scenariot.

### B. CLAUDE.md — fine-grained streaming

- [ ] **[Haiku] Uppdatera fine-grained streaming-stycket i CLAUDE.md**
  - Fil: `CLAUDE.md`, avsnitt "Fine-grained tool streaming — latency for large code blocks".
  - Ta bort: instruktionen att sätta `eager_input_streaming: true` som explicit header/parameter.
  - Ersätt med: notering att funktionen är GA på Sonnet 4.6+ och aktiveras automatiskt — ingen action krävs av klienten. Latens-siffrorna (200–800 ms TTFT) behålls som kontext.
  - Acceptanskriterium: stycket innehåller ingen instruktion om att sätta ett header eller parameter för denna funktion.

### C. CLAUDE.md — cache_control TTL och brytpunktsordning

- [ ] **[Sonnet] Uppdatera prompt cache-stycket med explicit TTL och brytpunktsordning**
  - Fil: `CLAUDE.md`, avsnitt "Prompt cache TTL — session-level savings".
  - Lägg till: explicit kod-exempel med `"cache_control": {"type": "ephemeral", "ttl": 3600}` (inte bara `"ephemeral"` utan TTL-fältet).
  - Lägg till: varning om standard-TTL-ändringen (5 min sedan mars 2026) — referera [DEV Community-artikeln](https://dev.to/whoffagents/anthropic-silently-dropped-prompt-cache-ttl-from-1-hour-to-5-minutes-16ao).
  - Lägg till: ett dedikerat stycke "Brytpunktsordning" som förklarar att föränderlig per-turn-data (t.ex. `followUpInstruction` från `code_health_auto_refactor` med ett skiftande `effort`-värde) **måste** placeras i meddelandeflödet **efter** sista `cache_control`-markerade blocket — annars ogiltigförklaras cachen varje turn.
  - Lägg till: notis om att blandar man 1h och 5min TTL-block måste längre TTL komma före kortare.
  - Acceptanskriterium: stycket innehåller `ttl: 3600` explicit, förklarar standard-TTL-ändringen, och visar var per-turn-data ska placeras i meddelande-arrayen relativt `cache_control`-blocket.

### D. Schema-filer för outputSchema

- [ ] **[Sonnet] Skapa `packages/mcp-server/src/schemas/code-health-review-output.schema.ts`**
  - Definiera och exportera `reviewOutputSchema` som ett JSON Schema-objekt (typ `object`) som speglar `ToolResponse`-interfacet i `packages/mcp-server/src/types.ts`.
  - Fälten: `score` (number), `category` (enum: green/yellow/red), `loopComplete` (boolean), `issues` (array av Smell-objekt), `summary` (string), `nextAction` (object med `action`, `instruction`, `priority`, `toolToCallAfter`).
  - Smell-arrayns items ska ha: `type` (string), `severity` (enum: critical/high/medium), `description` (string), `suggestion` (string) och valfria fält `line`, `functionName`.
  - Acceptanskriterium: `reviewOutputSchema` är ett giltig JSON Schema-objekt; importeras utan TypeScript-fel; alla fält i `ToolResponse` representeras.

- [ ] **[Sonnet] Skapa `packages/mcp-server/src/schemas/auto-refactor-output.schema.ts`**
  - Definiera och exportera `autoRefactorOutputSchema` som ett JSON Schema-objekt som speglar `AutoRefactorResult`-typen från `@healthy-ai-code/core` (exporterad från `packages/core/src/refactor/index.ts`).
  - Täck båda fall: hälsofile-svaret (`message`, `filePath`, `score`, `category`) och refaktorerings-svaret (med `refactoringNeeded`, `primaryTarget`, `codeContext`, `followUpInstruction`, m.fl.).
  - Använd `oneOf` eller `anyOf` för att representera de två svarsformerna.
  - Acceptanskriterium: `autoRefactorOutputSchema` är ett giltigt JSON Schema-objekt; täcker alla fält `handleAutoRefactor` kan returnera.

### E. code-health-review.ts — outputSchema + structuredContent

- [ ] **[Sonnet] Lägg till `outputSchema` och `structuredContent` i `code-health-review.ts`**
  - Fil: `packages/mcp-server/src/tools/code-health-review.ts`
  - Importera `reviewOutputSchema` från `../schemas/code-health-review-output.schema.ts`.
  - Problemet: `server.tool` anropas via `McpToolRegistrar`-alias med 4 argument (name, desc, schema, handler). MCP SDK:s `server.tool`-signatur stöder ett 5:e argument eller ett options-objekt för `outputSchema` — verifiera SDK-versionen i `packages/mcp-server/package.json` och anpassa anropet.
  - Lägg till `outputSchema: reviewOutputSchema` i verktygsdefinitionen.
  - I `handleCodeHealthReview`: returnera `structuredContent: response` som ett toppnivå-fält parallellt med `content: [{type:'text', text: JSON.stringify(response, null, 2)}]` — båda behövs för bakåtkompatibilitet per MCP-spec.
  - Hantera fel-fallet på samma sätt: returnera `structuredContent: {error: message}` parallellt med befintligt `content`-block + `isError: true`.
  - Acceptanskriterium: `pnpm -r typecheck` passerar; ett MCP-anrop till `code_health_review` returnerar ett `result`-objekt med både `content`-array och `structuredContent`-fält.

- [ ] **[Haiku] Uppdatera TypeScript-typdeklarationen för `McpToolRegistrar` i `code-health-review.ts`**
  - Fil: `packages/mcp-server/src/tools/code-health-review.ts`
  - Nuvarande `McpToolRegistrar`-typ deklareras lokalt och kastar bort SDK:s typinformation. Antingen utöka typdeklarationen med `outputSchema`-stöd, eller byt till en korrekt import av handler-typen från `@modelcontextprotocol/sdk`.
  - Om SDK-versionen inte stöder `outputSchema` i `server.tool`-signaturen: lägg till ett `as unknown as`-cast för att kringgå och dokumentera med en TODO som pekar på SDK-versionen som krävs.
  - Acceptanskriterium: `pnpm -r typecheck` passerar utan `any`-varningar på den ändrade kodraden.

### F. auto-refactor.ts — outputSchema + structuredContent

- [ ] **[Sonnet] Lägg till `outputSchema` och `structuredContent` i `auto-refactor.ts`**
  - Fil: `packages/mcp-server/src/tools/auto-refactor.ts`
  - Importera `autoRefactorOutputSchema` från `../schemas/auto-refactor-output.schema.ts`.
  - Lägg till `outputSchema: autoRefactorOutputSchema` i verktygsdefinitionen (samma mönster som E ovan).
  - I `handleAutoRefactor`: returnera `structuredContent: refactorResult` parallellt med befintligt `content`-block i normalfallet.
  - I `buildHealthyResponse`: returnera `structuredContent: {message, filePath, score, category}` parallellt med `content`-blocket.
  - I fel-fallet: returnera `structuredContent: {error: message}` + `isError: true`.
  - Acceptanskriterium: `pnpm -r typecheck` passerar; anrop till `code_health_auto_refactor` returnerar `structuredContent` oavsett om filen är hälsosam, behöver refaktorering, eller ger fel.

- [ ] **[Haiku] Uppdatera `McpToolRegistrar`-typdeklarationen i `auto-refactor.ts`**
  - Samma mönster som task E2 ovan.
  - Fil: `packages/mcp-server/src/tools/auto-refactor.ts`.
  - Acceptanskriterium: `pnpm -r typecheck` passerar.

### G. Integrationstester

- [ ] **[Sonnet] Lägg till integrationstester för `structuredContent` i båda verktygen**
  - Fil: `packages/mcp-server/tests/integration/` — skapa eller utöka befintliga testfiler för `code_health_review` och `code_health_auto_refactor`.
  - Test 1 (`code_health_review`, hälsosam fil): anropa verktyget med en fil från `packages/core/tests/fixtures/healthy/`; verifiera att svaret innehåller `result.structuredContent` med korrekt `score >= 9.5` och `loopComplete: true`.
  - Test 2 (`code_health_review`, ohälsosam fil): anropa med en fil från `packages/core/tests/fixtures/unhealthy/`; verifiera att `result.structuredContent.loopComplete === false` och `result.structuredContent.issues.length > 0`.
  - Test 3 (`code_health_auto_refactor`, fil behöver refaktorering): verifiera att `result.structuredContent` innehåller `refactoringNeeded: true` och `followUpInstruction` är en icke-tom sträng.
  - Test 4 (`code_health_auto_refactor`, hälsosam fil): verifiera att `result.structuredContent.message` innehåller "No refactoring needed" och `result.structuredContent.score >= 9.5`.
  - Acceptanskriterium: `pnpm --filter @healthy-ai-code/mcp-server test` passerar alla fyra tester.

- [ ] **[Haiku] Kontrollera att befintliga integrationstester fortfarande passerar**
  - Verifiera att `content`-arrayen (text-blocket) fortfarande returneras korrekt parallellt med `structuredContent` — bakåtkompatibilitetsgarantin per MCP-spec.
  - Kör: `pnpm --filter @healthy-ai-code/mcp-server test` och säkerställ inga regressioner i befintliga snapshots eller assertions.
  - Acceptanskriterium: noll testfel jämfört med main-branchen före denna sprint.

---

## Beroenden

**Måste finnas på plats för Sprint 51:**
- Ingen extern beroende — alla ändringar är i CLAUDE.md och MCP-server-lagret; core-logiken rörs ej.

**Vad Sprint 51 låser upp (efterföljande sprintar):**
- `outputSchema` är förutsättningen för diff-svar (`editMode: 'patch'|'funcRewrite'`) i auto-refactor (Token-usage playbook item 3).
- `outputSchema` är förutsättningen för TOON-tabellformat för smell-arrayer (item 11).
- `outputSchema` aktiverar Anthropics `structured-outputs-2025-11-13` beta-header för constrained decoding + 24h schema-cache.
- Korrekt `cache_control ttl:3600` + brytpunktsordning ger ~55 % av den caching-besparning som tappades vid standard-TTL-ändringen i mars 2026.
- `budget_tokens`-bugg-fix är en förutsättning för korrekt dokumentation av Opus 4.8-loopen i alla framtida sprint-dokument och klientguider.

---

## Testplan

```bash
# 1. TypeScript-kompilering — alla paket
pnpm -r typecheck

# 2. Alla tester
pnpm test

# 3. Enbart core-tester (ska inte beröras av denna sprint)
pnpm --filter @healthy-ai-code/core test

# 4. MCP-server-tester inkl. nya integrationstester
pnpm --filter @healthy-ai-code/mcp-server test

# 5. Self-audit — verifiera att serverstart fungerar
node scripts/health-audit.mjs
```

**Förväntade utfall:**

| Test | Förväntat resultat |
|---|---|
| `pnpm -r typecheck` | 0 fel — schema-filerna är välformade TS, `McpToolRegistrar`-typen hanterar `outputSchema` |
| `pnpm test` | Alla befintliga + 4 nya integrationstester gröna |
| MCP-anrop till `code_health_review` | Svar innehåller både `content[0].type === 'text'` och `structuredContent` med `score`, `loopComplete`, `issues` |
| MCP-anrop till `code_health_auto_refactor` | Svar innehåller `structuredContent` oavsett utfall (hälsosam/refaktorering/fel) |
| `node scripts/health-audit.mjs` | Server startar korrekt; inga runtime-fel från schema-imports |

**Inga nya fixtures** behövs i `packages/core/tests/fixtures/` — verktygen analyserar redan befintliga fixtures; integrationstesterna återanvänder `healthy/` och `unhealthy/`-katalogerna.

---

## Tekniska beslut

1. **Schema-filer i ett eget `schemas/`-underpaket under `tools/`-nivån** — alternativet är att definiera schemana inline i respektive tool-fil. Separata filer ger möjlighet att importera schemana i tester för validering mot faktiska svar, och håller tool-filerna kortare. Nackdel: ett extra import-steg. Givet att schemana troligen växer (Sprint 52+ lägger till fält), är separata filer rätt.

2. **`oneOf` i `autoRefactorOutputSchema` för de två svarsformerna** — `handleAutoRefactor` kan returnera antingen `{message, filePath, score, category}` (hälsosam fil) eller `AutoRefactorResult` (refaktorering krävs). En `oneOf`-struktur är korrekt per JSON Schema men kan vara svår att validera i practice. Alternativ: ett gemensamt schema med alla fält valfria utom ett diskrimineringsfält (`refactoringNeeded`). Välj det gemensamma schemat om `oneOf` ger valideringsproblem i SDK-versionen.

3. **Bakåtkompatibilitet via parallell `content`+`structuredContent`** — MCP 2025-11-25-specen säger `SHOULD` (inte `MUST`) för text-blocket när `structuredContent` returneras. Vi behåller text-blocket för att inte bryta klienter som inte stöder `structuredContent` ännu. Cost: marginell payload-ökning. Benefit: noll breaking change.

4. **Ingen ändring av `ToolResponse`-interfacet i `types.ts`** — interfacet är korrekt och testas indirekt via integrationstesterna. Att ändra det vore out of scope för en korrigerings-sprint och riskerar regression.

---

## Risker / öppna frågor

1. **MCP SDK-version och `server.tool`-signatur** — `@modelcontextprotocol/sdk`-versionen i `packages/mcp-server/package.json` måste kontrolleras. Om SDK:n inte stöder `outputSchema` som argument till `server.tool` direkt, kräver det antingen ett `as unknown as`-cast eller en uppgradering av SDK-versionen. En SDK-uppgradering kan introducera breaking changes som är out of scope för Sprint 51.

2. **`effort`-fältet är i `output_config`, inte i `thinking`** — Baserat på [Anthropics dokumentation](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking) är korrekt form `output_config: {effort: "xhigh"}` som ett separat toppnivå-fält. Om äldre SDK-versioner av Anthropic SDK inte stödjer `output_config` som ett namngivet fält kan dokumentationen behöva hänvisa till direkt API-anrop snarare än SDK-wrapper.

3. **Brytpunktsordning är client-side** — Korrekt `cache_control`-ordning är klientens ansvar, inte MCP-serverns. CLAUDE.md-dokumentationen är det enda verktyget vi har för att styra detta. Klienter som inte läser CLAUDE.md noggrant riskerar fortfarande cachen varje turn. En framtida förbättring vore att returnera en `cacheHint` i `followUpInstruction` som påminner klienten, men det är out of scope.

4. **`structured-outputs-2025-11-13` beta-header aktiveras av klienten** — Att lägga till `outputSchema` i verktygsdefinitionen är MCP-serversidans del. Anthropics 24h schema-cache och constrained decoding aktiveras via `anthropic-beta: structured-outputs-2025-11-13`-headern som klienten sätter. CLAUDE.md dokumenterar detta redan — men efekten av `outputSchema` syns fullt ut först när klienten aktiverar headern.
