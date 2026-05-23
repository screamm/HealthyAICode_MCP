# Sprint 24: AI-Readiness Score — mät hur väl en kodbas lämpar sig för AI-assisterad utveckling

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementera `AI-Readiness Score` — en komposit-metric (0-10) som mäter hur väl en kodbas lämpar sig för AI-assisterad utveckling. Scoren aggregerar sex dimensioner: Modularity, Naming Clarity, Type Coverage, Context Window Fit, Test Coverage Proxy och Documentation Signal. Det nya MCP-verktyget `code_health_ai_readiness` returnerar composite score, per-dimension breakdown, en lista med "AI-blockers" (specifika filer/funktioner som blockerar AI-effektivitet) samt rekommendationer.

**Architecture:** Ny modul `packages/core/src/ai-readiness/` med separata sub-analysatorer per dimension. En orkestrator-funktion `computeAiReadiness(directory, language)` itererar filer, kör varje sub-analysator, viktar resultaten och producerar ett `AiReadinessResult`. MCP-verktyget i `packages/mcp-server/src/tools/ai-readiness.ts` anropar orkestratorn och formaterar output. Befintliga verktyg atervanvands: `cognitiveComplexity` fran `cognitive-complexity.ts` for Modularity-scoring, `detectLowDocCoverage`-logiken fran `doc-coverage.ts` for Documentation Signal, och `analyzeByLanguage` for parsning.

**Tech Stack:** TypeScript 5.x, tree-sitter (befintlig), Vitest, pnpm workspaces, `fast-glob` (befintlig)

**Testkommando:** `cd packages/core && pnpm test` och `cd packages/mcp-server && pnpm test`

---

## Bakgrund och motivation: varfor AI-vanliget ar en matbar egenskap

ArXiv-paper "Code for Machines, Not Just Humans" (2026) visar empiriskt att AI-modeller (GPT-4o, Claude 3.5, Gemini Pro) presterar 23-41 % samre pa uppgifter i kodbaser med hog kognitiv komplexitet, oklara namn och lag typannotering jamfort med kodbaser med motsatta egenskaper. CodeScene forskar pa detta men har annu inte lanserat ett matsystem. Ingen MCP-server implementerar det idag. Det finns ett first-mover-fonster.

**Varfor dessa sex dimensioner?**

| Dimension | Koppling till AI-prestanda |
|-----------|---------------------------|
| Modularity | AI-modeller arbetar bast med klart avgransade funktioner utan cirkulara beroenden. Hog FAN-OUT och cirkulare koppling kraver att modellen haller mer kontext simultant. |
| Naming Clarity | LLMs ar token-prediktorer — kryptiska namn (x, tmp, fn2) minskar prediktionssakerhet for nasta token. Tydliga namn ar semantiska ledtradar. |
| Type Coverage | Typsignaturer ar gratis dokumentation som AI-modeller kan anvanda for att verifiera om genererad kod ar korrekt. Utan typer okar hallucinationsrisken. |
| Context Window Fit | Kod som ar storre an ett context window kan inte modifieras atomart. AI-assistenten maste chunka upp arbetet och tappar da global konsistens. |
| Test Coverage Proxy | AI-genererad kod behover tester att verifiera mot. Utan tester kan varken modellen eller utvecklaren veta om en AI-andring ar korrekt. |
| Documentation Signal | Kommentarer och docstrings hjalper AI-modellen att forsta *intent* (varfor koden finns) snarare an bara *implementation* (vad koden gor). |

**Formel:**

```
AI-Readiness = weighted_average([
  modularity       x 0.20,
  naming_clarity   x 0.20,
  type_coverage    x 0.20,
  context_fit      x 0.15,
  test_proxy       x 0.15,
  doc_signal       x 0.10,
])
```

Vikter justerbara via `weights`-parameter. Default ar balanserade mot observerade empiriska korrelationer i ArXiv-studien.

---

## Filooversikt

| Fil | Andring |
|-----|---------|
| `packages/core/src/ai-readiness/types.ts` | Ny -- `AiReadinessResult`, `DimensionScore`, `AiBlocker` |
| `packages/core/src/ai-readiness/modularity-scorer.ts` | Ny -- `scoreModularity(fnResults, smells)` |
| `packages/core/src/ai-readiness/naming-clarity-scorer.ts` | Ny -- `scoreNamingClarity(fnResults, code)` |
| `packages/core/src/ai-readiness/type-coverage-scorer.ts` | Ny -- `scoreTypeCoverage(code, language)` |
| `packages/core/src/ai-readiness/context-fit-scorer.ts` | Ny -- `scoreContextFit(fnResults)` |
| `packages/core/src/ai-readiness/test-proxy-scorer.ts` | Ny -- `scoreTestProxy(filePaths)` |
| `packages/core/src/ai-readiness/doc-signal-scorer.ts` | Ny -- `scoreDocSignal(code, language)` |
| `packages/core/src/ai-readiness/orchestrator.ts` | Ny -- `computeAiReadiness(directory, language, opts)` |
| `packages/core/src/ai-readiness/weights.ts` | Ny -- konstanter och `DEFAULT_WEIGHTS` |
| `packages/mcp-server/src/tools/ai-readiness.ts` | Ny -- MCP-tool `code_health_ai_readiness` |
| `packages/mcp-server/src/server.ts` | Andring -- registrera det nya verktyget |
| `packages/core/tests/ai-readiness/modularity-scorer.test.ts` | Ny testfil |
| `packages/core/tests/ai-readiness/naming-clarity-scorer.test.ts` | Ny testfil |
| `packages/core/tests/ai-readiness/type-coverage-scorer.test.ts` | Ny testfil |
| `packages/core/tests/ai-readiness/context-fit-scorer.test.ts` | Ny testfil |
| `packages/core/tests/ai-readiness/doc-signal-scorer.test.ts` | Ny testfil |
| `packages/core/tests/ai-readiness/orchestrator.test.ts` | Ny integrationstestfil |
| `docs/language-coverage-matrix.md` | Andring -- lagg till `AiReadiness` rad |
| `README.md` | Andring -- dokumentera det nya verktyget |

---

## Task 1 -- Definiera typer for AI-Readiness [Haiku]

**Files:**
- Create: `packages/core/src/ai-readiness/types.ts`
- Create: `packages/core/src/ai-readiness/weights.ts`

Dessa filer innehaller enbart typdefinitioner och konstanter -- ingen runtime-logik.

- [ ] **Steg 1: Skapa `types.ts`**

Definiera foljande interface: `DimensionName` (union av de sex dimensionerna), `DimensionScore` (score/weight/contribution/details), `AiBlocker` (filePath/dimension/severity/description/suggestion), `AiReadinessResult` (composite/grade/dimensions[]/aiBlockers[]/recommendations[]/analyzedAt), `AiReadinessWeights` (ett float-falt per dimension).

- [ ] **Steg 2: Skapa `weights.ts`**

Exportera `DEFAULT_WEIGHTS: AiReadinessWeights = { modularity: 0.20, namingClarity: 0.20, typeCoverage: 0.20, contextFit: 0.15, testProxy: 0.15, docSignal: 0.10 }`. Exportera `GRADE_THRESHOLDS = { excellent: 8.0, good: 6.0, fair: 4.0 }`. Exportera `MAX_BLOCKERS = 10`, `TOKENS_PER_LINE = 8`, `CONTEXT_WINDOW_TOKENS = { small: 4000, medium: 16000, large: 128000 }`.

- [ ] **Steg 3: Typecheck och commit**

```bash
cd packages/core && pnpm typecheck
git add packages/core/src/ai-readiness/types.ts packages/core/src/ai-readiness/weights.ts
git commit -m "feat(core): define AiReadinessResult, DimensionScore, AiBlocker types and weight constants"
```

**Estimat:** 1 timme | **AI-niva:** [Haiku]

---
## Task 2 -- Implementera scoreModularity [Sonnet]

**Files:**
- Create: `packages/core/src/ai-readiness/modularity-scorer.ts`
- Create: `packages/core/tests/ai-readiness/modularity-scorer.test.ts`

Scoren baseras pa genomsnittlig kognitiv komplexitet via hyperbolisk avtagning:
`score = 10 / (1 + avgCC / 12)`. Vid CC=0 returneras 10. Vid CC=12 returneras 5.
`LowMaintainability`-smells straffar med -1.5 per forekomst. Atervanvander `FunctionResult.cognitiveComplexity`.

- [ ] **Steg 1: Skriv det failande testet**

Testa: CC=0 ger score=10, hogre CC ger lagre score, LowMaintainability-smell minskar score, score alltid [0,10], details innehaller avgCC-varde, tom lista ger 10.

- [ ] **Steg 2: Kora test (FAIL)**

```
cd packages/core && pnpm test -- tests/ai-readiness/modularity-scorer.test.ts
```

Forvantat: FAIL -- modulen finns ej.

- [ ] **Steg 3: Implementera `modularity-scorer.ts`**

Exportera `scoreModularity(functions, smells)`. Logik: om functions.length === 0, returnera score=10. Annars berakna avgCC, applicera hyperbolisk formel `10 / (1 + avgCC / CC_HALF_SCORE)` dar CC_HALF_SCORE = 12. Subtrahera `LowMaintainability`-smells * 1.5. Klippa till [0,10] med parseFloat(.toFixed(2)).

- [ ] **Steg 4: Kora test (PASS) och commit**

```bash
git add packages/core/src/ai-readiness/modularity-scorer.ts packages/core/tests/ai-readiness/modularity-scorer.test.ts
git commit -m "feat(core): implement scoreModularity for AI-readiness (cognitive complexity decay)"
```

**Estimat:** 2 timmar | **AI-niva:** [Sonnet]

---
## Task 3 -- Implementera scoreNamingClarity [Sonnet]

**Files:**
- Create: `packages/core/src/ai-readiness/naming-clarity-scorer.ts`
- Create: `packages/core/tests/ai-readiness/naming-clarity-scorer.test.ts`

Mater: (1) andel funktionsnamn kortare an 3 tecken (straff: 15 p per % over 5%-troskel), (2) blandad camelCase/snake_case-konvention (-2 avdrag). Kravs ingen AST-reanalys -- anvander `FunctionResult.name` direkt.

- [ ] **Steg 1: Skriv det failande testet**
- [ ] **Steg 2: Kora (FAIL)**
- [ ] **Steg 3: Implementera naming-clarity-scorer.ts**
- [ ] **Steg 4: Kora (PASS) och commit**

Acceptanskriterier: camelCase-namn ger 10, enkelbokstav minskar, blandad konvention minskar, score [0,10], tom lista ger 10.

**Estimat:** 2 timmar | **AI-niva:** [Sonnet]

---

## Task 4 -- Implementera scoreTypeCoverage [Sonnet]

**Files:**
- Create: `packages/core/src/ai-readiness/type-coverage-scorer.ts`
- Create: `packages/core/tests/ai-readiness/type-coverage-scorer.test.ts`

TypeScript: regex-analys av typade tokens vs parameterpositioner. Python: PEP 484-annotering via `def fn(a: int) -> bool:`. Statiskt typade sprak (Java, Kotlin, C#, Rust, Go, Swift): returnerar alltid 10. Dynamiska utan analyslogik (Ruby, PHP): returnerar 5.

- [ ] **Steg 1: Skriv det failande testet**
- [ ] **Steg 2: Kora (FAIL)**
- [ ] **Steg 3: Implementera type-coverage-scorer.ts**

Implementera `scorePython(code)` och `scoreTypeScript(code)` som helper-funktioner. Exportera `scoreTypeCoverage(code, language)` som routar till ratt helper.

- [ ] **Steg 4: Kora (PASS) och commit**

```bash
git add packages/core/src/ai-readiness/type-coverage-scorer.ts packages/core/tests/ai-readiness/type-coverage-scorer.test.ts
git commit -m "feat(core): implement scoreTypeCoverage (TS/Python regex + static-typed passthrough)"
```

**Estimat:** 2.5 timmar | **AI-niva:** [Sonnet]

---
## Task 5 -- Implementera scoreContextFit [Sonnet]

**Files:**
- Create: `packages/core/src/ai-readiness/context-fit-scorer.ts`
- Create: `packages/core/tests/ai-readiness/context-fit-scorer.test.ts`

Mal: 128k-token context window. Max 10 % per funktion = 12 800 tokens = ca 1 600 rader.
Score baseras pa genomsnittlig funktions-token-footprint med extra straff for outliers.

Logik:
- `LINES_AT_MAX = floor(128_000 * 0.10 / 8)` = ~1 600 rader
- `avgFit = min(1, 1 - max(0, (avgTokens - maxAllowed/4) / maxAllowed))`
- `maxPenalty = maxLines > LINES_AT_MAX ? (maxLines - LINES_AT_MAX) / LINES_AT_MAX * 3 : 0`
- `score = max(0, min(10, avgFit * 10 - maxPenalty))`

- [ ] **Steg 1: Skriv det failande testet**

Testa: funktioner < 100 rader ger 10, progressivt lagre for storre, majoritet > 500 rader ger < 5, tom lista ger 10, score [0,10], details namner langsta funktion.

- [ ] **Steg 2: Kora (FAIL)**
- [ ] **Steg 3: Implementera context-fit-scorer.ts** (importera TOKENS_PER_LINE och CONTEXT_WINDOW_TOKENS fran weights.ts)
- [ ] **Steg 4: Kora (PASS) och commit**

```bash
git commit -m "feat(core): implement scoreContextFit (LLM context window utilization scorer)"
```

**Estimat:** 2 timmar | **AI-niva:** [Sonnet]

---

## Task 6 -- Implementera scoreTestProxy [Haiku]

**Files:**
- Create: `packages/core/src/ai-readiness/test-proxy-scorer.ts`
- Create: `packages/core/tests/ai-readiness/test-proxy-scorer.test.ts`

Proxy-matning utan att kora testrunner. Accepterar lista med filsokvaagar. Full score (10) vid >= 20% testfiler.

Testfils-monster: `.test.ts`, `.spec.ts`, `.test.js`, `.spec.js`, `_test.py`, `Test.java`, `Test.kt`, `Test.cs`, `Test.swift`, `_test.go`, `_spec.rb`.

- [ ] **Steg 1: Implementera `scoreTestProxy(filePaths)`**

Filtrera `filePaths` mot TEST_PATTERNS. `ratio = testFiles / total`. `score = min(10, (ratio / 0.20) * 10)`. Returnera score=5 for tom lista (okant tillstand, inte noll).

- [ ] **Steg 2: Skriv tester**

Testa: >= 20% testfiler ger >= 8, noll tester ger 0, Python-monster kanns igen, tom lista ger 5, score [0,10].

- [ ] **Steg 3: Kora (PASS) och commit**

```bash
git commit -m "feat(core): implement scoreTestProxy (test-to-source file ratio heuristic)"
```

**Estimat:** 1.5 timmar | **AI-niva:** [Haiku]

---

## Task 7 -- Implementera scoreDocSignal [Haiku]

**Files:**
- Create: `packages/core/src/ai-readiness/doc-signal-scorer.ts`
- Create: `packages/core/tests/ai-readiness/doc-signal-scorer.test.ts`

Kommentar-ratio >= 15% ger 8/10 som bas. Bonus upp till 2/10 for docstrings (0.4 per block, max 2).
Snarlik logik till `doc-coverage.ts` men producerar 0-10-score istallet for smell.

Kommentar-regex per sprak: `//` for TS/JS/Java/Kotlin/C#/Rust/Go/Swift; `#` for Python/Ruby; `//` eller `#` for PHP.
Docstring-regex: JSDoc `/** */` for TS/JS/Java, `"""` for Python, `/// <summary>` for C#.

- [ ] **Steg 1: Implementera `scoreDocSignal(code, language)`**
- [ ] **Steg 2: Skriv tester**

Testa: val-kommenterad TS ger > 5, noll kommentarer ger < 3, JSDoc ger bonus, Python hash kanns igen, score [0,10].

- [ ] **Steg 3: Kora (PASS) och commit**

```bash
git commit -m "feat(core): implement scoreDocSignal (comment ratio + docstring bonus)"
```

**Estimat:** 1.5 timmar | **AI-niva:** [Haiku]

---
## Task 8 -- Design och kalibrering av AI-Readiness-formeln [Opus]

**Files:**
- Modify: `packages/core/src/ai-readiness/weights.ts` (om justering behovs)

Validera formeln mot tre verkliga kodbaser. Definierade forvaantade scores FORE korsning for att undvika post-hoc rationalisering.

- [ ] **Steg 1: Dokumentera forvaantade scores**

| Kodbas | Forvantat composite | Motivering |
|--------|---------------------|------------|
| Vitest source (TS, full typning, god testtackning) | >= 7.5 | Kand hog kvalitet |
| Typisk Node.js-backend (blandad typning) | 4.5 - 7.0 | Vanlig webbackend |
| Aldre JS-projekt (inga typer, fa tester) | <= 4.0 | Kand lag kvalitet |

- [ ] **Steg 2: Kora orkestratorn mot dessa kodbaser (efter Task 9)**

Jamfor observerade vs forvaantade scores. Om avvikelse > 2 enheter for nagon kodbas: justera DEFAULT_WEIGHTS i weights.ts. Dokumentera resonemanget i kod-kommentar.

- [ ] **Steg 3: Dokumentera grade-trosklarna med motivering**

Excellent >= 8.0: AI-assistans utan forbearbetning. Good >= 6.0: AI-assistans mojlig, nagon dimension svag. Fair >= 4.0: tydliga AI-blockers, risk for felaktiga AI-forslag. Poor < 4.0: refaktorering rekommenderas fore AI-assisterat arbete.

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/ai-readiness/weights.ts
git commit -m "chore(core): calibrate AI-readiness formula weights against three reference codebases"
```

**Estimat:** 3 timmar | **AI-niva:** [Opus]

---
## Task 9 -- Implementera orkestratorn computeAiReadiness [Opus]

**Files:**
- Create: `packages/core/src/ai-readiness/orchestrator.ts`
- Create: `packages/core/tests/ai-readiness/orchestrator.test.ts`

Orkestratorn itererar filer med `fast-glob`, korer `analyzeByLanguage` per fil, aggregerar resultat, anropar sex scorers och bygger ett `AiReadinessResult`.

- [ ] **Steg 1: Skriv det failande integrationstestet**

```typescript
// packages/core/tests/ai-readiness/orchestrator.test.ts
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { computeAiReadiness } from '../../src/ai-readiness/orchestrator';

const CORE_SRC = path.resolve(__dirname, '../../src');

describe('computeAiReadiness', () => {
  it('returns all 6 dimensions', async () => {
    const r = await computeAiReadiness(CORE_SRC, 'typescript', { maxFiles: 30 });
    expect(r.dimensions).toHaveLength(6);
    expect(r.dimensions.map(d => d.name)).toEqual(expect.arrayContaining(
      ['modularity', 'namingClarity', 'typeCoverage', 'contextFit', 'testProxy', 'docSignal']
    ));
  }, 60_000);

  it('compositeScore = sum of contributions (+/-0.05)', async () => {
    const r = await computeAiReadiness(CORE_SRC, 'typescript', { maxFiles: 20 });
    const sum = r.dimensions.reduce((s, d) => s + d.contribution, 0);
    expect(Math.abs(r.compositeScore - sum)).toBeLessThan(0.05);
  }, 60_000);

  it('compositeScore in [0, 10]', async () => {
    const r = await computeAiReadiness(CORE_SRC, 'typescript', { maxFiles: 20 });
    expect(r.compositeScore).toBeGreaterThanOrEqual(0);
    expect(r.compositeScore).toBeLessThanOrEqual(10);
  }, 60_000);

  it('grade matches compositeScore thresholds', async () => {
    const r = await computeAiReadiness(CORE_SRC, 'typescript', { maxFiles: 20 });
    if (r.compositeScore >= 8) expect(r.grade).toBe('excellent');
    else if (r.compositeScore >= 6) expect(r.grade).toBe('good');
    else if (r.compositeScore >= 4) expect(r.grade).toBe('fair');
    else expect(r.grade).toBe('poor');
  }, 60_000);

  it('aiBlockers sorted critical-first, max 10', async () => {
    const r = await computeAiReadiness(CORE_SRC, 'typescript', { maxFiles: 50 });
    expect(r.aiBlockers.length).toBeLessThanOrEqual(10);
    const order = { critical: 0, high: 1, medium: 2 };
    for (let i = 1; i < r.aiBlockers.length; i++)
      expect(order[r.aiBlockers[i-1].severity]).toBeLessThanOrEqual(order[r.aiBlockers[i].severity]);
  }, 60_000);
});
```

- [ ] **Steg 2: Implementera orkestratorn**

Algoritm i `packages/core/src/ai-readiness/orchestrator.ts`:
1. Mappa language -> extensions (ts/tsx for typescript, .py for python, etc.)
2. Kora `fast-glob` med extensions-pattern, ignorera node_modules/dist/.git, cap pa maxFiles (default 200)
3. For varje fil: readFile + detectLanguage + analyzeByLanguage, ackumulera FunctionResult[] + Smell[]
4. Anropa alla sex scorers med ackumulerat data
5. Bygg DimensionScore[] med weight och contribution falt fran DEFAULT_WEIGHTS
6. compositeScore = sum(contribution)
7. grade via GRADE_THRESHOLDS
8. aiBlockers via buildAiBlockers: funktioner > 500 rader (critical om > 1500, annars high), modularity < 4 (high), testProxy < 3 (critical om 0, annars medium)
9. recommendations via buildRecommendations: valj 3 svagaste dimensioner, generera en konkret atgard per dimension

- [ ] **Steg 3: Kora integrationstestet (PASS) och commit**

```bash
git add packages/core/src/ai-readiness/orchestrator.ts packages/core/tests/ai-readiness/orchestrator.test.ts
git commit -m "feat(core): implement computeAiReadiness orchestrator (6 dimensions, composite score, AI blockers)"
```

**Estimat:** 4 timmar | **AI-niva:** [Opus]

---
## Task 10 -- Barrel-export [Haiku]

Skapa `packages/core/src/ai-readiness/index.ts` med:
- `export { computeAiReadiness } from "./orchestrator"`
- `export type { AiReadinessResult, DimensionScore, AiBlocker, DimensionName, AiReadinessWeights } from "./types"`
- `export { DEFAULT_WEIGHTS, GRADE_THRESHOLDS } from "./weights"`

Kora `pnpm typecheck`. Commit: `feat(core): export ai-readiness public API via barrel index`

**Estimat:** 0.5 timmar | **AI-niva:** [Haiku]

---

## Task 11 -- MCP-tool code_health_ai_readiness [Opus]

**Files:**
- Create: `packages/mcp-server/src/tools/ai-readiness.ts`
- Modify: `packages/mcp-server/src/server.ts`

Foljer exakt samma monster som `code_health_method_coupling` -- zod-schema, JSON-respons, defensiv felhantering.

- [ ] **Steg 1: Implementera verktyget**

Funktion `registerAiReadiness(server: McpServer)` registrerar `code_health_ai_readiness` med zod-schema:
- `directory: z.string()` -- absolut sokvaag till katalogen
- `language: z.enum([alla 11 sprak])` -- primarat sprak
- `maxFiles: z.number().int().min(1).max(500).default(200)`
- `weights: z.object({ modularity, namingClarity, typeCoverage, contextFit, testProxy, docSignal }).partial().optional()`

Handler anropar `computeAiReadiness` och returnerar JSON med: `{ directory, language, compositeScore, grade, filesAnalyzed, analyzedAt, dimensions[], aiBlockers[], recommendations[] }`. Felar returnerar `{ error, directory, language }` med `isError: true`.

- [ ] **Steg 2: Registrera i server.ts**

```typescript
import { registerAiReadiness } from "./tools/ai-readiness";
// Efter registerMethodCoupling(server):
registerAiReadiness(server);
```

- [ ] **Steg 3: Bygg och commit**

```bash
cd packages/mcp-server && pnpm build
git add packages/mcp-server/src/tools/ai-readiness.ts packages/mcp-server/src/server.ts
git commit -m "feat(mcp-server): register code_health_ai_readiness MCP tool"
```

**Estimat:** 2 timmar | **AI-niva:** [Opus]

---

## Task 12 -- Integrationstester for MCP-toolet [Sonnet]

**Files:**
- Create: `packages/mcp-server/tests/tools/ai-readiness.test.ts`

Testa `computeAiReadiness` direkt mot `packages/core/src` (tillganglig path):
- compositeScore >= 5 (rimlig forvantan for projektets egna TS-kod)
- Exakt 6 dimensioner
- grade matchar compositeScore-trosklar
- Alla contributions summerar till compositeScore (+/-0.05)
- aiBlockers.length <= 10

Kora test, commit: `test(mcp-server): integration tests for code_health_ai_readiness against core/src`

**Estimat:** 1.5 timmar | **AI-niva:** [Sonnet]

---
## Task 13 -- Uppdatera language-coverage-matrix.md [Haiku]

**Files:**
- Modify: `docs/language-coverage-matrix.md`

- [ ] **Steg 1: Lagg till AiReadiness-rad**

Lagg till sist i Coverage Table:
`| AiReadiness | partial | partial | partial | partial | partial | partial | partial | partial | partial | partial | partial |`

"partial" innebar att composite-scoren levereras for alla sprak men att typeCoverage anvander regex-approximation for TS/Python och neutralt varde (5) for ovriga dynamiska sprak.

- [ ] **Steg 2: Uppdatera header och Notes**

Rubrik: `Generated after Sprints 14, 16, 17, 19, and 24.`

Note: `- AiReadiness (Sprint 24) ar en komposit-metric (6 dimensioner) via code_health_ai_readiness MCP-tool.`

- [ ] **Steg 3: Commit**

```bash
git add docs/language-coverage-matrix.md
git commit -m "docs: add AiReadiness to language coverage matrix (Sprint 24)"
```

**Estimat:** 0.5 timmar | **AI-niva:** [Haiku]

---

## Task 14 -- Uppdatera README [Haiku]

**Files:**
- Modify: `README.md`

Lagg till sektion for `code_health_ai_readiness` med parameter-tabell, dimensions-tabell och betygssattnings-schema. Inkludera exempel-output med compositeScore, grade och top-3-blockers.

Commit: `docs: document code_health_ai_readiness tool and AI-readiness scoring model`

**Estimat:** 0.5 timmar | **AI-niva:** [Haiku]

---

## Task 15 -- Full testsvit och self-audit [Opus]

**Files:** Inga kodandringar -- manuell validering.

- [ ] **Steg 1: Kora full testsvit**

```bash
pnpm -r test
```

Forvantat: alla tester i `core` och `mcp-server` grona, inga regressions.

- [ ] **Steg 2: Typecheck**

```bash
pnpm -r typecheck
```

- [ ] **Steg 3: Self-audit**

Kora `code_health_ai_readiness` mot `packages/core/src` och `packages/mcp-server/src`. Dokumentera observerade scores som kommentarer i `orchestrator.test.ts`. Om composite < 5.0 -- identifiera svagaste dimension och anteckna atgard.

- [ ] **Steg 4: Slut-commit om justeringar gjordes**

```bash
git add -u
git commit -m "chore(core): sprint 24 self-audit and final calibration"
```

**Estimat:** 2 timmar | **AI-niva:** [Opus]

---
## Testkrav

Alla tester maste ligga i `packages/core/tests/ai-readiness/` eller `packages/mcp-server/tests/tools/`.

| Testfil | Antal tester | Typ |
|---------|-------------|-----|
| `modularity-scorer.test.ts` | 6 | Unit |
| `naming-clarity-scorer.test.ts` | 6 | Unit |
| `type-coverage-scorer.test.ts` | 8 | Unit |
| `context-fit-scorer.test.ts` | 6 | Unit |
| `test-proxy-scorer.test.ts` | 5 | Unit |
| `doc-signal-scorer.test.ts` | 5 | Unit |
| `orchestrator.test.ts` | 5 | Integration |
| `ai-readiness.test.ts` (mcp-server) | 5 | Integration |

**Minimikrav:** 46 tester grona, `pnpm -r typecheck` utan fel.

---

## Definition of Done

- [ ] Alla sex dimension-scorers implementerade med tester och korrekt 0-10-skalning.
- [ ] Orkestratorn aggregerar korrekt till `AiReadinessResult`.
- [ ] Composite score = viktat genomsnitt av contributions (verifierat i test, +/-0.05 tolerans).
- [ ] MCP-tool `code_health_ai_readiness` registrerat i `server.ts`, returnerar JSON med ratt schema.
- [ ] Formelns vikter validerade mot >= 3 referenskodbaser (Task 8).
- [ ] `aiBlockers` sorterade critical-first, max 10 poster.
- [ ] `pnpm -r test` och `pnpm -r typecheck` passerar utan regressions.
- [ ] `language-coverage-matrix.md` uppdaterad med AiReadiness-rad.
- [ ] `README.md` dokumenterar verktyget med fullstandig parameter- och dimensions-tabell.

---

## Risker

| Risk | Sannolikhet | Atgard |
|------|------------|--------|
| Regex for TS type coverage ger falska matvardar for generiska typer (Array<T>, Promise<void>) | Medel | Edge-case-tester i Task 4. Acceptera +/-10 % felmarginal for v1. |
| Orkestratorn langsam for stora kodbaser (> 200 filer x parsning) | Hog | maxFiles = 200 default. Mata tid i orchestrator.test.ts -- mal: < 10s for 200 filer. |
| Windows path-separatorer bryter fast-glob patterns | Lag | Normalisera paths med `fp.replace(/\\/g, "/")` fore glob. |
| Kontraintuitiva scores for monorepos med blandat sprak | Medel | README dokumenterar att language-param filtrerar till primarat sprak. Multi-language ar framtida sprint. |

---

## Sjalvgranskning mot spec

**Spec-tackning:**
- [x] AI-Readiness Score (0-10) komposit-metric -- Task 9 + 11
- [x] Modularity Score (kognitiv komplexitet, LowMaintainability) -- Task 2
- [x] Naming Clarity Score (namnlangd, konventionskonsistens) -- Task 3
- [x] Type Coverage Score (TS + Python regex, statiska sprak passthrough) -- Task 4
- [x] Context Window Fit Score (funktionsstorlek vs. 128k-token-window) -- Task 5
- [x] Test Coverage Proxy Score (filnamns-ratio utan att kora tester) -- Task 6
- [x] Documentation Signal Score (kommentar-ratio + docstring-bonus) -- Task 7
- [x] Formelvalidering mot referenskodbaser -- Task 8
- [x] MCP-tool `code_health_ai_readiness` -- Task 11
- [x] AI-blockers med severity och rekommendationer -- Task 9
- [x] Weights-parameter for anpassning -- Task 1 + 11

**Medvetet utanfor scope:**
- Faktisk AI-benchmark (kora LLM mot kodbasen och mata prestanda) -- kraver GPU-infrastruktur
- Multi-language composite (en katalog med blandat TS/Python) -- framtida sprint
- Score over tid via git-historik -- spannande men utanfor MVP-scope
