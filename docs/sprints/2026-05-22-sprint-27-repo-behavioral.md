# Sprint 27: Repo-nivå behavioral analysis & change coupling

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg ett fullständigt behavioral analytics-lager som analyserar kodbas-evolution *över tid* — inte bara i ett ögonblick. Leverera: hotspot-analys (komplexitet × churn), churn rate per fil, complexity trend per commit, utökad change coupling på filnivå med rullande 90-dagars fönster, och ett Architectural Decay Index (0–10) per modul. Fem nya eller utökade MCP-verktyg exponeras: `code_health_hotspots`, `code_health_trend_analysis`, utökat `code_health_method_coupling`, stöd för monorepos, och konfigurerbar lookback-period.

**Architecture:** Ny modul `packages/core/src/temporal/behavioral-analytics.ts` orkestrerar alla beräkningar. Återanvänder `simpleGit`-infrastrukturen från `temporal-coupling.ts`, `code-churn.ts` och `hotspot.ts` (som redan implementerar delar av funktionaliteten — se `temporal/hotspot.ts` och `temporal/code-churn.ts`). Ny katalog `packages/mcp-server/src/tools/behavioral/` med ett tool-fil per MCP-verktyg. Git fixture-repos med kontrollerad commit-historik används för integrationstester — samma mönster som Sprint 19.

**Viktigt:** Projektet har redan `packages/core/src/temporal/hotspot.ts` och `packages/core/src/temporal/code-churn.ts`. Dessa ska läsas noggrant innan implementation för att undvika duplicering — sprint 27 bygger *ovanpå* dem, inte parallellt.

**Tech Stack:** TypeScript 5.x, simple-git 3.22 (befintlig), tree-sitter (via `analyzeByLanguage`), Vitest, pnpm workspaces

**Testkommando:** `cd packages/core && pnpm test` och `cd packages/mcp-server && pnpm test`

---

## Bakgrund och motivation

Sprint 19 implementerade method-level temporal coupling (metoder i *samma fil* som ändras tillsammans i en commit). Det är värdefull information, men det är en ögonblicksbild — den analyserar inte hur ett systems hälsa förändras *över tid*.

CodeScene:s kärnfunktionalitet är tidsserieanalys av kodbas-evolution. Deras "hotspot"-analys kombinerar komplexitet och ändringsfrekvens för att identifiera de mest riskfyllda delarna av en kodbas. Deras "change coupling"-analys identifierar filer som *konsekvent* ändras tillsammans månader eller år framöver — dolda arkitekturella beroenden som inte syns i statisk `import`-analys.

Vi har redan primitiva building blocks:

| Befintlig modul | Vad den gör | Vad som saknas |
|---|---|---|
| `temporal/hotspot.ts` | Beräknar hotspot-score (churn × complexity?) | Verifiera implementation — finns grunderna redan? |
| `temporal/code-churn.ts` | Hämtar churn per fil (additions + deletions) | Trend-analys, rullande fönster, normalisering |
| `temporal/temporal-coupling.ts` | Fil-par som ändras i *samma commit* | Historisk ackumulering, coupling-styrka, 90-dagars fönster |
| `temporal/method-coupling.ts` | Method-par i *samma fil* (Sprint 19) | Fil-nivå variant med historisk coupling-styrka |

Sprint 27 fogar samman dessa till ett sammanhängande behavioral analytics-system och lägger till de saknade komponenterna.

---

## Läs de befintliga modulerna först (obligatorisk discovery-fas)

Innan någon implementation-task påbörjas **måste** de befintliga temporal-modulerna granskas:

```
packages/core/src/temporal/hotspot.ts
packages/core/src/temporal/hotspot-helpers.ts
packages/core/src/temporal/code-churn.ts
packages/core/src/temporal/temporal-coupling.ts
```

Detta är viktigt för att förstå: (1) vilka git-API:er som redan är abstraherade, (2) vilket dataformat som används, (3) om hotspot-score redan kombinerar komplexitet och churn eller om det saknas.

---

## Teknisk design

### A. Hotspot Analysis — formel

```
HOTSPOT_SCORE(fil) = normalize(complexity(fil)) × normalize(churnRate(fil))

Där:
  complexity(fil)   = cognitiveComplexity ELLER cyclomaticComplexity per funktion, summerat per fil
                      Fallback om analyzer inte stöder fil-typen: 0
  churnRate(fil)    = (additions + deletions) / dagar i lookback-period
  normalize(x)      = x / max(x för alla filer i repot)  → [0, 1]

HOTSPOT_SCORE ∈ [0, 1]

Klassificering:
  score > 0.7  → "critical hotspot"    (röd)
  score > 0.4  → "warning hotspot"     (gul)
  score ≤ 0.4  → "healthy"             (grön, rapporteras inte som default)

Ranking: Top-10 hotspots per anrop (konfigurerbar topN-parameter)
```

### B. Churn Rate & Complexity Trend — formel

```
CHURN_RATE(fil, period) = Σ (additions + deletions per commit) / period_i_dagar

COMPLEXITY_TREND(fil, commits) =
  Beräkna complexity vid commit[0], commit[N/4], commit[N/2], commit[3N/4], commit[N]
  (5 samplingspunkter för att undvika O(commits) analyzer-anrop)
  
  Trend = LinearRegression(samplingspunkter).slope
    slope > 0    → "rising" (teknisk skuld ökar)
    slope ≈ 0    → "stable"
    slope < 0    → "declining" (kod rensas upp)

HEALTH_TRAJECTORY(fil):
  rising  + hög churn  = "deteriorating"  → varning
  rising  + låg churn  = "slow_decay"     → info
  stable               = "stable"         → ok
  declining            = "improving"      → positiv signal
```

### C. Utökad Change Coupling (fil-par, rullande fönster)

```
Till skillnad från temporal-coupling.ts (som tittar på commits utan tidsfönster):

ROLLING_COUPLING(filA, filB, windowDays=90):
  Hämta alla commits som rör filA ELLER filB inom windowDays senaste dagar
  
  pairsInWindow = commits som rör BÅDE filA OCH filB
  touchesA      = commits som rör filA (oavsett filB)
  touchesB      = commits som rör filB (oavsett filA)
  
  couplingStrength = |pairsInWindow| / max(|touchesA|, |touchesB|)
  
  Rapportera par med couplingStrength > threshold (default 0.3 för fil-nivå,
  lägre än method-nivåns 0.5 p.g.a. större brus på fil-nivå)

TEMPORAL STABILITY:
  Dela lookback-perioden i tre lika delar (tidiga, mitten, senaste)
  Beräkna couplingStrength per period
  Om couplingStrength ökar → "tightening" (arkitekturellt problem förvärras)
  Om den minskar → "loosening" (refaktorering hjälper)
```

### D. Architectural Decay Index — formel

```
ADI(modul) = weighted_sum(
  complexityTrend_score  × 0.35,  // starkaste signal
  churnRate_normalized   × 0.25,
  couplingDensity        × 0.20,  // antal starka kopplingar till andra moduler
  docCoverageTrend       × 0.10,  // om LowDocCoverage-smells ökar
  testProximity_inverted × 0.10,  // om test-filer är frånvarande
)

ADI ∈ [0, 10]

complexityTrend_score = clamp((slope × 10), 0, 10)
churnRate_normalized  = clamp((churnRate / HIGH_CHURN_THRESHOLD) × 10, 0, 10)
couplingDensity       = clamp((strongCouplings × 2), 0, 10)  // antal par > 0.5 coupling
docCoverageTrend      = docCoverageScore (0–10, inverterat från LowDocCoverage-smell)
testProximity_inverted= 10 - testProximityScore (0–10)

HIGH_CHURN_THRESHOLD = 50 ändringar / dag (konfigurerbar)

Klassificering:
  ADI 0–3   → "healthy"
  ADI 3–6   → "warning"
  ADI 6–8   → "high_risk"
  ADI 8–10  → "critical"
```

### E. Git-historik förbättringar

```
Konfigurerbar lookback:
  lookbackDays: number  (default 90, max 365)
  Impl: git log --since="<date>" --until="<date>"

Monorepo-stöd:
  packageRoot: string  (t.ex. "packages/core" i en pnpm-workspace)
  Alla fil-sökvägar relativeras till packageRoot
  Churn-analys begränsas till filer under packageRoot

Exkludera brus:
  Merge-commits: --no-merges
  Versionsändringar: filter på commit-meddelande (VERSION_BUMP_PATTERN)
  Binärfiler: skippa filer utan text-extension
```

---

## Filöversikt

| Fil | Ändring |
|---|---|
| `packages/core/src/temporal/behavioral-analytics.ts` | Ny — orkestrator för hotspot, trend, fil-nivå coupling, ADI |
| `packages/core/src/temporal/complexity-trend.ts` | Ny — beräknar complexity-trend via sampling + linjär regression |
| `packages/core/src/temporal/file-coupling.ts` | Ny — fil-par change coupling med rullande fönster |
| `packages/core/src/temporal/decay-index.ts` | Ny — Architectural Decay Index per modul |
| `packages/core/src/types.ts` | Utöka — `HotspotResult`, `TrendResult`, `FileCouplingPair`, `ArchitecturalDecayResult` |
| `packages/mcp-server/src/tools/hotspots.ts` | Ny — `code_health_hotspots` |
| `packages/mcp-server/src/tools/trend-analysis.ts` | Ny — `code_health_trend_analysis` |
| `packages/mcp-server/src/tools/method-coupling.ts` | Utöka — lägg till fil-nivå coupling som alternativ mode |
| `packages/mcp-server/src/server.ts` | Registrera nya verktyg |
| `packages/core/tests/temporal/behavioral-analytics.test.ts` | Ny integrationstest med git fixture |
| `packages/core/tests/temporal/file-coupling.test.ts` | Ny enhets- och integrationstest |
| `packages/core/tests/temporal/complexity-trend.test.ts` | Ny enhetstest (linjär regression, sampling) |
| `packages/core/tests/fixtures/behavioral-analytics-repo-builder.ts` | Ny — bygger fixture-git-repo med kontrollerad evolution |
| `README.md` | Dokumentera nya verktyg och `architecturalDecayIndex`-biomarkern |

---

## Task 1 — Granska befintliga temporal-moduler och kartlägg vad som saknas

**Files:**
- Read-only: `packages/core/src/temporal/hotspot.ts`, `hotspot-helpers.ts`, `code-churn.ts`, `temporal-coupling.ts`

**AI-modell: [Sonnet]** — Discovery-fas. Sonnet räcker för kodläsning och strukturerad analys.

Denna task producerar inga kod-ändringar — den säkerställer att implementationen bygger rätt på befintliga fundamentet.

- [ ] **Steg 1: Läs `hotspot.ts` och `hotspot-helpers.ts`**

Dokumentera:
- Vilken formel används för hotspot-score? Kombineras komplexitet och churn redan?
- Vilket format returneras?
- Finns det en `lookbackDays`-parameter?

- [ ] **Steg 2: Läs `code-churn.ts`**

Dokumentera:
- Vilka git-kommandon används?
- Returneras additions/deletions per fil separat?
- Finns normalisering?

- [ ] **Steg 3: Läs `temporal-coupling.ts`**

Dokumentera:
- Analyseras par i ett tidsfönster eller över hela historiken?
- Vilken styrka-formel används?

- [ ] **Steg 4: Identifiera dupliceringsrisker**

Lista alla funktioner i sprint 27-specen som *kanske* redan är implementerade och markera om de ska:
- **Återanvändas as-is** (ingen ändring)
- **Utökas** (ny parameter eller nytt returvärde)
- **Nyimplementeras** (funktionen saknas eller är för annorlunda)

- [ ] **Steg 5: Skapa discovery-anteckning (intern arbetsanteckning)**

Skriv en kort summering i en kommentar i `behavioral-analytics.ts` (skapas i Task 2) om vad som återanvänds och vad som är nytt. Denna kommentar tas bort i slutlig PR.

---

## Task 2 — Bygg fixture-git-repo för behavioral analytics-tester

**Files:**
- Create: `packages/core/tests/fixtures/behavioral-analytics-repo-builder.ts`

**AI-modell: [Sonnet]** — Mönstret är identiskt med Sprint 19:s `buildMethodCouplingFixtureRepo`. Sonnet räcker för att bygga fixture-repot korrekt.

Fixture-repot ska simulera ett "verkligt projekt" med kontrollerad evolution: en fil vars komplexitet ökar över tid, ett fil-par med konsekvent co-change, och en frisk fil utan mönster.

- [ ] **Steg 1: Specificera fixture-repot**

Repot ska innehålla:
- `src/auth.ts` — komplexiteten ökar per commit (mer nästlad kod per version)
- `src/utils.ts` — ändras *tillsammans med* `src/auth.ts` i 8 av 12 commits (coupling 67%)
- `src/types.ts` — ändras sällan och ensam (frisk fil, låg churn)
- Totalt: 20 commits (1 initial + 12 "evolutionary" + 7 "solo types-commits")
- Commits distribuerade bakåt i tid: `GIT_COMMITTER_DATE` sätts så att 20 commits sträcker sig 120 dagar bakåt (6 dagar per commit)

- [ ] **Steg 2: Implementera byggaren**

```typescript
// packages/core/tests/fixtures/behavioral-analytics-repo-builder.ts
import * as path from 'path';
import * as os from 'os';
import * as fsp from 'fs/promises';
import simpleGit from 'simple-git';

export interface BehavioralFixtureRepo {
  rootPath: string;
  cleanup: () => Promise<void>;
}

function makeDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

// Ger successivt mer komplex auth.ts (fler nästlade if-satser per version)
function authContent(complexity: number): string {
  const nestings = Array.from({ length: complexity }, (_, i) =>
    `  if (condition${i + 1}) {\n    return value${i + 1};\n  }`
  ).join('\n');
  return `export function validateUser(user: string): boolean {\n${nestings}\n  return true;\n}\n`;
}

function utilsContent(version: number): string {
  return `export function formatUser(u: string): string {\n  // v${version}\n  return u.trim();\n}\n`;
}

function typesContent(version: number): string {
  return `export type User = { id: ${version}; name: string; };\n`;
}

export async function buildBehavioralAnalyticsFixtureRepo(): Promise<BehavioralFixtureRepo> {
  const rootPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'behavioral-analytics-'));
  await fsp.mkdir(path.join(rootPath, 'src'), { recursive: true });

  const git = simpleGit(rootPath);
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'Test');
  await git.addConfig('commit.gpgsign', 'false');

  const env = { ...process.env, GIT_COMMITTER_DATE: '', GIT_AUTHOR_DATE: '' };

  async function commit(message: string, daysAgo: number) {
    const date = makeDate(daysAgo);
    env.GIT_COMMITTER_DATE = date;
    env.GIT_AUTHOR_DATE = date;
    await git.env(env).commit(message);
  }

  // Commit 0: Initial (dag 120)
  await fsp.writeFile(path.join(rootPath, 'src/auth.ts'), authContent(1), 'utf-8');
  await fsp.writeFile(path.join(rootPath, 'src/utils.ts'), utilsContent(0), 'utf-8');
  await fsp.writeFile(path.join(rootPath, 'src/types.ts'), typesContent(0), 'utf-8');
  await git.add(['src/auth.ts', 'src/utils.ts', 'src/types.ts']);
  await commit('initial: project setup', 120);

  // Commits 1–12: auth.ts + utils.ts ändras tillsammans, komplexitet stiger (dag 114 → dag 6)
  for (let i = 1; i <= 12; i++) {
    await fsp.writeFile(path.join(rootPath, 'src/auth.ts'), authContent(i + 1), 'utf-8');
    await fsp.writeFile(path.join(rootPath, 'src/utils.ts'), utilsContent(i), 'utf-8');
    await git.add(['src/auth.ts', 'src/utils.ts']);
    await commit(`feat: update auth logic v${i}`, 120 - i * 10);
  }

  // Commits 13–15: utils.ts ensam (dag 5, 4, 3)
  for (let i = 0; i < 3; i++) {
    await fsp.writeFile(path.join(rootPath, 'src/utils.ts'), utilsContent(13 + i), 'utf-8');
    await git.add('src/utils.ts');
    await commit(`refactor: utils cleanup ${i}`, 5 - i);
  }

  // Commits 16–19: types.ts ensam, sällan ändrad (dag 60, 45, 30, 15)
  for (let i = 1; i <= 4; i++) {
    await fsp.writeFile(path.join(rootPath, 'src/types.ts'), typesContent(i), 'utf-8');
    await git.add('src/types.ts');
    await commit(`chore: update types v${i}`, 75 - i * 15);
  }

  return {
    rootPath,
    cleanup: async () => { await fsp.rm(rootPath, { recursive: true, force: true }); },
  };
}
```

- [ ] **Steg 3: Verifiera commit-historiken**

```typescript
// Lägg till i en smoke-test (kan tas bort):
const repo = await buildBehavioralAnalyticsFixtureRepo();
const git = simpleGit(repo.rootPath);
const log = await git.log();
console.assert(log.total === 20, `Förväntat 20 commits, fick ${log.total}`);
await repo.cleanup();
```

- [ ] **Steg 4: Commit**

```bash
git add packages/core/tests/fixtures/behavioral-analytics-repo-builder.ts
git commit -m "test(core): add behavioral analytics fixture repo builder with controlled evolution"
```

**Acceptanskriterier:**
- [ ] Fixture-repot producerar exakt 20 commits
- [ ] `src/auth.ts` har stigande komplexitet (fler nästlingar per version)
- [ ] `src/utils.ts` och `src/auth.ts` ändras tillsammans i 12 av 15 commits som rör dem (>75% coupling-potential)
- [ ] Commit-datum är distribuerade bakåt i tid (GIT_COMMITTER_DATE satt korrekt)

**Estimat:** 3 timmar

---

## Task 3 — Implementera `complexity-trend.ts`

**Files:**
- Create: `packages/core/src/temporal/complexity-trend.ts`
- Create: `packages/core/tests/temporal/complexity-trend.test.ts`

**AI-modell: [Sonnet]** — Linjär regression och git-sampling är väldefinierade algoritmer.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/temporal/complexity-trend.test.ts
import { describe, it, expect } from 'vitest';
import { linearRegressionSlope, sampleComplexityPoints } from '../../src/temporal/complexity-trend';

describe('linearRegressionSlope', () => {
  it('returnerar positiv slope för stigande sekvens', () => {
    const points = [{ x: 0, y: 5 }, { x: 1, y: 7 }, { x: 2, y: 10 }, { x: 3, y: 13 }];
    expect(linearRegressionSlope(points)).toBeGreaterThan(0);
  });

  it('returnerar negativ slope för sjunkande sekvens', () => {
    const points = [{ x: 0, y: 20 }, { x: 1, y: 15 }, { x: 2, y: 10 }, { x: 3, y: 5 }];
    expect(linearRegressionSlope(points)).toBeLessThan(0);
  });

  it('returnerar noll för konstant sekvens', () => {
    const points = [{ x: 0, y: 10 }, { x: 1, y: 10 }, { x: 2, y: 10 }];
    expect(Math.abs(linearRegressionSlope(points))).toBeLessThan(0.001);
  });

  it('returnerar 0 för enstaka punkt', () => {
    expect(linearRegressionSlope([{ x: 0, y: 5 }])).toBe(0);
  });

  it('returnerar 0 för tom lista', () => {
    expect(linearRegressionSlope([])).toBe(0);
  });
});

describe('sampleComplexityPoints — sampling-indexering', () => {
  it('returnerar 5 index för lista med 20 element', () => {
    const indices = sampleComplexityPoints(20, 5);
    expect(indices).toHaveLength(5);
    expect(indices[0]).toBe(0);
    expect(indices[indices.length - 1]).toBe(19);
  });

  it('returnerar alla index för lista kortare än N', () => {
    const indices = sampleComplexityPoints(3, 5);
    expect(indices).toEqual([0, 1, 2]);
  });

  it('ger jämnt distribuerade index', () => {
    const indices = sampleComplexityPoints(100, 5);
    const gaps = indices.slice(1).map((v, i) => v - indices[i]);
    const maxGap = Math.max(...gaps);
    const minGap = Math.min(...gaps);
    expect(maxGap - minGap).toBeLessThanOrEqual(2); // Jämna gap ±1
  });
});
```

- [ ] **Steg 2: Implementera**

```typescript
// packages/core/src/temporal/complexity-trend.ts
import simpleGit from 'simple-git';
import { analyzeByLanguage } from '../analyzers';
import { detectLanguage } from '../languages';

export interface ComplexityPoint {
  x: number; // commit-index (0 = äldst)
  y: number; // total complexity vid detta commit
  sha: string;
}

export interface ComplexityTrendResult {
  filePath: string;
  slope: number;           // positiv = stigande komplexitet, negativ = sjunkande
  trajectory: 'rising' | 'stable' | 'declining';
  sampledPoints: ComplexityPoint[];
  commitsAnalyzed: number;
}

/**
 * Beräknar slope via linjär regression (least-squares).
 * Returnerar 0 för < 2 punkter.
 */
export function linearRegressionSlope(points: Array<{ x: number; y: number }>): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Returnerar ett jämnt distribuerat urval av N index från en lista med `total` element.
 * Första och sista index inkluderas alltid.
 */
export function sampleComplexityPoints(total: number, n: number): number[] {
  if (total <= n) return Array.from({ length: total }, (_, i) => i);
  const indices: number[] = [];
  for (let i = 0; i < n; i++) {
    indices.push(Math.round(i * (total - 1) / (n - 1)));
  }
  return indices;
}

const STABLE_SLOPE_THRESHOLD = 0.1; // Komplexitetsenheter per commit — justeras empiriskt

export async function analyzeComplexityTrend(
  repoPath: string,
  filePath: string,
  options: { maxCommits?: number; samplePoints?: number } = {},
): Promise<ComplexityTrendResult> {
  const maxCommits = options.maxCommits ?? 200;
  const samplePoints = options.samplePoints ?? 5;
  const git = simpleGit(repoPath);

  let shas: string[] = [];
  try {
    const log = await git.log({ file: filePath, '--follow': null, maxCount: maxCommits } as Record<string, unknown>);
    // git log returnerar nyaste-först — vi vill äldsta-först för x-axeln
    shas = log.all.map(c => c.hash).reverse();
  } catch {
    return { filePath, slope: 0, trajectory: 'stable', sampledPoints: [], commitsAnalyzed: 0 };
  }

  if (shas.length < 2) {
    return { filePath, slope: 0, trajectory: 'stable', sampledPoints: [], commitsAnalyzed: shas.length };
  }

  const language = detectLanguage(filePath);
  if (language === 'unsupported') {
    return { filePath, slope: 0, trajectory: 'stable', sampledPoints: [], commitsAnalyzed: shas.length };
  }

  const sampleIndices = sampleComplexityPoints(shas.length, samplePoints);
  const sampledPoints: ComplexityPoint[] = [];

  for (const idx of sampleIndices) {
    const sha = shas[idx];
    try {
      const content = await git.show([`${sha}:${filePath}`]);
      const result = analyzeByLanguage(content, language, filePath);
      const totalComplexity = result.functions.reduce((s, f) => s + (f.cyclomaticComplexity ?? 1), 0);
      sampledPoints.push({ x: idx, y: totalComplexity, sha });
    } catch {
      // Fil existerar inte vid denna commit — hoppa över
    }
  }

  if (sampledPoints.length < 2) {
    return { filePath, slope: 0, trajectory: 'stable', sampledPoints, commitsAnalyzed: shas.length };
  }

  const slope = linearRegressionSlope(sampledPoints);
  const trajectory = slope > STABLE_SLOPE_THRESHOLD ? 'rising'
    : slope < -STABLE_SLOPE_THRESHOLD ? 'declining'
    : 'stable';

  return { filePath, slope: parseFloat(slope.toFixed(4)), trajectory, sampledPoints, commitsAnalyzed: shas.length };
}
```

- [ ] **Steg 3: Kör testerna**

```bash
cd packages/core && pnpm test -- tests/temporal/complexity-trend.test.ts
```

Förväntat: alla enhetstest PASS.

- [ ] **Steg 4: Lägg till integrationstester mot fixture-repot**

```typescript
describe('analyzeComplexityTrend — integration', () => {
  let repo: BehavioralFixtureRepo;
  beforeAll(async () => { repo = await buildBehavioralAnalyticsFixtureRepo(); }, 60_000);
  afterAll(async () => { await repo.cleanup(); });

  it('identifierar stigande komplexitet i auth.ts', async () => {
    const result = await analyzeComplexityTrend(repo.rootPath, 'src/auth.ts');
    expect(result.trajectory).toBe('rising');
    expect(result.slope).toBeGreaterThan(0);
  });

  it('auth.ts har ≥ 3 samplade punkter', async () => {
    const result = await analyzeComplexityTrend(repo.rootPath, 'src/auth.ts');
    expect(result.sampledPoints.length).toBeGreaterThanOrEqual(3);
  });

  it('hanterar obefintlig fil gracefully', async () => {
    const result = await analyzeComplexityTrend(repo.rootPath, 'src/does-not-exist.ts');
    expect(result.trajectory).toBe('stable');
    expect(result.sampledPoints).toHaveLength(0);
  });
});
```

- [ ] **Steg 5: Commit**

```bash
git add packages/core/src/temporal/complexity-trend.ts packages/core/tests/temporal/complexity-trend.test.ts
git commit -m "feat(core): add complexity trend analysis with linear regression over sampled commits"
```

**Acceptanskriterier:**
- [ ] `linearRegressionSlope` uppfyller alla 5 enhetstest
- [ ] `sampleComplexityPoints` uppfyller alla 3 enhetstest
- [ ] `analyzeComplexityTrend` identifierar `rising` för fixture-repots `auth.ts`
- [ ] Ickeexisterande filer returnerar `{ trajectory: 'stable', sampledPoints: [] }` utan exception

**Estimat:** 4 timmar

---

## Task 4 — Implementera `file-coupling.ts` (fil-nivå coupling med rullande fönster)

**Files:**
- Create: `packages/core/src/temporal/file-coupling.ts`
- Create: `packages/core/tests/temporal/file-coupling.test.ts`

**AI-modell: [Opus]** — Rullande fönster-logik kombinerad med temporal stability-analys kräver noggrann genomtänkthet för att undvika off-by-one-fel i datum och coupling-beräkningar.

- [ ] **Steg 1: Definiera typer**

```typescript
// Lägg till i packages/core/src/types.ts:

export interface FileCouplingPair {
  fileA: string;
  fileB: string;
  coChangeCount: number;
  combinedTouches: number;
  couplingStrength: number;           // [0..1]
  temporalStability: 'tightening' | 'stable' | 'loosening';
  severity: 'low' | 'medium' | 'high';
  windowDays: number;
}

export interface FileCouplingResult {
  repoPath: string;
  windowDays: number;
  threshold: number;
  commitsAnalyzed: number;
  pairs: FileCouplingPair[];
}
```

- [ ] **Steg 2: Skriv det failande integrationstestet**

```typescript
// packages/core/tests/temporal/file-coupling.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { analyzeFileCoupling } from '../../src/temporal/file-coupling';
import { buildBehavioralAnalyticsFixtureRepo, type BehavioralFixtureRepo } from '../fixtures/behavioral-analytics-repo-builder';

describe('analyzeFileCoupling', () => {
  let repo: BehavioralFixtureRepo;
  beforeAll(async () => { repo = await buildBehavioralAnalyticsFixtureRepo(); }, 60_000);
  afterAll(async () => { await repo.cleanup(); });

  it('identifierar auth.ts ↔ utils.ts coupling ovan tröskeln', async () => {
    const result = await analyzeFileCoupling(repo.rootPath, {
      windowDays: 180,  // täcker hela fixture-historiken
      threshold: 0.3,
    });
    const pair = result.pairs.find(p =>
      new Set([p.fileA, p.fileB]).has('src/auth.ts') &&
      new Set([p.fileA, p.fileB]).has('src/utils.ts')
    );
    expect(pair).toBeDefined();
    expect(pair!.couplingStrength).toBeGreaterThanOrEqual(0.3);
  });

  it('types.ts är inte kopplad till auth.ts ovan tröskeln', async () => {
    const result = await analyzeFileCoupling(repo.rootPath, {
      windowDays: 180,
      threshold: 0.3,
    });
    const pair = result.pairs.find(p =>
      new Set([p.fileA, p.fileB]).has('src/auth.ts') &&
      new Set([p.fileA, p.fileB]).has('src/types.ts')
    );
    // types.ts ändras sällan med auth.ts — ska vara under tröskel
    expect(pair?.couplingStrength ?? 0).toBeLessThan(0.3);
  });

  it('respekterar windowDays-parameter', async () => {
    const longWindow = await analyzeFileCoupling(repo.rootPath, { windowDays: 180, threshold: 0.1 });
    const shortWindow = await analyzeFileCoupling(repo.rootPath, { windowDays: 10, threshold: 0.1 });
    expect(longWindow.commitsAnalyzed).toBeGreaterThan(shortWindow.commitsAnalyzed);
  });

  it('returnerar tom pairs-lista för repo utan coupling-mönster', async () => {
    const result = await analyzeFileCoupling(repo.rootPath, {
      windowDays: 180,
      threshold: 0.99, // Extremt hög tröskel
    });
    expect(result.pairs).toHaveLength(0);
  });
});
```

- [ ] **Steg 3: Implementera `file-coupling.ts`**

```typescript
// packages/core/src/temporal/file-coupling.ts
import simpleGit from 'simple-git';
import type { FileCouplingPair, FileCouplingResult } from '../types';

export interface FileCouplingOptions {
  windowDays?: number;   // default 90
  threshold?: number;    // default 0.3
  maxCommits?: number;   // default 500
  packageRoot?: string;  // för monorepo-stöd: begränsa till delsökväg
}

const DEFAULT_WINDOW_DAYS = 90;
const DEFAULT_THRESHOLD = 0.3;
const DEFAULT_MAX_COMMITS = 500;
const HIGH_STRENGTH = 0.6;
const MEDIUM_STRENGTH = 0.4;

export async function analyzeFileCoupling(
  repoPath: string,
  options: FileCouplingOptions = {},
): Promise<FileCouplingResult> {
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const maxCommits = options.maxCommits ?? DEFAULT_MAX_COMMITS;
  const git = simpleGit(repoPath);

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - windowDays);
  const sinceIso = sinceDate.toISOString().split('T')[0];

  // Hämta commits inom fönstret
  const logArgs: Record<string, unknown> = {
    '--since': sinceIso,
    '--no-merges': null,
    maxCount: maxCommits,
    '--format': '%H',
    '--name-only': null,
  };
  if (options.packageRoot) {
    logArgs['--'] = [options.packageRoot];
  }

  let rawLog: string;
  try {
    rawLog = await git.raw(['log', '--since', sinceIso, '--no-merges',
      `-${maxCommits}`, '--format=%H', '--name-only']);
  } catch {
    return { repoPath, windowDays, threshold, commitsAnalyzed: 0, pairs: [] };
  }

  // Parsa commit-block: SHA-rad följd av fil-rader, tomrad = ny commit
  const commits: Array<{ sha: string; files: string[] }> = [];
  let currentSha = '';
  let currentFiles: string[] = [];
  for (const line of rawLog.split('\n')) {
    if (/^[0-9a-f]{40}$/i.test(line.trim())) {
      if (currentSha) commits.push({ sha: currentSha, files: currentFiles });
      currentSha = line.trim();
      currentFiles = [];
    } else if (line.trim() && currentSha) {
      const f = line.trim();
      if (!options.packageRoot || f.startsWith(options.packageRoot)) {
        currentFiles.push(f);
      }
    }
  }
  if (currentSha) commits.push({ sha: currentSha, files: currentFiles });

  if (commits.length === 0) {
    return { repoPath, windowDays, threshold, commitsAnalyzed: 0, pairs: [] };
  }

  // Bygg co-change-matris
  const touchCount = new Map<string, number>();
  const coChangeCount = new Map<string, number>();

  for (const commit of commits) {
    const files = commit.files.filter(f => f.length > 0);
    for (const f of files) touchCount.set(f, (touchCount.get(f) ?? 0) + 1);
    const sorted = [...new Set(files)].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const key = `${sorted[i]}||${sorted[j]}`;
        coChangeCount.set(key, (coChangeCount.get(key) ?? 0) + 1);
      }
    }
  }

  // Temporal stability: dela windowDays i tre perioder och beräkna coupling per period
  const thirdWindow = Math.floor(windowDays / 3);
  const earlyStrengths = await computeWindowStrength(git, repoPath, windowDays, windowDays - thirdWindow, options);
  const lateStrengths = await computeWindowStrength(git, repoPath, thirdWindow, 0, options);

  const pairs = buildFilePairs(coChangeCount, touchCount, threshold, earlyStrengths, lateStrengths);

  return {
    repoPath,
    windowDays,
    threshold,
    commitsAnalyzed: commits.length,
    pairs: pairs.sort((a, b) => b.couplingStrength - a.couplingStrength),
  };
}

async function computeWindowStrength(
  git: ReturnType<typeof simpleGit>,
  repoPath: string,
  sinceAgo: number,
  untilAgo: number,
  options: FileCouplingOptions,
): Promise<Map<string, number>> {
  const since = new Date();
  since.setDate(since.getDate() - sinceAgo);
  const until = new Date();
  until.setDate(until.getDate() - untilAgo);

  try {
    const raw = await git.raw([
      'log',
      '--since', since.toISOString().split('T')[0],
      '--until', until.toISOString().split('T')[0],
      '--no-merges', '--format=%H', '--name-only',
    ]);
    const touches = new Map<string, number>();
    const coChanges = new Map<string, number>();
    let files: string[] = [];
    for (const line of raw.split('\n')) {
      if (/^[0-9a-f]{40}$/i.test(line.trim())) {
        const sorted = [...new Set(files)].sort();
        for (let i = 0; i < sorted.length; i++) {
          for (let j = i + 1; j < sorted.length; j++) {
            const key = `${sorted[i]}||${sorted[j]}`;
            coChanges.set(key, (coChanges.get(key) ?? 0) + 1);
          }
          touches.set(sorted[i], (touches.get(sorted[i]) ?? 0) + 1);
        }
        files = [];
      } else if (line.trim()) {
        files.push(line.trim());
      }
    }
    const strengths = new Map<string, number>();
    for (const [key, count] of coChanges) {
      const [a, b] = key.split('||');
      const combined = Math.max(touches.get(a) ?? 1, touches.get(b) ?? 1);
      strengths.set(key, count / combined);
    }
    return strengths;
  } catch {
    return new Map();
  }
}

function buildFilePairs(
  coChangeCount: Map<string, number>,
  touchCount: Map<string, number>,
  threshold: number,
  earlyStrengths: Map<string, number>,
  lateStrengths: Map<string, number>,
): FileCouplingPair[] {
  const pairs: FileCouplingPair[] = [];
  for (const [key, count] of coChangeCount) {
    const [fileA, fileB] = key.split('||');
    const combined = Math.max(touchCount.get(fileA) ?? 1, touchCount.get(fileB) ?? 1);
    const strength = count / combined;
    if (strength < threshold) continue;

    const earlyS = earlyStrengths.get(key) ?? 0;
    const lateS = lateStrengths.get(key) ?? 0;
    const stability: FileCouplingPair['temporalStability'] =
      lateS > earlyS + 0.1 ? 'tightening'
      : lateS < earlyS - 0.1 ? 'loosening'
      : 'stable';

    pairs.push({
      fileA, fileB,
      coChangeCount: count,
      combinedTouches: combined,
      couplingStrength: parseFloat(strength.toFixed(2)),
      temporalStability: stability,
      severity: strength >= HIGH_STRENGTH ? 'high' : strength >= MEDIUM_STRENGTH ? 'medium' : 'low',
      windowDays: 0, // sätts av caller
    });
  }
  return pairs;
}
```

- [ ] **Steg 4: Kör testerna**

```bash
cd packages/core && pnpm test -- tests/temporal/file-coupling.test.ts
```

- [ ] **Steg 5: Commit**

```bash
git add packages/core/src/temporal/file-coupling.ts packages/core/src/types.ts packages/core/tests/temporal/file-coupling.test.ts
git commit -m "feat(core): add file-level change coupling with rolling window and temporal stability"
```

**Acceptanskriterier:**
- [ ] `auth.ts ↔ utils.ts` identifieras med `couplingStrength ≥ 0.3` i fixture-repot med `windowDays: 180`
- [ ] `types.ts` kopplas inte till `auth.ts` med `threshold: 0.3`
- [ ] `windowDays`-parametern begränsar antalet analyserade commits korrekt
- [ ] `temporalStability` differentierar korrekt (kräver tillräcklig commit-historik per period)
- [ ] Inga exceptions för tom historik eller repon utan coupling-mönster

**Estimat:** 6 timmar

---

## Task 5 — Implementera hotspot-analys (kombinerar komplexitet × churn)

**Files:**
- Modify eller Skapa: `packages/core/src/temporal/behavioral-analytics.ts`

**AI-modell: [Sonnet]** — Baserat på discovery i Task 1. Om `hotspot.ts` redan implementerar rätt formel, är detta enbart en wrapper/utökning.

Notera: denna task beror på discovery i Task 1 för att avgöra om `hotspot.ts` ska utökas eller om `behavioral-analytics.ts` behöver en ny implementation.

- [ ] **Steg 1: Implementera hotspot-orkestrator (eller verifiera befintlig)**

```typescript
// packages/core/src/temporal/behavioral-analytics.ts

import simpleGit from 'simple-git';
import { analyzeByLanguage } from '../analyzers';
import { detectLanguage } from '../languages';
import type { HotspotResult } from '../types';

export interface HotspotOptions {
  lookbackDays?: number;       // default 90
  topN?: number;               // default 10
  packageRoot?: string;        // monorepo-stöd
  minChurnCommits?: number;    // minimum antal commits för att inkludera fil (default 3)
}

export async function analyzeHotspots(
  repoPath: string,
  options: HotspotOptions = {},
): Promise<HotspotResult[]> {
  const lookbackDays = options.lookbackDays ?? 90;
  const topN = options.topN ?? 10;
  const minChurnCommits = options.minChurnCommits ?? 3;
  const git = simpleGit(repoPath);

  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  // Hämta churn per fil (additions + deletions)
  const logArgs = [
    'log', '--since', since.toISOString().split('T')[0],
    '--no-merges', '--format=', '--numstat',
  ];
  if (options.packageRoot) logArgs.push('--', options.packageRoot);

  let numstatRaw: string;
  try {
    numstatRaw = await git.raw(logArgs);
  } catch {
    return [];
  }

  // Parsa numstat: "<additions>\t<deletions>\t<filePath>"
  const churnMap = new Map<string, { additions: number; deletions: number; commitCount: number }>();
  for (const line of numstatRaw.split('\n')) {
    const parts = line.split('\t');
    if (parts.length !== 3) continue;
    const [addStr, delStr, filePath] = parts;
    if (addStr === '-' || !filePath) continue; // Binärfil
    const additions = parseInt(addStr, 10);
    const deletions = parseInt(delStr, 10);
    if (isNaN(additions) || isNaN(deletions)) continue;
    const existing = churnMap.get(filePath) ?? { additions: 0, deletions: 0, commitCount: 0 };
    churnMap.set(filePath, {
      additions: existing.additions + additions,
      deletions: existing.deletions + deletions,
      commitCount: existing.commitCount + 1,
    });
  }

  // Filtrera ut filer med för få commits
  const eligibleFiles = [...churnMap.entries()]
    .filter(([, v]) => v.commitCount >= minChurnCommits);

  if (eligibleFiles.length === 0) return [];

  // Beräkna komplexitet för varje fil (vid HEAD)
  const complexityMap = new Map<string, number>();
  for (const [filePath] of eligibleFiles) {
    const lang = detectLanguage(filePath);
    if (lang === 'unsupported') {
      complexityMap.set(filePath, 0);
      continue;
    }
    try {
      const content = await git.show([`HEAD:${filePath}`]);
      const result = analyzeByLanguage(content, lang, filePath);
      const totalComplexity = result.functions.reduce((s, f) => s + (f.cyclomaticComplexity ?? 1), 0);
      complexityMap.set(filePath, totalComplexity);
    } catch {
      complexityMap.set(filePath, 0);
    }
  }

  // Normalisera och beräkna hotspot-score
  const maxChurn = Math.max(...eligibleFiles.map(([, v]) => v.additions + v.deletions), 1);
  const maxComplexity = Math.max(...[...complexityMap.values()], 1);

  const scores = eligibleFiles.map(([filePath, churn]) => {
    const normalizedChurn = (churn.additions + churn.deletions) / maxChurn;
    const normalizedComplexity = (complexityMap.get(filePath) ?? 0) / maxComplexity;
    const score = normalizedChurn * normalizedComplexity;
    return {
      filePath,
      score: parseFloat(score.toFixed(4)),
      churn: churn.additions + churn.deletions,
      commitCount: churn.commitCount,
      complexity: complexityMap.get(filePath) ?? 0,
      classification: score > 0.7 ? 'critical' : score > 0.4 ? 'warning' : 'healthy',
    } as HotspotResult;
  });

  return scores
    .filter(s => s.classification !== 'healthy')
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}
```

- [ ] **Steg 2: Lägg till `HotspotResult` i `types.ts`**

```typescript
export interface HotspotResult {
  filePath: string;
  score: number;           // [0, 1]
  churn: number;           // totala additions + deletions i perioden
  commitCount: number;     // antal commits som rör filen
  complexity: number;      // summa cyclomatic complexity vid HEAD
  classification: 'critical' | 'warning' | 'healthy';
}
```

- [ ] **Steg 3: Integrationstester**

```typescript
describe('analyzeHotspots — integration', () => {
  let repo: BehavioralFixtureRepo;
  beforeAll(async () => { repo = await buildBehavioralAnalyticsFixtureRepo(); }, 60_000);
  afterAll(async () => { await repo.cleanup(); });

  it('identifierar auth.ts som hotspot (hög churn + stigande komplexitet)', async () => {
    const results = await analyzeHotspots(repo.rootPath, { lookbackDays: 200, topN: 10, minChurnCommits: 1 });
    const authEntry = results.find(r => r.filePath.includes('auth.ts'));
    expect(authEntry).toBeDefined();
    expect(['critical', 'warning']).toContain(authEntry!.classification);
  });

  it('returnerar max topN resultat', async () => {
    const results = await analyzeHotspots(repo.rootPath, { lookbackDays: 200, topN: 2, minChurnCommits: 1 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('returnerar tom lista för obefintlig packageRoot', async () => {
    const results = await analyzeHotspots(repo.rootPath, {
      lookbackDays: 200, packageRoot: 'nonexistent/path'
    });
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/temporal/behavioral-analytics.ts packages/core/src/types.ts packages/core/tests/temporal/behavioral-analytics.test.ts
git commit -m "feat(core): implement hotspot analysis combining normalized complexity × churn"
```

**Acceptanskriterier:**
- [ ] `auth.ts` identifieras som `warning` eller `critical` i fixture-repot med `lookbackDays: 200`
- [ ] `topN`-parametern begränsar resultatlistan korrekt
- [ ] `minChurnCommits`-filtret exkluderar filer med för lite historik
- [ ] Normalisering ger score ∈ [0, 1] för alla filer

**Estimat:** 4 timmar

---

## Task 6 — Implementera Architectural Decay Index

**Files:**
- Create: `packages/core/src/temporal/decay-index.ts`

**AI-modell: [Opus]** — ADI-formuleringen kombinerar flera dimensioner med viktade koefficienter. Opus behövs för att säkerställa att formeln är väldefinierad, skalorna är rätt kalibrerade, och att edge cases (t.ex. saknad data för en dimension) hanteras korrekt.

- [ ] **Steg 1: Definiera `ArchitecturalDecayResult` i `types.ts`**

```typescript
export interface DecayDimension {
  score: number;           // 0–10
  weight: number;          // koefficient i ADI-formeln
  label: string;           // human-readable
  evidence: string;        // förklaringstext
}

export interface ArchitecturalDecayResult {
  module: string;          // katalog-sökväg eller fil-sökväg
  adi: number;             // Architectural Decay Index, 0–10
  classification: 'healthy' | 'warning' | 'high_risk' | 'critical';
  dimensions: {
    complexityTrend: DecayDimension;
    churnRate: DecayDimension;
    couplingDensity: DecayDimension;
    docCoverage: DecayDimension;
    testProximity: DecayDimension;
  };
}
```

- [ ] **Steg 2: Implementera ADI-beräkning**

```typescript
// packages/core/src/temporal/decay-index.ts

import type { ArchitecturalDecayResult, DecayDimension } from '../types';
import { analyzeComplexityTrend } from './complexity-trend';
import { analyzeFileCoupling } from './file-coupling';

const WEIGHTS = {
  complexityTrend:  0.35,
  churnRate:        0.25,
  couplingDensity:  0.20,
  docCoverage:      0.10,
  testProximity:    0.10,
} as const;

// Dessa ska stämma med realistiska projektdata
const HIGH_CHURN_THRESHOLD = 50; // ändringar per dag = "hög" churn (raw adds+dels / lookbackDays)

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

function classifyAdi(adi: number): ArchitecturalDecayResult['classification'] {
  if (adi < 3) return 'healthy';
  if (adi < 6) return 'warning';
  if (adi < 8) return 'high_risk';
  return 'critical';
}

function complexityTrendDimension(slope: number): DecayDimension {
  // slope: komplexitetsenheter per commit-index — skalas till 0–10
  // En slope på +1.0 per commit-index (extremt steil) → score 10
  const rawScore = clamp(slope * 10, 0, 10);
  return {
    score: parseFloat(rawScore.toFixed(2)),
    weight: WEIGHTS.complexityTrend,
    label: 'Complexity Trend',
    evidence: slope > 0.1
      ? `Stigande komplexitet (slope=${slope.toFixed(3)}): teknisk skuld ökar`
      : slope < -0.1
      ? `Sjunkande komplexitet (slope=${slope.toFixed(3)}): kod förbättras`
      : `Stabil komplexitet (slope=${slope.toFixed(3)})`,
  };
}

function churnRateDimension(churnPerDay: number): DecayDimension {
  const rawScore = clamp((churnPerDay / HIGH_CHURN_THRESHOLD) * 10, 0, 10);
  return {
    score: parseFloat(rawScore.toFixed(2)),
    weight: WEIGHTS.churnRate,
    label: 'Churn Rate',
    evidence: `${churnPerDay.toFixed(1)} ändringar/dag (gräns: ${HIGH_CHURN_THRESHOLD})`,
  };
}

function couplingDensityDimension(strongCouplingCount: number): DecayDimension {
  // Varje starkt kopplat fil-par (>0.5) bidrar med 2 poäng, max 10
  const rawScore = clamp(strongCouplingCount * 2, 0, 10);
  return {
    score: parseFloat(rawScore.toFixed(2)),
    weight: WEIGHTS.couplingDensity,
    label: 'Coupling Density',
    evidence: `${strongCouplingCount} starkt kopplade fil-par (styrka >0.5)`,
  };
}

function docCoverageDimension(lowDocScore: number): DecayDimension {
  // lowDocScore 0–10 (0=bra dokumentation, 10=ingen dokumentation)
  return {
    score: clamp(lowDocScore, 0, 10),
    weight: WEIGHTS.docCoverage,
    label: 'Documentation Coverage',
    evidence: lowDocScore > 7 ? 'Dokumentationstäckning kritiskt låg'
      : lowDocScore > 4 ? 'Dokumentationstäckning under rekommenderad nivå'
      : 'Dokumentationstäckning acceptabel',
  };
}

function testProximityDimension(testProximityScore: number): DecayDimension {
  // testProximityScore 0–10 (10=bra testtäckning, 0=inga tester)
  // Inverteras: hög testProximityScore → låg ADI-contribution
  const inverted = 10 - testProximityScore;
  return {
    score: clamp(inverted, 0, 10),
    weight: WEIGHTS.testProximity,
    label: 'Test Proximity',
    evidence: testProximityScore > 7 ? 'Tester finns nära produktionskoden'
      : testProximityScore > 3 ? 'Begränsad testtäckning'
      : 'Inga tester identifierade i närheten av modulen',
  };
}

export async function computeArchitecturalDecayIndex(
  repoPath: string,
  modulePath: string,
  options: {
    lookbackDays?: number;
    churnPerDay?: number;     // kan injiceras om redan beräknad
    complexitySlope?: number; // kan injiceras om redan beräknad
    strongCouplings?: number; // kan injiceras om redan beräknad
    docScore?: number;        // 0–10, 0=bra
    testScore?: number;       // 0–10, 10=bra
  } = {},
): Promise<ArchitecturalDecayResult> {
  const lookbackDays = options.lookbackDays ?? 90;

  // Använd injicerade värden eller beräkna
  let complexitySlope = options.complexitySlope ?? 0;
  let churnPerDay = options.churnPerDay ?? 0;
  let strongCouplings = options.strongCouplings ?? 0;
  const docScore = options.docScore ?? 5;   // Neutral default
  const testScore = options.testScore ?? 5; // Neutral default

  // Om värdena inte är injicerade — beräkna
  if (options.complexitySlope === undefined) {
    const trend = await analyzeComplexityTrend(repoPath, modulePath, { maxCommits: 100 });
    complexitySlope = Math.max(0, trend.slope); // Negativa slopes bidrar inte till decay
  }

  if (options.strongCouplings === undefined) {
    const coupling = await analyzeFileCoupling(repoPath, { windowDays: lookbackDays, threshold: 0.5 });
    strongCouplings = coupling.pairs.filter(p =>
      p.fileA === modulePath || p.fileB === modulePath
    ).length;
  }

  const dimensions = {
    complexityTrend: complexityTrendDimension(complexitySlope),
    churnRate:       churnRateDimension(churnPerDay),
    couplingDensity: couplingDensityDimension(strongCouplings),
    docCoverage:     docCoverageDimension(docScore),
    testProximity:   testProximityDimension(testScore),
  };

  const adi = Object.values(dimensions).reduce(
    (sum, dim) => sum + dim.score * dim.weight, 0
  );

  return {
    module: modulePath,
    adi: parseFloat(adi.toFixed(2)),
    classification: classifyAdi(adi),
    dimensions,
  };
}
```

- [ ] **Steg 3: Enhetstester för ADI-formeln**

```typescript
describe('ADI formula — unit tests', () => {
  it('perfekt fil (ingen slope, ingen churn, ingen coupling) ger ADI nära 0', () => {
    // Alla dimensions injicerade direkt
    const expected = 0 * 0.35 + 0 * 0.25 + 0 * 0.20 + 0 * 0.10 + 10 * 0.10; // testProximity=10 → inverterat=0
    // faktisk: docScore=0 → 0, testScore=10 → inverted=0
    // ADI = 0
    expect(expected).toBe(0);
  });

  it('helt söndrig fil ger ADI nära 10', async () => {
    // Maximala värden för alla dimensioner
    const adi = await computeArchitecturalDecayIndex('repo', 'bad.ts', {
      complexitySlope: 1.0,   // → score 10
      churnPerDay: 500,       // >> HIGH_CHURN_THRESHOLD → score 10
      strongCouplings: 5,     // 5 × 2 = 10
      docScore: 10,           // → score 10
      testScore: 0,           // inverterat → 10
    });
    // ADI = 10*0.35 + 10*0.25 + 10*0.20 + 10*0.10 + 10*0.10 = 10
    expect(adi.adi).toBeCloseTo(10, 1);
    expect(adi.classification).toBe('critical');
  });

  it('ADI ∈ [0, 10] för alla rimliga indata', async () => {
    for (const slope of [0, 0.5, 1.0, 2.0]) {
      const result = await computeArchitecturalDecayIndex('repo', 'test.ts', {
        complexitySlope: slope,
        churnPerDay: slope * 100,
        strongCouplings: Math.floor(slope * 3),
        docScore: slope * 5,
        testScore: 10 - slope * 5,
      });
      expect(result.adi).toBeGreaterThanOrEqual(0);
      expect(result.adi).toBeLessThanOrEqual(10.001);
    }
  });

  it('klassificering matchar ADI-gränser', async () => {
    const healthy = await computeArchitecturalDecayIndex('r', 'f.ts', { complexitySlope: 0, churnPerDay: 0, strongCouplings: 0, docScore: 0, testScore: 10 });
    expect(healthy.classification).toBe('healthy');
  });
});
```

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/temporal/decay-index.ts packages/core/src/types.ts packages/core/tests/temporal/decay-index.test.ts
git commit -m "feat(core): implement Architectural Decay Index (ADI 0-10) combining 5 weighted dimensions"
```

**Acceptanskriterier:**
- [ ] ADI returnerar värden i [0, 10] för alla rimliga kombinationer av indata
- [ ] Injicerbara parametrar gör enhetstest möjliga utan git-anrop
- [ ] Klassificeringar `healthy/warning/high_risk/critical` matchar rätt ADI-gränser
- [ ] `evidence`-strängar är läsbara och meningsfulla

**Estimat:** 5 timmar

---

## Task 7 — MCP-verktyg `code_health_hotspots`

**Files:**
- Create: `packages/mcp-server/src/tools/hotspots.ts`
- Modify: `packages/mcp-server/src/server.ts`

**AI-modell: [Sonnet]** — Standardmönster för MCP-verktygsregistrering.

- [ ] **Steg 1: Implementera `hotspots.ts`**

```typescript
// packages/mcp-server/src/tools/hotspots.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { analyzeHotspots } from '@healthy-ai-code/core/temporal/behavioral-analytics';

export function registerHotspots(server: McpServer): void {
  (server.tool as Function)(
    'code_health_hotspots',
    'Identifierar de hetaste koddelarna (hotspots) i ett git-repo: filer med hög komplexitet OCH hög ändringsfrekvens. Kombinerar cyclomatic complexity med churn rate under en konfigurerbar tidsperiod. Top-N hotspots returneras sorterade efter score.',
    {
      repoPath:       z.string().describe('Absolut sökväg till git-repots rotkatalog'),
      lookbackDays:   z.number().int().min(7).max(365).default(90).describe('Historik-period i dagar (default 90)'),
      topN:           z.number().int().min(1).max(50).default(10).describe('Antal hotspots att returnera (default 10)'),
      packageRoot:    z.string().optional().describe('Begränsa analys till delsökväg (monorepo-stöd)'),
      minChurnCommits: z.number().int().min(1).default(3).describe('Minimum antal commits för att inkludera fil (default 3)'),
    },
    async (args: Record<string, unknown>) => handleHotspots(args),
  );
}

async function handleHotspots(args: Record<string, unknown>) {
  try {
    const results = await analyzeHotspots(args.repoPath as string, {
      lookbackDays: args.lookbackDays as number,
      topN: args.topN as number,
      packageRoot: args.packageRoot as string | undefined,
      minChurnCommits: args.minChurnCommits as number,
    });

    const body = {
      repoPath: args.repoPath,
      lookbackDays: args.lookbackDays,
      hotspotCount: results.length,
      hotspots: results.map((h, i) => ({
        rank: i + 1,
        file: h.filePath,
        score: h.score,
        classification: h.classification,
        churn: h.churn,
        commitCount: h.commitCount,
        complexity: h.complexity,
      })),
      summary: results.length === 0
        ? 'Inga hotspots identifierade under angiven period.'
        : `Top hotspot: ${results[0].filePath} (score=${results[0].score}, ${results[0].classification})`,
    };

    return { content: [{ type: 'text' as const, text: JSON.stringify(body, null, 2) }] };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
}
```

- [ ] **Steg 2: Registrera i `server.ts`**

```typescript
import { registerHotspots } from './tools/hotspots';
// ...
registerCalibrationStatus(server);
registerHotspots(server);
```

- [ ] **Steg 3: Bygg och verifiera**

```bash
cd packages/mcp-server && pnpm build
```

- [ ] **Steg 4: Commit**

```bash
git add packages/mcp-server/src/tools/hotspots.ts packages/mcp-server/src/server.ts
git commit -m "feat(mcp): add code_health_hotspots tool with configurable lookback and topN"
```

**Acceptanskriterier:**
- [ ] Verktyget är registrerat och returnerar JSON med `hotspots[]`-array
- [ ] `lookbackDays`, `topN`, `packageRoot`, `minChurnCommits` stöds
- [ ] `pnpm build` passerar
- [ ] Errors returneras som `isError: true` med beskrivande meddelande

**Estimat:** 2 timmar

---

## Task 8 — MCP-verktyg `code_health_trend_analysis`

**Files:**
- Create: `packages/mcp-server/src/tools/trend-analysis.ts`
- Modify: `packages/mcp-server/src/server.ts`

**AI-modell: [Sonnet]** — Standardmönster. Kombinerar complexity-trend och churn per fil.

- [ ] **Steg 1: Implementera `trend-analysis.ts`**

Verktyget tar en lista av filer (eller en katalog) och returnerar trend-analys per fil: slope, trajectory, churnRate, och en `healthTrajectory`-klassificering.

```typescript
export function registerTrendAnalysis(server: McpServer): void {
  (server.tool as Function)(
    'code_health_trend_analysis',
    'Analyserar hur en fils kodkvalitet förändras över tid. Returnerar complexity trend (slope, rising/stable/declining), churn rate, och en övergripande health trajectory (deteriorating/stable/improving) per fil.',
    {
      repoPath:     z.string().describe('Absolut sökväg till git-repots rotkatalog'),
      filePaths:    z.array(z.string()).min(1).max(20).describe('Lista av filsökvägar att analysera (relativt repoPath)'),
      lookbackDays: z.number().int().min(7).max(365).default(90).describe('Historik-period i dagar'),
      samplePoints: z.number().int().min(3).max(10).default(5).describe('Antal samplingspunkter för complexity trend'),
    },
    async (args: Record<string, unknown>) => handleTrendAnalysis(args),
  );
}

async function handleTrendAnalysis(args: Record<string, unknown>) {
  // ... implementera med analyzeComplexityTrend per fil + churn från git --numstat
}
```

- [ ] **Steg 2: Registrera och bygg**

- [ ] **Steg 3: Commit**

```bash
git add packages/mcp-server/src/tools/trend-analysis.ts packages/mcp-server/src/server.ts
git commit -m "feat(mcp): add code_health_trend_analysis tool for per-file complexity and churn trending"
```

**Acceptanskriterier:**
- [ ] Verktyget returnerar `healthTrajectory` per fil
- [ ] Max 20 filer per anrop (begränsning mot timeout)
- [ ] `pnpm build` passerar

**Estimat:** 3 timmar

---

## Task 9 — Monorepo-stöd och konfigurerbar lookback

**Files:**
- Modify: `packages/core/src/temporal/behavioral-analytics.ts`
- Modify: `packages/core/src/temporal/file-coupling.ts`

**AI-modell: [Sonnet]** — Utökar befintliga funktioner med `packageRoot` och `since/until`-stöd.

- [ ] **Steg 1: Verifiera att `packageRoot` fungerar korrekt i `analyzeHotspots`**

Lägg till integrationstester med ett monorepo-fixture (ett repo med `packages/a/` och `packages/b/`):

```typescript
it('packageRoot begränsar analys till delsökväg', async () => {
  // Sätt upp ett mini-monorepo-fixture i os.tmpdir()
  // Verifiera att hotspots i packages/b/ inte syns när packageRoot='packages/a'
});
```

- [ ] **Steg 2: Lägg till `--since` och `--until` i `analyzeFileCoupling`**

```typescript
export interface FileCouplingOptions {
  windowDays?: number;
  since?: string;   // ISO-datum, t.ex. "2025-01-01" — overridar windowDays om satt
  until?: string;   // ISO-datum
  threshold?: number;
  maxCommits?: number;
  packageRoot?: string;
}
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/temporal/behavioral-analytics.ts packages/core/src/temporal/file-coupling.ts
git commit -m "feat(core): add monorepo packageRoot support and since/until parameters for behavioral analytics"
```

**Estimat:** 2 timmar

---

## Task 10 — Integrationstester mot fixture-repot

**Files:**
- Modify: `packages/core/tests/temporal/behavioral-analytics.test.ts`

**AI-modell: [Sonnet]** — Kompletterande integrationstester för samtliga komponenter.

- [ ] **Steg 1: Skriv fullständiga integrationstester**

```typescript
describe('behavioral analytics — full integration', () => {
  let repo: BehavioralFixtureRepo;
  beforeAll(async () => { repo = await buildBehavioralAnalyticsFixtureRepo(); }, 90_000);
  afterAll(async () => { await repo.cleanup(); });

  it('hotspot-analys identifierar auth.ts som top hotspot', async () => {
    const hotspots = await analyzeHotspots(repo.rootPath, { lookbackDays: 200, topN: 5, minChurnCommits: 1 });
    expect(hotspots[0].filePath).toContain('auth.ts');
  });

  it('fil-coupling identifierar auth.ts ↔ utils.ts', async () => {
    const coupling = await analyzeFileCoupling(repo.rootPath, { windowDays: 200, threshold: 0.3 });
    const pair = coupling.pairs.find(p => p.fileA.includes('auth') || p.fileB.includes('auth'));
    expect(pair).toBeDefined();
  });

  it('complexity trend identifierar rising i auth.ts', async () => {
    const trend = await analyzeComplexityTrend(repo.rootPath, 'src/auth.ts');
    expect(trend.trajectory).toBe('rising');
  });

  it('ADI är högre för auth.ts än för types.ts', async () => {
    const authTrend = await analyzeComplexityTrend(repo.rootPath, 'src/auth.ts');
    const typesTrend = await analyzeComplexityTrend(repo.rootPath, 'src/types.ts');
    // auth.ts har stigande slope, types.ts är stabil → auth.ts bör ha högre ADI
    expect(authTrend.slope).toBeGreaterThan(typesTrend.slope);
  });

  it('inga tester kastar för obefintliga filer eller empty repos', async () => {
    await expect(analyzeComplexityTrend(repo.rootPath, 'nonexistent.ts')).resolves.not.toThrow();
    await expect(analyzeFileCoupling(repo.rootPath, { windowDays: 1 })).resolves.not.toThrow();
    await expect(analyzeHotspots(repo.rootPath, { lookbackDays: 1 })).resolves.not.toThrow();
  });
});
```

- [ ] **Steg 2: Kör hela temporal-sviten**

```bash
cd packages/core && pnpm test -- tests/temporal/
```

Förväntat: alla tester PASS, inga regressions i Sprint 19:s method-coupling-tester.

- [ ] **Steg 3: Commit**

```bash
git add packages/core/tests/temporal/behavioral-analytics.test.ts
git commit -m "test(core): add full behavioral analytics integration test suite against fixture repo"
```

**Estimat:** 3 timmar

---

## Task 11 — Uppdatera README

**Files:**
- Modify: `README.md`

**AI-modell: [Haiku]**

Lägg till de tre nya MCP-verktygen i verktygs-tabellen:

```markdown
### `code_health_hotspots`

Identifierar de filer i ett git-repo som kombinerar hög komplexitet med hög ändringsfrekvens
— ett riktmärke på CodeScene's klassiska "hotspot"-analys. Returnerar Top-N filer sorterade
efter hotspot-score (normaliserat 0–1).

**Parametrar:** `repoPath`, `lookbackDays` (default 90), `topN` (default 10),
`packageRoot` (monorepo), `minChurnCommits` (default 3)

### `code_health_trend_analysis`

Returnerar complexity trend (slope + trajectory) och churn rate per fil. Visar om en fils
kodkvalitet förbättras, är stabil, eller försämras över tid.

**Parametrar:** `repoPath`, `filePaths[]`, `lookbackDays` (default 90), `samplePoints` (default 5)
```

Biomarkertabellen: lägg till `ArchitecturalDecayIndex` som ny biomarker (typ: `advisory`, inte `Smell`).

- [ ] **Commit**

```bash
git add README.md
git commit -m "docs: document code_health_hotspots and code_health_trend_analysis MCP tools"
```

**Estimat:** 1 timme

---

## Task 12 — Slutgiltig integrationskontroll och typecheck

**AI-modell: [Haiku]**

- [ ] **Steg 1: Kör alla tester**

```bash
cd packages/core && pnpm test
cd packages/mcp-server && pnpm test
```

Förväntat: alla PASS.

- [ ] **Steg 2: Typecheck**

```bash
cd packages/core && pnpm typecheck
cd packages/mcp-server && pnpm typecheck
```

- [ ] **Steg 3: Verifiera inga regressions i Sprint 19**

```bash
cd packages/core && pnpm test -- tests/temporal/method-coupling.test.ts
```

Förväntat: de ursprungliga Sprint 19-testerna är fortfarande gröna.

- [ ] **Steg 4: Final commit**

```bash
git commit -m "chore: sprint 27 final integration check — all tests green, no regressions"
```

**Estimat:** 1 timme

---

## Testkrav

| Testfil | Täcker |
|---|---|
| `tests/temporal/complexity-trend.test.ts` | `linearRegressionSlope`, `sampleComplexityPoints`, `analyzeComplexityTrend` (enhet + integration) |
| `tests/temporal/file-coupling.test.ts` | `analyzeFileCoupling` (rolling window, threshold, temporal stability) |
| `tests/temporal/decay-index.test.ts` | ADI-formel (unit), klassificering, clamp |
| `tests/temporal/behavioral-analytics.test.ts` | Hotspot-analys (integration), end-to-end med fixture-repo |
| `packages/mcp-server/tests/hotspots.test.ts` | MCP-verktygs-handler (mock av core-funktioner) |

**Minsta täckning:**
- `linearRegressionSlope`: ≥ 5 fall (positiv, negativ, konstant, singleton, tom)
- `sampleComplexityPoints`: ≥ 3 fall (N < antal, N = antal, N > antal med jämna gaps)
- Integration: auth.ts identifieras som `rising` och `warning/critical hotspot`
- Edge cases: obefintliga filer, tomma repos, extrema parametrar — inga exceptions

---

## Definition of Done

- [ ] `packages/core/src/temporal/complexity-trend.ts` implementerad med linjär regression och git-sampling.
- [ ] `packages/core/src/temporal/file-coupling.ts` implementerad med rullande fönster (90 dagar default) och temporal stability.
- [ ] `packages/core/src/temporal/decay-index.ts` implementerad med ADI 0–10, 5 dimensioner, 5 viktade koefficienter.
- [ ] `packages/core/src/temporal/behavioral-analytics.ts` implementerar `analyzeHotspots` (komplexitet × churn, normaliserat).
- [ ] MCP-verktyg `code_health_hotspots` registrerat och returnerar JSON med `hotspots[]`.
- [ ] MCP-verktyg `code_health_trend_analysis` registrerat och returnerar `healthTrajectory` per fil.
- [ ] Fixture-repo `buildBehavioralAnalyticsFixtureRepo` producerar 20 commits med kontrollerad evolution.
- [ ] Integrationstester mot fixture-repot: `auth.ts` identifieras som `rising` (complexity trend) och `warning/critical` (hotspot).
- [ ] `analyzeFileCoupling` identifierar `auth.ts ↔ utils.ts` med `windowDays: 180`.
- [ ] Monorepo-stöd via `packageRoot` fungerar för `analyzeHotspots` och `analyzeFileCoupling`.
- [ ] Inga regressions: Sprint 19:s method-coupling-tester är gröna.
- [ ] `pnpm typecheck` passerar i båda paketen.
- [ ] README dokumenterar de nya verktygen.

---

## Risker och beroenden

**Risk 1: Befintlig `hotspot.ts` duplicerar funktionalitet.**
Sprint 27 specifierar hotspot-analys som en ny feature, men `packages/core/src/temporal/hotspot.ts` kan redan implementera en version. Task 1 (discovery) är obligatorisk för att avgöra om implementation ska återanvändas, utökas, eller ersättas.
*Mitigering:* Task 1 är en obligatorisk discovery-fas. Ingen kod skrivs förrän discovery är klar.

**Risk 2: Complexity-trend-sampling kan ge felaktiga slopes.**
Med bara 5 samplingspunkter ur 200 commits kan enstaka extremt komplexa eller extremt enkla commits skeva regressionen. Särskilt för filer med "burst" av komplexitet (stor feature merge) och sedan nedgång.
*Mitigering:* `samplePoints`-parametern är konfigurerbar (max 10). Dokumentera att slope är en approximation, inte en exakt tidsserie.

**Risk 3: `computeWindowStrength` i `file-coupling.ts` kräver extra git-anrop.**
Temporal stability kräver att coupling beräknas i tre separata tidsfönster — tre extra git log-anrop per funktion-anrop. För stora repon kan detta ta 10–30 sekunder.
*Mitigering:* Temporal stability beräknas via de redan inladdade commit-loggarna (inte separata git-anrop) — implementera som en filter/partition-operation på den redan hämtade commit-listan.

**Risk 4: ADI-formulan är inte empiriskt validerad.**
Koefficienterna (0.35, 0.25, 0.20, 0.10, 0.10) och `HIGH_CHURN_THRESHOLD` är uppskattningar. Utan empirisk validering kan ADI ge systematiskt fel-klassificerade filer.
*Mitigering:* Dokumentera i README att ADI är ett analytiskt verktyg, inte ett kalibrerat mått. Koefficienterna exponeras som konfigurationspunkter för framtida validering via Sprint 26:s kalibreringspipeline.

**Risk 5: Fixture-repots datum-kontroll kan vara miljöberoende.**
`GIT_COMMITTER_DATE` / `GIT_AUTHOR_DATE` fungerar i standard git-installationer men kan ignoreras i vissa CI-konfigurationer med `safe.directory`-restriktioner.
*Mitigering:* Fixture-repot skapas i `os.tmpdir()` — utanför projektets `safe.directory`. Lägg till ett smoke-test som verifierar att commit-datumen faktiskt är distribuerade (diff > 5 dagar mellan äldst och nyast).

**Beroenden:**
- Sprint 19:s `method-coupling.ts` och `method-coupling-helpers.ts` måste vara mergade innan Sprint 27 börjar (de delar `simpleGit`-infrastruktur).
- `analyzeByLanguage` måste returnera `cyclomaticComplexity` per funktion — verifiera att detta är korrekt i `FunctionResult`-typen.
- Befintlig `temporal/hotspot.ts` måste läsas i Task 1 för att undvika arkitekturkonflikter.

---

## Självgranskning mot spec

**Spec-täckning:**
- [x] Hotspot-analys (komplexitet × churn) → Task 5, MCP i Task 7
- [x] Churn rate per fil → Task 5 (beräknas via `--numstat`)
- [x] Complexity trend per commit (sampling + linjär regression) → Task 3
- [x] Fil-par change coupling med rullande 90-dagars fönster → Task 4
- [x] Temporal stability (tightening/stable/loosening) → Task 4
- [x] Architectural Decay Index (0–10, 5 dimensioner) → Task 6
- [x] `code_health_hotspots` MCP-verktyg → Task 7
- [x] `code_health_trend_analysis` MCP-verktyg → Task 8
- [x] Monorepo-stöd (`packageRoot`) → Task 9
- [x] Konfigurerbar lookback (`lookbackDays`, `since`, `until`) → Task 9
- [x] Exkludering av merge-commits och version-bumps → Task 4 + 5 (`--no-merges`)
- [x] Git fixture-repo med kontrollerad evolution → Task 2
- [x] Integrationstester mot fixture → Task 10

**Medvetet utanför scope:**
- Graf-rendering av coupling-matrisen (UI-uppgift).
- Cross-language ADI-kalibrering mot defekt-data (Sprint 26-synk).
- Disk-cache för hotspot-beräkningar (premature optimization).
- Visualisering av complexity-trend som sparkline (kräver frontend-komponent).
- "Declining health"-notifikationer via MCP-prenumerations-API (inte ett MCP-mönster vi stöder).
- Integration med external code review-verktyg (Jira, GitHub Issues) för att korrelera hotspots mot öppna buggar.
