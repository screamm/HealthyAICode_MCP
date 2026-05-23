# Sprint 29: AI-Genererad Kod Revision och Benchmarking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg ett system för att (1) detektera AI-genererad kod via heuristiker och git-historik, (2) köra förstärkt hälsokontroll på AI-genererad kod med extra biomarkers, och (3) benchmarka AI-modellers kodkvalitet över tid. Levererar två nya MCP-tools — `code_health_ai_audit` och `code_health_model_benchmark` — samt ett JSON-baserat benchmarkhistorik-system och en GitHub Actions-workflow-mall.

**Architecture:** Ny katalog `packages/core/src/ai-audit/` med fyra moduler:
1. **AI-detektor** (`detector.ts`, `git-detector.ts`) — heuristiker för att identifiera AI-genererad kod med en konfidenspoäng [0, 1].
2. **Förstärkt hälsokontroll** (`enhanced-checks.ts`) — extra biomarkers specifika för AI-genererade kodmönster (`AbstractionLeakage`, `HardcodedAssumption`, `MissingEdgeCase`, `StyleInconsistency`).
3. **Benchmarking** (`benchmarker.ts`, `benchmark-store.ts`) — jämför AI-modell-output mot human baseline, lagrar historik i `benchmarks/ai-model-quality-history.json`.
4. **GitHub Actions-integration** (`ci-workflow-template.ts`) — exporterar YAML-mallsträng för PR-kommentarer med AI code quality-rapport.

Nya MCP-tools i `packages/mcp-server/src/tools/ai-audit.ts` och `packages/mcp-server/src/tools/model-benchmark.ts`, registrerade i `server.ts`.

**Tech Stack:** TypeScript 5.x, simple-git 3.22 (befintlig), tree-sitter (befintlig), Vitest, pnpm workspaces

**Testkommando:** `cd packages/core && pnpm test` och `cd packages/mcp-server && pnpm test`

---

## Akademisk grund och motivation

ArXiv-rapporten "Assessing the Quality and Security of AI-Generated Code" (2025) analyserade ~10 000 kodsnuttar genererade av Claude, GPT-4.1, Gemini 1.5 Pro och Llama 3.1, och fann:

| Observation | Andel |
|---|---|
| Kod-smells introducerade av LLMs i funktioner | 35–60% |
| Säkerhetsbrister i säkerhetskritisk AI-genererad kod | 15–25% |
| Stilinkonsekvenser som ökar underhållskostnader | 40–55% |
| AI-genererad kod som saknar felhantering för uppenbara edge cases | ~30% |

**Mönster specifika för AI-genererad kod:**

```
1. Abstraction leakage — AI tenderar att inte kapsla in implementationsdetaljer:
   // AI-typiskt (leakage):
   function processUser(user: { id: string; name: string; createdAt: Date }) { ... }

   // Human-typiskt (abstraktion):
   function processUser(user: User) { ... }

2. Hardcoded assumptions — magiska konstanter utan förklaring:
   // AI-typiskt:
   if (retries > 3) { ... }    // varifrån kommer 3?

   // Human-typiskt:
   const MAX_RETRIES = 3;
   if (retries > MAX_RETRIES) { ... }

3. Missing edge cases — AI fokuserar på happy path:
   // AI-typiskt (saknar null-check):
   function getUser(id: string) {
     return users.find(u => u.id === id).name;  // kraschar om ej hittat
   }

   // Human-typiskt:
   function getUser(id: string): string | undefined {
     return users.find(u => u.id === id)?.name;
   }
```

**Varför ingen MCP-server spårar detta idag:** Befintliga verktyg antingen (a) analyserar kodkvalitet generellt utan AI-specifika biomarkers, eller (b) är proprietära modell-egna lösningar utan jämförbarhet. Vi fyller gap:et med ett oberoende benchmarking-system anpassat till vår arkitektur.

**Vad detta INTE är:** Sprint 29 implementerar inte ML-baserad AI-text-detection (som GPTZero), full AST-diffing mot LLM-träningsdata, eller certifiering av att kod är "mänsklig" för regulatoriska ändamål. Fokus är praktisk kvalitetskontroll och modell-benchmarking.

---

## Arkitektur i detalj

### Modul A — AI-genererad kod-detektor

**Heuristiker (viktade bidrag till konfidenspoäng):**

```
AI_CONFIDENCE = weighted_avg([
  comment_style_score,      // Vikt: 0.20
  naming_pattern_score,     // Vikt: 0.25
  boilerplate_score,        // Vikt: 0.20
  structure_score,          // Vikt: 0.20
  git_score,                // Vikt: 0.15  (kräver git-historik)
])
```

**Kommentar-stilsheuristik:**

AI-genererad kod tenderar att ha:
- JSDoc/docstring på *varje* offentlig funktion (coverage > 90%)
- Kommentarer formulerade som naturligt språk med fullständiga meningar
- Sektionskommentarer (`// --- Validation logic ---`) som delar in funktionskroppar

```typescript
function commentStyleScore(code: string): number {
  const lines = code.split('\n');
  const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('*'));
  const commentRatio = commentLines.length / lines.length;

  // AI-genererad kod har ofta 20-40% kommentar-rader
  if (commentRatio > 0.25) return 0.8;
  if (commentRatio > 0.15) return 0.5;
  return 0.1;
}
```

**Git-baserad detektion (stor commit-storlek utan inkrementell historik):**

```
git_ai_score(file):
  IF commits_touching_file == 0: return 0.5   // ingen historik — osäker
  IF first_commit_size > 50 lines AND total_commits <= 2: return 0.9
  IF max_single_commit_change > 80% of file: return 0.75
  ELSE: return 0.1
```

### Modul B — Förstärkt hälsokontroll

Fyra extra biomarkers kombineras med befintliga smells:

```typescript
export type AiSpecificSmellType =
  | 'AbstractionLeakage'    // Inliner impl-detaljer som borde vara abstrakta typer
  | 'HardcodedAssumption'   // Magiska siffror/strängar utan named constant
  | 'MissingEdgeCase'       // Uppenbar null/undefined/empty-check saknas
  | 'StyleInconsistency';   // Avviker från projektets befintliga namngivningsstil
```

**Abstraction leakage-detektor (pseudokod):**

```
function detectAbstractionLeakage(paramNode: SyntaxNode) -> Finding | null:
  IF paramNode.type == 'destructuring_pattern':
    properties = extractProperties(paramNode)
    IF length(properties) > 3:
      return Finding(
        type='AbstractionLeakage',
        line=paramNode.startLine,
        description=f'Parameter destructurar {length(properties)} fält direkt — '
                    f'överväg en namngiven interface-typ',
      )
  RETURN null
```

**Missing edge case-detektor:**

```
function detectMissingEdgeCases(fnNode: SyntaxNode) -> Finding[]:
  findings = []

  // Pattern 1: .find() utan null-check på resultatet
  FOR each callExpr WHERE callee is .find():
    IF NOT wrapped_in_optional_chain AND NOT null_checked:
      findings.append(Finding(
        type='MissingEdgeCase',
        description='Array.find() kan returnera undefined; resultatet används utan null-kontroll',
      ))

  // Pattern 2: JSON.parse() utan try/catch
  FOR each callExpr WHERE callee is JSON.parse():
    IF NOT surrounded_by_try_catch(callExpr):
      findings.append(Finding(
        type='MissingEdgeCase',
        description='JSON.parse() utan try/catch — kastas vid ogiltig JSON',
      ))

  RETURN findings
```

### Modul C — Model Benchmarking

**JSON-schema för `benchmarks/ai-model-quality-history.json`:**

```typescript
interface BenchmarkHistory {
  schema_version: '1.0';
  entries: BenchmarkEntry[];
}

interface BenchmarkEntry {
  timestamp: string;                // ISO 8601
  model_name: string;               // "claude-sonnet-4-5", "gpt-4.1", etc.
  file_path: string;
  language: string;
  health_score_ai: number;          // vår score för AI-genererad kod
  health_score_baseline: number;    // score för referensversion (mänsklig eller historisk)
  delta: number;                    // health_score_ai - health_score_baseline (negativ = sämre)
  smells_introduced: string[];      // SmellType[] som finns i AI men inte i baseline
  smells_fixed: string[];           // SmellType[] som finns i baseline men inte i AI
  ai_specific_smells: string[];     // AiSpecificSmellType[] från förstärkt kontroll
  confidence_ai_generated: number;  // [0, 1] — detektorns konfidenspoäng
}
```

**Aggregationslogik för per-modell-statistik:**

```typescript
function aggregateModelStats(history: BenchmarkHistory, modelName: string): ModelStats {
  const entries = history.entries.filter(e => e.model_name === modelName);
  const n = entries.length;

  return {
    model_name: modelName,
    total_scans: n,
    avg_delta: mean(entries.map(e => e.delta)),
    std_delta: stddev(entries.map(e => e.delta)),
    avg_health_score: mean(entries.map(e => e.health_score_ai)),
    most_common_smells: topN(entries.flatMap(e => e.smells_introduced), 5),
    baseline_pass_rate: entries.filter(e => e.health_score_ai >= e.health_score_baseline).length / n,
  };
}
```

### Modul D — GitHub Actions CI/CD-integration

CI/CD-hook-mallen genererar en workflow som:
1. Vid varje PR: kör `code_health_ai_audit` på ändrade filer
2. Om en fil har AI-konfidenspoäng > 0.7 OCH health_score < `baseline - 1.5σ`: flaggar filen
3. Kommenterar PR med en strukturerad rapport

```yaml
# Exporteras som sträng från packages/core/src/ai-audit/ci-workflow-template.ts
name: AI Code Quality Check
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # behövs för git-baserad AI-detektion

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run AI code quality audit
        id: audit
        run: node scripts/ai-audit-ci.mjs --output-json /tmp/ai-audit-result.json

      - name: Comment PR with AI quality report
        uses: actions/github-script@v7
        with:
          script: |
            const result = require('/tmp/ai-audit-result.json');
            // formatera och posta kommentar
```

---

## Filöversikt

| Fil | Ändring |
|---|---|
| `packages/core/src/ai-audit/types.ts` | Ny — gemensamma typer |
| `packages/core/src/ai-audit/heuristic-detector.ts` | Ny — kommentar/namngivning/boilerplate-heuristiker |
| `packages/core/src/ai-audit/git-detector.ts` | Ny — git-baserad AI-detektion (commit-storlek, historik) |
| `packages/core/src/ai-audit/enhanced-checks.ts` | Ny — AbstractionLeakage, HardcodedAssumption, MissingEdgeCase, StyleInconsistency |
| `packages/core/src/ai-audit/benchmarker.ts` | Ny — jämför AI mot baseline, beräknar delta |
| `packages/core/src/ai-audit/benchmark-store.ts` | Ny — läs/skriv `benchmarks/ai-model-quality-history.json` |
| `packages/core/src/ai-audit/statistics.ts` | Ny — mean, stddev, topN, isOutlier, computeBaseline, flagOutliers |
| `packages/core/src/ai-audit/ci-workflow-template.ts` | Ny — YAML-mall som exporterad sträng |
| `packages/core/src/ai-audit/index.ts` | Ny — offentlig API |
| `packages/mcp-server/src/tools/ai-audit.ts` | Ny — MCP-tool `code_health_ai_audit` |
| `packages/mcp-server/src/tools/model-benchmark.ts` | Ny — MCP-tool `code_health_model_benchmark` |
| `packages/mcp-server/src/server.ts` | Ändra — registrera två nya verktyg |
| `packages/core/tests/ai-audit/heuristic-detector.test.ts` | Ny testfil |
| `packages/core/tests/ai-audit/git-detector.test.ts` | Ny testfil |
| `packages/core/tests/ai-audit/enhanced-checks.test.ts` | Ny testfil |
| `packages/core/tests/ai-audit/benchmarker.test.ts` | Ny testfil |
| `packages/core/tests/ai-audit/statistics.test.ts` | Ny testfil |
| `packages/core/tests/ai-audit/end-to-end.test.ts` | Ny testfil |
| `packages/core/tests/fixtures/ai-code-samples.ts` | Ny — AI-genererade kodfixtures |
| `benchmarks/ai-model-quality-history.json` | Ny — initialt tom historikfil |
| `benchmarks/schema.json` | Ny — JSON-schema |
| `scripts/ai-audit-ci.mjs` | Ny — CI-script för GitHub Actions |
| `docs/benchmarking-guide.md` | Ny — "How to benchmark AI models" |

---

## Task 1 — Definiera typer i `ai-audit/types.ts`

**Files:**
- Create: `packages/core/src/ai-audit/types.ts`

Stabilisera typkontraktet innan implementation av detektorer.

- [ ] **Steg 1: Skapa typmodulen**

```typescript
// packages/core/src/ai-audit/types.ts

export type AiSpecificSmellType =
  | 'AbstractionLeakage'
  | 'HardcodedAssumption'
  | 'MissingEdgeCase'
  | 'StyleInconsistency';

export interface AiDetectionResult {
  filePath: string;
  confidence: number;              // [0, 1]
  signals: AiSignal[];
  git_signal?: GitSignal;
}

export interface AiSignal {
  name: string;                    // "comment_style", "naming_pattern", etc.
  weight: number;
  score: number;                   // [0, 1]
  evidence: string;
}

export interface GitSignal {
  first_commit_lines_added: number;
  total_commits_touching_file: number;
  max_single_commit_change_pct: number;
  score: number;
}

export interface AiSpecificSmell {
  type: AiSpecificSmellType;
  severity: 'high' | 'medium' | 'low';
  line: number;
  description: string;
  suggestion: string;
}

export interface AiAuditResult {
  filePath: string;
  language: string;
  ai_detection: AiDetectionResult;
  base_health_score: number;
  enhanced_health_score: number;
  ai_specific_smells: AiSpecificSmell[];
  total_smells: number;
}

export interface BenchmarkEntry {
  timestamp: string;
  model_name: string;
  file_path: string;
  language: string;
  health_score_ai: number;
  health_score_baseline: number;
  delta: number;
  smells_introduced: string[];
  smells_fixed: string[];
  ai_specific_smells: string[];
  confidence_ai_generated: number;
}

export interface BenchmarkHistory {
  schema_version: '1.0';
  entries: BenchmarkEntry[];
}

export interface ModelStats {
  model_name: string;
  total_scans: number;
  avg_delta: number;
  std_delta: number;
  avg_health_score: number;
  most_common_smells: Array<{ smell: string; count: number }>;
  baseline_pass_rate: number;
}
```

- [ ] **Steg 2: Typecheck**

```
cd packages/core && pnpm typecheck
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/ai-audit/types.ts
git commit -m "feat(core/ai-audit): add shared type definitions for AI code detection and benchmarking"
```

**Estimat:** 1 timme | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `pnpm typecheck` passerar utan fel
- [ ] `AiSpecificSmellType` innehåller de 4 AI-specifika smell-typerna
- [ ] `BenchmarkEntry` innehåller alla fält som benchmarkhistoriken kräver
- [ ] `AiDetectionResult.confidence` är ett `number`-fält (inte sträng)

---

## Task 2 — Implementera heuristiska AI-detektorer

**Files:**
- Create: `packages/core/src/ai-audit/heuristic-detector.ts`
- Create: `packages/core/tests/ai-audit/heuristic-detector.test.ts`
- Create: `packages/core/tests/fixtures/ai-code-samples.ts`

Heuristikbaserad detektion av AI-genererade kodfiler via kommentar-stil, namngivningsmönster och boilerplate-igenkänning.

- [ ] **Steg 1: Bygg kodfixtures**

Skapa `packages/core/tests/fixtures/ai-code-samples.ts` med:
- `AI_GENERATED_SAMPLE`: En TypeScript-funktion med hög AI-sannolikhet (tunga JSDoc-kommentarer, sektionskommentarer, magiska konstanter)
- `HUMAN_WRITTEN_SAMPLE`: En TypeScript-funktion med låg AI-sannolikhet (minimala kommentarer, named constants, inkrementell stil)

```typescript
// packages/core/tests/fixtures/ai-code-samples.ts

/** Typisk AI-genererad kod: tung JSDoc, sektionskommentarer, verbose namngivning */
export const AI_GENERATED_SAMPLE = `
/**
 * Processes the user authentication request and validates credentials.
 * This function handles the complete authentication flow including validation,
 * token generation, and session management.
 * @param userCredentials - The user's login credentials
 * @param sessionOptions - Configuration options for the session
 * @returns Authentication result with token and user information
 */
export async function processUserAuthenticationRequest(
  userCredentials: { username: string; password: string; rememberMe: boolean },
  sessionOptions: { timeout: number; secure: boolean; domain: string },
): Promise<{ token: string; user: { id: string; name: string }; expiresAt: Date }> {
  // --- Input Validation Section ---
  if (!userCredentials.username || userCredentials.username.length === 0) {
    throw new Error('Username cannot be empty');
  }

  // --- Password Validation Section ---
  if (userCredentials.password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  // --- Token Generation Section ---
  const token = generateSecureToken(32);

  // --- Session Creation Section ---
  const session = createSession(token, sessionOptions.timeout);

  return { token, user: { id: '123', name: userCredentials.username }, expiresAt: session.expiresAt };
}
`;

/** Typisk mänskligt skriven kod: minimal kommentering, named constants, gradvis */
export const HUMAN_WRITTEN_SAMPLE = `
const MIN_PASSWORD_LENGTH = 8;
const TOKEN_LENGTH = 32;

export async function authenticate(credentials: UserCredentials): Promise<AuthResult> {
  validateCredentials(credentials);
  const token = generateSecureToken(TOKEN_LENGTH);
  const session = createSession(token);
  return { token, user: await findUser(credentials.username), expiresAt: session.expiresAt };
}

function validateCredentials(creds: UserCredentials): void {
  if (!creds.username) throw new AuthError('Missing username');
  if (creds.password.length < MIN_PASSWORD_LENGTH) throw new AuthError('Password too short');
}
`;
```

- [ ] **Steg 2: Skriv det failande testet**

```typescript
// packages/core/tests/ai-audit/heuristic-detector.test.ts
import { describe, it, expect } from 'vitest';
import { detectAiHeuristics, commentStyleScore, namingPatternScore } from '../../src/ai-audit/heuristic-detector';
import { AI_GENERATED_SAMPLE, HUMAN_WRITTEN_SAMPLE } from '../fixtures/ai-code-samples';

describe('commentStyleScore', () => {
  it('returnerar hög poäng för tung JSDoc-täckning (>25% kommentar-rader)', () => {
    expect(commentStyleScore(AI_GENERATED_SAMPLE)).toBeGreaterThan(0.6);
  });

  it('returnerar låg poäng för minimal kommentering', () => {
    expect(commentStyleScore(HUMAN_WRITTEN_SAMPLE)).toBeLessThan(0.4);
  });
});

describe('detectAiHeuristics', () => {
  it('returnerar hög konfidenspoäng för AI-genererat prov', () => {
    const result = detectAiHeuristics(AI_GENERATED_SAMPLE, 'src/test.ts', 'typescript');
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it('returnerar låg konfidenspoäng för mänskligt skrivet prov', () => {
    const result = detectAiHeuristics(HUMAN_WRITTEN_SAMPLE, 'src/test.ts', 'typescript');
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('returnerar signals-array med minst en signal', () => {
    const result = detectAiHeuristics(AI_GENERATED_SAMPLE, 'src/test.ts', 'typescript');
    expect(result.signals.length).toBeGreaterThan(0);
  });

  it('confidence är i intervallet [0, 1]', () => {
    const result = detectAiHeuristics(AI_GENERATED_SAMPLE, 'src/test.ts', 'typescript');
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Steg 3: Kör testet (FAIL)**

```
cd packages/core && pnpm test -- tests/ai-audit/heuristic-detector.test.ts
```

- [ ] **Steg 4: Implementera `heuristic-detector.ts`**

Implementera `detectAiHeuristics(code, filePath, language): AiDetectionResult` med:
- `commentStyleScore(code): number` — mäter kommentar-radandel + JSDoc-täckning
- `namingPatternScore(code, language): number` — detekterar extremt deskriptiva identifierarnamn (>30 tecken)
- `boilerplateScore(code): number` — igenkänner AI-boilerplate-fraser ("Handle the case where", "This function")
- `structureScore(code): number` — detekterar sektionskommentarer (`// ---`) och rigid blockstruktur

Konfidenspoäng = viktad genomsnitt av de fyra heuristikerna.

- [ ] **Steg 5: Kör testet (PASS) och commit**

```bash
git add packages/core/src/ai-audit/heuristic-detector.ts \
        packages/core/tests/ai-audit/heuristic-detector.test.ts \
        packages/core/tests/fixtures/ai-code-samples.ts
git commit -m "feat(core/ai-audit): add heuristic-based AI code detector (comment style, naming, boilerplate)"
```

**Estimat:** 4 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] AI-genererat prov ger konfidenspoäng > 0.6
- [ ] Mänskligt skrivet prov ger konfidenspoäng < 0.5
- [ ] `confidence` är alltid i intervallet [0, 1]
- [ ] `signals` innehåller minst en post med `name`, `weight`, `score`, `evidence`
- [ ] `commentStyleScore` returnerar > 0.6 för kod med > 25% kommentar-rader
- [ ] Alla fyra heuristiker är individuellt testbara via export

---

## Task 3 — Implementera git-baserad AI-detektion

**Files:**
- Create: `packages/core/src/ai-audit/git-detector.ts`
- Create: `packages/core/tests/ai-audit/git-detector.test.ts`

Git-historiken avslöjar om en fil introducerades i en stor initial commit utan inkrementell utveckling — ett mönster typiskt för AI-genererad kod som klistras in i ett repo.

- [ ] **Steg 1: Skriv det failande testet med fixture-repo**

```typescript
// packages/core/tests/ai-audit/git-detector.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeGitSignal } from '../../src/ai-audit/git-detector';
import simpleGit from 'simple-git';
import * as path from 'path';
import * as os from 'os';
import * as fsp from 'fs/promises';

async function buildAiLikeRepo() {
  const rootPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'ai-detect-'));
  await fsp.mkdir(path.join(rootPath, 'src'), { recursive: true });
  const filePath = 'src/service.ts';
  const git = simpleGit(rootPath);
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'test');
  await git.addConfig('commit.gpgsign', 'false');

  // Simulerar AI-klistra-in: stor initial commit, ingen historik
  const bigCode = Array.from({ length: 80 }, (_, i) => `export function fn${i}() { return ${i}; }`).join('\n');
  await fsp.writeFile(path.join(rootPath, filePath), bigCode, 'utf-8');
  await git.add(filePath);
  await git.commit('initial: add service');

  return {
    rootPath, filePath,
    cleanup: () => fsp.rm(rootPath, { recursive: true, force: true }),
  };
}

describe('analyzeGitSignal', () => {
  it('returnerar hög poäng för stor initial commit utan historik', async () => {
    const repo = await buildAiLikeRepo();
    const signal = await analyzeGitSignal(repo.rootPath, repo.filePath);
    expect(signal).toBeDefined();
    expect(signal!.score).toBeGreaterThan(0.6);
    await repo.cleanup();
  }, 30_000);

  it('returnerar undefined för icke-existerande git-repo', async () => {
    const signal = await analyzeGitSignal('/non-existent-repo', 'src/file.ts');
    expect(signal).toBeUndefined();
  });
});
```

- [ ] **Steg 2: Implementera `git-detector.ts`**

```typescript
// packages/core/src/ai-audit/git-detector.ts
import simpleGit from 'simple-git';
import type { GitSignal } from './types';

export async function analyzeGitSignal(
  repoPath: string,
  filePath: string,
): Promise<GitSignal | undefined> {
  const git = simpleGit(repoPath);
  let log;
  try {
    log = await git.log({ file: filePath, '--follow': null } as Record<string, unknown>);
  } catch {
    return undefined;
  }

  if (!log || log.all.length === 0) return undefined;

  const totalCommits = log.all.length;
  const initialSha = log.all[log.all.length - 1].hash;
  let initialLinesAdded = 0;
  try {
    const stat = await git.show([initialSha, '--stat', '--format=', '--', filePath]);
    const match = /(\d+) insertion/.exec(stat);
    if (match) initialLinesAdded = parseInt(match[1], 10);
  } catch {
    initialLinesAdded = 0;
  }

  const score = calculateGitScore(initialLinesAdded, totalCommits);
  return {
    first_commit_lines_added: initialLinesAdded,
    total_commits_touching_file: totalCommits,
    max_single_commit_change_pct: 0, // förenkling för v1
    score,
  };
}

function calculateGitScore(initialLines: number, totalCommits: number): number {
  let score = 0;
  if (initialLines > 50 && totalCommits <= 2) score += 0.7;
  else if (initialLines > 30 && totalCommits <= 3) score += 0.4;
  return Math.min(score, 1.0);
}
```

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/core/src/ai-audit/git-detector.ts \
        packages/core/tests/ai-audit/git-detector.test.ts
git commit -m "feat(core/ai-audit): add git-based AI code detection via commit size and history analysis"
```

**Estimat:** 3 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] Stor initial commit (>50 rader, <=2 commits) ger signal.score > 0.6
- [ ] `analyzeGitSignal` returnerar `undefined` för icke-git-kataloger
- [ ] `total_commits_touching_file` är korrekt räknat från `git log`
- [ ] Testet körs med eget fixture-repo i `os.tmpdir()`

---

## Task 4 — Implementera AI-specifika smelldetektorer

**Files:**
- Create: `packages/core/src/ai-audit/enhanced-checks.ts`
- Create: `packages/core/tests/ai-audit/enhanced-checks.test.ts`

De fyra AI-specifika biomarkers. Abstraction leakage kräver semantisk förståelse av AST-mönster och är sprintens svåraste analyssteg.

- [ ] **Steg 1: Skriv failande tester för alla fyra smells**

```typescript
// packages/core/tests/ai-audit/enhanced-checks.test.ts
import { describe, it, expect } from 'vitest';
import {
  detectAbstractionLeakage,
  detectHardcodedAssumptions,
  detectMissingEdgeCases,
  detectStyleInconsistency,
} from '../../src/ai-audit/enhanced-checks';

describe('detectAbstractionLeakage', () => {
  it('flaggar destructuring-parameter med fler än 3 fält', () => {
    const code = `
      function processUser({
        id, name, email, age, role
      }: { id: string; name: string; email: string; age: number; role: string }) {
        return name;
      }
    `;
    const smells = detectAbstractionLeakage(code, 'typescript');
    expect(smells.some(s => s.type === 'AbstractionLeakage')).toBe(true);
  });

  it('flaggar INTE parameter med namngiven interface-typ', () => {
    const code = `
      function processUser(user: User) {
        return user.name;
      }
    `;
    const smells = detectAbstractionLeakage(code, 'typescript');
    expect(smells.filter(s => s.type === 'AbstractionLeakage')).toHaveLength(0);
  });
});

describe('detectHardcodedAssumptions', () => {
  it('flaggar magic number i if-villkor', () => {
    const code = `
      function retry(fn: () => void, count: number) {
        if (count > 3) throw new Error('Max retries exceeded');
        fn();
      }
    `;
    const smells = detectHardcodedAssumptions(code, 'typescript');
    expect(smells.some(s => s.type === 'HardcodedAssumption')).toBe(true);
  });

  it('flaggar INTE named constant', () => {
    const code = `
      const MAX_RETRIES = 3;
      function retry(fn: () => void, count: number) {
        if (count > MAX_RETRIES) throw new Error('Max retries exceeded');
        fn();
      }
    `;
    const smells = detectHardcodedAssumptions(code, 'typescript');
    expect(smells.filter(s => s.type === 'HardcodedAssumption')).toHaveLength(0);
  });
});

describe('detectMissingEdgeCases', () => {
  it('flaggar Array.find() utan null-check', () => {
    const code = `
      function getUserName(users: User[], id: string): string {
        return users.find(u => u.id === id).name;
      }
    `;
    const smells = detectMissingEdgeCases(code, 'typescript');
    expect(smells.some(s => s.type === 'MissingEdgeCase')).toBe(true);
  });

  it('flaggar INTE find() med optional chaining', () => {
    const code = `
      function getUserName(users: User[], id: string): string | undefined {
        return users.find(u => u.id === id)?.name;
      }
    `;
    const smells = detectMissingEdgeCases(code, 'typescript');
    expect(smells.filter(s => s.type === 'MissingEdgeCase')).toHaveLength(0);
  });
});

describe('detectStyleInconsistency', () => {
  it('flaggar snake_case-variabel i fil med camelCase-stil', () => {
    const existingStyle = { convention: 'camelCase' as const };
    const code = `
      const user_name = 'Alice';
      const userEmail = 'alice@example.com';
    `;
    const smells = detectStyleInconsistency(code, existingStyle, 'typescript');
    expect(smells.some(s => s.type === 'StyleInconsistency')).toBe(true);
  });

  it('flaggar INTE konsistent camelCase', () => {
    const existingStyle = { convention: 'camelCase' as const };
    const code = `
      const userName = 'Alice';
      const userEmail = 'alice@example.com';
    `;
    const smells = detectStyleInconsistency(code, existingStyle, 'typescript');
    expect(smells.filter(s => s.type === 'StyleInconsistency')).toHaveLength(0);
  });
});
```

- [ ] **Steg 2: Implementera `enhanced-checks.ts`**

Implementera de fyra detektorfunktionerna via tree-sitter-AST-traversering:
- `detectAbstractionLeakage(code, language): AiSpecificSmell[]` — destructuring-parametrar med >3 fält
- `detectHardcodedAssumptions(code, language): AiSpecificSmell[]` — magic numbers i jämförelseoperatorer (återanvänd befintlig `detectMagicNumbers` och filtrera på om alternativet är ett named constant)
- `detectMissingEdgeCases(code, language): AiSpecificSmell[]` — `.find()` utan optional chain, `JSON.parse()` utan try/catch
- `detectStyleInconsistency(code, existingStyle, language): AiSpecificSmell[]` — namngivningskonvention mot projektets infererade stil

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/core/src/ai-audit/enhanced-checks.ts \
        packages/core/tests/ai-audit/enhanced-checks.test.ts
git commit -m "feat(core/ai-audit): add AI-specific smell detectors (AbstractionLeakage, HardcodedAssumption, MissingEdgeCase, StyleInconsistency)"
```

**Estimat:** 6 timmar | **AI-modell:** [Opus]

**Acceptanskriterier:**
- [ ] `detectAbstractionLeakage` flaggar destructuring med >3 fält men INTE namngiven interface
- [ ] `detectHardcodedAssumptions` flaggar magic number `3` i if-villkor men INTE `MAX_RETRIES`
- [ ] `detectMissingEdgeCases` flaggar `.find().name` men INTE `?.find()?.name`
- [ ] `detectStyleInconsistency` flaggar snake_case i camelCase-fil
- [ ] Alla 8 enhetstester passerar

---

## Task 5 — Implementera statistikhjälpare

**Files:**
- Create: `packages/core/src/ai-audit/statistics.ts`
- Create: `packages/core/tests/ai-audit/statistics.test.ts`

Rena matematiska hjälpfunktioner utan externa beroenden för benchmarking-aggregation och outlier-detektion.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/ai-audit/statistics.test.ts
import { describe, it, expect } from 'vitest';
import { mean, stddev, topN, isOutlier, computeBaseline, flagOutliers } from '../../src/ai-audit/statistics';

describe('mean', () => {
  it('beräknar korrekt medelvärde', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
  });

  it('returnerar 0 för tom array', () => {
    expect(mean([])).toBe(0);
  });
});

describe('stddev', () => {
  it('beräknar korrekt standardavvikelse', () => {
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.0, 1);
  });

  it('returnerar 0 för array med identiska element', () => {
    expect(stddev([3, 3, 3])).toBe(0);
  });
});

describe('topN', () => {
  it('returnerar de N mest frekventa elementen i fallande ordning', () => {
    const items = ['a', 'b', 'a', 'c', 'a', 'b'];
    const result = topN(items, 2);
    expect(result[0]).toEqual({ item: 'a', count: 3 });
    expect(result[1]).toEqual({ item: 'b', count: 2 });
  });
});

describe('isOutlier', () => {
  it('identifierar värde som outlier om det avviker mer än 1.5 sigma nedåt', () => {
    expect(isOutlier(5.0, 8.0, 1.0, 1.5)).toBe(true);  // 5.0 < 8.0 - 1.5*1.0
  });

  it('identifierar INTE normalt värde som outlier', () => {
    expect(isOutlier(7.5, 8.0, 1.0, 1.5)).toBe(false);
  });
});

describe('computeBaseline och flagOutliers', () => {
  it('flaggar en tydlig outlier', () => {
    const scores = [8.5, 8.0, 8.3, 5.0]; // 5.0 är outlier
    const baseline = computeBaseline(scores);
    const dummyEntries = scores.map(s => ({ health_score_ai: s }) as import('../../src/ai-audit/types').BenchmarkEntry);
    const flagged = flagOutliers(dummyEntries, baseline, 1.5);
    expect(flagged.some(e => e.health_score_ai === 5.0)).toBe(true);
    expect(flagged.every(e => e.health_score_ai < baseline.mean - 1.5 * baseline.sigma)).toBe(true);
  });
});
```

- [ ] **Steg 2: Implementera `statistics.ts`**

```typescript
// packages/core/src/ai-audit/statistics.ts
import type { BenchmarkEntry } from './types';

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

export function topN<T>(items: T[], n: number): Array<{ item: T; count: number }> {
  const freq = new Map<T, number>();
  for (const item of items) freq.set(item, (freq.get(item) ?? 0) + 1);
  return [...freq.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([item, count]) => ({ item, count }));
}

export function isOutlier(value: number, baseline: number, sigma: number, threshold: number): boolean {
  return value < baseline - threshold * sigma;
}

export interface Baseline { mean: number; sigma: number; }

export function computeBaseline(values: number[]): Baseline {
  return { mean: mean(values), sigma: stddev(values) };
}

export function flagOutliers(
  entries: BenchmarkEntry[],
  baseline: Baseline,
  sigmaThreshold: number,
): BenchmarkEntry[] {
  return entries.filter(e => isOutlier(e.health_score_ai, baseline.mean, baseline.sigma, sigmaThreshold));
}
```

- [ ] **Steg 3: Kör testet (PASS) och commit**

```bash
git add packages/core/src/ai-audit/statistics.ts \
        packages/core/tests/ai-audit/statistics.test.ts
git commit -m "feat(core/ai-audit): add pure statistics helpers (mean, stddev, topN, isOutlier, computeBaseline, flagOutliers)"
```

**Estimat:** 1.5 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `mean([1,2,3,4,5])` === 3
- [ ] `stddev([2,4,4,4,5,5,7,9])` ≈ 2.0 (tolerans 0.1)
- [ ] `topN` sorterar korrekt efter frekvens
- [ ] `isOutlier(5.0, 8.0, 1.0, 1.5)` === true
- [ ] `flagOutliers` returnerar enbart entries under `baseline.mean - sigmaThreshold * baseline.sigma`

---

## Task 6 — Implementera benchmarker och historiklagring

**Files:**
- Create: `packages/core/src/ai-audit/benchmarker.ts`
- Create: `packages/core/src/ai-audit/benchmark-store.ts`
- Create: `packages/core/tests/ai-audit/benchmarker.test.ts`
- Create: `benchmarks/ai-model-quality-history.json`

Jämförelsemotor och persistent lagring av benchmark-historik.

- [ ] **Steg 1: Initiera historikfilen**

```json
{
  "schema_version": "1.0",
  "entries": []
}
```

- [ ] **Steg 2: Implementera `benchmark-store.ts`**

```typescript
// packages/core/src/ai-audit/benchmark-store.ts
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { BenchmarkHistory, BenchmarkEntry } from './types';

export const DEFAULT_HISTORY_PATH = path.resolve(
  __dirname, '../../../../benchmarks/ai-model-quality-history.json'
);

export async function loadHistory(historyPath = DEFAULT_HISTORY_PATH): Promise<BenchmarkHistory> {
  try {
    const raw = await fsp.readFile(historyPath, 'utf-8');
    return JSON.parse(raw) as BenchmarkHistory;
  } catch {
    return { schema_version: '1.0', entries: [] };
  }
}

export async function appendEntry(
  entry: BenchmarkEntry,
  historyPath = DEFAULT_HISTORY_PATH,
): Promise<void> {
  const history = await loadHistory(historyPath);
  history.entries.push(entry);
  await fsp.writeFile(historyPath, JSON.stringify(history, null, 2), 'utf-8');
}

export async function getModelStats(
  modelName: string,
  historyPath = DEFAULT_HISTORY_PATH,
): Promise<BenchmarkEntry[]> {
  const history = await loadHistory(historyPath);
  return history.entries.filter(e => e.model_name === modelName);
}
```

- [ ] **Steg 3: Implementera `benchmarker.ts`**

```typescript
// packages/core/src/ai-audit/benchmarker.ts
import type { BenchmarkEntry, ModelStats } from './types';
import { mean, stddev, topN } from './statistics';

export function compareToBaseline(
  modelName: string,
  aiCode: string,
  referenceCode: string,
  filePath: string,
  language: string,
  runAnalysis: (code: string, filePath: string) => { score: number; smells: string[] },
): BenchmarkEntry {
  const aiResult = runAnalysis(aiCode, filePath);
  const baselineResult = runAnalysis(referenceCode, filePath);

  return {
    timestamp: new Date().toISOString(),
    model_name: modelName,
    file_path: filePath,
    language,
    health_score_ai: aiResult.score,
    health_score_baseline: baselineResult.score,
    delta: aiResult.score - baselineResult.score,
    smells_introduced: aiResult.smells.filter(s => !baselineResult.smells.includes(s)),
    smells_fixed: baselineResult.smells.filter(s => !aiResult.smells.includes(s)),
    ai_specific_smells: [],
    confidence_ai_generated: 0,
  };
}

export function aggregateModelStats(entries: BenchmarkEntry[], modelName: string): ModelStats {
  const modelEntries = entries.filter(e => e.model_name === modelName);
  const n = modelEntries.length;
  if (n === 0) {
    return { model_name: modelName, total_scans: 0, avg_delta: 0, std_delta: 0,
             avg_health_score: 0, most_common_smells: [], baseline_pass_rate: 0 };
  }
  const deltas = modelEntries.map(e => e.delta);
  const allIntroduced = modelEntries.flatMap(e => e.smells_introduced);
  return {
    model_name: modelName,
    total_scans: n,
    avg_delta: mean(deltas),
    std_delta: stddev(deltas),
    avg_health_score: mean(modelEntries.map(e => e.health_score_ai)),
    most_common_smells: topN(allIntroduced, 5).map(({ item, count }) => ({ smell: item, count })),
    baseline_pass_rate: modelEntries.filter(e => e.delta >= 0).length / n,
  };
}
```

- [ ] **Steg 4: Skriv tester**

```typescript
// packages/core/tests/ai-audit/benchmarker.test.ts
import { describe, it, expect } from 'vitest';
import { compareToBaseline, aggregateModelStats } from '../../src/ai-audit/benchmarker';
import type { BenchmarkEntry } from '../../src/ai-audit/types';

const mockAnalysis = (code: string, _: string) => ({
  score: code.includes('badCode') ? 6.0 : 8.0,
  smells: code.includes('badCode') ? ['ComplexMethod', 'MagicNumber'] : ['MagicNumber'],
});

describe('compareToBaseline', () => {
  it('beräknar negativ delta för AI-kod med sämre kvalitet', () => {
    const entry = compareToBaseline(
      'gpt-4.1', 'const x = badCode()', 'const x = goodCode()',
      'src/test.ts', 'typescript', mockAnalysis,
    );
    expect(entry.delta).toBe(6.0 - 8.0);
    expect(entry.delta).toBeLessThan(0);
  });

  it('identifierar korrekt smells_introduced', () => {
    const entry = compareToBaseline(
      'gpt-4.1', 'const x = badCode()', 'const x = goodCode()',
      'src/test.ts', 'typescript', mockAnalysis,
    );
    expect(entry.smells_introduced).toContain('ComplexMethod');
    expect(entry.smells_introduced).not.toContain('MagicNumber');
  });
});

describe('aggregateModelStats', () => {
  it('beräknar korrekt avg_delta', () => {
    const entries: BenchmarkEntry[] = [
      { model_name: 'claude-sonnet-4-5', delta: -1.0, health_score_ai: 7.0, health_score_baseline: 8.0,
        timestamp: '', file_path: '', language: '', smells_introduced: [], smells_fixed: [],
        ai_specific_smells: [], confidence_ai_generated: 0.8 },
      { model_name: 'claude-sonnet-4-5', delta: -0.5, health_score_ai: 7.5, health_score_baseline: 8.0,
        timestamp: '', file_path: '', language: '', smells_introduced: [], smells_fixed: [],
        ai_specific_smells: [], confidence_ai_generated: 0.7 },
    ];
    const stats = aggregateModelStats(entries, 'claude-sonnet-4-5');
    expect(stats.avg_delta).toBeCloseTo(-0.75, 4);
    expect(stats.total_scans).toBe(2);
  });
});
```

- [ ] **Steg 5: Commit**

```bash
git add packages/core/src/ai-audit/benchmarker.ts \
        packages/core/src/ai-audit/benchmark-store.ts \
        packages/core/tests/ai-audit/benchmarker.test.ts \
        benchmarks/ai-model-quality-history.json
git commit -m "feat(core/ai-audit): add model benchmarker with delta calculation and JSON history store"
```

**Estimat:** 4 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] `compareToBaseline` returnerar korrekt `delta`, `smells_introduced`, `smells_fixed`
- [ ] `aggregateModelStats` beräknar `avg_delta` korrekt till 4 decimaler
- [ ] `loadHistory` returnerar `{ schema_version: '1.0', entries: [] }` för saknad fil
- [ ] `appendEntry` skriver till historikfilen utan att skriva över befintliga entries
- [ ] `benchmarks/ai-model-quality-history.json` finns med initial tom struktur

---

## Task 7 — Implementera MCP-tool `code_health_ai_audit`

**Files:**
- Create: `packages/mcp-server/src/tools/ai-audit.ts`
- Modify: `packages/mcp-server/src/server.ts`

- [ ] **Steg 1: Implementera MCP-verktyget**

```typescript
// packages/mcp-server/src/tools/ai-audit.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerAiAudit(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_ai_audit',
    'Kör förstärkt hälsokontroll på en fil misstänkt vara AI-genererad. '
    + 'Returnerar AI-konfidenspoäng, vanliga smells och AI-specifika biomarkers '
    + '(AbstractionLeakage, HardcodedAssumption, MissingEdgeCase, StyleInconsistency).',
    {
      filePath: z.string().describe('Absolut sökväg till filen att analysera'),
      repoPath: z.string().optional()
        .describe('Absolut sökväg till git-repo-root (aktiverar git-baserad AI-detektion)'),
      language: z.enum(['typescript', 'javascript', 'python', 'java'])
        .describe('Programspråk'),
      style_convention: z.enum(['camelCase', 'snake_case', 'PascalCase']).optional()
        .describe('Projektets namngivningskonvention för StyleInconsistency-detektion'),
    },
    async (args) => handleAiAudit(args),
  );
}
```

- [ ] **Steg 2: Implementera handler-funktionen**

`handleAiAudit` ska:
1. Läsa filen från `filePath`
2. Köra `detectAiHeuristics` mot filinnehållet
3. Om `repoPath` anges: köra `analyzeGitSignal` och inkludera i `ai_detection`
4. Köra de fyra `enhanced-checks`-funktionerna
5. Köra befintlig `analyzeByLanguage` för `base_health_score`
6. Returnera `AiAuditResult` som JSON

- [ ] **Steg 3: Registrera i `server.ts`**

```typescript
import { registerAiAudit } from './tools/ai-audit';
// ...
registerSecurityAudit(server);
registerAiAudit(server);
registerConfigTools(server);
```

- [ ] **Steg 4: Commit**

```bash
git add packages/mcp-server/src/tools/ai-audit.ts \
        packages/mcp-server/src/server.ts
git commit -m "feat(mcp-server): add code_health_ai_audit tool with AI-specific enhanced checks"
```

**Estimat:** 3 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] Verktyget accepterar `filePath`, `repoPath` (optional), `language`, `style_convention` (optional)
- [ ] Output inkluderar `ai_detection.confidence` i [0, 1]
- [ ] Output inkluderar `ai_specific_smells` med typer från `AiSpecificSmellType`
- [ ] `repoPath` utelämnat ger korrekt resultat (utan git-signal, `git_signal: undefined`)
- [ ] Felhantering: filen existerar inte → tydligt felmeddelande i `isError: true`-svar

---

## Task 8 — Implementera MCP-tool `code_health_model_benchmark`

**Files:**
- Create: `packages/mcp-server/src/tools/model-benchmark.ts`
- Modify: `packages/mcp-server/src/server.ts`

- [ ] **Steg 1: Implementera MCP-verktyget**

```typescript
// packages/mcp-server/src/tools/model-benchmark.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerModelBenchmark(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_model_benchmark',
    'Jämför en AI-modells genererade kod mot human baseline. '
    + 'Beräknar delta i health-metrics, spårar introducerade smells och '
    + 'lagrar i benchmarkhistorik. Stöder aggregering av per-modell-statistik.',
    {
      model_name: z.string().describe('AI-modellens namn, t.ex. "claude-sonnet-4-5"'),
      generated_code: z.string().describe('Den AI-genererade koden att utvärdera'),
      reference_code: z.string().describe('Human-skriven referenskod (baseline)'),
      file_path: z.string().describe('Referenssökväg för historikens filmetadata'),
      language: z.enum(['typescript', 'javascript', 'python', 'java']),
      get_stats: z.boolean().default(false)
        .describe('Om true: returnera aggregerad statistik för modellen istället för enskild benchmark'),
      history_path: z.string().optional()
        .describe('Anpassad sökväg till historikfil (default: benchmarks/ai-model-quality-history.json)'),
    },
    async (args) => handleModelBenchmark(args),
  );
}
```

- [ ] **Steg 2: Registrera i `server.ts`**

```typescript
import { registerModelBenchmark } from './tools/model-benchmark';
// ...
registerAiAudit(server);
registerModelBenchmark(server);
registerConfigTools(server);
```

- [ ] **Steg 3: Commit**

```bash
git add packages/mcp-server/src/tools/model-benchmark.ts \
        packages/mcp-server/src/server.ts
git commit -m "feat(mcp-server): add code_health_model_benchmark tool with history persistence and model stats aggregation"
```

**Estimat:** 3 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] Enkel benchmark returnerar `delta`, `smells_introduced`, `health_score_ai`, `health_score_baseline`
- [ ] Entry sparas till `benchmarks/ai-model-quality-history.json`
- [ ] `get_stats: true` returnerar `ModelStats` med `avg_delta` och `most_common_smells`
- [ ] Anpassad `history_path` fungerar korrekt
- [ ] `get_stats: true` utan historikdata returnerar tom `ModelStats` (inte ett fel)

---

## Task 9 — Generera GitHub Actions workflow-mall och CI-script

**Files:**
- Create: `packages/core/src/ai-audit/ci-workflow-template.ts`
- Create: `scripts/ai-audit-ci.mjs`

CI/CD-integrationshjälpare utan externa API-anrop.

- [ ] **Steg 1: Skapa `ci-workflow-template.ts`**

```typescript
// packages/core/src/ai-audit/ci-workflow-template.ts

/**
 * GitHub Actions workflow YAML-mall för AI code quality check.
 * Kopiera innehållet till .github/workflows/ai-code-quality.yml i ditt projekt.
 */
export const GITHUB_ACTIONS_WORKFLOW_TEMPLATE = `
name: AI Code Quality Check
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Run AI code quality audit
        run: node scripts/ai-audit-ci.mjs --output-json /tmp/ai-audit-result.json

      - name: Comment PR with AI quality report
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const result = JSON.parse(fs.readFileSync('/tmp/ai-audit-result.json', 'utf8'));
            if (result.flagged_files.length === 0) return;
            const body = '## AI Code Quality Report\\n' +
              result.flagged_files.map(f => \`- \${f.path}: score \${f.score} (confidence: \${f.confidence})\`).join('\\n');
            await github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body,
            });
`.trim();
```

- [ ] **Steg 2: Skapa `scripts/ai-audit-ci.mjs`**

```javascript
// scripts/ai-audit-ci.mjs
import { parseArgs } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const { values: args } = parseArgs({
  options: {
    'output-json': { type: 'string', default: '/tmp/ai-audit-result.json' },
    'baseline-sigma': { type: 'string', default: '1.5' },
  },
  strict: false,
});

// Placeholder: i produktion kopplar detta in mot analysfunktionerna
// från packages/core/src/ai-audit/ via programmatisk import
const result = {
  schema_version: '1.0',
  run_timestamp: new Date().toISOString(),
  flagged_files: [],
  summary: 'AI audit CI placeholder — koppla in @healthy-ai-code/core/ai-audit',
};

await fs.writeFile(args['output-json'], JSON.stringify(result, null, 2), 'utf-8');
console.log(`AI audit complete. Output: ${args['output-json']}`);
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/ai-audit/ci-workflow-template.ts \
        scripts/ai-audit-ci.mjs
git commit -m "feat: add GitHub Actions CI/CD workflow template and AI audit CI script"
```

**Estimat:** 2 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `GITHUB_ACTIONS_WORKFLOW_TEMPLATE` exporteras och är en icke-tom sträng
- [ ] Workflow-mallen inkluderar `fetch-depth: 0`
- [ ] `scripts/ai-audit-ci.mjs` körs utan fel via `node scripts/ai-audit-ci.mjs`
- [ ] `--output-json` parametern respekteras

---

## Task 10 — JSON-schema för benchmarkhistorik

**Files:**
- Create: `benchmarks/schema.json`
- Create: `docs/benchmarking-guide.md`

Formellt JSON-schema och användardokumentation.

- [ ] **Steg 1: Skapa `benchmarks/schema.json`**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://healthyaicode.dev/benchmarks/schema.json",
  "title": "AI Model Quality Benchmark History",
  "type": "object",
  "required": ["schema_version", "entries"],
  "properties": {
    "schema_version": { "type": "string", "enum": ["1.0"] },
    "entries": {
      "type": "array",
      "items": {
        "type": "object",
        "required": [
          "timestamp", "model_name", "file_path", "language",
          "health_score_ai", "health_score_baseline", "delta"
        ],
        "properties": {
          "timestamp": { "type": "string", "format": "date-time" },
          "model_name": { "type": "string" },
          "file_path": { "type": "string" },
          "language": { "type": "string" },
          "health_score_ai": { "type": "number", "minimum": 0, "maximum": 10 },
          "health_score_baseline": { "type": "number", "minimum": 0, "maximum": 10 },
          "delta": { "type": "number" },
          "smells_introduced": { "type": "array", "items": { "type": "string" } },
          "smells_fixed": { "type": "array", "items": { "type": "string" } },
          "ai_specific_smells": { "type": "array", "items": { "type": "string" } },
          "confidence_ai_generated": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    }
  }
}
```

- [ ] **Steg 2: Skapa `docs/benchmarking-guide.md`**

Dokumentet ska innehålla:
1. **Varför benchmarka AI-modeller** — bakgrund och akademiska fynd
2. **Hur man kör en benchmark** — steg-för-steg via MCP-tool `code_health_model_benchmark`
3. **Hur man tolkar historikdata** — vad `delta`, `avg_delta`, `baseline_pass_rate` innebär
4. **GitHub Actions-integration** — hur man aktiverar `ci-workflow-template`
5. **Exempel på typisk output** — kodexempel av JSON-output per modell

- [ ] **Steg 3: Commit**

```bash
git add benchmarks/schema.json docs/benchmarking-guide.md
git commit -m "docs: add JSON Schema for benchmark history and AI model benchmarking guide"
```

**Estimat:** 1.5 timmar | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] Schema validerar den initiala tomma historikfilen utan fel
- [ ] `health_score_ai` och `health_score_baseline` har `minimum: 0` och `maximum: 10`
- [ ] `confidence_ai_generated` har `minimum: 0` och `maximum: 1`
- [ ] `docs/benchmarking-guide.md` täcker de 5 avsnitten ovan

---

## Task 11 — Tester med AI-genererade kodfixtures (utökade)

**Files:**
- Modify: `packages/core/tests/fixtures/ai-code-samples.ts`
- Create: `packages/core/tests/ai-audit/end-to-end.test.ts`

End-to-end-test av hela AI-audit-pipelinen.

- [ ] **Steg 1: Utöka `ai-code-samples.ts`**

Lägg till minst 2 ytterligare fixtures:
- `VERBOSE_STYLE_SAMPLE`: Med extremt deskriptiva funktionsnamn och sektionskommentarer
- `INLINE_TYPES_SAMPLE`: Med destructuring-parameter med >3 fält (triggar AbstractionLeakage)

- [ ] **Steg 2: Skriv end-to-end-testet**

```typescript
// packages/core/tests/ai-audit/end-to-end.test.ts
import { describe, it, expect } from 'vitest';
import { detectAiHeuristics } from '../../src/ai-audit/heuristic-detector';
import { detectMissingEdgeCases, detectAbstractionLeakage } from '../../src/ai-audit/enhanced-checks';
import { AI_GENERATED_SAMPLE, HUMAN_WRITTEN_SAMPLE, INLINE_TYPES_SAMPLE } from '../fixtures/ai-code-samples';

describe('AI audit pipeline — end-to-end', () => {
  it('AI-genererat prov: hög konfidenspoäng', () => {
    const detection = detectAiHeuristics(AI_GENERATED_SAMPLE, 'src/test.ts', 'typescript');
    expect(detection.confidence).toBeGreaterThan(0.5);
  });

  it('Mänskligt skrivet prov: låg konfidenspoäng', () => {
    const detection = detectAiHeuristics(HUMAN_WRITTEN_SAMPLE, 'src/test.ts', 'typescript');
    expect(detection.confidence).toBeLessThan(0.6);
  });

  it('INLINE_TYPES_SAMPLE triggar AbstractionLeakage', () => {
    const leakage = detectAbstractionLeakage(INLINE_TYPES_SAMPLE, 'typescript');
    expect(leakage.some(s => s.type === 'AbstractionLeakage')).toBe(true);
  });

  it('ingen exception vid körning av alla fyra enhanced-checks', () => {
    expect(() => {
      detectMissingEdgeCases(AI_GENERATED_SAMPLE, 'typescript');
      detectAbstractionLeakage(AI_GENERATED_SAMPLE, 'typescript');
    }).not.toThrow();
  });
});
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/tests/fixtures/ai-code-samples.ts \
        packages/core/tests/ai-audit/end-to-end.test.ts
git commit -m "test(core/ai-audit): add extended AI code fixtures and end-to-end audit pipeline tests"
```

**Estimat:** 2 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] Minst 4 fixtures i `ai-code-samples.ts` (2 AI-genererade, 2 mänskliga/neutrala)
- [ ] AI-fixture ger konfidenspoäng > 0.5
- [ ] Human-fixture ger konfidenspoäng < 0.6
- [ ] `INLINE_TYPES_SAMPLE` triggar `AbstractionLeakage`
- [ ] Inga uncaught exceptions vid körning av enhanced-checks

---

## Task 12 — Exponera `ai-audit/index.ts` och uppdatera typer

**Files:**
- Create: `packages/core/src/ai-audit/index.ts`
- Modify: `packages/core/src/types.ts`

- [ ] **Steg 1: Skapa `index.ts`**

```typescript
// packages/core/src/ai-audit/index.ts
export type {
  AiSpecificSmellType, AiDetectionResult, AiSignal, GitSignal,
  AiSpecificSmell, AiAuditResult, BenchmarkEntry, BenchmarkHistory, ModelStats,
} from './types';
export { detectAiHeuristics, commentStyleScore, namingPatternScore } from './heuristic-detector';
export { analyzeGitSignal } from './git-detector';
export {
  detectAbstractionLeakage, detectHardcodedAssumptions,
  detectMissingEdgeCases, detectStyleInconsistency,
} from './enhanced-checks';
export { compareToBaseline, aggregateModelStats } from './benchmarker';
export { loadHistory, appendEntry, getModelStats, DEFAULT_HISTORY_PATH } from './benchmark-store';
export { mean, stddev, topN, isOutlier, computeBaseline, flagOutliers } from './statistics';
export { GITHUB_ACTIONS_WORKFLOW_TEMPLATE } from './ci-workflow-template';
```

- [ ] **Steg 2: Utöka `SmellType` i `types.ts`**

```typescript
  // Befintliga typer...
  | 'MethodTemporalCoupling'
  // Säkerhetstyper (Sprint 28):
  | 'SqlInjectionRisk'
  | 'XssRisk'
  | 'CommandInjectionRisk'
  | 'HardcodedCredential'
  | 'HardcodedApiKey'
  | 'UnsafeDeserialization'
  | 'PathTraversalRisk'
  | 'DependencyVulnerability'
  // AI-specifika typer (Sprint 29):
  | 'AbstractionLeakage'
  | 'HardcodedAssumption'
  | 'MissingEdgeCase'
  | 'StyleInconsistency';
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/ai-audit/index.ts packages/core/src/types.ts
git commit -m "feat(core/ai-audit): export public AI audit module API and register AI-specific SmellTypes"
```

**Estimat:** 1 timme | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] Alla publika funktioner importerbara via `@healthy-ai-code/core/ai-audit`
- [ ] `SmellType` inkluderar de 4 AI-specifika typerna
- [ ] `pnpm -r typecheck` passerar utan fel

---

## Task 13 — Fullständig testsvit och slutgranskning

**Files:**
- Alla testfiler i `packages/core/tests/ai-audit/`

- [ ] **Steg 1: Kör hela testsviten**

```
pnpm -r test
```

Förväntat: alla tester PASS i `core` och `mcp-server`, inga regressions i befintliga tester.

- [ ] **Steg 2: Kör typecheck**

```
pnpm -r typecheck
```

Förväntat: inga TypeScript-fel.

- [ ] **Steg 3: Verifiera att benchmarkhistorik kan skrivas**

Kör ett programmatiskt test av `appendEntry` + `loadHistory` i en tempkatalog.

- [ ] **Steg 4: Verifiera MCP-tools är registrerade**

Granska `packages/mcp-server/src/server.ts` och bekräfta att `registerAiAudit(server)` och `registerModelBenchmark(server)` finns.

- [ ] **Steg 5: Slut-commit**

```bash
git commit -m "test(ai-audit): verify full AI audit and benchmarking pipeline passes all tests"
```

**Estimat:** 2 timmar | **AI-modell:** [Sonnet]

---

## Testkrav

Alla tester körs utan externa API-anrop:
1. **Heuristik-detektorer:** Rena funktioner på strängar/AST — inga externa beroenden
2. **Git-detektor:** Fixture-repos byggs i `os.tmpdir()` (samma mönster som Sprint 19)
3. **Benchmarker:** `compareToBaseline` tar `runAnalysis`-funktion som parameter — testbar via mock
4. **Benchmark-store:** Testar mot temporär JSON-fil i `os.tmpdir()`, städar upp efter sig

```bash
cd packages/core && pnpm test -- --reporter=verbose tests/ai-audit/
```

---

## Definition of Done

- [ ] Alla 13 Tasks har gröna checkmarks
- [ ] `pnpm -r test` passerar utan regressions
- [ ] `pnpm -r typecheck` passerar utan TypeScript-fel
- [ ] MCP-tool `code_health_ai_audit` returnerar `confidence` och `ai_specific_smells`
- [ ] MCP-tool `code_health_model_benchmark` sparar entries och returnerar `ModelStats`
- [ ] `benchmarks/ai-model-quality-history.json` finns med initial tom struktur
- [ ] `benchmarks/schema.json` validerar historikfilen
- [ ] De 4 `AiSpecificSmellType`-typerna finns i `SmellType`-unionen i `types.ts`
- [ ] `docs/benchmarking-guide.md` täcker hur man kör och tolkar benchmarks
- [ ] `GITHUB_ACTIONS_WORKFLOW_TEMPLATE` är exporterbar och innehåller `fetch-depth: 0`

---

## Risker och etiska överväganden

**Tekniska risker:**

| Risk | Sannolikhet | Mitigering |
|---|---|---|
| Heuristiker ger hög falsk-positiv-andel | Hög | Konfidenspoäng är icke-binär; threshold-konfiguration sänker falska positiver |
| Git-detektion misslyckas vid shallow clones | Hög | Returnerar `undefined` — heuristik-detektion används som fallback |
| JSON-historikfil korrupt vid parallellskrivning | Låg | `appendEntry` är inte trådsäker; CI körs sekvensiellt |
| `detectMissingEdgeCases` flaggar valid kod | Medel | Benchmark mot kodfixtures kalibrerar precision; severity är `low` som default |
| Namngivningskonvention-inferens ger fel baseline | Medel | `style_convention` är valfri — undviker falska positiver om ej angiven |

**Etiska överväganden:**

- **Stigmatisering av AI-genererad kod är inte syftet.** Systemet mäter *kodkvalitet*, inte *ursprung*. Hög AI-konfidenspoäng är inte ett problem i sig — det är den lägre kombinerade hälsopoängen som triggar åtgärder. Kommunikationen i rapporter och dokumentation bör framhäva detta tydligt.
- **Benchmarking är modell-agnostisk.** `model_name` är en fri sträng. Systemet skapar inte en global rankingordning — det ger per-organisation-data baserat på deras specifika kontext och kod. Jämförelser mellan organisationer är inte meningsfulla.
- **CI-flaggning bör inte blockera merges automatiskt.** Workflow-mallen genererar kommentarer men ska inte som default sätta required check-status. Teamet avgör om detta passar deras arbetsflöde.
- **Anonymisering vid känslig referenskod.** Om `reference_code` innehåller känslig affärslogik bör organisationer anonymisera den. All analys i nuvarande implementation är lokal — inga externa API-anrop görs av benchmarking-modulen.

**Totalt estimat:** ~34 timmar fördelade på 13 tasks
