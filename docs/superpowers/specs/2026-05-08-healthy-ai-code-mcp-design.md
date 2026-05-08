# Healthy AI Code MCP — Designdokument

**Datum:** 2026-05-08  
**Status:** Godkänd  
**Produkt:** `@healthy-ai-code/mcp-server`

---

## Sammanfattning

En lokal MCP-server som exponerar kodhälsoanalys direkt till AI-assistenter och agenter. Servern analyserar kod via egna AST-baserade metrics och returnerar strukturerad feedback med en självkorrigerande feedbackloop — AI-agenten refaktorerar kod tills hälsopoängen når målnivå.

Bygger på samma koncept som CodeScene's CodeHealth MCP Server men som ett öppet projekt med full kontroll över analyslogiken.

---

## 1. Övergripande arkitektur

### Monorepo med pnpm workspaces — två paket

```
healthy-ai-code-mcp/
├── packages/
│   ├── core/                    # @healthy-ai-code/core
│   │   ├── src/
│   │   │   ├── analyzers/       # Språkspecifika AST-parsers
│   │   │   ├── metrics/         # Individuella metrics
│   │   │   ├── scoring/         # Aggregering till 1-10 hälsopoäng
│   │   │   ├── smells/          # Kodluktidentifiering
│   │   │   ├── diff/            # Git-diffanalys
│   │   │   ├── types.ts         # Delade typer/interfaces
│   │   │   └── index.ts         # Publik API
│   │   └── tests/
│   └── mcp-server/              # @healthy-ai-code/mcp-server
│       ├── src/
│       │   ├── tools/           # En fil per MCP-verktyg
│       │   ├── server.ts        # MCP SDK-setup
│       │   └── index.ts         # Startpunkt (bin)
│       └── tests/
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

### Teknikstack

| Lager | Teknik |
|---|---|
| Monorepo | pnpm workspaces |
| Språk | TypeScript 5.x, Node.js 18+ |
| AST-parsing | tree-sitter + language bindings |
| MCP-protokoll | @modelcontextprotocol/sdk |
| Testning | Vitest |
| Distribution | npx via npm |

### Dataflöde

```
AI-assistent → MCP-klient → mcp-server (tool call)
                                  ↓
                          core.analyzeFile(path)
                                  ↓
                     Språkdetektering → AST-parser
                                  ↓
                     Metrics → Scoring → Smells
                                  ↓
                     HealthResult { score, issues, smells }
                                  ↓
                     MCP-svar med nextAction till AI-assistent
```

---

## 2. Core-bibliotekets analysmotor

### Stödda programmeringsspråk (v1)

- TypeScript / JavaScript
- Python
- Java / Kotlin
- C# / .NET

Språkdetektering sker via filändelse. tree-sitter tillhandahåller parsers för samtliga.

### Metrics

| Metrik | Vad det mäter | Vikt i scoring |
|---|---|---|
| Cyklomatisk komplexitet | Antal grenar (if/for/while/case) | Hög |
| Kognitiv komplexitet | Mental ansträngning att förstå | Hög |
| Max nestningsdjup | Djupaste block-nästning | Hög |
| Funktionslängd | Rader per funktion/metod | Medium |
| Fil-längd | Totalt antal rader | Medium |
| Parameterantal | Antal argument per funktion | Medium |
| Kodduplikering | Liknande block inom fil | Medium |

### Kodlukter (smells)

| Smell | Trigger |
|---|---|
| `ComplexMethod` | Cyklomatisk komplexitet > 10 |
| `DeepNesting` | Nestningsdjup > 4 |
| `BumpyRoad` | Flera djupa nestningar i sekvens |
| `LargeMethod` | Funktion > 30 rader |
| `ComplexConditional` | Sammansatta boolska uttryck |
| `LongParameterList` | > 5 parametrar |
| `LargeFile` | Fil > 500 rader |

### Hälsopoäng (1–10)

```
10.0      = Perfekt, fullt AI-redo
9.5–9.9   = AI-redo (målnivå för agenter)
9.0–9.4   = Grön — Hälsosam
4.0–8.9   = Gul — Teknisk skuld
1.0–3.9   = Röd — Allvarlig teknisk skuld
```

Aggregering: Baspoäng 10.0, varje identifierad smell sänker poängen med en konfigurerad vikt. Flera instanser av samma smell ger ökande avdrag upp till ett tak per smell-typ.

### Publik API (core)

```typescript
// Analysera en fil på disk
analyzeFile(filePath: string): Promise<HealthResult>

// Analysera kodsträng direkt (för diff-analys)
analyzeCode(code: string, language: Language): HealthResult

// Analysera git-diff mot basgren
analyzeChangeset(repoPath: string, baseBranch: string): Promise<ChangesetResult>

type Language = 'typescript' | 'javascript' | 'python' | 'java' | 'kotlin' | 'csharp'

interface HealthResult {
  score: number
  category: 'green' | 'yellow' | 'red'
  smells: Smell[]
  metrics: MetricBreakdown
  functions: FunctionResult[]
}

interface ChangesetResult {
  filesAnalyzed: number
  regressions: FileRegression[]   // Filer vars poäng sjunkit
  improvements: FileImprovement[] // Filer vars poäng förbättrats
  newUnhealthyFiles: HealthResult[] // Nya filer med score < 7.0
  overallSafe: boolean            // true om inga regressioner eller röda filer
}

interface FileRegression {
  filePath: string
  scoreBefore: number
  scoreAfter: number
  newSmells: Smell[]
}
```

---

## 3. MCP-verktyg & självkorrigerande feedbackloop

### Verktygsöversikt

| Verktyg | Input | Syfte |
|---|---|---|
| `code_health_score` | `filePath` | Snabb poäng för en fil |
| `code_health_review` | `filePath` | Detaljerad granskning med specifika issues |
| `pre_commit_code_health_safeguard` | `repoPath`, `files[]` | Kontrollera staged/unstaged filer före commit |
| `analyze_change_set` | `repoPath`, `baseBranch` | Hela diff mot basgren, före PR |
| `code_health_refactoring_business_case` | `filePath` | ROI-kalkyl för refaktorering |
| `explain_code_health` | *(ingen)* | Förklaring av vad hälsopoäng innebär |
| `explain_code_health_productivity` | *(ingen)* | Länk mellan kodhälsa och produktivitet |

### Strukturerat svarformat med `nextAction`

Alla verktyg returnerar ett konsekvent format som driver feedbackloopen:

```typescript
interface ToolResponse {
  score: number
  category: 'green' | 'yellow' | 'red'
  loopComplete: boolean            // true när score >= targetScore (default 9.5)
  issues: Issue[]
  summary: string                  // Klartext sammanfattning
  nextAction: NextAction
}

interface NextAction {
  action: 'refactor' | 'commit_safe' | 'review_pr' | 'none'
  instruction: string              // Explicit instruktion till AI-agenten
  priority: Issue | null           // Viktigaste problemet att åtgärda först
  toolToCallAfter: string | null   // Vilket verktyg agenten ska anropa efter åtgärd
}
```

**Exempel — score 4.2 (pågående loop):**
```json
{
  "score": 4.2,
  "category": "red",
  "loopComplete": false,
  "nextAction": {
    "action": "refactor",
    "instruction": "Refaktorera 'validateUser' för att minska cyklomatisk komplexitet från 18 till under 10. Extrahera logik till separata hjälpfunktioner. Kör sedan code_health_review igen.",
    "priority": { "smell": "ComplexMethod", "function": "validateUser" },
    "toolToCallAfter": "code_health_review"
  }
}
```

**Exempel — score 10.0 (loop klar):**
```json
{
  "score": 10.0,
  "category": "green",
  "loopComplete": true,
  "nextAction": {
    "action": "commit_safe",
    "instruction": "Koden är AI-redo (10.0/10.0). Inga problem identifierade. Kör pre_commit_code_health_safeguard innan commit.",
    "priority": null,
    "toolToCallAfter": null
  }
}
```

### Feedbackloop — visuellt flöde

```
AI kör code_health_review
        ↓
score < 9.5? → Ja → AI refaktorerar utifrån nextAction.instruction
        ↓                        ↓
      Nej              AI kör code_health_review igen
        ↓                        ↓
  loopComplete: true      (upprepa tills loopComplete: true)
        ↓
  AI kör pre_commit_code_health_safeguard
```

---

## 4. Felhantering

| Scenario | Beteende |
|---|---|
| Fil saknas | Tydligt felmeddelande, ingen krasch |
| Okänt språk | Returnerar `language: 'unsupported'`, hoppar över analys |
| Parsningsfel (ogiltig syntax) | Partiellt resultat + varning, avbryter inte |
| Git-repo saknas | `analyze_change_set` returnerar förklarande fel |
| Fil > 10 000 rader | Analyserar men inkluderar prestandavarning i svar |

Alla fel returneras som strukturerade MCP-felsvar, inte okontrollerade undantag.

---

## 5. Teststrategi

```
packages/core/tests/
  metrics/           # Unit-tester per metrik
    cyclomatic.test.ts
    cognitive.test.ts
    nesting.test.ts
    function-length.test.ts
  analyzers/         # Integration per språk
    typescript.test.ts
    python.test.ts
    java.test.ts
    csharp.test.ts
  scoring/
    scorer.test.ts
  fixtures/
    healthy/         # Filer med känd score ~10.0
    unhealthy/       # Filer med känd score ~2-4
    edge-cases/      # Tomma filer, extremt långa funktioner etc.

packages/mcp-server/tests/
  tools/             # Verifierar MCP-svarformat + nextAction-struktur
  integration/       # End-to-end: anropa MCP-verktyg mot fixtures
```

**Täckningsmål:** 80%+ på core-paketet. Varje språkparser ska ha minst 5 fixtures med verifierade poäng.

---

## 6. AGENTS.md

Filen kopieras av användaren till sitt repo och styr AI-agentens beteende:

```markdown
# Healthy AI Code MCP — Agent Workflow

## OBLIGATORISKA REGLER

### Innan du ändrar kod
1. Kör `code_health_review` på filen du ska ändra
2. Om score < 7.0: refaktorera FÖRST innan ny funktionalitet läggs till
3. Notera baseline-poängen

### Efter varje kodändring
1. Kör `code_health_review` igen
2. Om score SJUNKIT: STOPPA — gå in i refaktoreringsloop
3. Fortsätt loopen tills score >= ursprunglig baseline ELLER >= 9.5

### Refaktoreringsloop
1. Läs `nextAction.instruction` i svaret
2. Åtgärda `nextAction.priority`-problemet
3. Kör `code_health_review` igen
4. Upprepa tills `loopComplete: true`

### Innan commit
- Kör alltid `pre_commit_code_health_safeguard`
- Commit INTE om röda filer introduceras utan explicit godkännande

### Innan PR
- Kör `analyze_change_set` mot basgrenen
- Adressera alla röda filer i changesettet
```

---

## 7. Distribution

### npm-paket

```json
{
  "name": "@healthy-ai-code/mcp-server",
  "bin": {
    "healthy-ai-code-mcp": "./dist/index.js"
  }
}
```

### Användarkonfiguration (MCP-klient)

```json
{
  "servers": {
    "healthy-ai-code": {
      "type": "stdio",
      "command": "npx",
      "args": ["@healthy-ai-code/mcp-server"]
    }
  }
}
```

### Byggordning

```
pnpm install → build core → build mcp-server → test allt
```

---

## 8. Byggsekvens (implementationsordning)

1. **Monorepo-setup** — pnpm workspaces, tsconfig, Vitest
2. **Core: typer & interfaces** — `types.ts`, publik API-kontrakt
3. **Core: TypeScript/JS-analyzer** — tree-sitter + metrics + scoring
4. **Core: Python-analyzer** — tree-sitter-python
5. **Core: Java/Kotlin-analyzer** — tree-sitter-java
6. **Core: C#-analyzer** — tree-sitter-c-sharp
7. **Core: diff-modul** — git-integration för changeset-analys
8. **MCP-server: grundstruktur** — SDK-setup, server.ts
9. **MCP-server: verktyg** — implementera alla 7 verktyg
10. **AGENTS.md** — skriva och validera agent-instruktioner
11. **Integration-tester** — end-to-end mot fixtures
12. **npm-publicering** — paketering och distributionstest
