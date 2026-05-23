# Sprint 22: Arkitekturskuldanalys — FAN-IN/OUT, Propagation Cost och cykliska beroenden

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementera ett nytt MCP-verktyg `code_health_architecture_debt` som analyserar arkitekturella skulder pa modulniva: FAN-IN och FAN-OUT per fil/modul, Propagation Cost (hur stor andel av kodbasen transitiv paverkas av en andring), cykliska beroenden via Tarjan's SCC-algoritm, och ett sammansatt "Cost of Change"-score per modul som kombinerar strukturella beroendemat med git-historik. Ingen befintlig MCP-tjanst erbjuder detta idag.

**Architecture:** Ny analysmodul i `packages/core/src/analyzers/` med fyra samverkande filer: `dependency-graph.ts` (bygger beroendegrafen fran import-parsning), `scc.ts` (Tarjan's algoritm for cykeldetektion), `architecture-debt.ts` (beraknar FAN-IN/OUT, Propagation Cost, Cost of Change och orkestrerar hela analysen), `change-frequency.ts` (hamtar commit-frekvens per fil via simple-git), samt `project-file-reader.ts` (laser projektfiler rekursivt fran disk). Nytt MCP-verktyg i `packages/mcp-server/src/tools/architecture-debt.ts`.

**Tech Stack:** TypeScript 5.x, simple-git 3.22 (befintlig), Vitest, pnpm workspaces

**Testkommando:** `cd packages/core && pnpm test` och `cd packages/mcp-server && pnpm test`

---

## Bakgrund och motivation

Strukturella kodlukt-detektorer (Sprint 5-9) och temporala analysverktyg (Sprint 10, 19) mater vad som finns i koden respektive hur koden andras. Arkitekturskuldanalys svarar pa en tredje fraga: hur svart ar det att andra koden? Det ar det centrala problemet i alla stora kodbaser och den primara orsaken till att mjukvaruprojekt saktar ner med aren.

**FAN-IN / FAN-OUT** (Henry & Kafura 1984):
- **FAN-IN**: antalet moduler som importerar modulen M
- **FAN-OUT**: antalet moduler som M importerar
- **Instabilitet** (Robert C. Martin 2003): `I = FAN-OUT / (FAN-IN + FAN-OUT)` — instabila moduler bor inte ha hogt FAN-IN

**Propagation Cost** (MacCormack et al. 2006): andelen av kodbasen som transitiv paverkas av en andring i M. Beraknas via BFS pa den transponerade grafen. > 20% = arkitekturell flaskhals.

**Cykliska beroenden**: forhindrar oberoende deployment och testning. Tarjan's SCC-algoritm hittar alla strongly connected components i O(V+E).

**Cost of Change** (sammansatt score):
```
CostOfChange(M) = fanIn_normalized x 0.35
                + PropagationCost(M)  x 0.40
                + InCyclePenalty(M)   x 0.15
                + changeFreq_norm     x 0.10
```
Viktning baserad pa MacCormack et al.:s empiriska resultat.

---

## Varfor ingen annan MCP gor detta

CodeScene's "Architectural Hotspots" ar en molnbetalfunktion. SonarQube's "Coupling Between Objects" ar klassniva inom ett sprak. Ingen befintlig lokal MCP kombinerar: (1) cross-file beroendegrafsanalys, (2) transitiv propagation cost, (3) cykeldetektion via SCC, (4) git-historik som forandringstakts-komponent, (5) sammansatt score med tydlig tolkning. `code_health_architecture_debt` ar ett lokalt alternativ utan molnberoende.

---

## Filoverikt

| Fil | Andring |
|---|---|
| `packages/core/src/analyzers/dependency-graph.ts` | Ny — beroendegrafsbyggare fran import-parsning |
| `packages/core/src/analyzers/scc.ts` | Ny — iterativ Tarjan's SCC-algoritm |
| `packages/core/src/analyzers/architecture-debt.ts` | Ny — FAN-IN/OUT, Propagation Cost, Cost of Change |
| `packages/core/src/analyzers/change-frequency.ts` | Ny — commit-frekvens per fil via simple-git |
| `packages/core/src/analyzers/project-file-reader.ts` | Ny — rekursiv fillaesning fran disk |
| `packages/core/src/types.ts` | Lagg till ModuleDebtProfile, DependencyCycle, ArchitectureDebtResult, 'ArchitectureDebt' i SmellType |
| `packages/core/src/analyzers/index.ts` | Exportera nya moduler |
| `packages/mcp-server/src/tools/architecture-debt.ts` | Nytt MCP-verktyg `code_health_architecture_debt` |
| `packages/mcp-server/src/server.ts` | Registrera det nya verktyget |
| `packages/core/tests/fixtures/architecture-fixtures.ts` | Ny — fixture TypeScript-strangar |
| `packages/core/tests/analyzers/dependency-graph.test.ts` | Ny — 8 testfall |
| `packages/core/tests/analyzers/scc.test.ts` | Ny — 7 testfall |
| `packages/core/tests/analyzers/architecture-debt.test.ts` | Ny — 18 testfall (enhets + edge cases) |
| `packages/core/tests/analyzers/change-frequency.test.ts` | Ny — 3 testfall |
| `packages/core/tests/analyzers/project-file-reader.test.ts` | Ny — 4 testfall |
| `packages/core/tests/analyzers/architecture-debt-integration.test.ts` | Ny — 6 integrationstestfall |

---

## Task 1 — Definiera typer och datastrukturer [Sonnet]

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/tests/analyzers/architecture-debt.test.ts` (minimal typtest)

**Estimat:** 2 timmar

Laggar grunden for hela sprintens typsystem. Typerna exponeras i MCP-verktygets JSON-output och anvands internt i alla berakningar. Definiera dem forst sa att alla foljande tasks kan importera dem.

- [ ] **Steg 1: Skriv det failande typkontrolltestet**

```typescript
// packages/core/tests/analyzers/architecture-debt.test.ts
import { describe, it, expect } from 'vitest';
import type { ModuleDebtProfile, DependencyCycle, ArchitectureDebtResult } from '../../src/types';

describe('ArchitectureDebt types', () => {
  it('ModuleDebtProfile kompilerar med alla obligatoriska falt', () => {
    const profile: ModuleDebtProfile = {
      filePath: 'src/auth.ts', fanIn: 3, fanOut: 5, instability: 0.625,
      propagationCost: 0.15, inCycle: false, changeFrequency: 8,
      costOfChange: 0.32, costOfChangeSeverity: 'medium',
    };
    expect(profile.fanIn).toBe(3);
  });
});
```

- [ ] **Steg 2: Lagg till typerna i `types.ts`**

Lagg till foljande direkt efter SmellType-unionen:

```typescript
export interface ModuleDebtProfile {
  filePath: string;
  fanIn: number;            // inkommande beroenden
  fanOut: number;           // utgaende beroenden
  instability: number;      // fanOut / (fanIn + fanOut), [0..1]
  propagationCost: number;  // andel av kodbasen transitiv beroende, [0..1]
  inCycle: boolean;         // ingar i SCC med storlek > 1
  changeFrequency: number;  // commits senaste 12 manaderna
  costOfChange: number;     // sammansatt score, [0..1]
  costOfChangeSeverity: 'high' | 'medium' | 'low';
}

export interface DependencyCycle {
  members: string[];         // filsokvaegar i cykeln
  size: number;
  severity: 'high' | 'medium'; // high om > 5 noder
}

export interface ArchitectureDebtResult {
  directory: string;
  depth: 'file' | 'module';
  totalModules: number;
  modules: ModuleDebtProfile[];          // sorterade efter costOfChange fallande
  cycles: DependencyCycle[];             // sorterade efter size fallande
  topCostlyModules: ModuleDebtProfile[]; // top-10
  summary: {
    avgFanIn: number; avgFanOut: number;
    avgPropagationCost: number; avgCostOfChange: number;
    cycleCount: number; modulesInCycles: number; highSeverityModules: number;
  };
}
```

Lagg ocksa till `'ArchitectureDebt'` i SmellType-unionen i types.ts.

- [ ] **Steg 3: Kor typkontroll**

```bash
cd packages/core && pnpm typecheck
```

Forvantat: inga TS-fel.

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/types.ts packages/core/tests/analyzers/architecture-debt.test.ts
git commit -m "feat(core): add ArchitectureDebt types — ModuleDebtProfile, DependencyCycle, ArchitectureDebtResult"
```

**Acceptanskriterier:**
- `ModuleDebtProfile` kompilerar med alla obligatoriska falt
- `ArchitectureDebtResult` tillganglig via import type
- `'ArchitectureDebt'` ingar i SmellType
- `pnpm typecheck` ger inga TS-fel

---

## Task 2 — Bygg beroendegrafsparser: extrahera import-statements [Opus]

**Files:**
- Create: `packages/core/src/analyzers/dependency-graph.ts`
- Create: `packages/core/tests/analyzers/dependency-graph.test.ts`
- Create: `packages/core/tests/fixtures/architecture-fixtures.ts`

**Estimat:** 5 timmar

Sprintens mest komplexa task. Parsar import/require/using via regex per sprak och bygger en riktad graf. Regex-baserad (inte AST) ar ett medvetet val for v1-enkelhet. Relativa imports (./x, ../y) inkluderas; node_modules filtreras bort.

Sprakstod i v1:
- TypeScript/JS: static imports (`import ... from '...'`, type-only), dynamic (`require('...')`)
- Python: `from .module import x`, `import .module` (bara relativa med punkt-prefix)
- Rust: `use crate::module` -> konvertera :: till /
- Go: `import "./local"` (bara med dot-prefix)
- PHP: `require_once './x'`, `include './y'`
- Ruby: `require_relative 'module'`
- Java/Kotlin/C#: returnerar tom lista (fully qualified names kraver classpath-index)

- [ ] **Steg 1: Skapa fixture-filer**

```typescript
// packages/core/tests/fixtures/architecture-fixtures.ts
export const FIXTURE_A = `
import { doSomething } from './b';
import type { Config } from './c';
export function featureA(): void { doSomething(); }
`;
export const FIXTURE_B = `
import { config } from './c';
export function doSomething(): void { console.log(config); }
`;
export const FIXTURE_C = `
export const config = { timeout: 3000 };
`;
export const FIXTURE_D = `
import { featureA } from './a';
export function featureD(): void { featureA(); }
`;
export const FIXTURE_E = `
import { featureD } from './d';
import { config } from './c';
export function featureE(): void { featureD(); }
`;
export const FIXTURE_CYCLE_X = `
import { y } from './y';
export function x(): void { y(); }
`;
export const FIXTURE_CYCLE_Y = `
import { x } from './x';
export function y(): void { x(); }
`;
```

- [ ] **Steg 2: Skriv de failande testerna (8 testfall)**

```typescript
// packages/core/tests/analyzers/dependency-graph.test.ts
describe('extractImports — TypeScript', () => {
  it('extraherar relativa imports (./b och ./c) fran FIXTURE_A');
  it('ignorerar node_modules-imports (lodash etc.)');
  it('hanterar type-only imports');
  it('extraherar require()-imports');
});
describe('buildDependencyGraph', () => {
  it('A har FAN-OUT = 2 (importerar B och C)');
  it('C har FAN-OUT = 0 (stabil karna, inga imports)');
  it('detekterar direkt cykel X <-> Y i edges');
  it('alla noder finns i graph.nodes');
});
```

- [ ] **Steg 3: Implementera `dependency-graph.ts`**

Exportera:
```typescript
export interface DependencyGraph {
  nodes: Set<string>;
  edges: Map<string, Set<string>>;
}

export function extractImports(content: string, language: string, filePath: string): string[];
export function buildDependencyGraph(files: Record<string, { content: string; language: string }>): DependencyGraph;
```

Regexp per sprak:
- TypeScript/JS: `/import\s+(?:type\s+)?(?:[\w{},\s*]+from\s+)?['"]([^'"]+)['"]/g` och `/require\(['"]([^'"]+)['"]\)/g`
- Python: `/^from\s+(\.+[\w./]*)\s+import/gm` och `/^import\s+(\.[\w.]+)/gm`
- Rust: `/^use\s+crate::([\w:]+)/gm` — ersatt :: med /
- Go: `/import\s+(?:\w+\s+)?"(\.\/[^"]+)"/gm`
- PHP: `/(?:require|include)(?:_once)?\s+['"](\.['"])/gm`
- Ruby: `/require_relative\s+['"]([^'"]+)['"]/gm` — prependa ./

Filterlogik: `spec.startsWith('./') || spec.startsWith('../')` = relativ import (inkludera). Annars skip.
Path-resolution: `path.normalize(path.join(path.dirname(filePath), spec))` + `.ts`-extension for TypeScript om saknas.

- [ ] **Steg 4: Kor testerna (PASS)**

```bash
cd packages/core && pnpm test -- tests/analyzers/dependency-graph.test.ts
```

- [ ] **Steg 5: Commit**

```bash
git add packages/core/src/analyzers/dependency-graph.ts \
        packages/core/tests/analyzers/dependency-graph.test.ts \
        packages/core/tests/fixtures/architecture-fixtures.ts
git commit -m "feat(core): add dependency graph builder — regex import extraction per language"
```

**Acceptanskriterier:**
- FIXTURE_A ger 2 imports (b.ts och c.ts)
- Node_modules ignoreras
- FAN-OUT = 2 for A, FAN-OUT = 0 for C
- X -> Y och Y -> X bada representerade i edges
- Alla 8 testfall passerar

---

## Task 3 — Implementera Tarjan's SCC-algoritm for cykeldetektion [Opus]

**Files:**
- Create: `packages/core/src/analyzers/scc.ts`
- Create: `packages/core/tests/analyzers/scc.test.ts`

**Estimat:** 4 timmar

Tarjan's algoritm hittar alla Strongly Connected Components (SCC med storlek > 1 = cykel) i O(V+E). Implementeringen MASTE vara iterativ (explicit call-stack) for att undvika JavaScript V8:s stack-overflow vid djupa grafer (~10 000 frames).

Algoritmen:
- `index[node]`: besoksordningsnummer
- `lowlink[node]`: lagsta index nabart fran noden via DFS
- `stack` + `onStack`: for att extrahera SCCs

Iterativ variant med frames `{ node, iter: IterableIterator<string>, phase: 'enter' | 'next' }`:
- `enter`: satt index/lowlink, push pa DFS-stack, byt till `next`
- `next`: ta nasta granne
  - Obesokt: push nytt enter-frame
  - Besokta pa stack: `lowlink[node] = min(lowlink[node], index[neighbor])`
  - done: pop frame; propagera `lowlink[parent] = min(lowlink[parent], lowlink[node])`; om `lowlink[node] === index[node]`, extrahera SCC fran DFS-stack

- [ ] **Steg 1: Skriv de failande testerna (7 testfall)**

```typescript
describe('findStronglyConnectedComponents', () => {
  it('DAG A->B->C: alla SCCs har storlek 1 (inga cykler)');
  it('Direkt cykel X<->Y: SCC med storlek 2');
  it('Langre cykel A->B->C->A: SCC med storlek 3');
  it('Blandat: cykel P<->Q + acyklisk R->P: en cykel-SCC');
  it('Tom graf: returnerar tom lista');
  it('Enda nod utan kanter: SCC med storlek 1');
  it('Stor cykel 10 noder: SCC med storlek 10 (ingen stack overflow)');
});
```

- [ ] **Steg 2: Implementera `scc.ts`**

```typescript
export function findStronglyConnectedComponents(
  edges: Map<string, Set<string>>,
): string[][]
```

Iterativ DFS enligt algoritmbeskrivningen ovan. Se till att `onStack` hanteras korrekt nar SCCs extraheras (satt `onStack[w] = false` for varje nod som poppar ur DFS-stack).

- [ ] **Steg 3: Kor testerna (PASS)**

```bash
cd packages/core && pnpm test -- tests/analyzers/scc.test.ts
```

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/analyzers/scc.ts packages/core/tests/analyzers/scc.test.ts
git commit -m "feat(core): implement iterative Tarjan SCC algorithm for dependency cycle detection"
```

**Acceptanskriterier:**
- Alla 7 testfall passerar
- DAG ger SCCs med storlek 1
- X <-> Y: SCC med storlek 2
- A -> B -> C -> A: SCC med storlek 3
- 10-nodscykeln hanteras korrekt (ingen stack overflow)

---

## Task 4 — Berakna FAN-IN, FAN-OUT, instabilitet och Propagation Cost [Sonnet]

**Files:**
- Create: `packages/core/src/analyzers/architecture-debt.ts` (del 1)
- Modify: `packages/core/tests/analyzers/architecture-debt.test.ts`

**Estimat:** 3 timmar

- [ ] **Steg 1: Lagg till 7 failande testfall**

Anvand FIXTURE_A/B/C och bygg grafen med `buildDependencyGraph`. Verifiera:
- A: fanOut=2, fanIn=0, instability=1.0
- B: fanOut=1, fanIn=1, instability=0.5
- C: fanOut=0, fanIn=2, instability=0.0
- Propagation Cost: C > A (C paverkar A och B transitiv)
- Alla propagation cost-varden i [0, 1]
- Tom graf: returnerar tomma Maps

- [ ] **Steg 2: Implementera `computeFanInFanOut` och `computePropagationCost`**

`computeFanInFanOut(graph: DependencyGraph): Map<string, FanMetrics>`:
- fanOut = `graph.edges.get(node).size`
- fanIn = rakna hur manga noder som har kanten -> node
- `instability = fanOut === 0 && fanIn === 0 ? 0 : fanOut / (fanIn + fanOut)`

`computePropagationCost(graph: DependencyGraph): Map<string, number>`:
- Bygg transponerad graf: om A -> B i original, lagg B -> A i reversed
- BFS fran varje M pa reversed: besokta = alla som transitiv beror pa M
- `propagationCost(M) = (|besokta| - 1) / max(|totalt|, 1)` (exkludera M sjalv)

- [ ] **Steg 3: Kor testerna (PASS) och commit**

```bash
git add packages/core/src/analyzers/architecture-debt.ts \
        packages/core/tests/analyzers/architecture-debt.test.ts
git commit -m "feat(core): compute FAN-IN/OUT, instability and propagation cost"
```

**Acceptanskriterier:**
- A: fanIn=0, fanOut=2, instability=1.0
- C: fanIn=2, fanOut=0, instability=0.0
- C:s propagationCost > A:s propagationCost
- Alla varden i [0, 1]

---

## Task 5 — Hamta change frequency fran git-historik [Haiku]

**Files:**
- Create: `packages/core/src/analyzers/change-frequency.ts`
- Create: `packages/core/tests/analyzers/change-frequency.test.ts`

**Estimat:** 1.5 timmar

Raknar commits per fil de senaste N manaderna via `simpleGit.raw()`. Exakt samma monster som `developer-congestion.ts` i temporal/.

- [ ] **Steg 1: Skriv failande tester med vi.mock for simple-git**

Mock returnerar: 3 SHA-rader (test 1: count=3), tom sträng (test 2: count=0), kastar undantag (test 3: count=0).

- [ ] **Steg 2: Implementera**

```typescript
import { simpleGit } from 'simple-git';

export async function getChangeFrequency(
  repoPath: string, filePath: string, windowMonths: number = 12,
): Promise<number> {
  try {
    const output = await simpleGit(repoPath).raw([
      'log', `--since=${windowMonths} months ago`, '--format=%H', '--follow', '--', filePath,
    ]);
    return output.split('\n').filter(l => l.trim().length > 0).length;
  } catch { return 0; }
}
```

- [ ] **Steg 3: Kor testerna (PASS) och commit**

```bash
git add packages/core/src/analyzers/change-frequency.ts \
        packages/core/tests/analyzers/change-frequency.test.ts
git commit -m "feat(core): add change frequency helper — commit count per file from git log"
```

**Acceptanskriterier:**
- Returnerar 3 for tre SHA-rader
- Returnerar 0 for tom output
- Returnerar 0 vid git-undantag (aldrig kastar)
- Anvander --follow flag

---

## Task 6 — Berakna Cost of Change och orkestreringsfunktion [Opus]

**Files:**
- Modify: `packages/core/src/analyzers/architecture-debt.ts` (del 2)
- Modify: `packages/core/tests/analyzers/architecture-debt.test.ts`

**Estimat:** 5 timmar

Orkestratorn sammansatter alla delfunktioner till `ArchitectureDebtResult`. Normaliseringsstrategin ar linjar per projektmaximum for fanIn och changeFrequency; propagationCost ar redan i [0,1]; inCyclePenalty = 1.0 eller 0.0.

Vikter: `fanIn_norm * 0.35 + propCost * 0.40 + cycle * 0.15 + churn_norm * 0.10`. Klipp resultatet till [0, 1].

Severity: `high >= 0.60`, `medium >= 0.35`, `low > 0.0`.

- [ ] **Steg 1: Lagg till 7 failande testfall (mocka getChangeFrequency till 5)**

```typescript
// Testa: totalModules=5, cykel X<->Y detekteras, modules sorterade fallande,
//        topCostlyModules.length <= 10, X och Y har inCycle=true,
//        summary.cycleCount > 0, alla costOfChange i [0, 1]
```

- [ ] **Steg 2: Implementera `analyzeArchitectureDebt`**

```typescript
export async function analyzeArchitectureDebt(
  repoPath: string,
  files: Record<string, { content: string; language: string }>,
): Promise<ArchitectureDebtResult>
```

Interna konstanter:
```typescript
const WEIGHT_FAN_IN = 0.35, WEIGHT_PROPAGATION = 0.40;
const WEIGHT_CYCLE = 0.15, WEIGHT_CHURN = 0.10;
const HIGH_THRESHOLD = 0.60, MEDIUM_THRESHOLD = 0.35;
const BATCH_SIZE = 50;
```

Steg i orkestratorn:
1. `buildDependencyGraph(files)`
2. `computeFanInFanOut(graph)`, `computePropagationCost(graph)` — synkront
3. `findStronglyConnectedComponents(graph.edges)` — extrahera cycleSccs (size > 1)
4. `inCycleNodes = new Set(cycleSccs.flat())`
5. `fetchChangeFrequenciesBatched(repoPath, [...graph.nodes], 12, BATCH_SIZE)`
6. Normalisera fanIn och changeFrequency mot maxvarden
7. Bygg `ModuleDebtProfile` per nod, sortera fallande efter costOfChange
8. Bygg `DependencyCycle[]`, `summary`

Intern `fetchChangeFrequenciesBatched`: iterera i BATCH_SIZE-skärvor med Promise.all per skärva.

- [ ] **Steg 3: Kor testerna (PASS) och commit**

```bash
git add packages/core/src/analyzers/architecture-debt.ts \
        packages/core/tests/analyzers/architecture-debt.test.ts
git commit -m "feat(core): orchestrate full architecture debt analysis — Cost of Change formula with batched git"
```

**Acceptanskriterier:**
- `totalModules === 5` for 5-filsinput
- Cykeln X <-> Y detekteras
- X och Y har `inCycle === true`
- `modules` sorterade fallande
- `topCostlyModules.length <= 10`
- Alla `costOfChange` i [0, 1]
- `summary.cycleCount > 0`

---

## Task 7 — Las projektfiler rekursivt fran disk [Sonnet]

**Files:**
- Create: `packages/core/src/analyzers/project-file-reader.ts`
- Create: `packages/core/tests/analyzers/project-file-reader.test.ts`

**Estimat:** 2 timmar

Atervander `detectLanguage` fran befintliga `language-detect.ts`. Ignorerar node_modules, dist, .git och liknande. Hoppar over filer > 500 KB.

- [ ] **Steg 1: Skriv failande tester mot temporar katalog**

Skapa i `beforeAll`: `src/a.ts`, `src/b.ts`, `src/c.py`, `node_modules/lodash/index.js`. Testa: hittar .ts och .py; ignorerar node_modules; language='typescript' for .ts; relativa sokvaegar (inte absoluta).

- [ ] **Steg 2: Implementera**

```typescript
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.next', '.cache', 'vendor', '__pycache__', 'target', 'out', 'bin', 'obj']);
const SUPPORTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.kt', '.cs', '.rs', '.go', '.php', '.rb', '.swift']);

export async function readProjectFiles(
  directory: string, maxFileSizeBytes: number = 500_000,
): Promise<Record<string, { content: string; language: Language }>>
```

Rekursiv `walkDir` med `fsp.readdir(dir, { withFileTypes: true })`. Skip directories i IGNORE_DIRS eller som borjar med '.'. For filer: kontrollera extension, filstorlek, `detectLanguage !== 'unsupported'`. Las med `fsp.readFile(fullPath, 'utf-8')`. Nyckel: `path.relative(root, fullPath).replace(/\\/g, '/')`.

- [ ] **Steg 3: Kor testerna (PASS) och commit**

```bash
git add packages/core/src/analyzers/project-file-reader.ts \
        packages/core/tests/analyzers/project-file-reader.test.ts
git commit -m "feat(core): add recursive project file reader — ignore node_modules, detect language"
```

**Acceptanskriterier:**
- Hittar .ts och .py men ignorerar node_modules
- language='typescript' for .ts
- Relativa sokvaegar
- Hoppar over filer > 500 KB

---

## Task 8 — Implementera MCP-verktyget `code_health_architecture_debt` [Sonnet]

**Files:**
- Create: `packages/mcp-server/src/tools/architecture-debt.ts`

**Estimat:** 2.5 timmar

Samma monster som `method-coupling.ts`: zod-schema, JSON-respons, defensiv felhantering.

- [ ] **Steg 1: Implementera verktyget**

Input-schema (zod):
```typescript
{
  directory: z.string().describe('Absolut sokvaeg till projektets rotkatalog'),
  language: z.enum(['typescript', 'javascript', 'python', 'all']).default('all'),
  depth: z.enum(['file', 'module']).default('file'),
  maxFiles: z.number().int().min(1).max(10000).default(1000),
}
```

Handler:
1. `readProjectFiles(directory)`
2. Filtrera pa language (om inte 'all')
3. Begränsa till maxFiles med slice
4. Returnera isError om inga filer hittades
5. `analyzeArchitectureDebt(directory, limitedFiles)`
6. Formatera: topCostlyModules, cycles, summary, allModules

Per-modul format i output:
```json
{ "file": "src/auth.ts", "costOfChange": 0.72, "severity": "high",
  "fanIn": 8, "fanOut": 3, "propagationCost": "34.5%", "inCycle": false, "changeFrequency": 23 }
```

- [ ] **Steg 2: Commit**

```bash
git add packages/mcp-server/src/tools/architecture-debt.ts
git commit -m "feat(mcp-server): add code_health_architecture_debt tool"
```

**Acceptanskriterier:**
- Kompilerar utan TS-fel
- JSON med topCostlyModules, cycles, summary, allModules
- Hanterar tom katalog med isError: true
- Respekterar maxFiles-granssen

---

## Task 9 — Registrera verktyget i `server.ts` [Haiku]

**Files:**
- Modify: `packages/mcp-server/src/server.ts`

**Estimat:** 30 minuter

- [ ] **Steg 1: Importera och registrera efter registerMethodCoupling**

```typescript
import { registerArchitectureDebt } from './tools/architecture-debt';
registerMethodCoupling(server);
registerArchitectureDebt(server);
```

- [ ] **Steg 2: Verifiera build**

```bash
cd packages/mcp-server && pnpm build
```

- [ ] **Steg 3: Commit**

```bash
git add packages/mcp-server/src/server.ts
git commit -m "feat(mcp-server): register code_health_architecture_debt tool in server"
```

**Acceptanskriterier:**
- `pnpm build` passerar utan TS-fel
- Verktyget syns i `tools/list`-svaret

---

## Task 10 — Integrationstester mot fixture-katalog pa disk [Sonnet]

**Files:**
- Create: `packages/core/tests/analyzers/architecture-debt-integration.test.ts`

**Estimat:** 3 timmar

Full pipeline utan mocks. Testar hela kedjan: readProjectFiles -> buildDependencyGraph -> SCC -> Cost of Change.

- [ ] **Steg 1: Bygg fixture-katalog i beforeAll**

I os.tmpdir() skapa:
- `src/config.ts`: `export const config = { timeout: 3000 };` (stabil karna)
- `src/utils.ts`: `import { config } from './config'; export function getTimeout() { return config.timeout; }`
- `src/feature.ts`: `import { getTimeout } from './utils'; import { config } from './config'; export function run() { return getTimeout(); }`
- `src/cycle-a.ts`: `import { b } from './cycle-b'; export function a() { return b(); }`
- `src/cycle-b.ts`: `import { a } from './cycle-a'; export function b() { return a(); }`

- [ ] **Steg 2: Skriv 6 integrationstestfall**

1. `config.ts` har hogst propagationCost (importeras transitiv av utils och feature)
2. Cykeln `cycle-a <-> cycle-b` detekteras i `result.cycles`
3. `cycle-a.ts` och `cycle-b.ts` har `inCycle === true`
4. `config.ts` har `fanIn === 2`
5. `feature.ts` har `fanOut === 2`
6. `result.totalModules === 5`

- [ ] **Steg 3: Kor hela test-sviten och commit**

```bash
cd packages/core && pnpm test
cd packages/mcp-server && pnpm test
git add packages/core/tests/analyzers/architecture-debt-integration.test.ts
git commit -m "test(core): integration tests — full architecture debt pipeline with fixture directory"
```

**Acceptanskriterier:**
- Alla 6 integrationstestfall passerar
- `config.ts` har hogst propagationCost
- Cykeln detekteras
- Inga regressions i befintliga testsviter

---

## Task 11 — Exportera modulerna fran core-paketet [Haiku]

**Files:**
- Modify: `packages/core/src/analyzers/index.ts`

**Estimat:** 30 minuter

- [ ] **Steg 1: Lagg till exports**

```typescript
export * from './dependency-graph';
export * from './scc';
export * from './architecture-debt';
export * from './change-frequency';
export * from './project-file-reader';
```

- [ ] **Steg 2: Verifiera build**

```bash
cd packages/mcp-server && pnpm build
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/analyzers/index.ts
git commit -m "feat(core): export architecture debt modules from analyzers index"
```

---

## Task 12 — Edge case-hantering och robusthetstester [Sonnet]

**Files:**
- Modify: `packages/core/tests/analyzers/architecture-debt.test.ts`

**Estimat:** 2 timmar

- [ ] **Steg 1: Lagg till 4 edge case-testfall**

1. Enda fil utan beroenden: `totalModules=1`, `cycles=[]`, `propagationCost=0`, `costOfChange=0`
2. Tom fil-map: `totalModules=0`, `cycles=[]`, `modules=[]` — aldrig undantag
3. Self-import (src/self.ts importerar ./self): ingen infinite loop, ingen krasch
4. Extrem normalisering: `costOfChange` alltid i [0, 1] aven nar fanIn = 1000

- [ ] **Steg 2: Kor testerna (PASS) och commit**

```bash
git add packages/core/tests/analyzers/architecture-debt.test.ts
git commit -m "test(core): cover architecture debt edge cases — empty input, self-imports, normalization"
```

---

## Task 13 — Prestandaoptimering: batcha git-anrop [Sonnet]

**Files:**
- Modify: `packages/core/src/analyzers/architecture-debt.ts`

**Estimat:** 2 timmar

For stora projekt (1000+ filer) ar sekventiella git-anrop flaskhals. Batch till 50 parallella anrop per omgang. Dokumentera tidskomplexitet per steg.

- [ ] **Steg 1: Extrahera `fetchChangeFrequenciesBatched` (BATCH_SIZE=50)**

Iterera filePaths i BATCH_SIZE-skarvor med Promise.all per skarva. Returnerar Map<string, number>.

- [ ] **Steg 2: Lagg till prestandakommentar**

```
Prestandacharakteristik:
- Grafsbygge: O(files x avg_imports), typiskt < 100 ms for 1000 filer
- Propagation Cost BFS: O(nodes x (nodes + edges))
- Tarjan's SCC: O(V + E)
- Change Frequency: batchar 50 git-anrop at gangen, typiskt 5-10 s for 1000 filer
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/analyzers/architecture-debt.ts
git commit -m "perf(core): batch git change-frequency requests (BATCH_SIZE=50) for large projects"
```

---

## Task 14 — Runtime inputvalidering [Haiku]

**Files:**
- Modify: `packages/core/src/analyzers/architecture-debt.ts`

**Estimat:** 45 minuter

- [ ] **Steg 1: Lagg till validering i borjan av `analyzeArchitectureDebt`**

```typescript
if (typeof repoPath !== 'string' || repoPath.trim() === '') throw new Error('repoPath maste vara en icke-tom strang');
if (typeof files !== 'object' || files === null) throw new Error('files maste vara ett objekt');
```

- [ ] **Steg 2: Kör typecheck och commit**

```bash
cd packages/core && pnpm typecheck
git add packages/core/src/analyzers/architecture-debt.ts
git commit -m "feat(core): add runtime input validation to analyzeArchitectureDebt"
```

---

## Task 15 — Kor hela test-sviten och verifiering [Haiku]

**Estimat:** 1 timme

- [ ] **Steg 1: Kor alla tester och typecheck**

```bash
cd packages/core && pnpm test
cd packages/mcp-server && pnpm test
pnpm -r typecheck
```

Forvantat: alla befintliga tester grona. Minst 46 nya testfall fran sprint 22.

- [ ] **Steg 2: Slutgiltig commit**

```bash
git commit -m "test(core): sprint 22 — all tests green, 46+ new tests, no regressions"
```

---

## Testkrav

| Testkategori | Antal nya tester | Testfil |
|---|---|---|
| Beroendegrafsparser | 8 tester | `dependency-graph.test.ts` |
| Tarjan's SCC | 7 tester | `scc.test.ts` |
| FAN-IN/OUT, Propagation Cost | 7 tester | `architecture-debt.test.ts` |
| Sammansatt analys (orkestrator) | 7 tester | `architecture-debt.test.ts` |
| Edge cases | 4 tester | `architecture-debt.test.ts` |
| Change frequency | 3 tester | `change-frequency.test.ts` |
| Project file reader | 4 tester | `project-file-reader.test.ts` |
| Integration mot disk | 6 tester | `architecture-debt-integration.test.ts` |
| **Totalt** | **46+ tester** | Alla ska vara PASS |

---

## Definition of Done

- [ ] `pnpm -r test` passerar utan regressions i befintliga tester
- [ ] `pnpm -r typecheck` passerar i alla paket
- [ ] Minst 46 nya testfall fran sprint 22
- [ ] MCP-verktyget `code_health_architecture_debt` registrerat och svarar med korrekt JSON
- [ ] Beroendegrafsbyggaren hanterar TypeScript, JavaScript och Python-imports
- [ ] Tarjan's SCC identifierar alla cykler korrekt (7 testfall godkanda)
- [ ] Propagation Cost korrekt via transitiv BFS pa transponerad graf
- [ ] Cost of Change normaliserat till [0, 1] med korrekt severity-klassificering
- [ ] Change frequency via simple-git med graceful degradation (aldrig undantag)
- [ ] Edge cases: tom input, enda fil, self-import — inga undantag
- [ ] `inCycle` korrekt for alla cykelnoder i integrationstestet

---

## Sjalvgranskning mot spec

**Spec-tackning:**
- [x] FAN-IN / FAN-OUT per modul/fil — Task 4
- [x] Propagation Cost — Task 4 (transitiv BFS pa transponerad graf)
- [x] Cykliska beroenden via SCC — Task 3 (iterativ Tarjan's algoritm)
- [x] Cost of Change-score — Task 6 (sammansatt formel med 4 vikter)
- [x] MCP-verktyg `code_health_architecture_debt` — Task 8 + 9
- [x] Input: directory, language, depth — Task 8 (zod-schema)
- [x] Output: per-modul rankings, cykliska grupper, cost-of-change ranking — Task 8
- [x] Beroendegrafsbygge via import-statement parsning — Task 2 (regex per sprak)
- [x] Change frequency fran simple-git — Task 5 (same monster som temporal/)
- [x] Exporterade fran core-paketet — Task 11

**Medvetet utanfor scope:**
- Java/C#/Kotlin classpath-baserad import-resolution (kraver projektvid index — framtida sprint)
- Klassniva-granularitet (`depth: 'class'`) — planerat for framtida sprint
- Interaktiv visualisering av beroendegrafen — UI-uppgift utanfor motorn
- Persistent disk-cache — premature for v1; in-memory racker

**Risker:**
- Import-parsning ar regex-baserad, inte AST-baserad — falska positiver vid kommenterade imports. Acceptabelt for v1.
- Propagation Cost BFS ar O(nodes^2) i varsta fall. Mitigeras av maxFiles-granssen (default 1000).
- git.raw() per fil kan bli langsamt. Mitigeras av BATCH_SIZE=50 och --since-begransning.
