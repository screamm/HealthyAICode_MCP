# Sprint 57: AI-native biomarkörer — LLM-integration, slopsquatting, intentDebt, erosion

**Datum:** 2026-05-30
**Status:** Planerad

---

## Mål

- Implementera de fem SpecDetect4AI-lukterna (UMM/NMVP/NSM/NSO/TNES) som call-site-AST-matchningar mot OpenAI-, Anthropic- och LangChain-SDK:er i ett nytt `analyzers/llm-integration.ts` — det enskilt mest differentierande tillägget mot konkurrenterna (inga konkurrenter scorar detta, 60.5 % av LLM-integrerade repos drabbade, 86 % precision).
- Lägga till `HallucinatedPackageImport`-detektion (slopsquatting) via import-nodextraktion och korscheck mot en cachad PyPI/npm-snapshot — säkerhetsrisk med vikt ≥ 1.5 i paritet med `SqlInjectionRisk`.
- Utöka den befintliga SATD-pipelinen med en AI-attributionsöverlagring (`AiAttributedSATD`, GIST) — κ = 0.896, 1.47 % träfffrekvens — samt ett `tiered AI-gate` som kräver score ≥ 9.7 om fyndet existerar.
- Introducera ett `intentDebt`-fält i `HealthResult` som aggregerar `AiAttributedSATD`, `OrphanedTODO` och odokumenterade publika API:er.
- Implementera `ComplexityMassConcentration` (Structural Erosion Index): `erosion = Σ mass(CC>10) / Σ mass(alla)` med `mass(f) = CC(f) × √SLOC(f)` — validerat mot agentkod (medelvärde 0.68) kontra mänsklig kod (0.34) i [SlopCodeBench](https://arxiv.org/abs/2603.24755).

---

## Bakgrund och motivation

### SpecDetect4AI — LLM-integrationslukter (UMM/NMVP/NSM/NSO/TNES)

[arXiv 2512.18020](https://arxiv.org/html/2512.18020) introducerar fem statiskt detekterbara call-site-mönster som påverkar 60.5 % av LLM-integrerade open-source-system med 86.06 % precision:

| Förkortning | Fullständigt namn | Vad som detekteras |
|---|---|---|
| **UMM** | Unbounded Max Metrics | `max_output_tokens`/`timeout`/`max_retries` saknas i API-anrop |
| **NMVP** | No Model Version Pinning | Rörlig alias (`"gpt-4o"`) utan explicit datumstämplad version (`"gpt-4o-2024-11-20"`) |
| **NSM** | No System Message | `messages`-array utan `{"role": "system", ...}`-entry |
| **NSO** | No Structured Output | `response_format`/schema saknas när nedströmslogik förväntar sig strukturerat svar |
| **TNES** | Temperature Not Explicitly Set | `temperature`-parametern utelämnad, provider-default styr reproducerbarhet |

Ingen konkurrent — inkl. SonarQube — scorar dessa. Implementeras som rena call-site-AST-matchningar i de befintliga Tier A-grammatikerna (TypeScript/JavaScript/Python).

### HallucinatedPackageImport / slopsquatting

[arXiv 2501.19012](https://arxiv.org/pdf/2501.19012) mäter att LLM-verktyg rekommenderar icke-existerande paket i 19.7 % av kodsampler (576 000 sampler, 16 LLM:er). Angripare registrerar hallucenerade paketnamn som skadlig kod. Detektionen är O(n): extrahera `import`/`require`/`use`-noder (redan tillgängliga via Tier A-AST) och korscheck mot en periodiskt cachad PyPI Simple-index/npm-registry-snapshot. Vikt ≥ 1.5 i paritet med `SqlInjectionRisk` motiveras av supply-chain-angreppsrisken.

### AiAttributedSATD (GIST)

[arXiv 2601.07786](https://arxiv.org/html/2601.07786v1) identifierar *GenAI-Induced Self-Admitted Technical Debt* — kommentarer som kombinerar en AI-referens med ett SATD-märke. Metod: regex-overlay på befintliga kommentnoder med sju AI-termer (`LLM|AI|GPT|ChatGPT|Copilot|Gemini|Claude`) kombinerat med SATD-märken (`TODO|FIXME|HACK|XXX`). Träfffrekvens 1.47 % av AI-refererande kommentarer; inter-annotator-agreement κ = 0.896. Bygger direkt på befintliga `detectSATD()` och `detectSATDFromText()` i `packages/core/src/smells/satd.ts` och `text-detectors.ts` — implementationskostnaden är låg. Dessutom: SonarQube kräver score ≥ 9.7 för kod flaggad som AI-genererad — ett `tiered AI-gate` ger tydlig positionering.

### intentDebt-fält i HealthResult

[arXiv 2603.22106 (Triple Debt Model)](https://ietresearch.onlinelibrary.wiley.com/doi/full/10.1049/sfw2/5579438) fastslår att *intent debt* (saknad motivering för beslut) i AI-assisterade kodbasers nu överstiger teknisk skuld i betydelse. `intentDebt` aggregerar tre signaler: `AiAttributedSATD`-smells, odokumenterade publika funktioner (proxy för OrphanedTODO via befintlig `LowDocCoverage`), och SATD-kommentarer utan öppet issue.

### ComplexityMassConcentration (Structural Erosion Index)

[arXiv 2603.24755 — SlopCodeBench](https://arxiv.org/html/2603.24755) mäter att agentkod uppvisar erosion 0.68 ± 0.20 kontra mänskliga repositories 0.34 ± 0.22 — agenter ackumulerar erosion 5.0× snabbare per checkpoint. Formeln:

```
mass(f) = CC(f) × √SLOC(f)
erosion  = Σ mass(f | CC(f) > 10) / Σ mass(alla f)
Lukten fires om erosion > 0.60
```

Beräkningsbar från befintlig per-funktion CC + `length`-data i `FunctionResult`. Kompletterar `ComplexMethod`/`BrainMethod` (som mäter totaler) genom att mäta *koncentration* — det snöbollsmönster refaktoreringsslingan är avsedd att förhindra.

---

## Arkitektur

### Nya filer

```
packages/core/src/
  analyzers/
    llm-integration.ts          — Fem SpecDetect4AI-smells (UMM/NMVP/NSM/NSO/TNES) via call-site-AST-matchning för TS/JS/Python
    hallucinated-import.ts      — HallucinatedPackageImport: import-extraktion + korscheck mot PyPI/npm-snapshot
    complexity-mass.ts          — ComplexityMassConcentration (Structural Erosion Index): mass(f) = CC×√SLOC, erosion>0.60

  smells/
    ai-attributed-satd.ts       — AiAttributedSATD: regex-overlay på befintliga kommentnoder, AI-termer × SATD-märken

  data/
    npm-snapshot.json           — Cachad npm-namnlista (inbäddad, ~2 MB komprimerad) för offline-korscheck
    pypi-snapshot.json          — Cachad PyPI-namnlista för offline-korscheck
```

### Ändringar i befintliga filer

- **`packages/core/src/types.ts`** — Lägger till nya SmellType-värden: `'LlmUnboundedCall'`, `'LlmUnpinnedModel'`, `'LlmNoSystemMessage'`, `'LlmNoStructuredOutput'`, `'LlmUnsetTemperature'`, `'HallucinatedPackageImport'`, `'AiAttributedSATD'`, `'ComplexityMassConcentration'`. Utökar `HealthResult`-interfacet med det valfria fältet `intentDebt?: IntentDebtSummary` (nytt interface i samma fil).

- **`packages/core/src/scoring/weights.ts`** — Lägger till vikter för samtliga nya smell-typer i `SMELL_WEIGHTS`-objektet. Uppdaterar typen `SmellType` är beroende (via Record-definitionen).

- **`packages/core/src/smells/satd.ts`** — Importerar och anropar `detectAiAttributedSATD()` från `ai-attributed-satd.ts` som ett andra pass direkt efter det befintliga SATD-passet i `detectSATD()`-funktionen. Returnerar båda i samma `Smell[]`.

- **`packages/core/src/smells/text-detectors.ts`** — Utökar `detectSATDFromText()` med ett andra pass via `detectAiAttributedSATDFromText()` för Tier B/C-språk utan AST.

- **`packages/core/src/analyzers/index.ts`** — Exporterar `analyzeLlmIntegration`, `detectHallucinatedImports`, `detectComplexityMassConcentration`.

- **`packages/core/src/analyzers/typescript.ts`** (och `python.ts`) — Anropar `analyzeLlmIntegration()` och `detectHallucinatedImports()` inom respektive analyzers och lägger till resultaten i `smells`-arrayen innan return. Anropar `detectComplexityMassConcentration()` från `complexity-mass.ts` och appendar funnet smell om erosion > 0.60.

- **`packages/core/src/scoring/scorer.ts`** — Lägger till logik för `intentDebt`-aggregering och `tieredAiGate`-kontroll: om `AiAttributedSATD`-smells > 0 och score ≥ 9.5 returneras `loopComplete: false` tills score ≥ 9.7 (implementeras i `ToolResponse`-byggarsteget, inte i scorer.ts direkt — se `mcp-server`-sidan).

- **`packages/core/src/index.ts`** — Exporterar `analyzeLlmIntegration`, `detectHallucinatedImports`, `detectComplexityMassConcentration`, `detectAiAttributedSATD`, och typen `IntentDebtSummary`.

- **`packages/mcp-server/src/tools/review.ts`** (eller `code-health-review.ts`) — Inkluderar `intentDebt` i svar-payloaden och applicerar det tiered AI-gate (ändrar `loopComplete` till `false` om `AiAttributedSATD > 0 && score < 9.7`).

---

## Tasks

### 1. Nya SmellType-värden och HealthResult.intentDebt (typer)

- [ ] **[Haiku] Utöka `SmellType` i `packages/core/src/types.ts`**
  - Lägg till: `'LlmUnboundedCall' | 'LlmUnpinnedModel' | 'LlmNoSystemMessage' | 'LlmNoStructuredOutput' | 'LlmUnsetTemperature' | 'HallucinatedPackageImport' | 'AiAttributedSATD' | 'ComplexityMassConcentration'` till union-typen.
  - Lägg till nytt interface direkt efter `HealthResult`:
    ```ts
    export interface IntentDebtSummary {
      aiAttributedSatdCount: number;
      orphanedTodoCount: number;    // SATD utan spårad fix (befintlig SATD-count)
      undocumentedPublicApiCount: number; // LowDocCoverage-smells
      tieredGateActive: boolean;    // true om AiAttributedSATD > 0 → kräver score ≥ 9.7
    }
    ```
  - Utöka `HealthResult` med `intentDebt?: IntentDebtSummary`.
  - Acceptanskriterium: `pnpm -r typecheck` passerar utan fel.

### 2. Vikter för nya smells

- [ ] **[Haiku] Uppdatera `packages/core/src/scoring/weights.ts`**
  - Lägg till i `SMELL_WEIGHTS`:
    ```ts
    LlmUnboundedCall: 1.0,
    LlmUnpinnedModel: 1.0,
    LlmNoSystemMessage: 1.0,
    LlmNoStructuredOutput: 1.0,
    LlmUnsetTemperature: 0.8,
    HallucinatedPackageImport: 1.5,
    AiAttributedSATD: 0.8,
    ComplexityMassConcentration: 1.2,
    ```
  - Motivering i kommentar: LLM-integration-smells anpassade från SpecDetect4AI-pappret (arXiv 2512.18020). `HallucinatedPackageImport` i paritet med `SqlInjectionRisk` (supply-chain-risk). `ComplexityMassConcentration` 1.2 — samma nivå som `BrainMethod`/`DeepNesting` då detta är ett strukturellt konsoliderings-smell.
  - Acceptanskriterium: `SMELL_WEIGHTS` kompilerar (alla `SmellType`-värden måste vara nycklar i `Record<SmellType, number>`).

### 3. AiAttributedSATD-detektor

- [ ] **[Sonnet] Skapa `packages/core/src/smells/ai-attributed-satd.ts`**
  - Exportera `detectAiAttributedSATD(tree: SyntaxNode): Smell[]` för AST-baserade språk (Tier A).
  - Exportera `detectAiAttributedSATDFromText(code: string): Smell[]` för Tier B/C.
  - AI-termer (regex): `\b(LLM|AI|GPT|ChatGPT|Copilot|Gemini|Claude)\b`
  - Kombinera med SATD-märken: `\b(TODO|FIXME|HACK|XXX)\b` — båda krävs i samma kommentnod/-rad.
  - Optionellt: matcha osäkerhetsfraser `(no clue|not sure|don't understand|unclear why)` i kombination med en AI-term som förhöjer severity till `'medium'` (annars `'low'`).
  - Returnera `SmellType: 'AiAttributedSATD'`, rad, `description` med matchad AI-term och SATD-märke, `suggestion: 'Lös den AI-inducerade skulden omedelbart eller addera ett spårat issue — kräver score ≥ 9.7 för loopComplete.'`
  - Acceptanskriterium: Fixture `packages/core/tests/fixtures/unhealthy/ai-satd-fixture.ts` med kommentarer som `// TODO: Claude generated this but I'm not sure it handles edge cases` detekteras; rent fixture utan AI-referens detekteras inte.

- [ ] **[Haiku] Integrera `detectAiAttributedSATD` i `packages/core/src/smells/satd.ts`**
  - Importera `detectAiAttributedSATD` och anropa den i `detectSATD(tree)` som ett andra pass.
  - Lägg till resultaten i `smells`-arrayen innan return.
  - Acceptanskriterium: befintliga SATD-tester fortsätter passera; nytt AI-SATD-test passerar.

- [ ] **[Haiku] Integrera `detectAiAttributedSATDFromText` i `packages/core/src/smells/text-detectors.ts`**
  - Exportera `detectAiAttributedSATDFromText` och anropa den som ett andra pass i `detectSATDFromText()`.
  - Slå ihop resultaten i returnerad array.
  - Acceptanskriterium: `detectSATDFromText('// TODO: GPT wrote this, unsure about correctness')` returnerar ett `AiAttributedSATD`-smell.

### 4. LLM-integrationslukter (SpecDetect4AI)

- [ ] **[Opus] Skapa `packages/core/src/analyzers/llm-integration.ts`**
  - Exportera `analyzeLlmIntegration(code: string, language: 'typescript' | 'javascript' | 'python', filePath: string): Smell[]`.
  - **Strategi:** Regex + enkla textmönster på parsad kod (inga nya tree-sitter-anrop utöver de som redan utförs av respektive analyzers); eller om befintligt AST-objekt finns — traversera `call_expression`-noder. Rekommendation: regex-overlay på kodsträng för att hålla implementationen oberoende av interna AST-objekt.
  - **UMM (LlmUnboundedCall):** Detektera anrop till `client.chat.completions.create(`, `anthropic.messages.create(`, `openai.responses.create(`, `ChatOpenAI(`, `Anthropic(` — om `max_tokens`/`max_output_tokens`/`timeout`/`max_retries` saknas i argumenten (inom 5 rader efter anropet eller i constructor-argumenten).
  - **NMVP (LlmUnpinnedModel):** Detektera strängliteraler som matchar `"gpt-4o"`, `"gpt-4"`, `"claude-3"`, `"claude-opus"`, `"claude-sonnet"` utan datumstämpel (mönster: modellnamn utan `-YYYY-MM-DD` eller `-YYYYMMDD`-suffix).
  - **NSM (LlmNoSystemMessage):** Detektera `messages`-array-literal nära LLM-anrop som saknar ett objekt med `"role":\s*"system"`.
  - **NSO (LlmNoStructuredOutput):** Detektera LLM-anrop utan `response_format`-nyckel eller utan Pydantic-modell/schema som argument.
  - **TNES (LlmUnsetTemperature):** Detektera LLM-anrop utan `temperature`-nyckel i argumenten.
  - Returnera rätt `SmellType` per smell, `severity: 'medium'`, rad, beskrivning med faktisk matchad text.
  - Acceptanskriterium: Fixture `packages/core/tests/fixtures/unhealthy/llm-integration-smells.ts` med ett anrop `openai.chat.completions.create({ model: 'gpt-4o', messages: [{role: 'user', content: 'Hi'}] })` returnerar minst NMVP, NSM, NSO, TNES. Fixture `packages/core/tests/fixtures/healthy/llm-integration-clean.ts` med `model: 'gpt-4o-2024-11-20'`, explicit `temperature`, `response_format`, system-message och `max_tokens` returnerar inga sådana smells.

- [ ] **[Haiku] Integrera `analyzeLlmIntegration` i `packages/core/src/analyzers/typescript.ts`**
  - Importera och anropa `analyzeLlmIntegration(code, 'typescript', filePath)` i slutet av `analyzeTypeScript()`, lägg till resultaten i `smells`-arrayen.
  - Anropa även för `javascript` i `LANGUAGE_DISPATCH` (sker via `analyzeTypeScript` med `language`-parameter om det stöds, annars separat anrop).
  - Acceptanskriterium: `analyzeCode(llmSmellCode, 'typescript')` returnerar NMVP-smell.

- [ ] **[Haiku] Integrera `analyzeLlmIntegration` i `packages/core/src/analyzers/python.ts`**
  - Importera och anropa `analyzeLlmIntegration(code, 'python', filePath)` i slutet av `analyzePython()`.
  - Acceptanskriterium: `analyzeCode(pythonLlmCode, 'python')` med `client.chat.completions.create(model="gpt-4o", ...)` returnerar NMVP-smell.

### 5. HallucinatedPackageImport (slopsquatting)

- [ ] **[Sonnet] Skapa `packages/core/src/analyzers/hallucinated-import.ts`**
  - Exportera `detectHallucinatedImports(code: string, language: Language, filePath: string): Smell[]`.
  - **Import-extraktion (regex, språkagnostisk):**
    - Python: `import\s+([\w.]+)` och `from\s+([\w.]+)\s+import`
    - TS/JS: `import\s+.*from\s+['"]([^'"./][^'"]*?)['"]` och `require\(['"]([^'"./][^'"]*?)['"]\)`
    - Rust (Tier A, valfritt): `use\s+([\w:]+)` (top-level crate-namn)
    - Filtrera bort: relativa imports (`./`, `../`), inbyggda Node-moduler och Python-stdlib (hårdkodad lista).
  - **Korscheck:** Läs `packages/core/src/data/npm-snapshot.json` (för TS/JS) eller `packages/core/src/data/pypi-snapshot.json` (för Python) och sök paketnamnet (case-insensitiv för PyPI, exakt match för npm). Om paketet inte finns → `HallucinatedPackageImport`-smell.
  - **Snapshot-fallback:** Om snapshot-filen saknas eller är äldre än 30 dagar → logga varning, returnera inga smells (offline-säkert beteende).
  - **Snapshot-generering:** Inkludera ett `scripts/update-package-snapshots.mjs` som hämtar PyPI Simple HTML-index och npm registry search, extraherar paketnamn, och skriver JSON-filerna.
  - Returnera `SmellType: 'HallucinatedPackageImport'`, `severity: 'high'`, rad, `description: 'Paketet "${name}" hittades inte i cached registry-snapshot — potentiell slopsquatting-risk.'`
  - Acceptanskriterium: `detectHallucinatedImports("import nonexistent_package_xyz123", 'python', 'test.py')` returnerar ett smell (given att `pypi-snapshot.json` inte innehåller det namnet). Verkliga paket (`import openai`, `import requests`) returnerar inga smells.

- [ ] **[Haiku] Lägg till `npm-snapshot.json` och `pypi-snapshot.json` under `packages/core/src/data/`**
  - Skapa katalogen `packages/core/src/data/`.
  - Generera initiala snapshots via `scripts/update-package-snapshots.mjs` — eller inkludera ett minimalt testsnap (1000 vanligaste paket) för testmiljön.
  - Lägg till `data/*.json` i `packages/core/package.json` under `files`-fältet om det finns.
  - Acceptanskriterium: `detectHallucinatedImports("import openai", 'python', 'f.py')` returnerar tomt array (openai finns i snapshot).

### 6. ComplexityMassConcentration (Structural Erosion Index)

- [ ] **[Sonnet] Skapa `packages/core/src/analyzers/complexity-mass.ts`**
  - Exportera `detectComplexityMassConcentration(functions: FunctionResult[]): Smell | null`.
  - Implementera formeln:
    ```ts
    const mass = (f: FunctionResult) => f.cyclomaticComplexity * Math.sqrt(f.length);
    const highCC = functions.filter(f => f.cyclomaticComplexity > 10);
    const totalMass = functions.reduce((s, f) => s + mass(f), 0);
    const highMass  = highCC.reduce((s, f) => s + mass(f), 0);
    const erosion   = totalMass > 0 ? highMass / totalMass : 0;
    ```
  - Om `erosion > 0.60` och `functions.length >= 3` (minst 3 funktioner för signal): returnera smell med `type: 'ComplexityMassConcentration'`, `severity: erosion > 0.80 ? 'critical' : 'high'`, `line: 1`, `metricValue: erosion`, `description: 'Erosionsindex ${(erosion * 100).toFixed(1)} % — ${(erosion * 100 - 60).toFixed(1)} procentenheter över tröskeln (60 %). Agentkod uppvisar typiskt 0.68 kontra mänsklig kod 0.34.'`, `suggestion: 'Extrahera komplexa funktioner (CC > 10) till separata moduler tills de inte längre dominerar komplexitetsmassan.'`
  - Returnera `null` om `functions.length < 3` eller `erosion <= 0.60`.
  - Acceptanskriterium: Fixture med tre funktioner där en har CC = 25 och SLOC = 100 och de övriga har CC = 2 och SLOC = 10 → erosion = (25×10) / (25×10 + 2×√10 + 2×√10) ≈ 0.97 → smell returneras. Fixture med jämnt fördelade funktioner (CC ≤ 8 alla) → null.

- [ ] **[Haiku] Anropa `detectComplexityMassConcentration` i `packages/core/src/analyzers/typescript.ts`**
  - Importera från `../analyzers/complexity-mass` och anropa med `functions`-arrayen i slutet av `analyzeTypeScript()`, lägg till smell i `smells` om icke-null.
  - Gör samma för `python.ts`, `java.ts`, `csharp.ts`, `go.ts` och `rust.ts` (alla Tier A med fullständig `FunctionResult`-data inkl. `length`).
  - Acceptanskriterium: `analyzeCode(highErosionCode, 'typescript')` returnerar `ComplexityMassConcentration`-smell med korrekt `metricValue`.

### 7. intentDebt-aggregering och tiered AI-gate

- [ ] **[Sonnet] Bygg `intentDebt`-aggregering i `packages/core/src/index.ts`-pipeline**
  - I den interna `buildHealthResult()`-hjälpfunktionen (eller inline i `analyzeCode()`-funktionen i `index.ts`): beräkna `IntentDebtSummary` efter smells-aggregeringen.
  - `aiAttributedSatdCount`: räkna smells med `type === 'AiAttributedSATD'`.
  - `orphanedTodoCount`: räkna smells med `type === 'SATD'` (befintliga ej-AI-attributerade).
  - `undocumentedPublicApiCount`: räkna smells med `type === 'LowDocCoverage'`.
  - `tieredGateActive`: `aiAttributedSatdCount > 0`.
  - Sätt `result.intentDebt = summary` på `HealthResult`.
  - Acceptanskriterium: `analyzeCode(codeWithAiSatd, 'typescript').intentDebt?.tieredGateActive === true`.

- [ ] **[Sonnet] Implementera tiered AI-gate i MCP review-verktyget**
  - I `packages/mcp-server/src/tools/` (relevant tool-fil för `code_health_review` eller `code_health_auto_refactor`) — läs `intentDebt?.tieredGateActive` och `intentDebt?.aiAttributedSatdCount` från `HealthResult`.
  - Om `tieredGateActive === true` och `score < 9.7`: sätt `loopComplete: false` oavsett om score ≥ `AI_READY_THRESHOLD` (9.5).
  - Lägg till i `summary`-texten: `'⚠ AI-attributerad skuld detekterad — loopComplete kräver score ≥ 9.7 (tiered AI-gate).'`
  - Acceptanskriterium: Mock-test: `HealthResult` med score = 9.6 och `intentDebt.tieredGateActive = true` → `ToolResponse.loopComplete === false`.

### 8. Fixtures och tester

- [ ] **[Haiku] Skapa unhealthy-fixtures för nya smells**
  - `packages/core/tests/fixtures/unhealthy/llm-integration-smells.ts` — TypeScript-fil med OpenAI-anrop som saknar `temperature`, `response_format`, system-message, version-pinning och `max_tokens`.
  - `packages/core/tests/fixtures/healthy/llm-integration-clean.ts` — TypeScript-fil med korrekt LLM-anrop (alla fem parametrar satta).
  - `packages/core/tests/fixtures/unhealthy/ai-satd-fixture.ts` — Fil med kommentarer som `// TODO: GPT wrote this but I'm not sure it handles edge cases` och `// FIXME: Claude suggested this approach, unclear why`.
  - `packages/core/tests/fixtures/unhealthy/high-erosion.ts` — Fil med tre funktioner: en med CC=25/SLOC=100, två med CC=2/SLOC=10 → erosion ≈ 0.97.
  - `packages/core/tests/fixtures/healthy/low-erosion.ts` — Fil med fyra funktioner alla med CC ≤ 8.
  - Acceptanskriterium: Varje unhealthy-fixture returnerar minst ett smell av rätt typ; healthy-fixtures returnerar inga smells av dessa typer.

- [ ] **[Sonnet] Skriv enhetstester**
  - `packages/core/tests/analyzers/llm-integration.test.ts`:
    - Test: OpenAI-anrop utan version-pinning → NMVP-smell.
    - Test: Anthropic-anrop utan system message → NSM-smell.
    - Test: Korrekt anrop → inga LLM-smells.
  - `packages/core/tests/smells/ai-attributed-satd.test.ts`:
    - Test: `detectAiAttributedSATDFromText('// TODO: Claude generated this')` → ett `AiAttributedSATD`-smell.
    - Test: `detectSATDFromText('// TODO: fix this later')` → `SATD`-smell men inget `AiAttributedSATD`-smell.
  - `packages/core/tests/analyzers/complexity-mass.test.ts`:
    - Test: hög-erosion-fixture → smell med `metricValue > 0.60`.
    - Test: låg-erosion-fixture → null.
  - `packages/core/tests/analyzers/hallucinated-import.test.ts`:
    - Test: känt paket → inga smells.
    - Test: okänt paket med giltig snapshot → `HallucinatedPackageImport`-smell.
    - Test: snapshot saknas → inga smells (graceful fallback).
  - Acceptanskriterium: `pnpm --filter @healthy-ai-code/core test` passerar alla nya tester.

### 9. Export och registrering

- [ ] **[Haiku] Uppdatera `packages/core/src/index.ts`**
  - Lägg till exports:
    ```ts
    export { analyzeLlmIntegration } from './analyzers/llm-integration';
    export { detectHallucinatedImports } from './analyzers/hallucinated-import';
    export { detectComplexityMassConcentration } from './analyzers/complexity-mass';
    export { detectAiAttributedSATD, detectAiAttributedSATDFromText } from './smells/ai-attributed-satd';
    export type { IntentDebtSummary } from './types';
    ```
  - Acceptanskriterium: `pnpm -r typecheck` passerar; konsumenter kan importera alla nya symboler.

- [ ] **[Haiku] Verifiera att `pnpm build` och `node scripts/health-audit.mjs` fungerar**
  - Bygg hela monorepon med `pnpm build`.
  - Kör `node scripts/health-audit.mjs` och verifiera att self-audit-körningen inte kastar fel.
  - Acceptanskriterium: `health-audit.mjs` avslutar utan uncaught exceptions och rapporterar scores för alla projekt-filer.

---

## Beroenden

**Måste landa först:**
- Sprint 28 (säkerhets-smells, `SqlInjectionRisk`, `UnsafeDeserialization`, `PathTraversalRisk`) — ger referensimplementationer för call-site-smell-mönster som `HallucinatedPackageImport` och LLM-smells kan följa.
- Sprint 29 (AI-kod-audit, `SATD`-pipeline, `detectSATDFromText`) — `AiAttributedSATD` bygger direkt ovanpå befintlig `detectSATD()` och `detectSATDFromText()`.

**Parallell med:**
- Sprint 56 (outputSchema, diff-mode responses) — oberoende, men om `outputSchema` landar kan `intentDebt` inkluderas i det schemalagda svaret utan extra arbete.

**Unblocks:**
- Tiered AI-gate möjliggör en framtida sprint med explicit "AI-code certification" (score ≥ 9.7 + noll AiAttributedSATD = certifierat AI-safe).
- `ComplexityMassConcentration` ger refaktoreringsslingan ett nytt stoppsignal — erosion > 0.80 i kombination med låg score kan trigga `xhigh`-effort istället för `high`.
- `HallucinatedPackageImport` öppnar för integration med SBOM-verktyg i en framtida sprint.

---

## Testplan

```bash
# 1. TypeScript-kompilering (hela monorepon)
pnpm -r typecheck

# 2. Core-enhetstest (alla)
pnpm --filter @healthy-ai-code/core test

# 3. MCP-servertest (integration)
pnpm --filter @healthy-ai-code/mcp-server test

# 4. Bygg
pnpm build

# 5. Self-audit (verifierar att nya smells inte kraschar pipeline)
node scripts/health-audit.mjs

# 6. Manuell sanity-check på unhealthy-fixtures
node -e "
const { analyzeCode } = require('./packages/core/dist/index.js');
const code = require('fs').readFileSync('./packages/core/tests/fixtures/unhealthy/llm-integration-smells.ts', 'utf8');
const result = analyzeCode(code, 'typescript');
const llmSmells = result.smells.filter(s => s.type.startsWith('Llm'));
console.log('LLM-smells:', llmSmells.length, llmSmells.map(s => s.type));
console.log('Score:', result.score);
"

# 7. Kör med fixture som har AI-SATD och verifiera intentDebt
node -e "
const { analyzeCode } = require('./packages/core/dist/index.js');
const code = require('fs').readFileSync('./packages/core/tests/fixtures/unhealthy/ai-satd-fixture.ts', 'utf8');
const result = analyzeCode(code, 'typescript');
console.log('intentDebt:', JSON.stringify(result.intentDebt, null, 2));
console.log('tieredGateActive:', result.intentDebt?.tieredGateActive);
"
```

**Förväntade utfall:**
- `pnpm -r typecheck` → inga fel (alla nya SmellType-värden täckta i `SMELL_WEIGHTS`).
- `pnpm --filter @healthy-ai-code/core test` → alla befintliga tester passerar + nya tester gröna.
- `llm-integration-smells.ts`-fixtur → minst 4 LLM-smells (NMVP, NSM, NSO, TNES), score < 9.0.
- `ai-satd-fixture.ts`-fixtur → `intentDebt.tieredGateActive === true`, `intentDebt.aiAttributedSatdCount >= 2`.
- `high-erosion.ts`-fixtur → `ComplexityMassConcentration`-smell med `metricValue > 0.60`.
- `health-audit.mjs` → avslutar utan fel, rapporterar scores.

**Nya fixtures som ska existera efter sprinten:**

```
packages/core/tests/fixtures/
  unhealthy/
    llm-integration-smells.ts       — OpenAI-anrop utan version, temp, system-message, structured output, max_tokens
    ai-satd-fixture.ts              — Kommentarer med AI-referens + SATD-märke
    high-erosion.ts                 — Hög ComplexityMassConcentration (erosion > 0.80)
  healthy/
    llm-integration-clean.ts        — Korrekt LLM-anrop (alla SpecDetect4AI-krav uppfyllda)
    low-erosion.ts                  — Jämt fördelad komplexitet (erosion < 0.40)
```

---

## Tekniska beslut

1. **Regex-overlay för LLM-smells, inte ny AST-traversal.** SpecDetect4AI-pappret validerar DSL-regelbaserad statisk detektion (86 % precision på 200 projekt). En regex-overlay på kodsträng är enklare att underhålla, oberoende av interna AST-objekt, och fungerar för alla tre målspråken (TS/JS/Python) utan att kräva förändringar i respektive parsers. Avvägning: regex kan ge false positives på strängliteraler eller kommentarer med SDK-namn — acceptabel risk vid 86 %-precisionen i referensstudien; kan hårdas med AST-kontext i en uppföljningssprint om falsk-positiv-frekvensen är oacceptabel i praktiken.

2. **Inbäddad package-snapshot (offline-first) för HallucinatedPackageImport.** Runtime-nätverksanrop mot PyPI/npm introducerar latens, offline-feltillstånd och supply-chain-risk i analysverktyget självt. En cachad JSON-snapshot (uppdateras via separat script) är förutsägbar och fungerar i air-gap-miljöer. Avvägning: snapshot blir inaktuell; löses med varning om snapshot är äldre än 30 dagar och ett `scripts/update-package-snapshots.mjs`-skript. Känd begränsning: nysläppta paket syns inte förrän snapshot uppdateras.

3. **`intentDebt` som valfritt fält i `HealthResult` (inte separat API).** Fältet byggs inline i den befintliga analyze-pipeline utan ny API-yta. Det håller bakåtkompatibilitet (konsumenter som inte bryr sig om `intentDebt` berörs inte) och gör att all information är tillgänglig i ett enda verktygssvar. Avvägning: `HealthResult` växer något; acceptabelt givet att fältet är `optional`.

4. **Tiered AI-gate i MCP-serverlagret, inte i scorer.ts.** `AI_READY_THRESHOLD` och scoring-formeln i `packages/core` förblir oförändrade och stabila. Gate-logiken hör hemma i verktygssvaret (MCP-servern) som ett affärsregelslager ovanpå core-analysen. Avvägning: en konsument som använder `packages/core` direkt utan MCP-servern ser inte gaten automatiskt — de måste kontrollera `intentDebt.tieredGateActive` själva. Det är korrekt beteende: core är ett analysbibliotek, inte en policy-motor.

5. **`ComplexityMassConcentration` anropas i Tier A-analyzers (TypeScript, Python, Java, C#, Go, Rust) men inte i Tier B/C.** Formeln `mass(f) = CC(f) × √SLOC(f)` kräver tillförlitlig `cyclomaticComplexity` och `length` per funktion — data som bara är fullt tillförlitlig från tree-sitter AST-parsning. Tier B-analyzers returnerar uppskattade CC-värden via regex; Tier C returnerar inga funktioner alls. Avvägning: erosions-signalen uteblir för Tier B-språk (Bash, Lua, etc.) — acceptabelt i nuläget; kan utökas om Tier B-CC-kvaliteten valideras.

---

## Risker och öppna frågor

1. **False-positive-risk för NMVP i icke-LLM-kod.** Strängliteralen `"gpt-4o"` kan uppträda i kommentarer, logg-meddelanden eller teststrängar och trigga NMVP felaktigt. Mitigation: matcha bara när strängen förekommer i närheten av ett känt SDK-anrop (inom 3 rader). Om det ändå ger för många falskt positiva i `health-audit.mjs`-köret → skärp kontextfönstret eller kräv att strängen är ett direkt argumentvärde till `model:`-nyckeln.

2. **Package-snapshot-storlek och uppstartsfördröjning.** PyPI innehåller ~600 000 paket, npm ~2.5 miljoner. En fullständig snapshot i JSON kan vara 20–50 MB. Mitigation: filtrera till de 100 000 vanligaste paketen baserat på nedladdningsstatistik, komprimera med gzip, och lazy-load snapshot vid första anrop (cachat i minnet efteråt). Om det ändå är för tungt → använd en Bloom-filter-representation (~1 MB för 100 000 paket vid 1 % false-positive-rate).

3. **Erosionsformeln är känslig för filer med få stora funktioner och ingen kontext.** En fil med exakt en funktion med CC = 15 och tre hjälpfunktioner med CC = 2 kan ge erosion > 0.60 utan att filen är "agentkodsdegraderad" — det är bara ett normalt extraheringssteg. Minimumet `functions.length >= 3` hjälper, men kanske inte tillräckligt. Öppen fråga: ska en minimitröskel på total filmassa (`totalMass > 50`) krävas för att undvika brus på mycket korta filer?

4. **`AiAttributedSATD` + tiered gate kan skapa falsk trygghet om AI-genererat men ej SATD-märkt.** Gate kräver att utvecklaren faktiskt skrivit en `TODO/AI`-kommentar — automatgenererad AI-kod utan kommentar passerar obemärkt. Det är ärlig gräns för vad GIST-metoden detekterar (den studerar explicithet, inte proveniensdetektering). Dokumentera begränsningen tydligt i tool-response `summary`-fältet.
