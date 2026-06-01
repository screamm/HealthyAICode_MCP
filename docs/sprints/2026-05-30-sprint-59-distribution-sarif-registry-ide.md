# Sprint 59: Distribution — SARIF-berikning, MCP-registry, IDE & standarder

**Datum:** 2026-05-30
**Status:** Planerad

> **Owner decision pending — tool rename NOT executed:**
> The planned rename of all `code_health_*` tool names to `healthy_ai_code_*` is a
> **breaking change affecting 25+ files** and requires an explicit owner decision before
> execution. It remains in the checklist below (item marked `[ ]`) as a pending owner
> action. No rename has been performed in this sprint or any prior sprint.

---

## Mål

- Berika den befintliga `formatAsSarif()`-funktionen med `partialFingerprints.primaryLocationLineHash`, `security-severity` (0.0–10.0) på säkerhetslukter och `run.properties.healthScore`, så att resultat dyker upp korrekt i GitHub Code Quality-flödet utan extra konfiguration.
- Lägga till GitLab Code Quality JSON-export (`--format gitlab-json`) och CWE/OWASP-taxonomimappning i SARIF, så att verktyget når GitLabs enterprise-bas och är filtrerbart per CWE i alla SARIF-konsumenter.
- Registrera servern i officiella MCP-registret och Smithery, byta ut verktygsprefix från `code_health_*` till `healthy_ai_code_*`, och publicera `.well-known/mcp-server-card.json` för automatisk klientdiscovery.
- Leverera ett GitHub Action (`sarif-upload-action`) och en VS Code-extension som bäddar in MCP-servern som en stdio-barnprocess, samt komplettera med `llms-full.txt` och en ISO/IEC 5055-mappning (`--format iso5055`) för reglerade branscher.

---

## Bakgrund och motivation

Roadmap-analysen (242 sökningar, 186 fynd) identifierade distribution som det **enskilt mest bindande gapet**: motorn är redan stark men osynlig i de kanaler där adoption sker.

**SARIF och GitHub Code Quality.** GitHub Code Quality gick ut i public preview oktober 2025 och organisationsdashboard februari 2026 ([github.blog/changelog/2025-10-28](https://github.blog/changelog/2025-10-28-github-code-quality-in-public-preview/)). Projektet har redan `formatAsSarif()` i `packages/core/src/security/sarif-formatter.ts`, men saknar tre fält som krävs för korrekt drift i GitHub:

1. `partialFingerprints.primaryLocationLineHash` — GitHub använder enbart detta fält för att deduplicera alerts mellan körningar. Utan det skapas dubbletter vid varje push. Format: `"<hex-hash>:<löpnummer>"`, t.ex. `"39fa2ee980eb94b0:1"` ([GitHub SARIF-dokumentation](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning)).
2. `properties.security-severity` på regelobjekt — ett numeriskt strängvärde 0.1–10.0 (>9.0 = critical, 7.0–8.9 = high, 4.0–6.9 = medium, 0.1–3.9 = low). Krävs för att resultat ska kategoriseras som säkerhetsresultat och filtreras i GitHub Advanced Security-vyer ([ibid.]).
3. `run.properties.healthScore` — GitHub definierar inga reserverade run-egenskaper; aggregerad hälsoscore kan skickas som ett godtyckligt `properties`-fält på `run`-objektet och är synligt i SARIF-läsare som stöder proprietära egenskaper.

**CWE/OWASP-taxonomi.** Alla 28 biomarkörer mappar till CWE-identifierare, och SARIF 2.1.0 stöder `taxa`-referenser mot externa taxonomier. Färdiga taxonomifiler finns på [github.com/sarif-standard/taxonomies](https://github.com/sarif-standard/taxonomies). Mappningen är ett engångsarbete med permanent interoperabilitetsvinst.

**GitLab Code Quality JSON.** GitLab kräver ett separat JSON-format (Code Climate-derivat, ej SARIF) med fälten `description`, `check_name`, `fingerprint`, `severity` (`info`/`minor`/`major`/`critical`/`blocker`) och `location.path` + `location.lines.begin`. Fingeravtrycket bör vara en MD5 av `filePath + smellType + startLine` ([docs.gitlab.com/ci/testing/code_quality](https://docs.gitlab.com/ci/testing/code_quality/)). GitLabs enterprise-bas nås inte via SARIF-kanalen.

**MCP-registry och verktygsomnamning.** Det officiella MCP-registret lanserade i preview september 2025 och har idag ~9 652 servrar. Registrets sökning baseras på embedding-likhet över namn, beskrivning och schema. Prefixet `code_health_*` kolliderar direkt med CodeScenes identiskt namngivna verktyg (`code_health_review`, `code_health_pre_commit`, etc., [codescene.com/early-access-codescene-mcp-server](https://codescene.com/early-access-codescene-mcp-server)). Byte till `healthy_ai_code_*` är en brytande förändring men billig att göra nu medan användarbasen är liten. `.well-known/mcp-server-card.json` föreslaget i SEP-1649 ([github.com/modelcontextprotocol/modelcontextprotocol/issues/1649](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1649)) möjliggör automatisk klientdiscovery.

**GitHub Action.** `github/codeql-action/upload-sarif@v3` är standardvägen för att ladda upp SARIF till GitHub. Kräver `security-events: write`-behörighet i workflow. Om `partialFingerprints` saknas i SARIF-filen beräknar actionen dem automatiskt, men det kräver att repositorykoden också finns tillgänglig — bättre att skicka med fingeravtrycken i filen.

**VS Code-extension.** VS Code MCP-stöd blev GA juli 2025 ([github.blog/changelog/2025-07-14](https://github.blog/changelog/2025-07-14-model-context-protocol-mcp-support-in-vs-code-is-generally-available/)). En extension som startar MCP-servern som en stdio-barnprocess via Node.js följer befintligt mönster från andra MCP-extensions och kräver ingen ny serverarkitektur.

**ISO/IEC 5055 och llms-full.txt.** ISO/IEC 5055:2021 definierar fyra mätdimensioner — Security, Reliability, Performance Efficiency, Maintainability — och 138 underliggande CWE-baserade svagheter ([CISQ](https://www.it-cisq.org/standards/code-quality-standards/)). En mappning av de 28 biomarkörerna till dessa fyra dimensioner öppnar regulatorisk upphandling. `llms-full.txt` är ett gemensamt mönster för att låta AI-klienter ladda all serverbeskrivning i en enda cachad hämtning ([buildwithfern.com/post/optimizing-api-docs-ai-agents-llms-txt-guide](https://buildwithfern.com/post/optimizing-api-docs-ai-agents-llms-txt-guide)).

**Konkurrensläget.** Roam (Apache-2.0) exporterar redan SARIF 2.1.0 från en MCP-server ([github.com/Cranot/roam-code](https://github.com/Cranot/roam-code)). Det är angeläget att stänga SARIF-gapet och ta registerpositionen innan SARIF-kanalen är mättad.

---

## Arkitektur

### Nya filer

```
packages/core/src/security/
  sarif-taxonomy.ts          — CWE/OWASP-taxonomimappning: SmellType → CweEntry (id, name, url); buildTaxaSection()
  gitlab-formatter.ts        — formatAsGitlabJson(): Smell[] + filePath → GitLabCodeQualityEntry[]
  iso5055-formatter.ts       — formatAsIso5055(): HealthResult → Iso5055Report (Security/Reliability/Performance/Maintainability)

packages/core/src/
  llms-full.ts               — generateLlmsFullTxt(): producerar llms-full.txt-sträng från verktygsscheman + viktstabell

packages/mcp-server/src/tools/
  format-output.ts           — MCP-verktyg: healthy_ai_code_format_output — tar HealthResult + format-parameter, returnerar SARIF/GitLab/ISO5055/llms-full

.well-known/
  mcp-server-card.json       — Serverbeskrivning för automatisk klientdiscovery (SEP-1649)

docs/llms-full.txt           — Genererad fil: alla 27 verktygsscheman, viktstabell, smelltyper, trösklar

actions/sarif-upload/
  action.yml                 — GitHub Action: healthy-ai-code/sarif-upload-action
  README.md                  — Installationsguide för actionen

vscode-extension/
  package.json               — VS Code-extension manifest (contributes.mcpServers)
  src/extension.ts           — Aktiverar MCP-server som stdio-barnprocess
  README.md                  — Installationsguide
```

### Ändringar i befintliga filer

- **`packages/core/src/security/sarif-formatter.ts`** — `formatAsSarif()` utökas med: (1) `partialFingerprints.primaryLocationLineHash` beräknad som `sha256(filePath + ruleId + startLine).slice(0,16) + ":1"`, (2) `properties.security-severity` (sträng 0.1–10.0) på regelobjektet i `tool.driver.rules[]` för alla `SecurityFindingType`, (3) `run.properties.healthScore` på `SarifRun`-objektet, (4) `taxa`-referens mot CWE-taxonomin i `run.taxonomies[]`.
- **`packages/core/src/security/types.ts`** — `SarifRun`-interfacet utökas med `properties?: Record<string, unknown>` och `taxonomies?: SarifTaxonomy[]`; nytt interface `SarifTaxonomy`, `SarifRule` och `SarifToolDriver` med `rules?: SarifRule[]`.
- **`packages/core/src/security/index.ts`** — Re-exporterar `formatAsGitlabJson`, `formatAsIso5055`, `buildTaxaSection` och `generateLlmsFullTxt` samt tillhörande typer.
- **`packages/mcp-server/src/server.ts`** — Importerar och registrerar `registerFormatOutput`; alla befintliga `registerX`-anrop behåller sina interna namn men verktygsnamnen i MCP-protokollet byts från `code_health_*` till `healthy_ai_code_*` i respektive `tools/`-fil. `McpServer`-versionen höjs till `'0.2.0'`.
- **`packages/mcp-server/src/tools/code-health-review.ts`** (och alla övriga verktyg) — Verktygsnamnet i `.tool()`-anropet byts från `code_health_review` till `healthy_ai_code_review` (och analogt för alla 25 andra verktyg). Alla registerförändringar är mekaniska sök-och-ersätt; inga beteendeändringar.
- **`packages/core/src/scoring/weights.ts`** — Inga viktändringar i detta sprint; filen läses av `iso5055-formatter.ts` för dimensionsmappning.
- **`README.md`** — Verktygstabell uppdateras med nytt prefix `healthy_ai_code_*`; ny sektion "Distribution" med installationsanvisningar för GitHub Action och VS Code-extension.

---

## Tasks

### 1. SARIF-berikning

- [ ] **[Sonnet] Berika `formatAsSarif()` med `partialFingerprints`**
  - Fil: `packages/core/src/security/sarif-formatter.ts`
  - Lägg till en intern hjälpfunktion `primaryLocationLineHash(filePath: string, ruleId: string, startLine: number): string` som beräknar `crypto.createHash('sha256').update(filePath + ruleId + String(startLine)).digest('hex').slice(0, 16) + ':1'` (Node.js `crypto`-modul, inget externt beroende).
  - I `toSarifResult()`: lägg till `partialFingerprints: { primaryLocationLineHash: primaryLocationLineHash(f.filePath, f.type, f.line) }` på varje `SarifResult`.
  - Acceptanskriterium: enhetsprov verifierar att `partialFingerprints.primaryLocationLineHash` på en finding med `filePath='src/app.ts'`, `type='SqlInjectionRisk'`, `line=42` är en icke-tom sträng med formatet `<16 hex-tecken>:1`.

- [ ] **[Sonnet] Lägg till `security-severity` och regelobjekt i SARIF-verktygskomponent**
  - Fil: `packages/core/src/security/sarif-formatter.ts`
  - Definiera en konstant `SECURITY_SEVERITY_MAP: Record<SecurityFindingType, string>` som mappar: `HardcodedCredential`/`HardcodedApiKey` → `"9.8"`, `SqlInjectionRisk`/`XssRisk`/`CommandInjectionRisk` → `"8.5"`, `UnsafeDeserialization`/`PathTraversalRisk` → `"7.5"`, `DependencyVulnerability` → `"6.0"`.
  - I `formatAsSarif()`: fyll `tool.driver.rules[]` med ett objekt per unik `ruleId` i findings. Varje regel får `id`, `name`, `shortDescription.text` och `properties: { "security-severity": SECURITY_SEVERITY_MAP[type] }`.
  - Utöka `SarifToolDriver`-interfacet i `types.ts` med `rules?: SarifRule[]` och lägg till `SarifRule`-interfacet.
  - Acceptanskriterium: `SarifReport.runs[0].tool.driver.rules` innehåller exakt en post per unik `SecurityFindingType` i findings-listan; varje posts `properties["security-severity"]` är ett numeriskt strängvärde i intervallet 0.1–10.0.

- [ ] **[Haiku] Lägg till `run.properties.healthScore` och signatur för taxonomi**
  - Fil: `packages/core/src/security/sarif-formatter.ts`
  - `formatAsSarif()` tar ett valfritt tredje argument `healthScore?: number`. Om angivet: lägg till `run.properties = { healthScore }` på `SarifRun`.
  - Lägg till `run.taxonomies` med en CWE-referens (se Task 1.4 nedan) om taxonomimappning finns tillgänglig.
  - Uppdatera `SarifRun`-interfacet i `types.ts` med `properties?: Record<string, unknown>` och `taxonomies?: SarifTaxonomy[]`.
  - Acceptanskriterium: `formatAsSarif(findings, '1.0.0', 8.7).runs[0].properties.healthScore === 8.7`.

- [ ] **[Sonnet] CWE/OWASP-taxonomimappning — ny fil `sarif-taxonomy.ts`**
  - Fil: `packages/core/src/security/sarif-taxonomy.ts`
  - Definiera `interface CweEntry { id: string; name: string; helpUri: string }` och en konstant `SMELL_TO_CWE: Partial<Record<SmellType, CweEntry>>` som mappar alla `SecurityFindingType`:
    - `SqlInjectionRisk` → `{ id: 'CWE-89', name: 'SQL Injection', helpUri: 'https://cwe.mitre.org/data/definitions/89.html' }`
    - `XssRisk` → `{ id: 'CWE-79', name: 'Cross-site Scripting', helpUri: '...' }`
    - `CommandInjectionRisk` → `{ id: 'CWE-78', ... }`
    - `HardcodedCredential` → `{ id: 'CWE-798', ... }`
    - `HardcodedApiKey` → `{ id: 'CWE-321', ... }`
    - `UnsafeDeserialization` → `{ id: 'CWE-502', ... }`
    - `PathTraversalRisk` → `{ id: 'CWE-22', ... }`
    - `DependencyVulnerability` → `{ id: 'CWE-1395', ... }`
  - Exportera `buildTaxaSection(): SarifTaxonomy` som returnerar ett `SarifTaxonomy`-objekt kompatibelt med SARIF 2.1.0 `run.taxonomies[]` och pekar på den officiella CWE-taxonomifilen på [github.com/sarif-standard/taxonomies](https://github.com/sarif-standard/taxonomies).
  - Acceptanskriterium: `SMELL_TO_CWE['SqlInjectionRisk'].id === 'CWE-89'`; `buildTaxaSection().name === 'CWE'`.

- [ ] **[Haiku] Fixturer för SARIF-berikning**
  - Ny fil: `packages/core/tests/fixtures/unhealthy/sarif-enrichment-fixture.ts` — en TypeScript-fil med minst en `SqlInjectionRisk`-smell, en `HardcodedCredential` och en `XssRisk` för att driva enhetstesterna för `formatAsSarif()`.
  - Uppdatera eller lägg till tester i `packages/core/tests/security/sarif-formatter.test.ts` som verifierar alla tre nya fält på en fixture-baserad SARIF-körning.
  - Acceptanskriterium: `pnpm --filter @healthy-ai-code/core test` passerar utan regressioner.

### 2. GitLab Code Quality JSON-format

- [ ] **[Sonnet] Ny `gitlab-formatter.ts`**
  - Fil: `packages/core/src/security/gitlab-formatter.ts`
  - Exportera `interface GitLabCodeQualityEntry` med fälten: `description: string`, `check_name: string`, `fingerprint: string`, `severity: 'info' | 'minor' | 'major' | 'critical' | 'blocker'`, `location: { path: string; lines: { begin: number } }`.
  - Exportera `formatAsGitlabJson(smells: Smell[], filePath: string): GitLabCodeQualityEntry[]` som:
    - Mappar `Smell.severity` (`critical`→`critical`, `high`→`major`, `medium`→`minor`, `low`→`info`, inga `blocker` genereras automatiskt).
    - Sätter `check_name` till `smell.type`.
    - Sätter `fingerprint` till `crypto.createHash('md5').update(filePath + smell.type + String(smell.line)).digest('hex')`.
    - Sätter `description` till `smell.description`.
    - Sätter `location.path` till `filePath` utan inledande `./`, och `location.lines.begin` till `smell.line`.
  - Acceptanskriterium: utdatatypen matchar GitLabs specifikation; fingeravtrycket är en 32-teckens hexsträng; array är tom om inga lukter skickas in.

- [ ] **[Haiku] Fixture och test för GitLab-formatteraren**
  - Ny fil: `packages/core/tests/fixtures/unhealthy/gitlab-format-fixture.ts` — TypeScript-fil med tre lukter av olika allvarlighetsgrad.
  - Enhetsprov i `packages/core/tests/security/gitlab-formatter.test.ts` som verifierar: korrekt `severity`-mappning, fingeravtrycksformat och att `location.path` ej börjar med `./`.
  - Acceptanskriterium: testerna passerar; MD5-fingeravtrycket är deterministiskt över körningar.

### 3. MCP-registry, Smithery och verktygsomnamning

- [ ] **[Haiku] Byt verktygsprefix: `code_health_*` → `healthy_ai_code_*`**
  - Berörd fil-grupp: alla 25 `.ts`-filer under `packages/mcp-server/src/tools/` som anropar `server.tool('code_health_...')`.
  - Sök-och-ersätt: `code_health_` → `healthy_ai_code_` i tool-namnssträngar och tillhörande typsignaturer/kommentarer. Inga beteendeändringar.
  - Uppdatera `server.ts`: höj `version` till `'0.2.0'`.
  - Uppdatera README-verktygstabellen med nytt prefix.
  - Acceptanskriterium: `pnpm -r typecheck` och `pnpm test` passerar; sökning i `packages/mcp-server/src/tools/` efter strängen `'code_health_'` ger noll träffar.

- [ ] **[Sonnet] `.well-known/mcp-server-card.json`**
  - Ny fil: `.well-known/mcp-server-card.json` i repo-roten.
  - Innehåll (SEP-1649-kompatibelt format):
    ```json
    {
      "name": "Healthy AI Code",
      "description": "Local MCP server: 28 biomarkers, 46 languages, score 1-10, self-correcting refactoring loop. No account required.",
      "version": "0.2.0",
      "transport": ["stdio"],
      "protocolVersion": "2025-11-25",
      "tools": "https://raw.githubusercontent.com/<owner>/healthy-ai-code-mcp/main/docs/llms-full.txt",
      "license": "MIT",
      "homepage": "https://github.com/<owner>/healthy-ai-code-mcp"
    }
    ```
  - Acceptanskriterium: filen är giltig JSON; `jq '.name' .well-known/mcp-server-card.json` returnerar `"Healthy AI Code"`.

- [ ] **[Haiku] `server.json` för MCP-registret**
  - Befintlig eller ny fil: `server.json` i repo-roten (kontrollera om den redan existerar och uppdatera i så fall).
  - Fälten `name`, `description`, `version`, `transport`, `tools` (lista med `healthy_ai_code_*`-namn), `license`, `homepage` skall spegla `.well-known/mcp-server-card.json`.
  - Acceptanskriterium: `node -e "JSON.parse(require('fs').readFileSync('server.json','utf8')); console.log('ok')"` skriver `ok`.

### 4. GitHub Action (sarif-upload-action)

- [ ] **[Sonnet] `actions/sarif-upload/action.yml`**
  - Ny fil: `actions/sarif-upload/action.yml` — en composite GitHub Action med inputs: `sarif-file` (required), `token` (required, default `${{ github.token }}`), `category` (optional, default `healthy-ai-code`).
  - Steps:
    1. Använd `github/codeql-action/upload-sarif@v3` med `sarif_file: ${{ inputs.sarif-file }}` och `category: ${{ inputs.category }}`.
  - Workflow-behörighet i README: `security-events: write`.
  - Acceptanskriterium: YAML är syntaktiskt korrekt (`python -c "import yaml; yaml.safe_load(open('actions/sarif-upload/action.yml'))"`); actionen kan refereras som `uses: ./actions/sarif-upload` i ett lokalt test-workflow.

- [ ] **[Haiku] Exempelworkflow i dokumentation**
  - Ny fil: `docs/github-action-example.yml` — ett komplett GitHub Actions-workflow som (1) checkar ut koden, (2) kör `node scripts/health-audit.mjs --format sarif --out health.sarif`, (3) anropar `healthy-ai-code/sarif-upload-action` med det genererade SARIF-resultatet.
  - Acceptanskriterium: YAML är syntaktiskt korrekt och följer GitHub Actions-konventioner (`uses: actions/checkout@v4`, korrekt `permissions`-block med `security-events: write`).

### 5. VS Code-extension

- [ ] **[Sonnet] `vscode-extension/package.json` och `src/extension.ts`**
  - Ny fil: `vscode-extension/package.json` med `engines.vscode: "^1.93.0"` (juli 2025 GA-version), `contributes.mcpServers` med en `stdio`-konfiguration som pekar på `node <absolut sökväg till packages/mcp-server/dist/index.js>`.
  - Ny fil: `vscode-extension/src/extension.ts` — minimalt `activate(context)`-anrop som verifierar att Node.js finns och att `mcp-server/dist/index.js` finns; loggar ett tydligt felmeddelande om bygget saknas. Inga runtime-registreringar utanför `package.json`-deklarationen (VS Code hanterar stdio-uppstart själv via `contributes.mcpServers`).
  - Acceptanskriterium: `pnpm -r typecheck` passerar för extension-paketet (om det ingår i workspace); `package.json` valideras med `node -e "require('./vscode-extension/package.json')"`.

### 6. ISO/IEC 5055-mappning och `llms-full.txt`

- [ ] **[Sonnet] Ny `iso5055-formatter.ts`**
  - Fil: `packages/core/src/security/iso5055-formatter.ts`
  - Definiera `interface Iso5055Dimension { name: string; score: number; smells: string[] }` och `interface Iso5055Report { security: Iso5055Dimension; reliability: Iso5055Dimension; performanceEfficiency: Iso5055Dimension; maintainability: Iso5055Dimension; overallScore: number }`.
  - Exportera `formatAsIso5055(result: HealthResult): Iso5055Report` som mappar biomarkörerna till de fyra ISO 5055-dimensionerna:
    - **Security**: `SqlInjectionRisk`, `XssRisk`, `CommandInjectionRisk`, `HardcodedCredential`, `HardcodedApiKey`, `UnsafeDeserialization`, `PathTraversalRisk`, `DependencyVulnerability`.
    - **Reliability**: `ComplexMethod`, `BrainMethod`, `BumpyRoad`, `DeepNesting`, `ComplexConditional`, `LargeMethod`, `GodClass`, `FeatureEnvy`, `DataClumps`, `MethodTemporalCoupling`, `KnowledgeLoss`.
    - **Performance Efficiency**: `LargeFile`, `CodeChurn`, `DeveloperCongestion`, `CognitiveComplexity`, `MagicNumber`.
    - **Maintainability**: `LowDocCoverage`, `SATD`, `LongParameterList`, `LowMaintainability`, `TypeSafetyEscape`, `MessageChain`, `PrimitiveObsession`, `ArchitectureDebt`, `DocumentationDebt`, `IntentClarity`.
  - Dimensionsscoren beräknas som `10 - Σ(weight × √count)` för smellarna i just den dimensionen (floor 1.0), dvs. samma formel fast subsettad.
  - Acceptanskriterium: `formatAsIso5055` returnerar ett objekt med alla fyra dimensioner; ett `HealthResult` med noll smells ger `overallScore === 10` och alla dimensionsscorer `=== 10`.

- [ ] **[Haiku] `generateLlmsFullTxt()` och `docs/llms-full.txt`**
  - Ny fil: `packages/core/src/llms-full.ts`.
  - Exportera `generateLlmsFullTxt(): string` som producerar en Markdown-formaterad sträng med: (1) projektbeskrivning, (2) alla verktygsnamn (`healthy_ai_code_*`) med en-menings-beskrivning, (3) viktstabell från `SMELL_WEIGHTS`, (4) tröskelvärden (`AI_READY_THRESHOLD`, `HEALTHY_THRESHOLD`, `PROBLEMATIC_THRESHOLD`), (5) scoringformel.
  - Lägg till ett skript `scripts/generate-llms-full.mjs` som anropar `generateLlmsFullTxt()` och skriver resultatet till `docs/llms-full.txt`.
  - Acceptanskriterium: `node scripts/generate-llms-full.mjs` skapar `docs/llms-full.txt`; filen innehåller strängen `healthy_ai_code_`; `pnpm -r typecheck` passerar.

- [ ] **[Haiku] MCP-verktyg `healthy_ai_code_format_output`**
  - Ny fil: `packages/mcp-server/src/tools/format-output.ts`.
  - Registrerar `healthy_ai_code_format_output` med inputs: `filePath: string`, `format: 'sarif' | 'gitlab-json' | 'iso5055'`, `healthScore?: number`.
  - Internt: läser filen med `analyzeFile(filePath)`, anropar korrekt formatter beroende på `format`-parametern, returnerar JSON-strängen.
  - Importeras och registreras i `packages/mcp-server/src/server.ts`.
  - Acceptanskriterium: integrationstestet i `packages/mcp-server/tests/integration/format-output.test.ts` verifierar att `format: 'gitlab-json'` returnerar ett JSON-array med korrekt struktur för en känd fixture-fil.

---

## Beroenden

**Förutsätter att följande redan är levererat:**
- Sprint 28 (neuro-symbolisk säkerhet) — `formatAsSarif()`, `SecurityFindingType`, `AggregatedFinding` i `packages/core/src/security/` existerar och är exporterade. Alla dessa filer läses av detta sprint.
- Sprint 29 (AI-kodgranskning) — `SmellType`-unionen i `types.ts` är komplett och stabil; utökningar i detta sprint (CWE-mappning) förutsätter inga ändringar i `SmellType`.
- Node.js `crypto`-modulen finns inbyggd — inget externt beroende behövs för SHA-256 och MD5.

**Detta sprint låser upp:**
- Kalibreringsdataflywheel (Strategy bet #2) — kräver faktisk adoption som SARIF-kanalen och registerpositionen skapar.
- Agentaudit.dev trust score och OpenSSF Scorecard SAST-kontroll — SARIF-actionen uppfyller SAST-kravet automatiskt.
- Per-organisations-dashboard i GitHub (GA februari 2026) — kräver `partialFingerprints` för korrekt deduplicering.

---

## Testplan

```bash
# 1. TypeScript-kompilering — hela monorepon
pnpm -r typecheck

# 2. Alla paket-tester
pnpm test

# 3. Kärntester för SARIF-berikning
pnpm --filter @healthy-ai-code/core test -- --testPathPattern sarif-formatter

# 4. Kärntester för GitLab-formatteraren
pnpm --filter @healthy-ai-code/core test -- --testPathPattern gitlab-formatter

# 5. Kärntester för ISO 5055
pnpm --filter @healthy-ai-code/core test -- --testPathPattern iso5055-formatter

# 6. MCP-server integrationstester (inkl. format-output-verktyget)
pnpm --filter @healthy-ai-code/mcp-server test

# 7. Självrevision — verifiera att inga verktyg fortfarande heter code_health_*
node -e "
const fs = require('fs');
const files = fs.readdirSync('packages/mcp-server/src/tools');
let found = false;
for (const f of files) {
  const src = fs.readFileSync('packages/mcp-server/src/tools/' + f, 'utf8');
  if (/server\\.tool\\(['\"]code_health_/.test(src)) { console.error('FAIL:', f); found = true; }
}
if (!found) console.log('OK: inga code_health_-namn kvar');
"

# 8. Generera docs/llms-full.txt och verifiera att den innehåller rätt prefix
node scripts/generate-llms-full.mjs
node -e "
const t = require('fs').readFileSync('docs/llms-full.txt', 'utf8');
if (!t.includes('healthy_ai_code_')) { console.error('FAIL: prefix saknas'); process.exit(1); }
console.log('OK: llms-full.txt innehåller rätt prefix');
"

# 9. Validera JSON-filer
node -e "require('./.well-known/mcp-server-card.json'); console.log('mcp-server-card.json ok')"
python -c "import yaml; yaml.safe_load(open('actions/sarif-upload/action.yml')); print('action.yml ok')"

# 10. Hälsorevision på projektets egna filer (regression-kontroll)
node scripts/health-audit.mjs
```

**Förväntade utfall:**
- `pnpm -r typecheck` — inga fel.
- `pnpm test` — ≥ 1 023 tester passerar (befintliga) + nya tester för SARIF-berikning, GitLab-formattering och ISO 5055.
- `docs/llms-full.txt` — innehåller strängen `healthy_ai_code_` och alla 27+ verktygsnamn.
- Sökning efter `code_health_` i `packages/mcp-server/src/tools/*.ts` — noll träffar.

**Nya fixturer:**
- `packages/core/tests/fixtures/unhealthy/sarif-enrichment-fixture.ts` — TypeScript-fil med SqlInjectionRisk, HardcodedCredential och XssRisk.
- `packages/core/tests/fixtures/unhealthy/gitlab-format-fixture.ts` — TypeScript-fil med tre lukter av blandat allvarlighetsgrad.

---

## Tekniska beslut

1. **SHA-256 för `primaryLocationLineHash`, MD5 för GitLab-fingeravtryck.** GitHub specificerar inte en hashalgoritm för `primaryLocationLineHash` — det primära kravet är att fingeravtrycket är stabilt mellan körningar. SHA-256 är kryptomodulen standard. GitLabs exempelkod antyder MD5; vi följer det etablerade mönstret för kompatibilitet med verktyg som jämför fingeravtryck. Att använda MD5 för ett icke-säkerhetskritiskt fingeravtryck (enbart för deduplicering av kodkvalitets-alerts) är godtagbart.

2. **`run.properties.healthScore` som godtycklig egenskap, inte ett standardiserat SARIF-fält.** GitHub definierar inga reserverade `run.properties`-fält. Egenskapen är synlig i SARIF-läsare som stöder proprietära properties, och skickas vidare orörd. Detta är det rätta SARIF 2.1.0-sättet att bifoga körningsnivå-metadata. Alternativet — att bädda in det i `runAutomationDetails.description` — är ett missbruk av det fältet.

3. **Verktygsomnamning som en atomär PR, inte gradvis.** Att byta prefix gradvis (med aliases) skapar en period med dubbla verktygsnamn som är förvirrande för MCP-klienter och registret. Eftersom användarbasen är liten är det bättre att göra bytet som en enda PR med tydlig BREAKING CHANGE-anteckning i CHANGELOG. Aliases implementeras ej.

4. **VS Code-extensionen deklarerar stdio-server i `package.json`, utan runtime-hook.** VS Code MCP GA (juli 2025) stöder `contributes.mcpServers` med `command`-transport. Extension-koden kör inget eget serverprotokoll — den deklarerar bara var binären finns och låter VS Code hantera uppstart. Detta minimerar underhållsbördan och risken för protokolldrift.

5. **ISO 5055-dimensionsscoren beräknas med samma formel `10 - Σ(weight × √count)` subsettad per dimension.** Alternativet är ett normaliserat index (0–100). Vi väljer samma skala (1–10) för konsistens med huvudscoren. Trade-off: dimensionsscorerna är inte additiva till huvudscoren, vilket bör dokumenteras tydligt i API-svaret.

---

## Risker och öppna frågor

1. **Verktygsomnamning är brytande.** Alla klienter som hårdkodar `code_health_review` slutar fungera. Risken är begränsad (liten användarbas, tidig fas) men skall kommuniceras som BREAKING CHANGE i release notes. Om ett deprekerings-alias beslutas är det lätt att lägga till i respektive `tools/`-fil efteråt.

2. **GitHub Code Quality public preview — beteendeändringar utan förvarning.** GitHub Code Quality är ännu i preview-fas. API:et för hur `security-severity` och `run.properties` visas i org-dashboarden kan förändras. Testerna mot GitHub-formatet skall hålla sig till SARIF 2.1.0-specifikationens egna fältkrav, inte GitHub-specifika UI-effekter.

3. **VS Code-extensionens sökväg till `dist/index.js` är miljöberoende.** En paketerad extension behöver antingen bunta `dist/`-mappen eller kräva att användaren kör `pnpm build` innan installation. Nuvarande plan kräver manuellt bygge; en vscode-extension som inkluderar det kompilerade paketet är en förbättring men lämnas till en uppföljningssprint. Dokumenteras tydligt i extension-README.

4. **MCP-registrets indexeringsfrekvens och sökrankningskriterier är delvis odokumenterade.** Registret drivs av Agentic AI Foundation; Smithery är en downstream-aggregator som indexerar oregelbundet. Det är oklart hur snabbt en ny server dyker upp i Smithery-sökningen efter registrering. Smithery-listning bör verifieras manuellt efter att server.json skickats in.
