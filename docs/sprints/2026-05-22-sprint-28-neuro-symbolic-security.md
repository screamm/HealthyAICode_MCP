# Sprint 28: Neuro-Symbolisk Säkerhetsanalys

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg ett neuro-symboliskt säkerhetsanalyssystem som kombinerar tree-sitter-baserad statisk analys (det symboliska lagret) med Claude API-anrop för kontextuell bedömning (det neurala lagret). Systemet levererar ett nytt MCP-tool `code_health_security_audit` och ett aggregationslager som kombinerar statiska poäng med LLM-konfidenspoäng till en gemensam `combined_score`. Output är SARIF-kompatibel JSON med per-fynd-metadata inklusive remediering.

**Architecture:** Tre separata lager i `packages/core/src/security/`:
1. **Symboliskt lager** (`static-patterns.ts`, `taint-flow.ts`, `secret-detection.ts`, `dependency-checker.ts`) — deterministisk tree-sitter-analys som producerar `StaticFinding[]` med radplats, typ och statisk riskpoäng.
2. **Neuralt lager** (`llm-assessor.ts`) — tar `StaticFinding[]` + källkodkontext (±20 rader) och anropar Claude API via `@anthropic-ai/sdk`; returnerar `LlmAssessment` med `confidence`, `severity`, `falsePositiveLikelihood` och `remediation`.
3. **Aggregationslager** (`aggregator.ts`) — kombinerar statisk poäng och LLM-konfidenspoäng via formel `final_score = 0.4 * static_score + 0.6 * llm_confidence`; flaggar disagreement-fall (hög statisk poäng + låg LLM-konfidenspoäng) för manuell granskning.

Nytt MCP-tool i `packages/mcp-server/src/tools/security-audit.ts`, registrerat i `server.ts`. Kalibreringskostnadsestimering via `cost-estimation.ts`.

**Tech Stack:** TypeScript 5.x, tree-sitter (befintlig), `@anthropic-ai/sdk` (nytt beroende), Vitest, pnpm workspaces

**Testkommando:** `cd packages/core && pnpm test` och `cd packages/mcp-server && pnpm test`

---

## Akademisk grund och motivation

IRIS-ramverket (presenterat på NeurIPS 2025, "Integrating Retrieval and Inference for Security analysis") demonstrerar att hybrid-approaches som kombinerar statisk analys med LLM-bedömning detekterar 75–80% av sårbarheter jämfört med ~50% för ren statisk analys och ~65% för isolerade LLM-baserade tillvägagångssätt. Nyckeln är att varje lager kompenserar för det andras svagheter:

| Metod | Styrkor | Svagheter |
|---|---|---|
| Ren statisk analys | Hög recall för kända mönster, deterministisk, snabb | Hög andel falska positiver, kan inte förstå semantisk kontext |
| Ren LLM-bedömning | Förstår kontext och avsikt, låg andel falska positiver | Missar mönster som kräver dataflödesanalys, icke-deterministisk |
| Hybrid (IRIS-approach) | Hög recall + låg falsk-positiv-andel | Kräver API-anrop, kostnad per analys |

**Varför ingen befintlig MCP implementerar detta idag:** Befintliga code-health-MCPs (inklusive vår nuvarande implementation) saknar säkerhetsspecifika detektorer. Generella säkerhetsscannrar som Semgrep eller CodeQL exponerar inte en MCP-interface och integrerar inte LLM-bedömning. Vi fyller detta gap med ett system anpassat till vår befintliga analyzer-arkitektur.

**Vad detta INTE är:** Sprint 28 implementerar inte CVE-databasslagning i realtid, dynamisk analys (runtime-exekvering av kod), eller fullständig SAST-certifiering. Fokus är proof-of-concept som validerar detektionsgraden och demonstrerar värdet av hybrid-approach för vår specifika kodbas.

---

## Arkitektur i detalj

### Lager 1 — Symboliskt lager (statisk analys)

Det symboliska lagret producerar `StaticFinding`-objekt med en deterministisk `static_score` i intervallet [0, 1]:

```typescript
// packages/core/src/security/types.ts

export type SecurityFindingType =
  | 'SqlInjectionRisk'
  | 'XssRisk'
  | 'CommandInjectionRisk'
  | 'HardcodedCredential'
  | 'HardcodedApiKey'
  | 'UnsafeDeserialization'
  | 'PathTraversalRisk'
  | 'DependencyVulnerability';

export interface StaticFinding {
  type: SecurityFindingType;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  filePath: string;
  codeSnippet: string;          // ±3 rader kring fyndet
  static_score: number;         // [0, 1] — deterministisk riskpoäng
  taintSource?: string;         // om taint tracking: variabelnamn från user input
  taintSink?: string;           // om taint tracking: sink-typ (sql_query, shell_cmd, file_path)
}
```

**Förenklad taint-flödesalgoritm (pseudokod):**

```
function taintAnalyze(functionNode: SyntaxNode) -> TaintResult[]:
  sources = findTaintSources(functionNode)
    // Sök efter: req.body, req.query, req.params, process.argv,
    //            stdin.read(), fs.readFileSync(userInput), etc.

  for each source in sources:
    propagate(source, visited=Set(), depth=0)

function propagate(node, visited, depth):
  if depth > 10: return  // begränsa rekursionsdjup
  for each assignment where node used on RHS:
    assignedVar = LHS of assignment
    if assignedVar not in visited:
      visited.add(assignedVar)
      // Kontrollera om assignedVar används i en sink
      sinks = findSinks(assignedVar, functionNode)
      for each sink in sinks:
        yield TaintResult(source=node, sink=sink, path=visited)
      propagate(assignedVar, visited, depth+1)

function findSinks(variable, scope) -> Sink[]:
  // SQL sinks: db.query(variable), knex.raw(variable), sequelize.query(variable)
  // Shell sinks: execFile(variable), spawnSync([variable])
  // Path sinks: fs.readFile(variable), fs.writeFile(variable), path.join(..., variable)
  // XSS sinks: res.send(variable), res.write(variable), innerHTML = variable
```

**Secret detection (regex + entropi):**

Hög entropisträngar (Shannon-entropi > 4.5) i kombination med nyckelordsnärhetsanalys (variabelnamn innehåller "key", "secret", "token", "password", "credential"):

```typescript
const HIGH_ENTROPY_THRESHOLD = 4.5;
const MIN_SECRET_LENGTH = 20;

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function isLikelySecret(value: string, varName: string): boolean {
  if (value.length < MIN_SECRET_LENGTH) return false;
  if (shannonEntropy(value) < HIGH_ENTROPY_THRESHOLD) return false;
  return SECRET_KEYWORDS.some(kw => varName.toLowerCase().includes(kw));
}
```

### Lager 2 — Neuralt lager (LLM-bedömning)

LLM-lagret tar emot statiska fynd och ber Claude om kontextuell bedömning. Promptstrategien:

```
SYSTEM: Du är en senior säkerhetsreviewer. Analysera den givna kodsnutten och bedöm
        sannolikheten att det statiska fyndet är ett verkligt säkerhetsproblem.
        Svara ENDAST med ett JSON-objekt i det specificerade formatet.

USER:
Fynd: {finding.type} på rad {finding.line}
Kodsnutt (±20 rader):
```{language}
{contextCode}
```

Statisk riskpoäng: {finding.static_score}

Svara med detta JSON-format:
{
  "confidence": <float 0.0-1.0>,
  "severity": "critical" | "high" | "medium" | "low",
  "false_positive_likelihood": <float 0.0-1.0>,
  "exploitability": "trivial" | "moderate" | "complex" | "theoretical",
  "remediation_code": "<konkret kodsnutt som fixar problemet>",
  "explanation": "<kortfattad förklaring på engelska, max 100 ord>"
}
```

**Rate limiting och retry-logik:**

```typescript
const RATE_LIMIT_DELAY_MS = 1000;      // 1 sekund mellan anrop för Haiku
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // exponentiell backoff

async function assessWithRetry(
  client: Anthropic,
  prompt: string,
  model: string,
  attempt = 0,
): Promise<LlmAssessment> {
  try {
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    return parseAssessment(response.content[0].text);
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    if (isRateLimitError(err)) {
      await sleep(RETRY_DELAYS[attempt]);
      return assessWithRetry(client, prompt, model, attempt + 1);
    }
    throw err;
  }
}
```

### Lager 3 — Aggregationslager

Kombinationsformel:

```
final_score = 0.4 * static_score + 0.6 * llm_confidence

disagreement = static_score > 0.7 AND llm_confidence < 0.3
            OR static_score < 0.3 AND llm_confidence > 0.7

combined_severity = llm_assessment.severity  // LLM vinner vid konflikt
                    UNLESS disagreement       // disagreement → behåll båda, flagga för granskning
```

### SARIF-kompatibelt output-format

```json
{
  "version": "2.1.0",
  "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
  "runs": [{
    "tool": { "driver": { "name": "HealthyAICode-SecurityAudit", "version": "1.0.0" } },
    "results": [{
      "ruleId": "SqlInjectionRisk",
      "level": "error",
      "message": { "text": "Möjlig SQL-injektion via otaint:ad användarinput" },
      "locations": [{
        "physicalLocation": {
          "artifactLocation": { "uri": "src/db/queries.ts" },
          "region": { "startLine": 42, "startColumn": 5 }
        }
      }],
      "properties": {
        "static_score": 0.85,
        "llm_confidence": 0.92,
        "combined_score": 0.892,
        "false_positive_likelihood": 0.08,
        "exploitability": "trivial",
        "remediation_code": "const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);",
        "disagreement": false,
        "model_used": "claude-haiku-4-5",
        "cost_usd": 0.0003
      }
    }]
  }]
}
```

---

## Filöversikt

| Fil | Ändring |
|---|---|
| `packages/core/src/security/types.ts` | Ny — gemensamma typer för alla säkerhetslager |
| `packages/core/src/security/static-patterns.ts` | Ny — tree-sitter-baserade pattern-detektorer (SQL, XSS, command injection, path traversal) |
| `packages/core/src/security/taint-flow.ts` | Ny — förenklad taint-flödesanalys för TypeScript/JavaScript |
| `packages/core/src/security/secret-detection.ts` | Ny — regex + entropibaserad detektion av hårdkodade credentials och API-nycklar |
| `packages/core/src/security/dependency-checker.ts` | Ny — kontrollerar package.json/requirements.txt mot kända CVE-patterns |
| `packages/core/src/security/llm-assessor.ts` | Ny — Claude API-integration med retry-logik och prompt-byggare |
| `packages/core/src/security/aggregator.ts` | Ny — kombinerar statisk poäng och LLM-konfidenspoäng |
| `packages/core/src/security/sarif-formatter.ts` | Ny — formaterar AggregatedFinding[] till SARIF 2.1.0 JSON |
| `packages/core/src/security/cost-estimation.ts` | Ny — beräknar kostnadsuppskattning per scan baserat på antal fynd och modellval |
| `packages/core/src/security/index.ts` | Ny — offentlig API för säkerhetsmodulen |
| `packages/mcp-server/src/tools/security-audit.ts` | Ny — MCP-tool `code_health_security_audit` |
| `packages/mcp-server/src/server.ts` | Ändra — registrera nya verktyget |
| `packages/core/tests/security/static-patterns.test.ts` | Ny testfil |
| `packages/core/tests/security/taint-flow.test.ts` | Ny testfil |
| `packages/core/tests/security/secret-detection.test.ts` | Ny testfil |
| `packages/core/tests/security/aggregator.test.ts` | Ny testfil |
| `packages/core/tests/security/llm-assessor.test.ts` | Ny testfil (mock Claude API) |
| `packages/mcp-server/tests/tools/security-audit.test.ts` | Ny testfil |

---

## Task 1 — Definiera typer i `security/types.ts`

**Files:**
- Create: `packages/core/src/security/types.ts`

Alla säkerhetslager delar en gemensam typvokabulär. Definiera dessa typer först för att undvika cirkulära beroenden och för att ge en stabil kontrakt som mock-tester kan luta sig mot.

- [ ] **Steg 1: Skapa typmodulen**

```typescript
// packages/core/src/security/types.ts

export type SecurityFindingType =
  | 'SqlInjectionRisk'
  | 'XssRisk'
  | 'CommandInjectionRisk'
  | 'HardcodedCredential'
  | 'HardcodedApiKey'
  | 'UnsafeDeserialization'
  | 'PathTraversalRisk'
  | 'DependencyVulnerability';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Exploitability = 'trivial' | 'moderate' | 'complex' | 'theoretical';
export type ScanDepth = 'quick' | 'standard' | 'deep';

export interface StaticFinding {
  type: SecurityFindingType;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  filePath: string;
  codeSnippet: string;
  static_score: number;
  taintSource?: string;
  taintSink?: string;
}

export interface LlmAssessment {
  confidence: number;
  severity: Severity;
  false_positive_likelihood: number;
  exploitability: Exploitability;
  remediation_code: string;
  explanation: string;
  model_used: string;
  cost_usd: number;
}

export interface AggregatedFinding extends StaticFinding {
  llm_assessment: LlmAssessment;
  combined_score: number;
  disagreement: boolean;
  requires_manual_review: boolean;
}

export interface SecurityAuditResult {
  directory: string;
  language: string;
  depth: ScanDepth;
  scanned_files: number;
  findings: AggregatedFinding[];
  total_cost_usd: number;
  sarif: SarifReport;
}

// Minimal SARIF 2.1.0-subset
export interface SarifReport {
  version: '2.1.0';
  runs: SarifRun[];
}
export interface SarifRun {
  tool: { driver: { name: string; version: string } };
  results: SarifResult[];
}
export interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: SarifLocation[];
  properties: Record<string, unknown>;
}
export interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region: { startLine: number; startColumn: number };
  };
}
```

- [ ] **Steg 2: Typecheck**

```
cd packages/core && pnpm typecheck
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/security/types.ts
git commit -m "feat(core/security): add shared type definitions for neuro-symbolic security audit"
```

**Estimat:** 1 timme | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `pnpm typecheck` passerar utan fel
- [ ] Alla typer exporteras och är importerbara från `../security/types`
- [ ] `SecurityFindingType` innehåller samtliga 8 finding-typer
- [ ] `AggregatedFinding` inkluderar båda lagerresultaten: `static_score` och `llm_assessment`

---

## Task 2 — Implementera statiska mönsterdetektorer

**Files:**
- Create: `packages/core/src/security/static-patterns.ts`
- Create: `packages/core/tests/security/static-patterns.test.ts`

Tree-sitter-baserade detektorer för de vanligaste injektionssårbarheterna. Dessa är deterministiska och kräver inga externa API-anrop.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/security/static-patterns.test.ts
import { describe, it, expect } from 'vitest';
import { detectStaticPatterns } from '../../src/security/static-patterns';

describe('detectStaticPatterns — SQL injection', () => {
  it('flags db.query with string concatenation', () => {
    const code = `
      async function getUser(userId: string) {
        const result = await db.query('SELECT * FROM users WHERE id = ' + userId);
        return result;
      }
    `;
    const findings = detectStaticPatterns(code, 'src/db.ts', 'typescript');
    expect(findings.some(f => f.type === 'SqlInjectionRisk')).toBe(true);
  });

  it('does NOT flag parameterized queries', () => {
    const code = `
      async function getUser(userId: string) {
        const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        return result;
      }
    `;
    const findings = detectStaticPatterns(code, 'src/db.ts', 'typescript');
    expect(findings.filter(f => f.type === 'SqlInjectionRisk')).toHaveLength(0);
  });
});

describe('detectStaticPatterns — command injection', () => {
  it('flags execFile with user-controlled argument built via concatenation', () => {
    // Det är SÄTTET argumentet konstrueras (sträng-sammanslagning) som vi detekterar,
    // inte anropet i sig — execFile är säkert när argument är separerade.
    const code = `
      import { execFileSync } from 'child_process';
      function runTool(userInput: string) {
        const arg = '--output=' + userInput;  // sträng-konkatenering med user input
        execFileSync('tool', [arg]);
      }
    `;
    const findings = detectStaticPatterns(code, 'src/runner.ts', 'typescript');
    expect(findings.some(f => f.type === 'CommandInjectionRisk')).toBe(true);
  });
});

describe('detectStaticPatterns — XSS risk', () => {
  it('flags res.send with unescaped user input', () => {
    const code = `
      app.get('/greet', (req, res) => {
        res.send('<h1>Hello ' + req.query.name + '</h1>');
      });
    `;
    const findings = detectStaticPatterns(code, 'src/routes.ts', 'typescript');
    expect(findings.some(f => f.type === 'XssRisk')).toBe(true);
  });
});

describe('detectStaticPatterns — path traversal', () => {
  it('flags fs.readFile with path built from user input', () => {
    const code = `
      import * as fs from 'fs';
      function serveFile(fileName: string) {
        return fs.readFileSync('/uploads/' + fileName);
      }
    `;
    const findings = detectStaticPatterns(code, 'src/files.ts', 'typescript');
    expect(findings.some(f => f.type === 'PathTraversalRisk')).toBe(true);
  });
});
```

- [ ] **Steg 2: Kör testet (FAIL)**

```
cd packages/core && pnpm test -- tests/security/static-patterns.test.ts
```

- [ ] **Steg 3: Implementera `static-patterns.ts`**

Implementera `detectStaticPatterns(code, filePath, language): StaticFinding[]` som via tree-sitter:
- Hittar call-expressions till `db.query`, `knex.raw`, `sequelize.query` med sträng-konkatenering
- Hittar `execFile`, `execFileSync`, `spawnSync` där argument byggs via sträng-konkatenering
- Hittar `res.send`, `res.write`, `innerHTML`-tilldelningar med sträng-konkatenering
- Hittar `fs.readFile`, `fs.readFileSync`, `path.join` med path-byggning från externa variabler

Returnera `StaticFinding[]` med `static_score` baserad på direkt konkatenering (0.85) vs template literals (0.6) vs variabeltilldelning (0.4).

- [ ] **Steg 4: Kör testet (PASS)**

- [ ] **Steg 5: Commit**

```bash
git add packages/core/src/security/static-patterns.ts \
        packages/core/tests/security/static-patterns.test.ts
git commit -m "feat(core/security): add tree-sitter static pattern detectors for SQL/XSS/command injection/path traversal"
```

**Estimat:** 4 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] SQL injection-detektor flaggar sträng-konkatenering i `db.query`
- [ ] SQL injection-detektor flaggar INTE parameteriserade queries (`$1`-placeholders)
- [ ] Command injection-detektor flaggar argument byggda via sträng-konkatenering
- [ ] XSS-detektor flaggar `res.send('<h1>' + req.query.name)`
- [ ] Path traversal-detektor flaggar `fs.readFileSync('/uploads/' + fileName)`
- [ ] `static_score` är i intervallet [0, 1] för alla fynd

---

## Task 3 — Implementera förenklad taint-flödesanalys

**Files:**
- Create: `packages/core/src/security/taint-flow.ts`
- Create: `packages/core/tests/security/taint-flow.test.ts`

Taint-tracking spårar dataflöde från user input-källor till farliga sinks. Detta är det mest komplexa steget i det symboliska lagret.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/security/taint-flow.test.ts
import { describe, it, expect } from 'vitest';
import { analyzeTaintFlow } from '../../src/security/taint-flow';

describe('analyzeTaintFlow — direkt taint', () => {
  it('detekterar direkt input->SQL sink', () => {
    const code = `
      async function findUser(req: Request, res: Response) {
        const userId = req.query.id;
        const rows = await db.query('SELECT * FROM users WHERE id = ' + userId);
        res.json(rows);
      }
    `;
    const flows = analyzeTaintFlow(code, 'typescript');
    expect(flows).toHaveLength(1);
    expect(flows[0].taintSource).toBe('req.query.id');
    expect(flows[0].taintSink).toBe('sql_query');
  });
});

describe('analyzeTaintFlow — indirekta tilldelningar', () => {
  it('spårar taint genom en variabeltilldelning', () => {
    const code = `
      function handleRequest(req: Request) {
        const rawInput = req.body.command;
        const safeArg = rawInput.trim();
        // safeArg är fortfarande taintad trots .trim()
        spawnSync('tool', [safeArg]);
      }
    `;
    const flows = analyzeTaintFlow(code, 'typescript');
    expect(flows.some(f => f.taintSink === 'shell_command')).toBe(true);
  });
});

describe('analyzeTaintFlow — inga falska positiver för konstanter', () => {
  it('flaggar INTE konstanta strängar som taint', () => {
    const code = `
      function runBackup() {
        const arg = '--database=mydb';
        spawnSync('pg_dump', [arg]);
      }
    `;
    const flows = analyzeTaintFlow(code, 'typescript');
    expect(flows).toHaveLength(0);
  });
});
```

- [ ] **Steg 2: Implementera `taint-flow.ts`**

Implementera `analyzeTaintFlow(code, language): TaintFlow[]` där `TaintFlow` utökar `StaticFinding` med `taintSource` och `taintSink`. Algoritmen:
1. Identifiera sources: `req.body.*`, `req.query.*`, `req.params.*`, `process.argv[*]`
2. Propagera via tilldelningskedjan (max 5 hopp)
3. Kontrollera mot sinks: SQL-queries, shell-argument-arrayer, fil-paths, HTML-output
4. Returnera fynd för varje source→sink-flöde

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/security/taint-flow.ts \
        packages/core/tests/security/taint-flow.test.ts
git commit -m "feat(core/security): add simplified taint flow analysis for TypeScript/JavaScript"
```

**Estimat:** 6 timmar | **AI-modell:** [Opus]

**Acceptanskriterier:**
- [ ] Direkt `req.query.id -> db.query`-flöde detekteras korrekt
- [ ] Indirekt taint via mellantilldelning detekteras
- [ ] Konstanta strängar ger inga falska positiver
- [ ] Maxdjup för propagering är konfigurerbart (default 5)
- [ ] `taintSource` och `taintSink` är ifyllda på alla returnerade fynd
- [ ] Analys klarar filer upp till 500 rader på under 2 sekunder

---

## Task 4 — Implementera secret detection

**Files:**
- Create: `packages/core/src/security/secret-detection.ts`
- Create: `packages/core/tests/security/secret-detection.test.ts`

Regex-baserad + entropibaserad detektion av hårdkodade credentials och API-nycklar i källkod.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/security/secret-detection.test.ts
import { describe, it, expect } from 'vitest';
import { detectSecrets, shannonEntropy } from '../../src/security/secret-detection';

describe('shannonEntropy', () => {
  it('returnerar 0 för en sträng med identiska tecken', () => {
    expect(shannonEntropy('aaaa')).toBe(0);
  });

  it('returnerar hög entropin för slumpmässiga strängar', () => {
    expect(shannonEntropy('aB3$kM9xYqW2zLpR')).toBeGreaterThan(3.5);
  });
});

describe('detectSecrets — API-nycklar', () => {
  it('flaggar hårdkodad AWS access key', () => {
    const code = `const AWS_KEY = 'AKIAIOSFODNN7EXAMPLE';`;
    const findings = detectSecrets(code, 'config.ts');
    expect(findings.some(f => f.type === 'HardcodedApiKey')).toBe(true);
  });

  it('flaggar JWT-liknande token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
                '.eyJzdWIiOiIxMjM0NTY3ODkwIn0' +
                '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const code = `const token = '${jwt}';`;
    const findings = detectSecrets(code, 'auth.ts');
    expect(findings.length).toBeGreaterThan(0);
  });

  it('flaggar INTE korrekt miljövariabelreferens', () => {
    const code = `const apiKey = process.env.API_KEY;`;
    const findings = detectSecrets(code, 'config.ts');
    expect(findings.filter(f => f.type === 'HardcodedApiKey')).toHaveLength(0);
  });
});

describe('detectSecrets — lösenord', () => {
  it('flaggar hårdkodat lösenord i variabel', () => {
    const code = `const dbPassword = 'SuperSecret123!@#AbcDef';`;
    const findings = detectSecrets(code, 'db.ts');
    expect(findings.some(f => f.type === 'HardcodedCredential')).toBe(true);
  });
});
```

- [ ] **Steg 2: Implementera `secret-detection.ts`**

```typescript
// packages/core/src/security/secret-detection.ts

export const SECRET_KEYWORDS = [
  'password', 'passwd', 'pwd', 'secret', 'token', 'api_key', 'apikey',
  'access_key', 'private_key', 'auth_key', 'credential', 'api_secret',
];

const AWS_KEY_PATTERN = /AKIA[0-9A-Z]{16}/;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;

export const HIGH_ENTROPY_THRESHOLD = 4.5;
export const MIN_SECRET_LENGTH = 16;

export function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ... implementationsdetaljer via tree-sitter för att hitta string literals
// med kringliggande variabler som innehåller SECRET_KEYWORDS
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/security/secret-detection.ts \
        packages/core/tests/security/secret-detection.test.ts
git commit -m "feat(core/security): add regex + entropy-based secret detection for API keys and credentials"
```

**Estimat:** 3 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] AWS access key-mönster detekteras (`AKIA...`)
- [ ] JWT-tokens detekteras
- [ ] Miljövariabelreferenser (`process.env.*`) ger inga falska positiver
- [ ] Variabelnamn med SECRET_KEYWORDS + hög-entropivärde flaggas
- [ ] `shannonEntropy` exporteras och är enhetstestabl
- [ ] Inga fynd för placeholder-strängar som `<YOUR_API_KEY_HERE>`

---

## Task 5 — Implementera dependency vulnerability checker

**Files:**
- Create: `packages/core/src/security/dependency-checker.ts`
- Create: `packages/core/tests/security/dependency-checker.test.ts`

Läsbaserad kontroll av `package.json` och `requirements.txt` mot en intern lista av kända sårbara paketversioner.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/security/dependency-checker.test.ts
import { describe, it, expect } from 'vitest';
import { checkDependencies } from '../../src/security/dependency-checker';

describe('checkDependencies — package.json', () => {
  it('flaggar känd sårbar lodash-version', () => {
    const packageJson = JSON.stringify({
      dependencies: { 'lodash': '4.17.4' }
    });
    const findings = checkDependencies(packageJson, 'package.json');
    expect(findings.some(f => f.type === 'DependencyVulnerability')).toBe(true);
    expect(findings[0].codeSnippet).toContain('lodash');
  });

  it('flaggar INTE uppdaterad lodash', () => {
    const packageJson = JSON.stringify({
      dependencies: { 'lodash': '4.17.21' }
    });
    const findings = checkDependencies(packageJson, 'package.json');
    expect(findings.filter(f => f.type === 'DependencyVulnerability')).toHaveLength(0);
  });
});
```

- [ ] **Steg 2: Implementera med intern CVE-lista**

Skapa en `KNOWN_VULNERABLE_PACKAGES`-karta med 15-20 väl-kända sårbarheter (lodash < 4.17.21, express < 4.18.0, axios < 0.21.1, etc.) och jämför mot installerade versioner via semver-jämförelse.

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/security/dependency-checker.ts \
        packages/core/tests/security/dependency-checker.test.ts
git commit -m "feat(core/security): add lightweight dependency vulnerability checker for package.json/requirements.txt"
```

**Estimat:** 2 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] Sårbar lodash 4.17.4 detekteras
- [ ] Patchad lodash 4.17.21 ger inga fynd
- [ ] Stöd för `package.json` (npm) och `requirements.txt` (Python pip)
- [ ] CVE-referens ingår i finding-metadata om tillgänglig

---

## Task 6 — Implementera LLM-bedömningslager

**Files:**
- Create: `packages/core/src/security/llm-assessor.ts`
- Create: `packages/core/tests/security/llm-assessor.test.ts`

Claude API-integration med prompt-byggare, retry-logik och kostnadsuppskattning. Rena hjälpfunktioner (`buildAssessmentPrompt`, `parseAssessmentResponse`) är testbara utan API-anrop.

- [ ] **Steg 1: Skriv det failande testet (med mock)**

```typescript
// packages/core/tests/security/llm-assessor.test.ts
import { describe, it, expect } from 'vitest';
import { buildAssessmentPrompt, parseAssessmentResponse } from '../../src/security/llm-assessor';
import type { StaticFinding } from '../../src/security/types';

const mockFinding: StaticFinding = {
  type: 'SqlInjectionRisk',
  line: 10,
  column: 5,
  endLine: 10,
  endColumn: 50,
  filePath: 'src/db.ts',
  codeSnippet: "await db.query('SELECT * FROM users WHERE id = ' + userId);",
  static_score: 0.85,
};

describe('buildAssessmentPrompt', () => {
  it('inkluderar finding-typ i prompten', () => {
    const prompt = buildAssessmentPrompt(mockFinding, 'const userId = req.query.id;', 'typescript');
    expect(prompt).toContain('SqlInjectionRisk');
    expect(prompt).toContain('0.85');
  });

  it('inkluderar kontext-kod i prompten', () => {
    const prompt = buildAssessmentPrompt(mockFinding, 'const userId = req.query.id;', 'typescript');
    expect(prompt).toContain('req.query.id');
  });
});

describe('parseAssessmentResponse', () => {
  it('parsar ett giltigt JSON-svar', () => {
    const json = JSON.stringify({
      confidence: 0.9,
      severity: 'high',
      false_positive_likelihood: 0.1,
      exploitability: 'trivial',
      remediation_code: "db.query('SELECT * FROM users WHERE id = $1', [userId])",
      explanation: 'SQL injection via string concatenation',
    });
    const assessment = parseAssessmentResponse(json, 'claude-haiku-4-5', 0.0003);
    expect(assessment.confidence).toBe(0.9);
    expect(assessment.severity).toBe('high');
    expect(assessment.model_used).toBe('claude-haiku-4-5');
    expect(assessment.cost_usd).toBe(0.0003);
  });

  it('returnerar en fallback-bedömning vid ogiltigt JSON', () => {
    const assessment = parseAssessmentResponse('INVALID JSON', 'claude-haiku-4-5', 0.0001);
    expect(assessment.confidence).toBe(0.5);
    expect(assessment.false_positive_likelihood).toBe(0.5);
  });
});
```

- [ ] **Steg 2: Implementera `llm-assessor.ts`**

Implementera:
- `buildAssessmentPrompt(finding, contextCode, language): string` — bygger SYSTEM+USER-prompt
- `parseAssessmentResponse(text, model, cost): LlmAssessment` — parsar JSON med fallback
- `assessFinding(client, finding, sourceCode, model, depth): Promise<LlmAssessment>` — Claude API-anrop med retry

Modellval baserat på `depth`:
- `quick` → `claude-haiku-4-5`
- `standard` → `claude-sonnet-4-5`
- `deep` → `claude-opus-4-5`

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/security/llm-assessor.ts \
        packages/core/tests/security/llm-assessor.test.ts
git commit -m "feat(core/security): add Claude API LLM assessor with retry logic and prompt builder"
```

**Estimat:** 4 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] `buildAssessmentPrompt` inkluderar finding-typ, statisk poäng och kontext-kod
- [ ] `parseAssessmentResponse` parsar giltig JSON korrekt
- [ ] `parseAssessmentResponse` returnerar fallback-bedömning (confidence=0.5) vid ogiltigt JSON
- [ ] Retry-logik hanterar rate limit-fel med exponentiell backoff
- [ ] Modellval matchar depth-parameter
- [ ] Tester körs utan riktiga API-anrop (funktioner är testbara isolerat via rena funktioner)

---

## Task 7 — Implementera aggregationslager

**Files:**
- Create: `packages/core/src/security/aggregator.ts`
- Create: `packages/core/tests/security/aggregator.test.ts`

Kombinerar statisk poäng och LLM-konfidenspoäng till `combined_score` och identifierar disagreement-fall.

- [ ] **Steg 1: Skriv det failande testet**

```typescript
// packages/core/tests/security/aggregator.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateFindings, detectDisagreement } from '../../src/security/aggregator';
import type { StaticFinding, LlmAssessment } from '../../src/security/types';

const baseFinding: StaticFinding = {
  type: 'SqlInjectionRisk', line: 10, column: 5, endLine: 10, endColumn: 50,
  filePath: 'src/db.ts', codeSnippet: 'db.query(...)', static_score: 0.85,
};

const highConfidenceAssessment: LlmAssessment = {
  confidence: 0.92, severity: 'high', false_positive_likelihood: 0.08,
  exploitability: 'trivial', remediation_code: 'db.query($1, [id])',
  explanation: 'SQL injection risk', model_used: 'claude-haiku-4-5', cost_usd: 0.0003,
};

describe('aggregateFindings', () => {
  it('beräknar combined_score korrekt', () => {
    const result = aggregateFindings(baseFinding, highConfidenceAssessment);
    const expected = 0.4 * 0.85 + 0.6 * 0.92;
    expect(result.combined_score).toBeCloseTo(expected, 4);
  });

  it('sätter disagreement=false vid konsistenta scores', () => {
    const result = aggregateFindings(baseFinding, highConfidenceAssessment);
    expect(result.disagreement).toBe(false);
    expect(result.requires_manual_review).toBe(false);
  });

  it('sätter disagreement=true vid hög statisk + låg LLM', () => {
    const lowConfidenceAssessment = { ...highConfidenceAssessment, confidence: 0.2 };
    const result = aggregateFindings(baseFinding, lowConfidenceAssessment);
    expect(result.disagreement).toBe(true);
    expect(result.requires_manual_review).toBe(true);
  });
});

describe('detectDisagreement', () => {
  it('returnerar true för hög statisk + låg LLM', () => {
    expect(detectDisagreement(0.8, 0.2)).toBe(true);
  });

  it('returnerar true för låg statisk + hög LLM', () => {
    expect(detectDisagreement(0.2, 0.8)).toBe(true);
  });

  it('returnerar false för konsistenta värden', () => {
    expect(detectDisagreement(0.8, 0.85)).toBe(false);
  });
});
```

- [ ] **Steg 2: Implementera `aggregator.ts`**

```typescript
// packages/core/src/security/aggregator.ts
import type { StaticFinding, LlmAssessment, AggregatedFinding } from './types';

const STATIC_WEIGHT = 0.4;
const LLM_WEIGHT = 0.6;

const DISAGREEMENT_THRESHOLD_HIGH = 0.7;
const DISAGREEMENT_THRESHOLD_LOW = 0.3;

export function detectDisagreement(static_score: number, llm_confidence: number): boolean {
  const gap = Math.abs(static_score - llm_confidence);
  if (gap < 0.4) return false;
  return (
    (static_score > DISAGREEMENT_THRESHOLD_HIGH && llm_confidence < DISAGREEMENT_THRESHOLD_LOW) ||
    (static_score < DISAGREEMENT_THRESHOLD_LOW && llm_confidence > DISAGREEMENT_THRESHOLD_HIGH)
  );
}

export function aggregateFindings(
  finding: StaticFinding,
  assessment: LlmAssessment,
): AggregatedFinding {
  const combined_score = STATIC_WEIGHT * finding.static_score + LLM_WEIGHT * assessment.confidence;
  const disagreement = detectDisagreement(finding.static_score, assessment.confidence);
  return {
    ...finding,
    llm_assessment: assessment,
    combined_score: parseFloat(combined_score.toFixed(4)),
    disagreement,
    requires_manual_review: disagreement,
  };
}
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/security/aggregator.ts \
        packages/core/tests/security/aggregator.test.ts
git commit -m "feat(core/security): add confidence-weighted aggregation layer with disagreement detection"
```

**Estimat:** 2 timmar | **AI-modell:** [Opus]

**Acceptanskriterier:**
- [ ] `combined_score = 0.4 * static_score + 0.6 * llm_confidence` med 4 decimaler precision
- [ ] Disagreement detekteras korrekt för kombinationerna hög/låg och låg/hög
- [ ] `requires_manual_review` är alltid `true` när `disagreement` är `true`
- [ ] Alla 5 tester i `aggregator.test.ts` passerar

---

## Task 8 — Implementera SARIF-formatter

**Files:**
- Create: `packages/core/src/security/sarif-formatter.ts`

SARIF 2.1.0-kompatibel JSON-formatter. Ren dataomvandling utan externa beroenden.

- [ ] **Steg 1: Implementera `sarif-formatter.ts`**

```typescript
// packages/core/src/security/sarif-formatter.ts
import type { AggregatedFinding, SarifReport, SarifResult } from './types';

const SEVERITY_TO_LEVEL: Record<string, 'error' | 'warning' | 'note'> = {
  critical: 'error', high: 'error', medium: 'warning', low: 'note',
};

export function formatAsSarif(
  findings: AggregatedFinding[],
  toolVersion = '1.0.0',
): SarifReport {
  return {
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'HealthyAICode-SecurityAudit', version: toolVersion } },
      results: findings.map(toSarifResult),
    }],
  };
}

function toSarifResult(f: AggregatedFinding): SarifResult {
  return {
    ruleId: f.type,
    level: SEVERITY_TO_LEVEL[f.llm_assessment.severity] ?? 'warning',
    message: { text: f.llm_assessment.explanation },
    locations: [{
      physicalLocation: {
        artifactLocation: { uri: f.filePath },
        region: { startLine: f.line, startColumn: f.column },
      },
    }],
    properties: {
      static_score: f.static_score,
      llm_confidence: f.llm_assessment.confidence,
      combined_score: f.combined_score,
      false_positive_likelihood: f.llm_assessment.false_positive_likelihood,
      exploitability: f.llm_assessment.exploitability,
      remediation_code: f.llm_assessment.remediation_code,
      disagreement: f.disagreement,
      requires_manual_review: f.requires_manual_review,
      model_used: f.llm_assessment.model_used,
      cost_usd: f.llm_assessment.cost_usd,
    },
  };
}
```

- [ ] **Steg 2: Commit**

```bash
git add packages/core/src/security/sarif-formatter.ts
git commit -m "feat(core/security): add SARIF 2.1.0 compatible output formatter"
```

**Estimat:** 1 timme | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `version` är `"2.1.0"` i SARIF-output
- [ ] Alla `AggregatedFinding`-fält mappas till korrekt SARIF-property
- [ ] `level` matchar finding-severity korrekt
- [ ] Output validerar mot SARIF 2.1.0 JSON-schema (manuell kontroll)

---

## Task 9 — Implementera kostnadsuppskattning

**Files:**
- Create: `packages/core/src/security/cost-estimation.ts`

Beräknar uppskattad API-kostnad för en scan baserat på antal fynd, modellval och kontextlängd.

- [ ] **Steg 1: Implementera `cost-estimation.ts`**

```typescript
// packages/core/src/security/cost-estimation.ts

// Priser i USD per 1M tokens (uppdaterade 2026-05)
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5':  { input: 0.80,  output: 2.40  },
  'claude-sonnet-4-5': { input: 3.00,  output: 15.00 },
  'claude-opus-4-5':   { input: 15.00, output: 75.00 },
};

const CONTEXT_TOKENS_PER_FINDING = 400;  // ±20 rader + prompt overhead
const OUTPUT_TOKENS_PER_FINDING = 150;   // JSON-svar

export interface CostEstimate {
  model: string;
  findings_count: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_cost_usd: number;
}

export function estimateScanCost(
  findingsCount: number,
  model: string,
): CostEstimate {
  const costs = TOKEN_COSTS[model] ?? TOKEN_COSTS['claude-haiku-4-5'];
  const inputTokens = findingsCount * CONTEXT_TOKENS_PER_FINDING;
  const outputTokens = findingsCount * OUTPUT_TOKENS_PER_FINDING;
  const cost = (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
  return {
    model,
    findings_count: findingsCount,
    estimated_input_tokens: inputTokens,
    estimated_output_tokens: outputTokens,
    estimated_cost_usd: parseFloat(cost.toFixed(6)),
  };
}
```

- [ ] **Steg 2: Commit**

```bash
git add packages/core/src/security/cost-estimation.ts
git commit -m "feat(core/security): add API cost estimation utility for security scan pricing"
```

**Estimat:** 1 timme | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `estimateScanCost(10, 'claude-haiku-4-5')` returnerar ett positivt kostnadsuppskattning
- [ ] Fallback till Haiku-pris om okänd modell
- [ ] `estimated_cost_usd` har 6 decimalers precision

---

## Task 10 — Implementera MCP-tool `code_health_security_audit`

**Files:**
- Create: `packages/mcp-server/src/tools/security-audit.ts`
- Modify: `packages/mcp-server/src/server.ts`
- Create: `packages/mcp-server/tests/tools/security-audit.test.ts`

Yttre MCP-interface som orkestrerar hela analysflödet: statisk analys → LLM-bedömning → aggregation → SARIF-output.

- [ ] **Steg 1: Implementera MCP-verktyget**

```typescript
// packages/mcp-server/src/tools/security-audit.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ScanDepth } from '@healthy-ai-code/core/security/types';

const DEPTH_TO_MODEL: Record<ScanDepth, string> = {
  quick: 'claude-haiku-4-5',
  standard: 'claude-sonnet-4-5',
  deep: 'claude-opus-4-5',
};

export function registerSecurityAudit(server: McpServer): void {
  (server.tool as unknown as McpToolRegistrar)(
    'code_health_security_audit',
    'Kör en neuro-symbolisk säkerhetsanalys (statisk analys + LLM-bedömning) mot en katalog. Returnerar SARIF-kompatibel JSON med per-fynd combined_score, remediering och kostnadsuppskattning.',
    {
      directory: z.string().describe('Absolut sökväg till katalogen att scanna'),
      language: z.enum(['typescript', 'javascript', 'python', 'java']).describe('Primärt programspråk'),
      model: z.string().optional().describe('Claude-modell att använda (default styrs av depth)'),
      depth: z.enum(['quick', 'standard', 'deep']).default('standard')
        .describe('Skandjup: quick=Haiku, standard=Sonnet, deep=Opus'),
      dry_run: z.boolean().default(false)
        .describe('Om true: kör bara statisk analys utan LLM-anrop, returnerar kostnadsuppskattning'),
    },
    async (args) => handleSecurityAudit(args),
  );
}
```

- [ ] **Steg 2: Registrera i `server.ts`**

Lägg till import och registrering i `packages/mcp-server/src/server.ts`:

```typescript
import { registerSecurityAudit } from './tools/security-audit';
// ...
registerMethodCoupling(server);
registerSecurityAudit(server);
registerConfigTools(server);
```

- [ ] **Steg 3: Commit**

```bash
git add packages/mcp-server/src/tools/security-audit.ts \
        packages/mcp-server/src/server.ts \
        packages/mcp-server/tests/tools/security-audit.test.ts
git commit -m "feat(mcp-server): add code_health_security_audit tool with neuro-symbolic analysis"
```

**Estimat:** 4 timmar | **AI-modell:** [Sonnet]

**Acceptanskriterier:**
- [ ] MCP-verktyget exponeras med rätt parameter-schema
- [ ] `dry_run: true` returnerar kostnadsuppskattning utan Claude API-anrop
- [ ] Output är giltig SARIF 2.1.0 JSON
- [ ] Felhantering: saknad API-nyckel returnerar tydligt felmeddelande utan krasch

---

## Task 11 — Benchmark: detektionsrate med och utan LLM

**Files:**
- Create: `packages/core/tests/security/benchmark.test.ts`
- Create: `packages/core/tests/fixtures/security-benchmark-corpus.ts`

Mätbar jämförelse av detektionsrate (precision/recall) för statisk analys baserat på ett labelat testkorpus.

- [ ] **Steg 1: Bygg labelat testkorpus**

Skapa `packages/core/tests/fixtures/security-benchmark-corpus.ts` med 20 kodexempel:
- 10 verkliga sårbarheter (ground truth: positiv)
- 10 säkra kodmönster (ground truth: negativ)

Varje exempel inkluderar `code`, `filePath`, `language`, `expectedFindings: SecurityFindingType[]`.

- [ ] **Steg 2: Skriv benchmark-testet**

```typescript
// packages/core/tests/security/benchmark.test.ts
import { describe, it, expect } from 'vitest';
import { BENCHMARK_CORPUS } from '../fixtures/security-benchmark-corpus';
import { detectStaticPatterns } from '../../src/security/static-patterns';

describe('Detektionsrate benchmark — statisk analys', () => {
  it('uppnår recall >= 70% på verkliga sårbarheter', () => {
    let truePositives = 0;
    let falseNegatives = 0;

    for (const sample of BENCHMARK_CORPUS.filter(s => s.expectedFindings.length > 0)) {
      const findings = detectStaticPatterns(sample.code, sample.filePath, sample.language);
      const detected = sample.expectedFindings.every(expected =>
        findings.some(f => f.type === expected)
      );
      if (detected) truePositives++;
      else falseNegatives++;
    }

    const recall = truePositives / (truePositives + falseNegatives);
    console.log(`Static recall: ${(recall * 100).toFixed(1)}%`);
    expect(recall).toBeGreaterThanOrEqual(0.7);
  });

  it('uppnår precision >= 60%', () => {
    let truePositives = 0;
    let falsePositives = 0;

    for (const sample of BENCHMARK_CORPUS) {
      const findings = detectStaticPatterns(sample.code, sample.filePath, sample.language);
      if (sample.expectedFindings.length > 0) {
        if (findings.length > 0) truePositives++;
      } else {
        if (findings.length > 0) falsePositives++;
      }
    }

    const precision = truePositives / (truePositives + falsePositives);
    console.log(`Static precision: ${(precision * 100).toFixed(1)}%`);
    expect(precision).toBeGreaterThanOrEqual(0.6);
  });
});
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/tests/security/ packages/core/tests/fixtures/security-benchmark-corpus.ts
git commit -m "test(core/security): add labeled benchmark corpus and precision/recall measurement"
```

**Estimat:** 5 timmar | **AI-modell:** [Opus]

**Acceptanskriterier:**
- [ ] Testkorpus innehåller 20 kodexempel (10 positiva, 10 negativa)
- [ ] Recall-mätning passerar (>= 70% för statisk analys)
- [ ] Precisions-mätning passerar (>= 60%)
- [ ] Benchmark-resultat loggas till konsolen för dokumentation
- [ ] Benchmark-testet körs utan API-anrop

---

## Task 12 — Exponera `security/index.ts` och uppdatera typer

**Files:**
- Create: `packages/core/src/security/index.ts`
- Modify: `packages/core/src/types.ts`

Offentlig API för säkerhetsmodulen samt registrering av nya SmellTypes.

- [ ] **Steg 1: Skapa `index.ts`**

```typescript
// packages/core/src/security/index.ts
export type {
  SecurityFindingType, StaticFinding, LlmAssessment,
  AggregatedFinding, SecurityAuditResult, SarifReport,
} from './types';
export { detectStaticPatterns } from './static-patterns';
export { analyzeTaintFlow } from './taint-flow';
export { detectSecrets, shannonEntropy } from './secret-detection';
export { checkDependencies } from './dependency-checker';
export { assessFinding, buildAssessmentPrompt, parseAssessmentResponse } from './llm-assessor';
export { aggregateFindings, detectDisagreement } from './aggregator';
export { formatAsSarif } from './sarif-formatter';
export { estimateScanCost } from './cost-estimation';
```

- [ ] **Steg 2: Lägg till nya SmellTypes i `types.ts`**

Utöka `SmellType`-unionen i `packages/core/src/types.ts`:

```typescript
  | 'MethodTemporalCoupling'
  | 'SqlInjectionRisk'
  | 'XssRisk'
  | 'CommandInjectionRisk'
  | 'HardcodedCredential'
  | 'HardcodedApiKey'
  | 'UnsafeDeserialization'
  | 'PathTraversalRisk'
  | 'DependencyVulnerability';
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/src/security/index.ts packages/core/src/types.ts
git commit -m "feat(core/security): export public security module API and register security SmellTypes"
```

**Estimat:** 1 timme | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] Alla publika funktioner är importerbara via `@healthy-ai-code/core/security`
- [ ] `SmellType`-unionen inkluderar samtliga 8 säkerhetstyper
- [ ] `pnpm -r typecheck` passerar utan fel

---

## Task 13 — Lägg till `@anthropic-ai/sdk` som beroende

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/mcp-server/package.json`

- [ ] **Steg 1: Lägg till beroende**

```bash
cd packages/core && pnpm add @anthropic-ai/sdk
cd packages/mcp-server && pnpm add @anthropic-ai/sdk
```

- [ ] **Steg 2: Verifiera att import fungerar i TypeScript**

```typescript
// Verifiera i en testfil att importen resolvas korrekt:
import Anthropic from '@anthropic-ai/sdk';
// typeof Anthropic === 'function' -> ok
```

- [ ] **Steg 3: Commit**

```bash
git add packages/core/package.json packages/mcp-server/package.json
git commit -m "chore: add @anthropic-ai/sdk dependency for LLM security assessment integration"
```

**Estimat:** 30 minuter | **AI-modell:** [Haiku]

**Acceptanskriterier:**
- [ ] `@anthropic-ai/sdk` finns i `dependencies` för båda paketen
- [ ] `pnpm install` körs utan konflikter
- [ ] Import av `Anthropic` fungerar utan TypeScript-typfel

---

## Task 14 — Fullständig testsvit och final granskning

**Files:**
- Alla testfiler i `packages/core/tests/security/`
- Alla testfiler i `packages/mcp-server/tests/tools/`

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

- [ ] **Steg 3: Kör self-audit i dry_run-läge**

Kör `code_health_security_audit` med `dry_run: true` mot `packages/core/src/` för att validera att den statiska analysen fungerar end-to-end utan API-anrop. Verifiera att output är parsbar SARIF 2.1.0 JSON.

- [ ] **Steg 4: Slut-commit**

```bash
git commit -m "test(security): verify all security module tests pass and full pipeline works end-to-end"
```

**Estimat:** 2 timmar | **AI-modell:** [Sonnet]

---

## Testkrav

Alla tester körs utan riktiga Claude API-anrop. Strategin:
1. **Rena funktioner testbara isolerat:** `buildAssessmentPrompt`, `parseAssessmentResponse`, `aggregateFindings`, `detectDisagreement`, `shannonEntropy`, `estimateScanCost` — testbara utan mocking
2. **LLM-integrationstester:** Skipas i CI om `ANTHROPIC_API_KEY` saknas i miljön via `it.skipIf(!process.env.ANTHROPIC_API_KEY, ...)`
3. **Benchmark-tester:** Kräver ingen API-nyckel — mäter enbart statisk analys

```bash
cd packages/core && pnpm test -- --reporter=verbose tests/security/
```

---

## Definition of Done

- [ ] Alla 14 Tasks har gröna checkmarks
- [ ] `pnpm -r test` passerar utan regressions i befintliga tester
- [ ] `pnpm -r typecheck` passerar utan TypeScript-fel
- [ ] MCP-tool `code_health_security_audit` svarar med giltig SARIF 2.1.0 JSON
- [ ] `dry_run: true` returnerar kostnadsuppskattning utan API-anrop
- [ ] Benchmark-testet dokumenterar precision/recall-baseline för statisk analys
- [ ] `@anthropic-ai/sdk` är registrerat i båda paketen
- [ ] Alla 8 `SecurityFindingType`-typer finns i `SmellType`-unionen i `types.ts`
- [ ] Disagreement-detection fungerar korrekt i aggregationslager-testerna

---

## Risker och etiska överväganden

**Tekniska risker:**

| Risk | Sannolikhet | Mitigering |
|---|---|---|
| LLM returnerar icke-parsbar JSON | Medel | `parseAssessmentResponse` har robust fallback-logik (confidence=0.5) |
| Taint-flödesanalys med hög falsk-positiv-andel | Hög | Benchmark-testet mäter precision; höj `static_score`-tröskel vid behov |
| API-kostnad överstiger budget vid djup scan | Låg | `dry_run`-mode och `estimateScanCost` exponeras för förhandsbedömning |
| tree-sitter klarar inte alla syntaxvarianter | Medel | Graceful degradation: fynd med `static_score = 0` om parsing misslyckas |
| Rate limiting vid stora scanningar | Låg | Exponentiell backoff i Task 6 med konfigurerbara delays |

**Etiska överväganden:**

- **Falska negativa är farligare än falska positiva** i säkerhetskontext. Sprint 28 prioriterar recall (hitta alla) över precision (undvika falsklarm) i den statiska fasen, och använder LLM-lagret för att reducera falska positiver i en andra fas.
- **LLM-bedömning är inte deterministisk.** Säkerhetsbeslut baserade enbart på LLM-output bör inte tas autonomt. `requires_manual_review: true` för disagreement-fall är ett designmässigt val som bevarar mänsklig granskning i loop:en.
- **Källkod skickas externt.** Källkod skickas till Claude API i ±20-raders-snuttar. Organisationer med stränga datasekretessregler bör använda `dry_run: true` och granska sekretessimplikationerna innan LLM-lagret aktiveras i produktion.
- **Dependency-listan är statisk.** Verktyget kontrollerar mot ett hårdkodat snapshot av kända sårbarheter. Det kompletterar, men ersätter inte, löpande CVE-databasslagning via Dependabot eller npm audit.

**Totalt estimat:** ~33 timmar fördelade på 14 tasks
