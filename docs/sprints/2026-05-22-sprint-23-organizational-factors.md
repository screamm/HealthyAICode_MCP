# Sprint 23: Organisatoriska faktorer & Intent Debt

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementera organisatoriska code health-metrics drivna av git-historik: Bus Factor per modul (Shannon entropy-baserad kunskapsfordelning), Developer Congestion pa sprint-niva (aktiva parallella bidragsgivare per modul i ett kortare tidsfanster), Knowledge Loss Index (inaktiva bidragsgivares kod som fortfarande lever), Documentation Debt Index (korrelation mellan kognitiv komplexitet och dokumentationstavckning), och Intent Clarity Score (docstring/kommentar-ratio, typannoteringar, namnkvalitet). Nagra av dessa metrics finns delvis i Sprint 10 (KnowledgeLoss, DeveloperCongestion) men Sprint 23 bygger ut dem med Shannon entropy, per-sprint kongestion, inaktivitetsindex, och den helt nya Documentation Debt-dimensionen.

**Architecture:** Utvidgad temporal-modul: nya filer `packages/core/src/temporal/bus-factor.ts` (Shannon entropy-baserat), `packages/core/src/temporal/sprint-congestion.ts` (14-dagars tidsfanster), `packages/core/src/temporal/knowledge-loss-index.ts` (inaktivitets-ratio), `packages/core/src/analyzers/doc-debt.ts` (dokumentationsskuld), `packages/core/src/analyzers/intent-clarity.ts` (namnsattning och typklarhet). Tva nya MCP-verktyg: `code_health_bus_factor` och `code_health_knowledge_map` (utvidgad version av befintlig). Den befintliga `analyzeKnowledgeLoss` i `knowledge-loss.ts` andras INTE — nya verktyg laggs bredvid.

**Tech Stack:** TypeScript 5.x, simple-git 3.22 (befintlig), Vitest, pnpm workspaces

**Testkommando:** `cd packages/core && pnpm test` och `cd packages/mcp-server && pnpm test`

---

## Bakgrund och motivation

Sprint 10 implementerade fyra organisatoriska metrics: CodeChurn, TemporalCoupling, DeveloperCongestion och KnowledgeLoss. Det var en solid grund, men tre viktiga dimensioner saknas fortfarande:

**1. Shannon entropy for kunskapsfordelning (Bus Factor)**
Befintlig DOA-baserad KnowledgeLoss ar binär: antingen ar en person "overwhelmingly primary" (> 80% DOA) eller inte. Shannon entropy ger ett mer nyanserat matt. Entropy = 0 nar en person skrivit allt; entropy = max nar bidragen ar jamnt fordelade. Ett filobibliotek med entropy < 1.0 bits (nara 0) har hog risk — da ar kunskapen koncentrerad till en person oavsett hur DOA-utrakningen faller ut.

```
Shannon Entropy H(X) = -sum_i [p_i * log2(p_i)]
```
dar `p_i` = andel av commits fran bidragsgivare i. Normaliseras mot log2(antal bidragsgivare) for att fa ett varde i [0, 1].

**2. Developer Congestion pa sprint-niva**
Befintlig DeveloperCongestion anvander ett 12-mananers fonstret — alt for brett for att fanga "denna sprint riskerar merge-konflikter". Sprint 23 introducerar ett 14-dagars fonstret som matchar ett typiskt agilt sprint. Hog kongestion (>= 3 aktiva bidragsgivare pa samma fil under 14 dagar) ar en tidig varning for commit-konflikter.

**3. Knowledge Loss Index (inaktivitets-ratio)**
Befintlig KnowledgeLoss identifierar BUS_FACTOR-situationer i nuet. Knowledge Loss Index kvantifierar hur mycket kod som ar skriven av nu-inaktiva bidragsgivare (ingen commit de senaste 6 manaderna). Formula:
```
KLI(fil) = LOC_by_inactive / total_LOC_git_blame
```
Baseras pa `git blame --line-porcelain` kombinerat med `git log` for att avgora om en bidragsgivare ar aktiv.

**4. Documentation Debt Index**
Korrelerar kognitiv komplexitet med dokumentationstavckning per modul. En hog-komplex modul utan dokumentation ar kritisk risk — ny utvecklare kan inte forsta koden utan att korstudera hela grafen av beroenden. Beraknas som:
```
DDI(modul) = kognitiv_komplexitet_norm * (1 - docCoverage)
```

**5. Intent Clarity Score**
Ett sammansatt matt pa hur tydlig "intentionen" med koden ar:
- Docstring/kommentar-ratio per funktion
- Andel typade parametrar och returtyper (TypeScript/Python)
- Namnkvalitet (korts funktion-/variabelnamn som `x`, `tmp`, `data` ger laga poang)
Returnerar ett varde i [0, 1] dar 1 = maximalt klar intention.

---

## Varfor detta gor CodeScene unikt och hur vi replikerar det

CodeScene marknadsfor "Social Metrics" och "Knowledge Risk" som premiumfunktioner. Deras styrka ar just att de kombinerar git-historik med statisk analys for att fa organisatorisk intelligens — nagot som inga vanliga linters kan ge. Sprint 23 replikerar exakt denna klass av analys:

| CodeScene-funktion | Var implementation | Ny i Sprint 23? |
|---|---|---|
| Bus Factor (DOA) | `knowledge-loss.ts` (Sprint 10) | Utvidgas med Shannon entropy |
| Knowledge Loss | `knowledge-loss.ts` (Sprint 10) | Knowledge Loss INDEX (inaktivitets-ratio) ar ny |
| Developer Congestion | `developer-congestion.ts` (Sprint 10) | Sprint-niva (14 dagar) ar ny |
| Code Biomarkers | Hela Sprint 5-9 | — |
| Documentation Coverage | `typescript-smells.ts` LowDocCoverage (Sprint 5) | DDI (korrelation med komplexitet) ar ny |

---

## Filoverikt

| Fil | Andring |
|---|---|
| `packages/core/src/temporal/bus-factor.ts` | Ny — Shannon entropy-baserat bus factor per fil |
| `packages/core/src/temporal/sprint-congestion.ts` | Ny — 14-dagars developer congestion |
| `packages/core/src/temporal/knowledge-loss-index.ts` | Ny — inaktivitets-ratio via git blame |
| `packages/core/src/analyzers/doc-debt.ts` | Ny — Documentation Debt Index |
| `packages/core/src/analyzers/intent-clarity.ts` | Ny — Intent Clarity Score |
| `packages/core/src/types.ts` | Lagg till BusFactorResult, SprintCongestionResult, KnowledgeLossIndexResult, DocDebtResult, IntentClarityResult, samt 'DocumentationDebt' och 'IntentClarity' i SmellType |
| `packages/mcp-server/src/tools/bus-factor.ts` | Nytt MCP-verktyg `code_health_bus_factor` |
| `packages/mcp-server/src/tools/knowledge-map.ts` | Utvidga befintligt `code_health_knowledge_map` med nya metrics |
| `packages/mcp-server/src/server.ts` | Registrera `code_health_bus_factor` |
| `packages/core/tests/temporal/bus-factor.test.ts` | Ny — enhetstester for Shannon entropy och bus factor |
| `packages/core/tests/temporal/sprint-congestion.test.ts` | Ny — enhetstester for 14-dagars kongestion |
| `packages/core/tests/temporal/knowledge-loss-index.test.ts` | Ny — enhetstester for KLI |
| `packages/core/tests/analyzers/doc-debt.test.ts` | Ny — enhetstester for Documentation Debt Index |
| `packages/core/tests/analyzers/intent-clarity.test.ts` | Ny — enhetstester for Intent Clarity Score |

---

## Task 1 — Definiera nya typer i `types.ts` [Haiku]

**Files:**
- Modify: `packages/core/src/types.ts`

**Estimat:** 1.5 timmar

Lagg till alla nya resultattyper och utvidga SmellType. Dessa typer anvands av alla foljande tasks och maste vara pa plats forst.

- [ ] **Steg 1: Skriv minimalt kompileringstest**

Skapa ett minimalt test i `packages/core/tests/temporal/bus-factor.test.ts` som importerar `BusFactorResult` och verifierar att det kompilerar. Forvantad: FAIL tills types.ts andras.

- [ ] **Steg 2: Lagg till typerna**

```typescript
/** Shannon entropy-baserat bus factor for en fil. */
export interface BusFactorResult {
  filePath: string;
  /** Antal unika bidragsgivare med minst en commit. */
  uniqueContributors: number;
  /** Shannon entropy normaliserad mot log2(uniqueContributors). 0 = en person har allt, 1 = jamnt fordelat. */
  normalizedEntropy: number;
  /** Bus factor-estimat: minsta antalet personer vars bortgang leder till > 50% kunskapsforiust. */
  busFactorEstimate: number;
  /** Sant om normalizedEntropy < 0.3 (hog koncentration) eller busFactorEstimate = 1. */
  isAtRisk: boolean;
  /** Bidragsgivare med andel commits, sorterade fallande. */
  contributors: Array<{ email: string; commitShare: number }>;
  smell: Smell | null;
}

/** Developer Congestion under ett 14-dagars sprint-fanster. */
export interface SprintCongestionResult {
  filePath: string;
  /** Antal aktiva bidragsgivare (minst en commit under senaste 14 dagarna). */
  activeContributors: number;
  /** E-postadresser till aktiva bidragsgivare. */
  activeEmails: string[];
  /** Sant om activeContributors >= 3 (konfliktrisk). */
  isCongestedSprint: boolean;
  smell: Smell | null;
}

/** Knowledge Loss Index — andel kod skriven av nu-inaktiva bidragsgivare. */
export interface KnowledgeLossIndexResult {
  filePath: string;
  /** Andel rader (via git blame) skrivna av inaktiva bidragsgivare (ingen commit senaste 6 manader). */
  knowledgeLossRatio: number;
  /** Totalt antal rader analyserade via blame. */
  totalLines: number;
  /** Rader skrivna av inaktiva bidragsgivare. */
  inactiveLines: number;
  /** Sant om knowledgeLossRatio > 0.4 (> 40% av koden ar orphaned). */
  isOrphaned: boolean;
  smell: Smell | null;
}

/** Documentation Debt Index — korrelation mellan kognitiv komplexitet och dokumentationsbrist. */
export interface DocDebtResult {
  filePath: string;
  /** Kognitiv komplexitet normaliserad till [0, 1] (dividerad med max-threshold). */
  normalizedComplexity: number;
  /** Dokumentationstavckning i [0, 1] (andel funktioner med docstring/JSDoc). */
  docCoverage: number;
  /** DDI = normalizedComplexity * (1 - docCoverage). Hogt DDI = komplex + odokumenterad. */
  docDebtIndex: number;
  /** Severitet: high >= 0.60, medium >= 0.30, low > 0. */
  severity: 'high' | 'medium' | 'low' | 'none';
  smell: Smell | null;
}

/** Intent Clarity Score — hur tydlig kodintentionen ar. */
export interface IntentClarityResult {
  filePath: string;
  /** Andel funktioner med docstring eller JSDoc-kommentar. */
  docRatio: number;
  /** Andel typade parametrar och returtyper (for TypeScript/Python). */
  typeAnnotationRatio: number;
  /** Namnkvalitetsindex: 0 = inga korta/generiska namn, 1 = alla namn beskrivande. */
  nameQualityScore: number;
  /** Sammansatt Intent Clarity Score i [0, 1]. */
  intentClarityScore: number;
  /** Funktioner med problematiska namn (kortare an 3 tecken eller generiska som tmp/data/x). */
  poorlyNamedFunctions: string[];
  smell: Smell | null;
}
```

Lagg till `'DocumentationDebt'` och `'IntentClarity'` i SmellType-unionen.

- [ ] **Steg 3: Kör typkontroll**

```bash
cd packages/core && pnpm typecheck
```

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/types.ts packages/core/tests/temporal/bus-factor.test.ts
git commit -m "feat(core): add Sprint 23 types — BusFactorResult, SprintCongestion, DocDebt, IntentClarity"
```

**Acceptanskriterier:**
- Alla 5 nya typer kompilerar korrekt
- `'DocumentationDebt'` och `'IntentClarity'` ingar i SmellType
- Minimalt kompileringstest passerar

---

## Task 2 — Implementera Shannon entropy-baserat Bus Factor [Opus]

**Files:**
- Create: `packages/core/src/temporal/bus-factor.ts`
- Create: `packages/core/tests/temporal/bus-factor.test.ts`

**Estimat:** 4 timmar

Shannon entropy ger ett mer nyanserat matt pa kunskapskoncentration an DOA. For en fil dar en person gjort 90% av commits ar entropy nara 0 — hog risk. For en fil med 10 bidragsgivare som var gjort ~10% ar entropy nara 1 — lag risk.

Berakning:
1. Hamta alla commits for filen med `git log --format=%ae --follow -- filePath`
2. Berakna `commitShare[email] = commits_by_email / total_commits`
3. `H = -sum_i [p_i * log2(p_i)]` (om p_i = 0, bidra med 0)
4. `normalizedEntropy = H / log2(uniqueContributors)` (om uniqueContributors <= 1, returnera 0)
5. `busFactorEstimate`: sortera bidragsgivare fallande, rakna hur manga som behovs for att komma over 50% kumulativ andel
6. `isAtRisk = normalizedEntropy < 0.3 || busFactorEstimate === 1`

Smell-logik:
- `isAtRisk = true && busFactorEstimate === 1`: `severity: 'high'`
- `isAtRisk = true && busFactorEstimate > 1`: `severity: 'medium'`
- Annars: ingen smell

- [ ] **Steg 1: Skriv failande enhetstester (8 testfall)**

```typescript
describe('computeNormalizedEntropy', () => {
  it('returnerar 0 for en enda bidragsgivare (all entropy i en person)');
  it('returnerar 1.0 for tva bidragsgivare med exakt 50/50-delning');
  it('returnerar korrekt entropy for ojaemn delning (70/30)');
  it('returnerar 0 for tom bidragslista');
});

describe('analyzeBusFactor', () => {
  it('busFactorEstimate = 1 nar en person har > 50% av commits');
  it('busFactorEstimate = 2 nar tva personer behovs for > 50%');
  it('isAtRisk = true nar normalizedEntropy < 0.3');
  it('producerar hog-severity smell nar busFactorEstimate = 1 och isAtRisk = true');
});
```

Mocka `simpleGit` sa testerna inte beror pa git-binaren.

- [ ] **Steg 2: Implementera `bus-factor.ts`**

```typescript
import { simpleGit } from 'simple-git';
import type { BusFactorResult, Smell } from '../types';

const RISK_ENTROPY_THRESHOLD = 0.30;
const BUS_FACTOR_INACTIVITY_MONTHS = 6;

export async function analyzeBusFactor(
  repoPath: string,
  filePath: string,
): Promise<BusFactorResult>
```

Internt:
- `git log --format=%ae --follow -- filePath` -> rakna commits per email
- `computeNormalizedEntropy(commitCounts: Map<string, number>): number` (exportera for testbarhet)
- `computeBusFactorEstimate(sortedShares: number[]): number`

Exportera aven `computeNormalizedEntropy` som namngivet export for direkta enhetstester.

- [ ] **Steg 3: Kör testerna (PASS)**

```bash
cd packages/core && pnpm test -- tests/temporal/bus-factor.test.ts
```

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/temporal/bus-factor.ts \
        packages/core/tests/temporal/bus-factor.test.ts
git commit -m "feat(core): Shannon entropy-based bus factor analysis per file"
```

**Acceptanskriterier:**
- `computeNormalizedEntropy` returnerar 0.0 for enda bidragsgivare
- `computeNormalizedEntropy` returnerar 1.0 for exakt 50/50-delning
- `busFactorEstimate = 1` nar en person > 50% av commits
- `isAtRisk = true` nar normalizedEntropy < 0.3
- Hog-severity smell nar busFactorEstimate = 1
- Alla 8 testfall passerar

---

## Task 3 — Implementera Developer Congestion pa sprint-niva (14 dagar) [Sonnet]

**Files:**
- Create: `packages/core/src/temporal/sprint-congestion.ts`
- Create: `packages/core/tests/temporal/sprint-congestion.test.ts`

**Estimat:** 2.5 timmar

Den befintliga `analyzeDeveloperCongestion` i `developer-congestion.ts` anvander ett 12-mananers fonstret for att mata strukturell kongestion. Sprint 23 introducerar ett 14-dagars fonstret for att fanga pagar sprint-level merge-konfliktrisk — nagot som ar handlingsbart nu.

Skillnad mot befintlig implementation:
- Tidsfanster: 14 dagar istallet for 12 manader
- Semantik: "aktiva just nu" istallet for "bidragit nagonsin senaste aret"
- Threshold: >= 3 bidragsgivare (lagre an 12-mananers >= 5)

- [ ] **Steg 1: Skriv failande tester (6 testfall)**

```typescript
describe('analyzeSprintCongestion', () => {
  it('returnerar isCongestedSprint = false for 2 aktiva bidragsgivare');
  it('returnerar isCongestedSprint = true for 3 aktiva bidragsgivare');
  it('returnerar isCongestedSprint = true for 5 aktiva bidragsgivare');
  it('producerar medium-severity smell nar 3-4 bidragsgivare');
  it('producerar high-severity smell nar 5+ bidragsgivare');
  it('returnerar tomt resultat vid git-fel (graceful degradation)');
});
```

Mocka `simpleGit` att returnera olika antal unika e-postadresser.

- [ ] **Steg 2: Implementera `sprint-congestion.ts`**

```typescript
import { simpleGit } from 'simple-git';
import type { SprintCongestionResult, Smell } from '../types';

const SPRINT_DAYS = 14;
const CONGESTION_HIGH_THRESHOLD = 5;
const CONGESTION_MEDIUM_THRESHOLD = 3;

export async function analyzeSprintCongestion(
  repoPath: string,
  filePath: string,
): Promise<SprintCongestionResult> {
  try {
    const git = simpleGit(repoPath);
    const since = `${SPRINT_DAYS} days ago`;
    const output = await git.raw([
      'log', `--since=${since}`, '--format=%ae', '--', filePath,
    ]);
    const emails = [...new Set(output.split('\n').map(l => l.trim()).filter(Boolean))];
    const activeContributors = emails.length;
    const isCongestedSprint = activeContributors >= CONGESTION_MEDIUM_THRESHOLD;
    const smell = buildSprintCongestionSmell(filePath, activeContributors, emails);
    return { filePath, activeContributors, activeEmails: emails, isCongestedSprint, smell };
  } catch {
    return { filePath, activeContributors: 0, activeEmails: [], isCongestedSprint: false, smell: null };
  }
}

function buildSprintCongestionSmell(
  filePath: string, count: number, emails: string[],
): Smell | null {
  if (count < CONGESTION_MEDIUM_THRESHOLD) return null;
  const severity = count >= CONGESTION_HIGH_THRESHOLD ? 'high' : 'medium';
  return {
    type: 'DeveloperCongestion',
    severity,
    line: 1,
    description: `${count} aktiva bidragsgivare har andrat denna fil de senaste 14 dagarna (${emails.slice(0, 3).join(', ')}${emails.length > 3 ? '...' : ''}). Hog risk for merge-konflikter i pagaende sprint.`,
    suggestion: 'Koordinera med teamet vem som agar andringarna. Overvaeg att dela upp filen efter ansvarsomrade.',
  };
}
```

- [ ] **Steg 3: Kör testerna (PASS)**

```bash
cd packages/core && pnpm test -- tests/temporal/sprint-congestion.test.ts
```

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/temporal/sprint-congestion.ts \
        packages/core/tests/temporal/sprint-congestion.test.ts
git commit -m "feat(core): 14-day sprint-level developer congestion analysis"
```

**Acceptanskriterier:**
- 2 aktiva bidragsgivare: `isCongestedSprint = false`, ingen smell
- 3 aktiva: `isCongestedSprint = true`, medium severity
- 5+ aktiva: `isCongestedSprint = true`, high severity
- Graceful degradation vid git-fel
- Alla 6 testfall passerar

---

## Task 4 — Implementera Knowledge Loss Index via git blame [Opus]

**Files:**
- Create: `packages/core/src/temporal/knowledge-loss-index.ts`
- Create: `packages/core/tests/temporal/knowledge-loss-index.test.ts`

**Estimat:** 5 timmar

Den mest komplexa tasken i sprinten. Knowledge Loss Index kvantifierar hur stor andel av kodens rader ar skrivna av nu-inaktiva bidragsgivare, definierat som "ingen commit de senaste 6 manaderna". Anvander `git blame --line-porcelain` for att fa per-rad author-attribution.

`git blame --line-porcelain filePath` producerar ett format dar varje rad har metadata med `author-mail <email>` som ett av falten. Vi parsar detta for att fa `email -> radantal`. Sedan kollar vi `git log --since="6 months ago" --format=%ae` for att avgora vilka emails som ar aktiva.

```
KLI(fil) = rader_skrivna_av_inaktiva / totalt_antal_blame-rader
```

Viktigt: `git blame` kan vara langsamt pa stora filer. Begränsa till max 5 000 rader (ta de forsta 5 000 raderna av blame-output).

- [ ] **Steg 1: Skriv failande tester (7 testfall)**

```typescript
describe('parseBlameOutput', () => {
  it('extraherar korrekt email-till-radantal-mapping');
  it('hanterar tom blame-output');
  it('hanterar blame-output utan author-mail-faltet');
});

describe('analyzeKnowledgeLossIndex', () => {
  it('returnerar KLI = 1.0 nar alla rader ar skrivna av inaktiv bidragsgivare');
  it('returnerar KLI = 0.0 nar alla bidragsgivare ar aktiva');
  it('returnerar KLI korrekt for blandat scenario (50% inaktiv)');
  it('returnerar graceful result vid git-fel');
});
```

Mocka bade `git.raw(['blame', ...])` och `git.raw(['log', ...])` for att styra blame-output och aktiva bidragsgivare.

- [ ] **Steg 2: Implementera `knowledge-loss-index.ts`**

```typescript
import { simpleGit } from 'simple-git';
import type { KnowledgeLossIndexResult, Smell } from '../types';

const INACTIVITY_MONTHS = 6;
const MAX_BLAME_LINES = 5000;
const ORPHANED_THRESHOLD = 0.40;
const MEDIUM_THRESHOLD = 0.20;

export async function analyzeKnowledgeLossIndex(
  repoPath: string,
  filePath: string,
): Promise<KnowledgeLossIndexResult>
```

Steg:
1. Kör `git blame --line-porcelain -- filePath` och parsa `author-mail`-faltet for varje rad
2. Kör `git log --since="6 months ago" --format=%ae` for att fa aktiva emails (som ett Set)
3. Berakna `inactiveLines = sum(lines for email not in activeEmails)`
4. `knowledgeLossRatio = inactiveLines / totalLines`
5. Bygg smell om ratio > MEDIUM_THRESHOLD

Intern `parseBlameOutput(output: string): Map<string, number>` (exporteras for testbarhet):
- Dela pa '\n', leta efter rader som borjar med `author-mail `
- Extrahera email, rakna upp per email

- [ ] **Steg 3: Kör testerna (PASS)**

```bash
cd packages/core && pnpm test -- tests/temporal/knowledge-loss-index.test.ts
```

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/temporal/knowledge-loss-index.ts \
        packages/core/tests/temporal/knowledge-loss-index.test.ts
git commit -m "feat(core): Knowledge Loss Index via git blame — inactive contributor ratio"
```

**Acceptanskriterier:**
- `parseBlameOutput` extraherar korrekt email-radantal-mapping
- KLI = 1.0 nar alla rader tillhor inaktiv bidragsgivare
- KLI = 0.0 nar alla aktiva
- `isOrphaned = true` nar KLI > 0.40
- Graceful degradation vid git-fel
- Alla 7 testfall passerar

---

## Task 5 — Implementera Documentation Debt Index [Sonnet]

**Files:**
- Create: `packages/core/src/analyzers/doc-debt.ts`
- Create: `packages/core/tests/analyzers/doc-debt.test.ts`

**Estimat:** 3 timmar

Documentation Debt Index (DDI) kombinerar kognitiv komplexitet med dokumentationstavckning. En hog-komplex fil utan dokumentation ar kritisk risk — ny entwicklare kan inte forsta den utan att agna timmar.

```
DDI(modul) = normalizedComplexity * (1 - docCoverage)
```

dar:
- `normalizedComplexity = cognitiveComplexity / MAX_COGNITIVE_THRESHOLD` (klippt till 1.0)
  - MAX_COGNITIVE_THRESHOLD ar kalibrerat till 50 (5x standard-threshold pa 10)
- `docCoverage = funktioner_med_docstring / total_antal_funktioner`
  - "Docstring" = JSDoc `/** ... */`, Python `"""..."""`, eller enkla `//`-block direkt fore funktionen (minst 2 rader)

Integreringen med befintliga analysresultat:
- `analyzeByLanguage` returnerar `FunctionResult[]` med `line` och `length` — kan vi berakna cognitiveComplexity om vi anropar `analyzeByLanguage`
- `LowDocCoverage`-smellen fran Sprint 5 beraknar redan docCoverage — vi atervander denna logik

- [ ] **Steg 1: Skriv failande tester (7 testfall)**

```typescript
describe('computeDocCoverage', () => {
  it('returnerar 1.0 nar alla funktioner har JSDoc-kommentar');
  it('returnerar 0.0 nar inga funktioner har kommentar');
  it('returnerar 0.5 nar haften av funktionerna har JSDoc');
});

describe('analyzeDocDebt', () => {
  it('DDI = 0.0 nar docCoverage = 1.0 (fullt dokumenterad)');
  it('DDI ar hogt (> 0.5) nar komplex + odokumenterad');
  it('DDI ar lagt nar enkel + odokumenterad (complexity nara 0)');
  it('producerar high-severity smell nar DDI >= 0.60');
});
```

- [ ] **Steg 2: Implementera `doc-debt.ts`**

```typescript
import { analyzeByLanguage } from './index';
import { detectLanguage } from '../language-detect';
import type { DocDebtResult, Smell } from '../types';

const MAX_COGNITIVE_THRESHOLD = 50;
const HIGH_DDI_THRESHOLD = 0.60;
const MEDIUM_DDI_THRESHOLD = 0.30;

export function analyzeDocDebt(
  content: string,
  filePath: string,
): DocDebtResult

/** Beraknar andel funktioner med JSDoc/docstring-kommentar. */
export function computeDocCoverage(content: string, language: string): number
```

`computeDocCoverage` for TypeScript/JavaScript:
- Anvand regexp `/\/\*\*[\s\S]*?\*\//g` for att hitta JSDoc-block
- For varje match: kontrollera om det finns en `function`/`=>` inom 3 rader efter blocket
- `docCoverage = dokumenterade_funktioner / totalt_antal_funktioner`

`analyzeDocDebt`:
- Anropa `analyzeByLanguage` for att fa `FunctionResult[]` och cognitiveComplexity
- Anropa `computeDocCoverage`
- Berakna `normalizedComplexity = min(1, cognitiveComplexity / MAX_COGNITIVE_THRESHOLD)`
- `docDebtIndex = normalizedComplexity * (1 - docCoverage)`

- [ ] **Steg 3: Kör testerna (PASS)**

```bash
cd packages/core && pnpm test -- tests/analyzers/doc-debt.test.ts
```

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/analyzers/doc-debt.ts \
        packages/core/tests/analyzers/doc-debt.test.ts
git commit -m "feat(core): Documentation Debt Index — complexity * (1 - docCoverage)"
```

**Acceptanskriterier:**
- `computeDocCoverage` returnerar 1.0, 0.0 och 0.5 korrekt for de tre testfallen
- DDI = 0.0 for fullt dokumenterad fil
- DDI > 0.5 for komplex + odokumenterad fil
- High-severity smell nar DDI >= 0.60
- Alla 7 testfall passerar

---

## Task 6 — Implementera Intent Clarity Score [Sonnet]

**Files:**
- Create: `packages/core/src/analyzers/intent-clarity.ts`
- Create: `packages/core/tests/analyzers/intent-clarity.test.ts`

**Estimat:** 4 timmar

Intent Clarity Score ar ett sammansatt matt pa hur tydlig avsikten med koden ar for en laesare — kombinerar dokumentation, typannoteringar och namnkvalitet.

Komponenterna och deras vikt:
- `docRatio` (andel funktioner med docstring): vikt 0.40
- `typeAnnotationRatio` (andel typade parametrar + returtyper for TS/Python): vikt 0.35
- `nameQualityScore` (namnkvalitet): vikt 0.25

`nameQualityScore` beraknas sa:
- For varje funktion- och variabelnamn: kontrollera om det ar kortare an 3 tecken (undantag: `i`, `j`, `k` for loop-variabler ar OK), eller finns i lista over generiska namn (`data`, `tmp`, `temp`, `result`, `res`, `val`, `item`, `obj`, `foo`, `bar`, `x`, `y`, `n`, `s`)
- `poorNames = antal funktioner med darligt namn / totalt antal funktioner`
- `nameQualityScore = 1 - poorNames`

```
intentClarityScore = docRatio * 0.40 + typeAnnotationRatio * 0.35 + nameQualityScore * 0.25
```

- [ ] **Steg 1: Skriv failande tester (8 testfall)**

```typescript
describe('computeTypeAnnotationRatio', () => {
  it('returnerar 1.0 nar alla parametrar och returtyper ar annoterade (TypeScript)');
  it('returnerar 0.0 for JavaScript utan JSDoc type-annotations');
  it('hanterar blandad TypeScript (delvis typat)');
});

describe('computeNameQualityScore', () => {
  it('returnerar 1.0 nar inga generiska namn finns');
  it('returnerar laga varden nar funktioner heter "data", "tmp", "x"');
  it('godkanner enkelbokstavs loop-variabler i for-satser');
});

describe('analyzeIntentClarity', () => {
  it('producerar high-severity smell nar intentClarityScore < 0.40');
  it('returnerar korrekt sammansatt score for en TypeScript-fil med JSDoc');
});
```

- [ ] **Steg 2: Implementera `intent-clarity.ts`**

```typescript
import type { IntentClarityResult, Smell } from '../types';

const GENERIC_NAMES = new Set(['data', 'tmp', 'temp', 'result', 'res', 'val', 'item', 'obj', 'foo', 'bar', 'x', 'y', 'n', 's', 'e', 'err']);
const SHORT_NAME_MIN_LENGTH = 3;
const LOOP_VAR_PATTERN = /for\s*\([^)]*\b([ijk])\b/g;

const WEIGHT_DOC = 0.40;
const WEIGHT_TYPE = 0.35;
const WEIGHT_NAME = 0.25;
const LOW_CLARITY_THRESHOLD = 0.40;
const MEDIUM_CLARITY_THRESHOLD = 0.65;

export function analyzeIntentClarity(
  content: string, filePath: string, language: string,
): IntentClarityResult

export function computeTypeAnnotationRatio(content: string, language: string): number
export function computeNameQualityScore(content: string): { score: number; poorlyNamed: string[] }
```

`computeTypeAnnotationRatio` for TypeScript:
- Regexp for funktionsparametrar med typer: `/\w+:\s*\w+/g` i parameter-listor
- Regexp for returtyper: `/\):\s*\w+/g`
- Ratio = annoterade_parametrar / totalt_antal_parametrar

`computeNameQualityScore`:
- Hitta alla funktionsnamn via regexp `/function\s+(\w+)/g` och arrowfunktioner `/const\s+(\w+)\s*=/g`
- For varje namn: kontrollera longd < SHORT_NAME_MIN_LENGTH och GENERIC_NAMES
- Undanta loop-variablar (i, j, k) om de foljt av for-sats

- [ ] **Steg 3: Kör testerna (PASS)**

```bash
cd packages/core && pnpm test -- tests/analyzers/intent-clarity.test.ts
```

- [ ] **Steg 4: Commit**

```bash
git add packages/core/src/analyzers/intent-clarity.ts \
        packages/core/tests/analyzers/intent-clarity.test.ts
git commit -m "feat(core): Intent Clarity Score — doc ratio, type annotations, name quality"
```

**Acceptanskriterier:**
- `computeTypeAnnotationRatio` returnerar 1.0 for fullt typad TypeScript
- `computeNameQualityScore` ger laga poang for generiska namn
- Loop-variablar i, j, k undantas fran namnkvalitets-poankdrag
- `intentClarityScore < 0.40` ger high-severity smell
- Alla 8 testfall passerar

---

## Task 7 — Implementera nytt MCP-verktyg `code_health_bus_factor` [Sonnet]

**Files:**
- Create: `packages/mcp-server/src/tools/bus-factor.ts`

**Estimat:** 2.5 timmar

Nytt MCP-verktyg som kombinerar Shannon entropy bus factor, sprint congestion och knowledge loss index for ett eller fler filer i ett projekt. Monstret ar identiskt med `knowledge-map.ts`.

- [ ] **Steg 1: Implementera verktyget**

Input-schema (zod):
```typescript
{
  projectPath: z.string().describe('Absolut sokvaeg till projektets git-rotkatalog'),
  filePattern: z.string().default('**/*.{ts,js,py}').describe('Glob-monster for filer att analysera'),
  maxFiles: z.number().int().min(1).max(500).default(100).describe('Max antal filer (default 100)'),
  includeSprintCongestion: z.boolean().default(true).describe('Inkludera 14-dagars sprint-kongestion'),
  includeKnowledgeLossIndex: z.boolean().default(true).describe('Inkludera inaktivitets-ratio via git blame'),
}
```

Handler-logik:
1. Globba filer med fast-glob (befintlig dependency)
2. Begränsa till maxFiles
3. For varje fil: kör `analyzeBusFactor`, `analyzeSprintCongestion` (om inkluderat), `analyzeKnowledgeLossIndex` (om inkluderat) parallellt
4. Bygg sammansatt output med riskfiler sorterade efter busFactorEstimate (lagst forst)

Output-format:
```json
{
  "projectPath": "...",
  "analyzedFiles": 42,
  "summary": {
    "atRiskFiles": 5,
    "congestedFiles": 2,
    "orphanedFiles": 3
  },
  "riskFiles": [...],
  "congestedFiles": [...],
  "orphanedFiles": [...]
}
```

- [ ] **Steg 2: Commit**

```bash
git add packages/mcp-server/src/tools/bus-factor.ts
git commit -m "feat(mcp-server): add code_health_bus_factor tool — Shannon entropy, sprint congestion, KLI"
```

**Acceptanskriterier:**
- Kompilerar utan TS-fel
- Returnerar JSON med riskFiles, congestedFiles, orphanedFiles
- Hanterar tom projekt-katalog med isError: true
- Respekterar maxFiles-granssen

---

## Task 8 — Utvidga `code_health_knowledge_map` med nya metrics [Sonnet]

**Files:**
- Modify: `packages/mcp-server/src/tools/knowledge-map.ts`

**Estimat:** 2 timmar

Den befintliga `code_health_knowledge_map` returnerar DeveloperCongestion, KnowledgeLoss och TemporalCoupling. Vi utvidgar den med Documentation Debt Index och Intent Clarity Score for att ge en fullstandig "organizational health"-vy.

- [ ] **Steg 1: Lagg till doc-debt och intent-clarity anrop**

Importera `analyzeDocDebt` och `analyzeIntentClarity`. I den befintliga `handleKnowledgeMap`-funktionen, lagg till parallella anrop:

```typescript
const [docDebtResults, intentResults] = await Promise.all([
  Promise.all(files.slice(0, 100).map(f => analyzeDocDebt(content, f))),
  Promise.all(files.slice(0, 100).map(f => analyzeIntentClarity(content, f, language))),
]);
```

- [ ] **Steg 2: Lagg till i output**

```json
"documentationDebt": {
  "criticalFiles": [...],   // DDI >= 0.60
  "avgDocDebtIndex": 0.34
},
"intentClarity": {
  "lowClarityFiles": [...], // intentClarityScore < 0.40
  "avgClarityScore": 0.72
}
```

- [ ] **Steg 3: Commit**

```bash
git add packages/mcp-server/src/tools/knowledge-map.ts
git commit -m "feat(mcp-server): extend code_health_knowledge_map with doc debt and intent clarity"
```

**Acceptanskriterier:**
- Output inkluderar documentationDebt och intentClarity
- Befintliga fields (developerCongestion, knowledgeRisk, temporalCoupling) ar opararenderade
- Inga TS-fel

---

## Task 9 — Registrera det nya verktyget i `server.ts` [Haiku]

**Files:**
- Modify: `packages/mcp-server/src/server.ts`

**Estimat:** 30 minuter

- [ ] **Steg 1: Importera och registrera**

```typescript
import { registerBusFactor } from './tools/bus-factor';
// ...
registerArchitectureDebt(server);  // fran Sprint 22
registerBusFactor(server);
```

- [ ] **Steg 2: Verifiera build**

```bash
cd packages/mcp-server && pnpm build
```

- [ ] **Steg 3: Commit**

```bash
git add packages/mcp-server/src/server.ts
git commit -m "feat(mcp-server): register code_health_bus_factor tool in server"
```

---

## Task 10 — Integrationstester mot fixture-git-repo [Sonnet]

**Files:**
- Create: `packages/core/tests/temporal/bus-factor-integration.test.ts`

**Estimat:** 3 timmar

Integrationstester som bygger ett fixture-git-repo med kontrollerade bidragsgivare och kont att alla tre nya temporal-analyzers fungerar korrekt mot ett verkligt (men litet) git-repo.

- [ ] **Steg 1: Bygg fixture-repo med kanda bidragsgivare**

Skapa en `buildBusFactorFixtureRepo`-funktion (liknande `buildMethodCouplingFixtureRepo` fran Sprint 19) som producerar:
- 10 commits fran `alice@example.com` (dominant bidragsgivare)
- 2 commits fran `bob@example.com`
- 1 commit fran `charlie@example.com` (for 10 dagar sedan — aktiv i sprint)
- Totalt: 13 commits, en fil `src/feature.ts`

Forvantat bus factor: Alice har 10/13 = 77% — `isAtRisk = true`, `busFactorEstimate = 1`.

- [ ] **Steg 2: Skriv 5 integrationstestfall**

1. `analyzeBusFactor` mot fixture: `busFactorEstimate = 1`, `isAtRisk = true`
2. `analyzeBusFactor` mot fixture: `uniqueContributors = 3`
3. `analyzeSprintCongestion` mot fixture: charlies commit ar < 14 dagar gammal — `activeContributors >= 1`
4. `analyzeKnowledgeLossIndex` mot fixture: returnerar valid KLI (inte undantag)
5. Alla tre returnerar gracefully nar filePath inte existerar

- [ ] **Steg 3: Kör integrationstesterna**

```bash
cd packages/core && pnpm test -- tests/temporal/bus-factor-integration.test.ts
```

- [ ] **Steg 4: Kör hela test-sviten**

```bash
cd packages/core && pnpm test
cd packages/mcp-server && pnpm test
```

Inga regressions.

- [ ] **Steg 5: Commit**

```bash
git add packages/core/tests/temporal/bus-factor-integration.test.ts
git commit -m "test(core): integration tests for bus factor, sprint congestion, KLI against fixture repo"
```

**Acceptanskriterier:**
- `busFactorEstimate = 1` for Alice (77% av commits)
- `uniqueContributors = 3`
- `analyzeSprintCongestion` hanterar 14-dagars fanster korrekt
- `analyzeKnowledgeLossIndex` returnerar valid resultat (inte undantag)
- Inga regressions

---

## Task 11 — Exportera nya moduler fran core-paketet [Haiku]

**Files:**
- Modify: `packages/core/src/temporal/index.ts` (om den finns) eller via main exports
- Modify: `packages/core/src/analyzers/index.ts`

**Estimat:** 30 minuter

- [ ] **Steg 1: Lagg till exports**

I `packages/core/src/analyzers/index.ts`:
```typescript
export * from './doc-debt';
export * from './intent-clarity';
```

I temporal-modulens exports (hitta befintlig export-fil eller skapa ny):
```typescript
export * from './bus-factor';
export * from './sprint-congestion';
export * from './knowledge-loss-index';
```

- [ ] **Steg 2: Verifiera build**

```bash
cd packages/mcp-server && pnpm build
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/analyzers/index.ts
git commit -m "feat(core): export Sprint 23 modules from core package"
```

---

## Task 12 — Edge case-hantering och robusthetstester [Haiku]

**Files:**
- Modify: flertal testfiler

**Estimat:** 2 timmar

Sakerstarll att alla nya analysverktyg hanterar edge cases korrekt.

- [ ] **Steg 1: Lagg till edge case-testfall**

For `analyzeBusFactor`:
- Tom git-historik (ny fil, inga commits): returnerar valid nollresultat
- Enda bidragsgivare: `normalizedEntropy = 0`, `busFactorEstimate = 1`

For `analyzeSprintCongestion`:
- Inga commits senaste 14 dagar: `activeContributors = 0`, `isCongestedSprint = false`

For `analyzeKnowledgeLossIndex`:
- Tom fil (0 rader): returnerar `knowledgeLossRatio = 0`, inget undantag
- Alla aktiva bidragsgivare: `knowledgeLossRatio = 0.0`

For `analyzeDocDebt`:
- Fil utan funktioner: `docDebtIndex = 0.0`, ingen smell
- Tom strang: returnerar valid nollresultat

For `analyzeIntentClarity`:
- Tom fil: returnerar `intentClarityScore = 0.0`, ingen krasch

Totalt: 8 extra edge case-testfall.

- [ ] **Steg 2: Kör edge cases (PASS) och commit**

```bash
git commit -m "test(core): sprint 23 edge cases — empty files, no history, single contributor"
```

---

## Task 13 — Kör hela test-sviten och verifiering [Haiku]

**Estimat:** 1 timme

- [ ] **Steg 1: Kör alla tester och typecheck**

```bash
cd packages/core && pnpm test
cd packages/mcp-server && pnpm test
pnpm -r typecheck
```

Forvantat: alla befintliga tester grona. Minst 58 nya testfall fran sprint 23.

- [ ] **Steg 2: Slutgiltig commit**

```bash
git commit -m "test(core): sprint 23 — all tests green, 58+ new tests, no regressions"
```

---

## Testkrav

| Testkategori | Antal nya tester | Testfil |
|---|---|---|
| Shannon entropy bus factor | 8 tester | `bus-factor.test.ts` |
| Sprint-level developer congestion | 6 tester | `sprint-congestion.test.ts` |
| Knowledge Loss Index (blame) | 7 tester | `knowledge-loss-index.test.ts` |
| Documentation Debt Index | 7 tester | `doc-debt.test.ts` |
| Intent Clarity Score | 8 tester | `intent-clarity.test.ts` |
| Integrationstester | 5 tester | `bus-factor-integration.test.ts` |
| Type-kompilerings-test | 1 test | `bus-factor.test.ts` (minimal) |
| Edge cases | 8 tester | Fordelas pa testfilerna ovan |
| Typdefinition | 8 tester | Fordelas pa testfilerna ovan |
| **Totalt** | **58+ tester** | Alla ska vara PASS |

---

## Definition of Done

- [ ] `pnpm -r test` passerar utan regressions i befintliga tester
- [ ] `pnpm -r typecheck` passerar i alla paket
- [ ] Minst 58 nya testfall fran sprint 23
- [ ] `code_health_bus_factor` registrerat och svarar med korrekt JSON
- [ ] `code_health_knowledge_map` utvidgat med documentationDebt och intentClarity
- [ ] Shannon entropy-baserat bus factor korrekt beraknat (bevisas av testfall)
- [ ] 14-dagars sprint congestion skild fran befintlig 12-mananers congestion
- [ ] Knowledge Loss Index beraknat via git blame utan att krasha
- [ ] Documentation Debt Index = komplexitet * (1 - docCoverage) korrekt
- [ ] Intent Clarity Score = vagt_sum av doc/type/name-komponenter korrekt
- [ ] Edge cases hanterade for alla 5 nya analysverktyg
- [ ] Befintliga Sprint 10-analysverktyg (knowledge-loss.ts, developer-congestion.ts) OPARARENDERADE

---

## Sjalvgranskning mot spec

**Spec-tackning:**
- [x] Bus Factor per modul — Task 2 (Shannon entropy, inte enbart DOA)
- [x] Developer Congestion pa sprint-niva — Task 3 (14-dagars fanster)
- [x] Knowledge Loss Index (inaktiva bidragsgivare) — Task 4 (git blame-baserad)
- [x] Documentation Debt Index — Task 5 (komplexitet * (1 - docCoverage))
- [x] Intent Clarity Score — Task 6 (doc + type + name-komponenter)
- [x] MCP-verktyg `code_health_bus_factor` — Task 7 + 9
- [x] MCP-verktyg `code_health_knowledge_map` utvidgat — Task 8
- [x] `simple-git` for git log med --follow for filhistorik — Task 2, 3, 4
- [x] Author attribution per rad via git blame — Task 4
- [x] Shannon entropy for kunskapsfordelning — Task 2
- [x] Integration med befintlig doc-coverage detector — Task 5

**Medvetet utanfor scope:**
- ML-baserad namnkvalitetsbedoming (kraver traning pa kodkorpus) — Intent Clarity namnkomponent ar regelbaserad
- Cross-file knowledge tracking (vem ager vilken funktionalitet utover fil-granser)
- Historisk trendanalys (KLI och entropy over tid) — framtida sprint
- Real-time git blame (mycket langsamt pa stora repos) — begränsat till 5 000 rader

**Risker:**
- `git blame --line-porcelain` ar langsamt pa stora filer (>10 000 rader). Mitigeras av MAX_BLAME_LINES = 5 000.
- Author-attribution via email kan ge dubbletter om en person anvander flera email-adresser. Acceptabelt for v1 — framtida sprint kan la till email-normalisering.
- Intent Clarity namnkvalitets-regeln ar heuristisk — kan ge falskt positiva for legitima enkelbokstavs-namn utanfor loop-kontext. Troskelvardet pa 0.40 ar konservativt for att minimera dessa.
- `analyzeKnowledgeLossIndex` kräver att git-binaren stödjer `--line-porcelain` (finns i git >= 1.8.0, bred kompatibilitet).
