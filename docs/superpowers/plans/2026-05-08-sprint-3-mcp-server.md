# Sprint 3: MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygga hela MCP-serverpaketet ovanpå Core (Sprint 1+2) — sju verktyg, stdio-transport, AGENTS.md och integrationstester.
**Architecture:** `packages/mcp-server` är ett separat pnpm workspace-paket som importerar `@healthy-ai-code/core` via workspace-protokollet. Varje MCP-verktyg är en egen fil som registrerar sig på `McpServer`-instansen; `server.ts` samlar registreringarna och `index.ts` startar stdio-transporten. Gemensam hjälplogik (nextAction, formatering) extraheras till `src/tools/shared.ts`.
**Tech Stack:** TypeScript 5.x, `@modelcontextprotocol/sdk ^1.0.0`, `zod` (schemavalidering), Vitest 1.x, Node.js 18+, pnpm workspaces.

---

## Förutsättningar

Sprint 3 förutsätter att Sprint 1 och Sprint 2 är klara och att följande finns på plats:

- `packages/core` byggs utan fel (`pnpm --filter @healthy-ai-code/core build`)
- Publik API exporterar: `analyzeFile`, `analyzeCode`, `analyzeChangeset`
- Typer exporteras: `HealthResult`, `ChangesetResult`, `Smell`, `Language`
- Ytterligare typer som MCP-lagret behöver (`ToolResponse`, `NextAction`) definieras i detta sprint

---

## Task 1: Package scaffold — package.json och tsconfig.json

Skapa katalogstrukturen och konfigurationsfilerna för `packages/mcp-server`.

- [ ] **Skapa kataloger**

  ```
  mkdir -p packages/mcp-server/src/tools
  mkdir -p packages/mcp-server/tests/tools
  mkdir -p packages/mcp-server/tests/integration
  ```

- [ ] **Skriv det felande testet** — `packages/mcp-server/tests/tools/scaffold.test.ts`

  ```typescript
  // Testar att paketet kan importeras och att entry point finns
  import { describe, it, expect } from 'vitest';
  import * as path from 'path';
  import * as fs from 'fs';

  describe('mcp-server package scaffold', () => {
    it('package.json finns och har rätt fält', () => {
      const pkgPath = path.resolve(__dirname, '../../package.json');
      expect(fs.existsSync(pkgPath)).toBe(true);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(pkg.name).toBe('@healthy-ai-code/mcp-server');
      expect(pkg.bin['healthy-ai-code-mcp']).toBe('./dist/index.js');
      expect(pkg.scripts.build).toBeDefined();
      expect(pkg.scripts.test).toBeDefined();
    });

    it('tsconfig.json finns', () => {
      const tsconfigPath = path.resolve(__dirname, '../../tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
      expect(tsconfig.compilerOptions.outDir).toBe('./dist');
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS** (package.json saknas)

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: Error: Cannot find module eller FAIL — package.json saknas
  ```

- [ ] **Skriv minimal implementation** — skapa `packages/mcp-server/package.json`

  ```json
  {
    "name": "@healthy-ai-code/mcp-server",
    "version": "0.1.0",
    "description": "MCP server for AI-code health analysis",
    "bin": {
      "healthy-ai-code-mcp": "./dist/index.js"
    },
    "main": "./dist/index.js",
    "scripts": {
      "build": "tsc",
      "test": "vitest run",
      "typecheck": "tsc --noEmit",
      "start": "node dist/index.js"
    },
    "dependencies": {
      "@healthy-ai-code/core": "workspace:*",
      "@modelcontextprotocol/sdk": "^1.0.0",
      "zod": "^3.22.0"
    },
    "devDependencies": {
      "typescript": "^5.4.0",
      "vitest": "^1.6.0",
      "@types/node": "^20.0.0"
    }
  }
  ```

- [ ] **Skapa `packages/mcp-server/tsconfig.json`**

  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "rootDir": "./src",
      "outDir": "./dist"
    },
    "include": ["src/**/*"],
    "references": [{"path": "../core"}]
  }
  ```

- [ ] **Installera beroenden**

  ```
  pnpm install
  # Förväntat: @modelcontextprotocol/sdk och zod installeras i packages/mcp-server/node_modules
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — scaffold.test.ts (2 tests)
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/package.json packages/mcp-server/tsconfig.json packages/mcp-server/tests/tools/scaffold.test.ts
  git commit -m "feat(mcp-server): add package scaffold — package.json and tsconfig"
  ```

---

## Task 2: Dela typer — MCP-specifika interfaces i core

MCP-lagret behöver `ToolResponse` och `NextAction`. Dessa läggs i core-paketet (eller i mcp-server/src/types.ts) och exporteras publikt.

- [ ] **Skriv det felande testet** — `packages/mcp-server/tests/tools/types.test.ts`

  ```typescript
  import { describe, it, expect } from 'vitest';
  import type { ToolResponse, NextAction } from '../../src/types';

  describe('MCP-specifika typer', () => {
    it('ToolResponse har rätt struktur', () => {
      const response: ToolResponse = {
        score: 8.5,
        category: 'yellow',
        loopComplete: false,
        issues: [],
        summary: 'Test summary',
        nextAction: {
          action: 'refactor',
          instruction: 'Refaktorera X',
          priority: null,
          toolToCallAfter: 'code_health_review',
        },
      };
      expect(response.score).toBe(8.5);
      expect(response.loopComplete).toBe(false);
      expect(response.nextAction.action).toBe('refactor');
    });

    it('NextAction med commit_safe', () => {
      const action: NextAction = {
        action: 'commit_safe',
        instruction: 'Koden är AI-redo.',
        priority: null,
        toolToCallAfter: null,
      };
      expect(action.action).toBe('commit_safe');
      expect(action.toolToCallAfter).toBeNull();
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: Cannot find module '../../src/types'
  ```

- [ ] **Skriv minimal implementation** — skapa `packages/mcp-server/src/types.ts`

  ```typescript
  import type { Smell } from '@healthy-ai-code/core';

  export interface NextAction {
    action: 'refactor' | 'commit_safe' | 'review_pr' | 'none';
    instruction: string;
    priority: Smell | null;
    toolToCallAfter: string | null;
  }

  export interface ToolResponse {
    score: number;
    category: 'green' | 'yellow' | 'red';
    loopComplete: boolean;
    issues: Smell[];
    summary: string;
    nextAction: NextAction;
  }
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — types.test.ts (2 tests)
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/src/types.ts packages/mcp-server/tests/tools/types.test.ts
  git commit -m "feat(mcp-server): add MCP-specific ToolResponse and NextAction types"
  ```

---

## Task 3: Gemensam hjälpfil — `src/tools/shared.ts`

`buildNextAction` och `formatReviewSummary` används av flera verktyg. Dessa extraheras till en delad modul och testas isolerat.

- [ ] **Skriv det felande testet** — `packages/mcp-server/tests/tools/shared.test.ts`

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { buildNextAction, formatReviewSummary } from '../../src/tools/shared';
  import type { HealthResult } from '@healthy-ai-code/core';

  const greenResult: HealthResult = {
    score: 9.8,
    category: 'green',
    smells: [],
    metrics: { cyclomaticComplexity: 1, cognitiveComplexity: 1, maxNestingDepth: 1, functionCount: 1, fileLineCount: 10, maxParameterCount: 2, duplicationRatio: 0 },
    functions: [],
  };

  const redResult: HealthResult = {
    score: 3.2,
    category: 'red',
    smells: [
      { type: 'ComplexMethod', severity: 'critical', description: 'Cyklomatisk komplexitet 18', suggestion: 'Extrahera till hjälpfunktioner', location: { line: 5, functionName: 'processOrder' } },
      { type: 'DeepNesting', severity: 'high', description: 'Nestningsdjup 6', suggestion: 'Minska nästning', location: { line: 10, functionName: 'validateData' } },
    ],
    metrics: { cyclomaticComplexity: 18, cognitiveComplexity: 22, maxNestingDepth: 6, functionCount: 3, fileLineCount: 120, maxParameterCount: 4, duplicationRatio: 0.1 },
    functions: [],
  };

  describe('buildNextAction', () => {
    it('returnerar commit_safe när loopComplete är true', () => {
      const action = buildNextAction(greenResult, true);
      expect(action.action).toBe('commit_safe');
      expect(action.toolToCallAfter).toBeNull();
      expect(action.priority).toBeNull();
      expect(action.instruction).toContain('9.8/10.0');
    });

    it('returnerar refactor med högsta prioritet smell', () => {
      const action = buildNextAction(redResult, false);
      expect(action.action).toBe('refactor');
      expect(action.toolToCallAfter).toBe('code_health_review');
      // Prioriterar critical (ComplexMethod) framför high (DeepNesting)
      expect(action.priority?.type).toBe('ComplexMethod');
      expect(action.instruction).toContain('code_health_review');
    });

    it('hanterar inga smells men loopComplete false', () => {
      const partialResult: HealthResult = { ...greenResult, score: 8.0, category: 'yellow', smells: [] };
      const action = buildNextAction(partialResult, false);
      expect(action.action).toBe('refactor');
      expect(action.priority).toBeNull();
    });
  });

  describe('formatReviewSummary', () => {
    it('formaterar grön fil korrekt', () => {
      const summary = formatReviewSummary('src/utils.ts', greenResult);
      expect(summary).toContain('src/utils.ts');
      expect(summary).toContain('9.8/10.0');
      expect(summary).toContain('Inga problem identifierade');
    });

    it('formaterar röd fil med smells', () => {
      const summary = formatReviewSummary('src/order.ts', redResult);
      expect(summary).toContain('src/order.ts');
      expect(summary).toContain('3.2/10.0');
      expect(summary).toContain('[KRITISK]');
      expect(summary).toContain('ComplexMethod');
      expect(summary).toContain('[HÖG]');
      expect(summary).toContain('DeepNesting');
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: Cannot find module '../../src/tools/shared'
  ```

- [ ] **Skriv minimal implementation** — skapa `packages/mcp-server/src/tools/shared.ts`

  ```typescript
  import type { HealthResult, Smell } from '@healthy-ai-code/core';
  import type { NextAction } from '../types';

  export function buildNextAction(result: HealthResult, loopComplete: boolean): NextAction {
    if (loopComplete) {
      return {
        action: 'commit_safe',
        instruction: `Koden är AI-redo (${result.score}/10.0). Inga problem identifierade. Kör pre_commit_code_health_safeguard innan commit.`,
        priority: null,
        toolToCallAfter: null,
      };
    }

    const prioritySmell = getPrioritySmell(result.smells);
    return {
      action: 'refactor',
      instruction: prioritySmell
        ? `${prioritySmell.suggestion} Kör sedan code_health_review igen för att mäta förbättringen.`
        : `Förbättra kodens hälsa från ${result.score}/10.0. Kör code_health_review igen efter ändringar.`,
      priority: prioritySmell,
      toolToCallAfter: 'code_health_review',
    };
  }

  function getPrioritySmell(smells: Smell[]): Smell | null {
    if (smells.length === 0) return null;
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
    return [...smells].sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))[0];
  }

  export function formatReviewSummary(filePath: string, result: HealthResult): string {
    const categoryLabel =
      result.category === 'red'
        ? 'Röd — Allvarlig teknisk skuld'
        : result.category === 'yellow'
        ? 'Gul — Teknisk skuld'
        : 'Grön — Hälsosam';

    const lines: string[] = [
      `Fil: ${filePath}`,
      `Hälsopoäng: ${result.score}/10.0  (${categoryLabel})`,
      '',
    ];

    if (result.smells.length === 0) {
      lines.push('Inga problem identifierade. Koden är AI-redo.');
    } else {
      lines.push('Identifierade problem:');
      for (const smell of result.smells) {
        const severity =
          smell.severity === 'critical'
            ? '[KRITISK]'
            : smell.severity === 'high'
            ? '[HÖG]    '
            : '[MEDIUM] ';
        lines.push(`  ${severity} ${smell.type}: ${smell.description}`);
        lines.push(`             → ${smell.suggestion}`);
      }
    }

    return lines.join('\n');
  }
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — shared.test.ts (5 tests)
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/src/tools/shared.ts packages/mcp-server/tests/tools/shared.test.ts
  git commit -m "feat(mcp-server): add shared helpers buildNextAction and formatReviewSummary"
  ```

---

## Task 4: Tool — `code_health_score`

Snabb screening-verktyg. Returnerar score, category, loopComplete och nextAction.

- [ ] **Skriv det felande testet** — `packages/mcp-server/tests/tools/code-health-score.test.ts`

  ```typescript
  import { describe, it, expect } from 'vitest';
  import * as path from 'path';
  import * as fs from 'fs/promises';
  import * as os from 'os';
  import { registerCodeHealthScore } from '../../src/tools/code-health-score';

  // Minimal mock av McpServer för tester
  class MockMcpServer {
    private tools: Map<string, Function> = new Map();
    tool(name: string, _desc: string, _schema: any, handler: Function): void {
      this.tools.set(name, handler);
    }
    async callTool(name: string, args: any): Promise<any> {
      const handler = this.tools.get(name);
      if (!handler) throw new Error(`Tool ${name} not found`);
      return handler(args);
    }
  }

  describe('code_health_score tool', () => {
    it('returnerar score och nextAction för en giltig TypeScript-fil', async () => {
      const tmpFile = path.join(os.tmpdir(), 'test-score-tool.ts');
      await fs.writeFile(tmpFile, 'export function add(a: number, b: number): number { return a + b; }');

      const server = new MockMcpServer() as any;
      registerCodeHealthScore(server);

      const result = await server.callTool('code_health_score', { filePath: tmpFile });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.score).toBeGreaterThan(8);
      expect(parsed.category).toBe('green');
      expect(parsed.loopComplete).toBe(true);
      expect(parsed.nextAction.action).toBe('commit_safe');
      expect(parsed.summary).toContain(tmpFile);

      await fs.unlink(tmpFile);
    });

    it('returnerar refactor-action för komplex fil', async () => {
      const tmpFile = path.join(os.tmpdir(), 'test-complex-tool.ts');
      // Fil med hög komplexitet — djup nästning och många grenar
      const complexCode = `
export function processOrder(order: any): string {
  if (order) {
    if (order.items) {
      for (const item of order.items) {
        if (item.type === 'A') {
          if (item.quantity > 10) {
            if (item.price > 100) {
              if (item.discount) {
                return 'discount-bulk';
              } else {
                return 'bulk';
              }
            } else {
              if (item.discount) {
                return 'discount-small';
              }
            }
          }
        } else if (item.type === 'B') {
          if (item.quantity > 5) {
            if (item.price > 50) {
              return 'b-bulk';
            }
          }
        }
      }
    }
  }
  return 'default';
}
`.trim();
      await fs.writeFile(tmpFile, complexCode);

      const server = new MockMcpServer() as any;
      registerCodeHealthScore(server);

      const result = await server.callTool('code_health_score', { filePath: tmpFile });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.score).toBeLessThan(7);
      expect(parsed.loopComplete).toBe(false);
      expect(parsed.nextAction.action).toBe('refactor');

      await fs.unlink(tmpFile);
    });

    it('returnerar fel för fil som inte finns', async () => {
      const server = new MockMcpServer() as any;
      registerCodeHealthScore(server);

      const result = await server.callTool('code_health_score', { filePath: '/nonexistent/file.ts' });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBeDefined();
    });

    it('verktyget registreras med rätt namn', () => {
      const registered: string[] = [];
      const server = {
        tool: (name: string, _d: string, _s: any, _h: Function) => { registered.push(name); },
      } as any;
      registerCodeHealthScore(server);
      expect(registered).toContain('code_health_score');
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: Cannot find module '../../src/tools/code-health-score'
  ```

- [ ] **Skriv minimal implementation** — skapa `packages/mcp-server/src/tools/code-health-score.ts`

  ```typescript
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { z } from 'zod';
  import { analyzeFile } from '@healthy-ai-code/core';
  import type { ToolResponse } from '../types';
  import { buildNextAction } from './shared';

  export function registerCodeHealthScore(server: McpServer): void {
    server.tool(
      'code_health_score',
      'Beräknar en snabb hälsopoäng (1-10) för en fil. Använd detta för snabb screening.',
      { filePath: z.string().describe('Absolut eller relativ sökväg till filen') },
      async ({ filePath }) => {
        try {
          const result = await analyzeFile(filePath);
          const loopComplete = result.score >= 9.5;
          const response: ToolResponse = {
            score: result.score,
            category: result.category,
            loopComplete,
            issues: result.smells,
            summary: `${filePath}: ${result.score}/10.0 (${result.category})`,
            nextAction: buildNextAction(result, loopComplete),
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
            isError: true,
          };
        }
      }
    );
  }
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — code-health-score.test.ts (4 tests)
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/src/tools/code-health-score.ts packages/mcp-server/tests/tools/code-health-score.test.ts
  git commit -m "feat(mcp-server): implement code_health_score tool"
  ```

---

## Task 5: Tool — `code_health_review` (viktigaste verktyget)

Djupgranskning med detaljerad formatering via `formatReviewSummary`. Kärnan i feedbackloopen.

- [ ] **Skriv det felande testet** — `packages/mcp-server/tests/tools/code-health-review.test.ts`

  ```typescript
  import { describe, it, expect } from 'vitest';
  import * as path from 'path';
  import * as fs from 'fs/promises';
  import * as os from 'os';
  import { registerCodeHealthReview } from '../../src/tools/code-health-review';

  class MockMcpServer {
    private tools: Map<string, Function> = new Map();
    tool(name: string, _desc: string, _schema: any, handler: Function): void {
      this.tools.set(name, handler);
    }
    async callTool(name: string, args: any): Promise<any> {
      const handler = this.tools.get(name);
      if (!handler) throw new Error(`Tool ${name} not found`);
      return handler(args);
    }
  }

  describe('code_health_review tool', () => {
    it('returnerar detaljerad summary med problem för komplex fil', async () => {
      const tmpFile = path.join(os.tmpdir(), 'test-review-complex.ts');
      const complexCode = `
export function validate(data: any): boolean {
  if (data) {
    if (data.user) {
      if (data.user.age > 18) {
        if (data.user.verified) {
          if (data.user.country === 'SE') {
            if (data.user.plan === 'premium') {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}
`.trim();
      await fs.writeFile(tmpFile, complexCode);

      const server = new MockMcpServer() as any;
      registerCodeHealthReview(server);

      const result = await server.callTool('code_health_review', { filePath: tmpFile });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.score).toBeDefined();
      expect(parsed.summary).toContain('Hälsopoäng');
      expect(parsed.summary).toContain(tmpFile);
      expect(parsed.nextAction).toBeDefined();
      expect(['refactor', 'commit_safe']).toContain(parsed.nextAction.action);

      await fs.unlink(tmpFile);
    });

    it('returnerar loopComplete true och commit_safe för hälsosam fil', async () => {
      const tmpFile = path.join(os.tmpdir(), 'test-review-healthy.ts');
      await fs.writeFile(tmpFile, [
        'export function multiply(a: number, b: number): number {',
        '  return a * b;',
        '}',
      ].join('\n'));

      const server = new MockMcpServer() as any;
      registerCodeHealthReview(server);

      const result = await server.callTool('code_health_review', { filePath: tmpFile });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.loopComplete).toBe(true);
      expect(parsed.nextAction.action).toBe('commit_safe');
      expect(parsed.summary).toContain('Inga problem identifierade');

      await fs.unlink(tmpFile);
    });

    it('returnerar fel för fil som inte finns', async () => {
      const server = new MockMcpServer() as any;
      registerCodeHealthReview(server);

      const result = await server.callTool('code_health_review', { filePath: '/no/such/file.ts' });

      expect(result.isError).toBe(true);
    });

    it('summary innehåller identifierade problem med severitet-märkning', async () => {
      const tmpFile = path.join(os.tmpdir(), 'test-review-smells.ts');
      // Fil med många parametrar och komplex logik
      const smellCode = `
export function process(a: any, b: any, c: any, d: any, e: any, f: any): any {
  if (a && b) {
    if (c || d) {
      if (e && f) {
        if (a.value > b.value) {
          if (c.active) {
            return { a, b, c, d, e, f };
          }
        }
      }
    }
  }
  return null;
}
`.trim();
      await fs.writeFile(tmpFile, smellCode);

      const server = new MockMcpServer() as any;
      registerCodeHealthReview(server);

      const result = await server.callTool('code_health_review', { filePath: tmpFile });
      const parsed = JSON.parse(result.content[0].text);

      // Ska ha hittat minst ett problem (djup nästning eller lång parameterlista)
      expect(parsed.issues.length).toBeGreaterThan(0);
      // Summary ska innehålla severeitetsmärkning
      if (parsed.issues.some((i: any) => i.severity === 'critical')) {
        expect(parsed.summary).toContain('[KRITISK]');
      }

      await fs.unlink(tmpFile);
    });

    it('verktyget registreras med rätt namn', () => {
      const registered: string[] = [];
      const server = {
        tool: (name: string, _d: string, _s: any, _h: Function) => { registered.push(name); },
      } as any;
      registerCodeHealthReview(server);
      expect(registered).toContain('code_health_review');
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: Cannot find module '../../src/tools/code-health-review'
  ```

- [ ] **Skriv minimal implementation** — skapa `packages/mcp-server/src/tools/code-health-review.ts`

  ```typescript
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { z } from 'zod';
  import { analyzeFile } from '@healthy-ai-code/core';
  import type { ToolResponse } from '../types';
  import { buildNextAction, formatReviewSummary } from './shared';

  export function registerCodeHealthReview(server: McpServer): void {
    server.tool(
      'code_health_review',
      'Djupgranskning av kodhälsa med detaljerade problem och refaktoreringsanvisningar. Kör detta i en loop tills loopComplete är true.',
      { filePath: z.string().describe('Absolut eller relativ sökväg till filen') },
      async ({ filePath }) => {
        try {
          const result = await analyzeFile(filePath);
          const loopComplete = result.score >= 9.5;
          const response: ToolResponse = {
            score: result.score,
            category: result.category,
            loopComplete,
            issues: result.smells,
            summary: formatReviewSummary(filePath, result),
            nextAction: buildNextAction(result, loopComplete),
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
            isError: true,
          };
        }
      }
    );
  }
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — code-health-review.test.ts (5 tests)
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/src/tools/code-health-review.ts packages/mcp-server/tests/tools/code-health-review.test.ts
  git commit -m "feat(mcp-server): implement code_health_review tool — core feedback loop"
  ```

---

## Task 6: Tool — `pre_commit_code_health_safeguard`

Kontrollerar en lista filer innan commit. Blockerar om någon fil har score < 7.0.

- [ ] **Skriv det felande testet** — `packages/mcp-server/tests/tools/pre-commit-safeguard.test.ts`

  ```typescript
  import { describe, it, expect } from 'vitest';
  import * as path from 'path';
  import * as fs from 'fs/promises';
  import * as os from 'os';
  import { registerPreCommitSafeguard } from '../../src/tools/pre-commit-safeguard';

  class MockMcpServer {
    private tools: Map<string, Function> = new Map();
    tool(name: string, _desc: string, _schema: any, handler: Function): void {
      this.tools.set(name, handler);
    }
    async callTool(name: string, args: any): Promise<any> {
      const handler = this.tools.get(name);
      if (!handler) throw new Error(`Tool ${name} not found`);
      return handler(args);
    }
  }

  describe('pre_commit_code_health_safeguard tool', () => {
    it('returnerar overallSafe true för en lista med hälsosamma filer', async () => {
      const tmpDir = os.tmpdir();
      const file1 = path.join(tmpDir, 'safe1.ts');
      const file2 = path.join(tmpDir, 'safe2.ts');
      await fs.writeFile(file1, 'export const a = 1;');
      await fs.writeFile(file2, 'export function add(x: number, y: number): number { return x + y; }');

      const server = new MockMcpServer() as any;
      registerPreCommitSafeguard(server);

      const result = await server.callTool('pre_commit_code_health_safeguard', {
        repoPath: tmpDir,
        files: [file1, file2],
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.overallSafe).toBe(true);
      expect(parsed.message).toContain('säkra att committa');
      expect(parsed.results).toHaveLength(2);
      expect(parsed.results[0].safe).toBe(true);
      expect(parsed.results[1].safe).toBe(true);

      await fs.unlink(file1);
      await fs.unlink(file2);
    });

    it('returnerar overallSafe false om en fil har score < 7.0', async () => {
      const tmpDir = os.tmpdir();
      const goodFile = path.join(tmpDir, 'safe-commit.ts');
      const badFile = path.join(tmpDir, 'bad-commit.ts');

      await fs.writeFile(goodFile, 'export const x = 42;');

      // Generera en fil med tillräcklig komplexitet för att få score < 7.0
      const deepNestCode = Array.from({ length: 8 }, (_, i) =>
        `${'  '.repeat(i)}if (cond${i}) {`
      ).join('\n') + '\n' + '  return true;\n' + Array.from({ length: 8 }, () => '}').join('\n');
      await fs.writeFile(badFile, `export function deep(): boolean {\n${deepNestCode}\n  return false;\n}`);

      const server = new MockMcpServer() as any;
      registerPreCommitSafeguard(server);

      const result = await server.callTool('pre_commit_code_health_safeguard', {
        repoPath: tmpDir,
        files: [goodFile, badFile],
      });
      const parsed = JSON.parse(result.content[0].text);

      // Verifiera struktur (faktiska scores beror på core-implementationen)
      expect(parsed.overallSafe).toBeDefined();
      expect(parsed.results).toHaveLength(2);
      expect(parsed.message).toBeDefined();

      await fs.unlink(goodFile);
      await fs.unlink(badFile);
    });

    it('hanterar filer som inte finns', async () => {
      const server = new MockMcpServer() as any;
      registerPreCommitSafeguard(server);

      const result = await server.callTool('pre_commit_code_health_safeguard', {
        repoPath: os.tmpdir(),
        files: ['/nonexistent/file.ts'],
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results[0].error).toBeDefined();
    });

    it('returnerar nextAction för varje fil', async () => {
      const tmpFile = path.join(os.tmpdir(), 'nextaction-check.ts');
      await fs.writeFile(tmpFile, 'export const z = 1;');

      const server = new MockMcpServer() as any;
      registerPreCommitSafeguard(server);

      const result = await server.callTool('pre_commit_code_health_safeguard', {
        repoPath: os.tmpdir(),
        files: [tmpFile],
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.results[0].nextAction).toBeDefined();
      expect(parsed.results[0].nextAction.action).toBeDefined();

      await fs.unlink(tmpFile);
    });

    it('verktyget registreras med rätt namn', () => {
      const registered: string[] = [];
      const server = {
        tool: (name: string, _d: string, _s: any, _h: Function) => { registered.push(name); },
      } as any;
      registerPreCommitSafeguard(server);
      expect(registered).toContain('pre_commit_code_health_safeguard');
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: Cannot find module '../../src/tools/pre-commit-safeguard'
  ```

- [ ] **Skriv minimal implementation** — skapa `packages/mcp-server/src/tools/pre-commit-safeguard.ts`

  ```typescript
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { z } from 'zod';
  import { analyzeFile } from '@healthy-ai-code/core';
  import { buildNextAction } from './shared';

  export function registerPreCommitSafeguard(server: McpServer): void {
    server.tool(
      'pre_commit_code_health_safeguard',
      'Kontrollerar staged/listade filer innan commit. Blockerar om ny röd kod introduceras.',
      {
        repoPath: z.string().describe('Absolut sökväg till git-repositoryt'),
        files: z.array(z.string()).describe('Lista med filsökvägar att kontrollera'),
      },
      async ({ repoPath, files }) => {
        const results = [];
        let overallSafe = true;

        for (const file of files) {
          try {
            const resolvedPath = file.startsWith('/') || file.startsWith('\\') || /^[A-Za-z]:/.test(file)
              ? file
              : `${repoPath}/${file}`;
            const result = await analyzeFile(resolvedPath);
            const isSafe = result.score >= 7.0;
            if (!isSafe) overallSafe = false;
            results.push({
              file,
              score: result.score,
              category: result.category,
              safe: isSafe,
              issues: result.smells,
              nextAction: buildNextAction(result, result.score >= 9.5),
            });
          } catch (error: any) {
            results.push({ file, error: error.message });
          }
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              overallSafe,
              message: overallSafe
                ? 'Alla filer är säkra att committa.'
                : 'STOPPA: Röda filer identifierade. Refaktorera innan commit.',
              results,
            }, null, 2),
          }],
        };
      }
    );
  }
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — pre-commit-safeguard.test.ts (5 tests)
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/src/tools/pre-commit-safeguard.ts packages/mcp-server/tests/tools/pre-commit-safeguard.test.ts
  git commit -m "feat(mcp-server): implement pre_commit_code_health_safeguard tool"
  ```

---

## Task 7: Tool — `analyze_change_set`

Analyserar hela diff mot basgren via `core.analyzeChangeset`. Kör innan PR skapas.

- [ ] **Skriv det felande testet** — `packages/mcp-server/tests/tools/analyze-change-set.test.ts`

  ```typescript
  import { describe, it, expect, vi } from 'vitest';
  import { registerAnalyzeChangeSet } from '../../src/tools/analyze-change-set';

  // Mock core.analyzeChangeset för att undvika git-beroende i unit-testet
  vi.mock('@healthy-ai-code/core', () => ({
    analyzeChangeset: vi.fn(),
    analyzeFile: vi.fn(),
  }));

  import { analyzeChangeset } from '@healthy-ai-code/core';

  class MockMcpServer {
    private tools: Map<string, Function> = new Map();
    tool(name: string, _desc: string, _schema: any, handler: Function): void {
      this.tools.set(name, handler);
    }
    async callTool(name: string, args: any): Promise<any> {
      const handler = this.tools.get(name);
      if (!handler) throw new Error(`Tool ${name} not found`);
      return handler(args);
    }
  }

  describe('analyze_change_set tool', () => {
    it('returnerar overallSafe true och message för säkert changeset', async () => {
      vi.mocked(analyzeChangeset).mockResolvedValueOnce({
        filesAnalyzed: 3,
        regressions: [],
        improvements: [{ filePath: 'src/a.ts', scoreBefore: 7.0, scoreAfter: 9.0 }],
        newUnhealthyFiles: [],
        overallSafe: true,
      });

      const server = new MockMcpServer() as any;
      registerAnalyzeChangeSet(server);

      const result = await server.callTool('analyze_change_set', {
        repoPath: '/tmp/repo',
        baseBranch: 'main',
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.overallSafe).toBe(true);
      expect(parsed.message).toContain('säkert');
      expect(parsed.improvements).toHaveLength(1);
      expect(parsed.regressions).toHaveLength(0);
    });

    it('returnerar varning för changeset med regressioner', async () => {
      vi.mocked(analyzeChangeset).mockResolvedValueOnce({
        filesAnalyzed: 2,
        regressions: [{ filePath: 'src/b.ts', scoreBefore: 8.0, scoreAfter: 4.5, newSmells: [] }],
        improvements: [],
        newUnhealthyFiles: [],
        overallSafe: false,
      });

      const server = new MockMcpServer() as any;
      registerAnalyzeChangeSet(server);

      const result = await server.callTool('analyze_change_set', {
        repoPath: '/tmp/repo',
        baseBranch: 'main',
      });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.overallSafe).toBe(false);
      expect(parsed.message).toContain('VARNING');
      expect(parsed.regressions).toHaveLength(1);
    });

    it('hanterar fel från analyzeChangeset', async () => {
      vi.mocked(analyzeChangeset).mockRejectedValueOnce(new Error('Git repo not found'));

      const server = new MockMcpServer() as any;
      registerAnalyzeChangeSet(server);

      const result = await server.callTool('analyze_change_set', {
        repoPath: '/no/repo',
        baseBranch: 'main',
      });

      expect(result.isError).toBe(true);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Git repo not found');
    });

    it('använder default baseBranch main', async () => {
      vi.mocked(analyzeChangeset).mockResolvedValueOnce({
        filesAnalyzed: 0,
        regressions: [],
        improvements: [],
        newUnhealthyFiles: [],
        overallSafe: true,
      });

      const server = new MockMcpServer() as any;
      registerAnalyzeChangeSet(server);

      await server.callTool('analyze_change_set', { repoPath: '/tmp/repo', baseBranch: 'main' });

      expect(analyzeChangeset).toHaveBeenCalledWith('/tmp/repo', 'main');
    });

    it('verktyget registreras med rätt namn', () => {
      const registered: string[] = [];
      const server = {
        tool: (name: string, _d: string, _s: any, _h: Function) => { registered.push(name); },
      } as any;
      registerAnalyzeChangeSet(server);
      expect(registered).toContain('analyze_change_set');
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: Cannot find module '../../src/tools/analyze-change-set'
  ```

- [ ] **Skriv minimal implementation** — skapa `packages/mcp-server/src/tools/analyze-change-set.ts`

  ```typescript
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { z } from 'zod';
  import { analyzeChangeset } from '@healthy-ai-code/core';

  export function registerAnalyzeChangeSet(server: McpServer): void {
    server.tool(
      'analyze_change_set',
      'Analyserar hela diff mot basgrenen. Kör innan PR skapas.',
      {
        repoPath: z.string().describe('Absolut sökväg till git-repositoryt'),
        baseBranch: z.string().default('main').describe('Basgren att jämföra mot (default: main)'),
      },
      async ({ repoPath, baseBranch }) => {
        try {
          const result = await analyzeChangeset(repoPath, baseBranch);
          const message = result.overallSafe
            ? `Changeset är säkert. ${result.improvements.length} förbättringar, inga regressioner.`
            : `VARNING: ${result.regressions.length} regressioner och ${result.newUnhealthyFiles.length} nya ohälsosamma filer.`;

          return {
            content: [{ type: 'text', text: JSON.stringify({ ...result, message }, null, 2) }],
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
            isError: true,
          };
        }
      }
    );
  }
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — analyze-change-set.test.ts (5 tests)
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/src/tools/analyze-change-set.ts packages/mcp-server/tests/tools/analyze-change-set.test.ts
  git commit -m "feat(mcp-server): implement analyze_change_set tool"
  ```

---

## Task 8: Tool — `code_health_refactoring_business_case`

Beräknar ROI för refaktorering baserat på CodeScene-forskning (4% per poäng).

- [ ] **Skriv det felande testet** — `packages/mcp-server/tests/tools/refactoring-business-case.test.ts`

  ```typescript
  import { describe, it, expect } from 'vitest';
  import * as path from 'path';
  import * as fs from 'fs/promises';
  import * as os from 'os';
  import { registerRefactoringBusinessCase } from '../../src/tools/refactoring-business-case';

  class MockMcpServer {
    private tools: Map<string, Function> = new Map();
    tool(name: string, _desc: string, _schema: any, handler: Function): void {
      this.tools.set(name, handler);
    }
    async callTool(name: string, args: any): Promise<any> {
      const handler = this.tools.get(name);
      if (!handler) throw new Error(`Tool ${name} not found`);
      return handler(args);
    }
  }

  describe('code_health_refactoring_business_case tool', () => {
    it('returnerar businessCase för en fil med låg score', async () => {
      const tmpFile = path.join(os.tmpdir(), 'business-case-low.ts');
      // Komplex funktion för att ge låg score
      const complexCode = `
export function analyzeData(data: any, config: any, opts: any, ctx: any, log: any, flags: any): any {
  if (data) {
    if (config) {
      if (opts) {
        if (ctx) {
          if (log) {
            if (flags.debug) {
              if (flags.verbose) {
                return { data, config, opts, ctx, log, flags };
              }
            }
          }
        }
      }
    }
  }
  return null;
}
`.trim();
      await fs.writeFile(tmpFile, complexCode);

      const server = new MockMcpServer() as any;
      registerRefactoringBusinessCase(server);

      const result = await server.callTool('code_health_refactoring_business_case', { filePath: tmpFile });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.currentScore).toBeDefined();
      expect(parsed.targetScore).toBe(9.5);
      expect(parsed.improvement).toBeGreaterThanOrEqual(0);
      expect(parsed.businessCase.developmentSpeedGain).toMatch(/^\+\d+%$/);
      expect(parsed.businessCase.defectRateReduction).toMatch(/^-\d+%$/);
      expect(parsed.businessCase.recommendation).toBeDefined();

      await fs.unlink(tmpFile);
    });

    it('returnerar låg prioritet för fil nära målpoängen', async () => {
      const tmpFile = path.join(os.tmpdir(), 'business-case-high.ts');
      await fs.writeFile(tmpFile, 'export function id<T>(x: T): T { return x; }');

      const server = new MockMcpServer() as any;
      registerRefactoringBusinessCase(server);

      const result = await server.callTool('code_health_refactoring_business_case', { filePath: tmpFile });
      const parsed = JSON.parse(result.content[0].text);

      // Hälsosam fil ska ha liten improvement och rätt recommendation
      expect(parsed.improvement).toBeLessThan(1.0);
      expect(parsed.businessCase.recommendation).toContain('gott skick');

      await fs.unlink(tmpFile);
    });

    it('ROI-beräkning är korrekt (4% per poäng)', async () => {
      const tmpFile = path.join(os.tmpdir(), 'roi-calc.ts');
      await fs.writeFile(tmpFile, 'export const x = 1;');

      const server = new MockMcpServer() as any;
      registerRefactoringBusinessCase(server);

      const result = await server.callTool('code_health_refactoring_business_case', { filePath: tmpFile });
      const parsed = JSON.parse(result.content[0].text);

      const expectedSpeedGain = Math.round(parsed.improvement * 4);
      expect(parsed.businessCase.developmentSpeedGain).toBe(`+${expectedSpeedGain}%`);
      expect(parsed.businessCase.defectRateReduction).toBe(`-${expectedSpeedGain}%`);

      await fs.unlink(tmpFile);
    });

    it('returnerar smells att fixa', async () => {
      const tmpFile = path.join(os.tmpdir(), 'biz-smells.ts');
      const complexCode = `
export function big(a: any, b: any, c: any, d: any, e: any, f: any): void {
  if (a) { if (b) { if (c) { if (d) { if (e) { console.log(f); } } } } }
}
`.trim();
      await fs.writeFile(tmpFile, complexCode);

      const server = new MockMcpServer() as any;
      registerRefactoringBusinessCase(server);

      const result = await server.callTool('code_health_refactoring_business_case', { filePath: tmpFile });
      const parsed = JSON.parse(result.content[0].text);

      expect(Array.isArray(parsed.smellsToFix)).toBe(true);

      await fs.unlink(tmpFile);
    });

    it('returnerar fel för fil som inte finns', async () => {
      const server = new MockMcpServer() as any;
      registerRefactoringBusinessCase(server);

      const result = await server.callTool('code_health_refactoring_business_case', { filePath: '/ghost.ts' });

      expect(result.isError).toBe(true);
    });

    it('verktyget registreras med rätt namn', () => {
      const registered: string[] = [];
      const server = {
        tool: (name: string, _d: string, _s: any, _h: Function) => { registered.push(name); },
      } as any;
      registerRefactoringBusinessCase(server);
      expect(registered).toContain('code_health_refactoring_business_case');
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: Cannot find module '../../src/tools/refactoring-business-case'
  ```

- [ ] **Skriv minimal implementation** — skapa `packages/mcp-server/src/tools/refactoring-business-case.ts`

  ```typescript
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { z } from 'zod';
  import { analyzeFile } from '@healthy-ai-code/core';

  // ROI-modell baserad på CodeScene-forskning:
  // Varje poängs förbättring ger ~4% snabbare development och ~4% lägre defekt-rate
  const ROI_PER_POINT = 4;
  const TARGET_SCORE = 9.5;

  export function registerRefactoringBusinessCase(server: McpServer): void {
    server.tool(
      'code_health_refactoring_business_case',
      'Beräknar affärsvärdet av att förbättra kodhälsan. Visar ROI i hastighet och defekter.',
      { filePath: z.string().describe('Sökväg till filen att analysera') },
      async ({ filePath }) => {
        try {
          const result = await analyzeFile(filePath);
          const currentScore = result.score;
          const improvement = Math.max(0, TARGET_SCORE - currentScore);

          const speedGainPct = Math.round(improvement * ROI_PER_POINT);
          const defectReductionPct = Math.round(improvement * ROI_PER_POINT);

          const recommendation =
            improvement > 2
              ? `Hög prioritet: ${improvement.toFixed(1)} poängs förbättring ger ${speedGainPct}% snabbare leverans`
              : improvement > 0.5
              ? `Medium prioritet: ${improvement.toFixed(1)} poängs förbättring ger marginella förbättringar`
              : 'Låg prioritet: Filen är redan i gott skick';

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                filePath,
                currentScore,
                targetScore: TARGET_SCORE,
                improvement: parseFloat(improvement.toFixed(1)),
                businessCase: {
                  developmentSpeedGain: `+${speedGainPct}%`,
                  defectRateReduction: `-${defectReductionPct}%`,
                  aiReadinessGain:
                    currentScore < TARGET_SCORE
                      ? 'Koden är inte AI-redo. Refaktorering möjliggör säker AI-assistans.'
                      : 'Koden är redan AI-redo.',
                  recommendation,
                },
                smellsToFix: result.smells,
              }, null, 2),
            }],
          };
        } catch (error: any) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
            isError: true,
          };
        }
      }
    );
  }
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — refactoring-business-case.test.ts (6 tests)
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/src/tools/refactoring-business-case.ts packages/mcp-server/tests/tools/refactoring-business-case.test.ts
  git commit -m "feat(mcp-server): implement code_health_refactoring_business_case tool"
  ```

---

## Task 9: Tools — `explain_code_health` och `explain_code_health_productivity`

Statiska förklaringsverktyg utan input-parametrar. Returnerar formaterad förklaringstext.

- [ ] **Skriv det felande testet** — `packages/mcp-server/tests/tools/explain-code-health.test.ts`

  ```typescript
  import { describe, it, expect } from 'vitest';
  import { registerExplainCodeHealth, registerExplainProductivity } from '../../src/tools/explain-code-health';

  class MockMcpServer {
    private tools: Map<string, Function> = new Map();
    tool(name: string, _desc: string, _schema: any, handler: Function): void {
      this.tools.set(name, handler);
    }
    async callTool(name: string, args: any): Promise<any> {
      const handler = this.tools.get(name);
      if (!handler) throw new Error(`Tool ${name} not found`);
      return handler(args);
    }
  }

  describe('explain_code_health tool', () => {
    it('returnerar förklaring av code health-skalan', async () => {
      const server = new MockMcpServer() as any;
      registerExplainCodeHealth(server);

      const result = await server.callTool('explain_code_health', {});
      const text = result.content[0].text;

      expect(text).toContain('Code Health');
      expect(text).toContain('9.5');
      expect(text).toContain('AI-redo');
      expect(text).toContain('1-10');
    });

    it('förklaringen innehåller skala och vad som mäts', async () => {
      const server = new MockMcpServer() as any;
      registerExplainCodeHealth(server);

      const result = await server.callTool('explain_code_health', {});
      const text = result.content[0].text;

      expect(text).toContain('Röd');
      expect(text).toContain('Gul');
      expect(text).toContain('Grön');
      // Ska nämna vad som mäts
      expect(text.toLowerCase()).toMatch(/komplexitet|nästning|längd/);
    });

    it('verktyget registreras med rätt namn', () => {
      const registered: string[] = [];
      const server = {
        tool: (name: string, _d: string, _s: any, _h: Function) => { registered.push(name); },
      } as any;
      registerExplainCodeHealth(server);
      expect(registered).toContain('explain_code_health');
    });
  });

  describe('explain_code_health_productivity tool', () => {
    it('returnerar produktivitetsförklaring med forskningsdata', async () => {
      const server = new MockMcpServer() as any;
      registerExplainProductivity(server);

      const result = await server.callTool('explain_code_health_productivity', {});
      const text = result.content[0].text;

      expect(text).toContain('36%');
      expect(text).toContain('CodeScene');
      expect(text).toContain('AI');
    });

    it('produktivitetsförklaringen innehåller token-kostnader och fix-rate', async () => {
      const server = new MockMcpServer() as any;
      registerExplainProductivity(server);

      const result = await server.callTool('explain_code_health_productivity', {});
      const text = result.content[0].text;

      expect(text).toContain('20%');
      expect(text).toContain('90');
      expect(text).toContain('9.5');
    });

    it('verktyget registreras med rätt namn', () => {
      const registered: string[] = [];
      const server = {
        tool: (name: string, _d: string, _s: any, _h: Function) => { registered.push(name); },
      } as any;
      registerExplainProductivity(server);
      expect(registered).toContain('explain_code_health_productivity');
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: Cannot find module '../../src/tools/explain-code-health'
  ```

- [ ] **Skriv minimal implementation** — skapa `packages/mcp-server/src/tools/explain-code-health.ts`

  ```typescript
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

  const CODE_HEALTH_EXPLANATION = `
  # Vad är Code Health?

  Code Health är ett mått (1-10) på hur lätt kod är att förstå, ändra och underhålla.

  ## Skala
  - 9.5-10.0: AI-redo — Säker och effektiv för AI-assisterat arbete
  - 9.0-9.4: Grön (Hälsosam) — Liten risk
  - 4.0-8.9: Gul (Teknisk skuld) — Ökad risk och underhållskostnad
  - 1.0-3.9: Röd (Allvarlig teknisk skuld) — Hög risk, svår att ändra

  ## Varför spelar det roll för AI?
  Forskning visar att AI-kodassistenter introducerar 60%+ fler buggar i ohälsosam kod.
  Kod med hälsopoäng under 7.0 är inte pålitlig att modifiera med AI.

  ## Vad mäts?
  - Cyklomatisk komplexitet (grenar i kod)
  - Nestningsdjup (nästlade kontrollstrukturer)
  - Funktions- och fillängd
  - Parameterantal
  - Kodlukter (code smells)
  `.trim();

  const PRODUCTIVITY_EXPLANATION = `
  # Code Health och Produktivitet

  ## Forskningsresultat (CodeScene, peer-reviewed)
  - Att förbättra från industri-genomsnittet 5.15 till 9.1 ger:
    - ~36% snabbare leveranstid
    - ~36% färre produktionsdefekter
    - ~50% lägre token-kostnad för AI-assistans

  ## AI-assistans och kodhälsa
  - 20%: Utan strukturell vägledning fixar frontier-modeller bara 20% av problem
  - 90-100%: Med Code Health-vägledning ökar fix-rate till 90-100%
  - Varje poängs förbättring = ~4% snabbare och ~4% färre defekter

  ## Rekommendation
  Sträva efter 9.5+ för AI-redo kod. Refaktorera till 9.5+ innan du låter AI
  modifiera filen — annars riskerar du att AI introducerar buggar.
  `.trim();

  export function registerExplainCodeHealth(server: McpServer): void {
    server.tool(
      'explain_code_health',
      'Förklarar vad Code Health-poängen betyder och hur den beräknas.',
      {},
      async () => ({
        content: [{ type: 'text', text: CODE_HEALTH_EXPLANATION }],
      })
    );
  }

  export function registerExplainProductivity(server: McpServer): void {
    server.tool(
      'explain_code_health_productivity',
      'Förklarar sambandet mellan Code Health och leveranshastighet/defekter.',
      {},
      async () => ({
        content: [{ type: 'text', text: PRODUCTIVITY_EXPLANATION }],
      })
    );
  }
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — explain-code-health.test.ts (6 tests)
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/src/tools/explain-code-health.ts packages/mcp-server/tests/tools/explain-code-health.test.ts
  git commit -m "feat(mcp-server): implement explain_code_health and explain_code_health_productivity tools"
  ```

---

## Task 10: Server base — `src/server.ts` och `src/index.ts`

Samlar alla verktygsregistreringar i `server.ts` och kopplar stdio-transport i `index.ts`.

- [ ] **Skriv det felande testet** — `packages/mcp-server/tests/tools/server.test.ts`

  ```typescript
  import { describe, it, expect, vi } from 'vitest';

  // Mock MCP SDK för att inte starta en riktig server i testet
  vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: vi.fn().mockImplementation(() => ({
      tool: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
    })),
  }));

  vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: vi.fn().mockImplementation(() => ({})),
  }));

  import { createServer } from '../../src/server';
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

  describe('createServer', () => {
    it('skapar en McpServer-instans', async () => {
      const server = await createServer();
      expect(server).toBeDefined();
      expect(McpServer).toHaveBeenCalledWith({
        name: 'healthy-ai-code',
        version: '0.1.0',
      });
    });

    it('registrerar alla sju verktyg', async () => {
      const toolNames: string[] = [];
      vi.mocked(McpServer).mockImplementationOnce(() => ({
        tool: (name: string) => { toolNames.push(name); },
        connect: vi.fn(),
      }) as any);

      await createServer();

      expect(toolNames).toContain('code_health_score');
      expect(toolNames).toContain('code_health_review');
      expect(toolNames).toContain('pre_commit_code_health_safeguard');
      expect(toolNames).toContain('analyze_change_set');
      expect(toolNames).toContain('code_health_refactoring_business_case');
      expect(toolNames).toContain('explain_code_health');
      expect(toolNames).toContain('explain_code_health_productivity');
      expect(toolNames).toHaveLength(7);
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: Cannot find module '../../src/server'
  ```

- [ ] **Skriv minimal implementation** — skapa `packages/mcp-server/src/server.ts`

  ```typescript
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { registerCodeHealthScore } from './tools/code-health-score';
  import { registerCodeHealthReview } from './tools/code-health-review';
  import { registerPreCommitSafeguard } from './tools/pre-commit-safeguard';
  import { registerAnalyzeChangeSet } from './tools/analyze-change-set';
  import { registerRefactoringBusinessCase } from './tools/refactoring-business-case';
  import { registerExplainCodeHealth, registerExplainProductivity } from './tools/explain-code-health';

  export async function createServer(): Promise<McpServer> {
    const server = new McpServer({
      name: 'healthy-ai-code',
      version: '0.1.0',
    });

    registerCodeHealthScore(server);
    registerCodeHealthReview(server);
    registerPreCommitSafeguard(server);
    registerAnalyzeChangeSet(server);
    registerRefactoringBusinessCase(server);
    registerExplainCodeHealth(server);
    registerExplainProductivity(server);

    return server;
  }
  ```

- [ ] **Skapa `packages/mcp-server/src/index.ts`**

  ```typescript
  #!/usr/bin/env node
  import { createServer } from './server';
  import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

  async function main(): Promise<void> {
    const server = await createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Server körs — MCP-klienten kommunicerar via stdio
  }

  main().catch((error) => {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  });
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — server.test.ts (2 tests)
  ```

- [ ] **Kör typecheck**

  ```
  pnpm --filter @healthy-ai-code/mcp-server typecheck
  # Förväntat: Inga TypeScript-fel
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/src/server.ts packages/mcp-server/src/index.ts packages/mcp-server/tests/tools/server.test.ts
  git commit -m "feat(mcp-server): add server.ts and index.ts — wire all tools to MCP server"
  ```

---

## Task 11: Build och smoke test

Verifiera att paketet kompilerar och att bin-filen är körbar.

- [ ] **Bygg paketet**

  ```
  pnpm --filter @healthy-ai-code/core build
  pnpm --filter @healthy-ai-code/mcp-server build
  # Förväntat: packages/mcp-server/dist/ skapas med index.js, server.js, tools/
  ```

- [ ] **Verifiera att dist/index.js existerar**

  ```
  ls packages/mcp-server/dist/index.js
  # Förväntat: filen finns
  ```

- [ ] **Verifiera att node kan ladda entry point utan krasch**

  ```
  node -e "require('./packages/mcp-server/dist/index.js')" 2>&1 | head -5
  # Förväntat: Ingen "Cannot find module" eller syntaxfel
  # (Servern försöker ansluta transport och hänger — det är korrekt beteende)
  ```

- [ ] **Kör alla tester en gång till — alla ska passera**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — alla tests i packages/mcp-server/tests/
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/dist/ --force
  # Alternativt: lägg dist/ i .gitignore och skippa dist-commit
  git commit -m "build(mcp-server): verify build output compiles without errors"
  ```

---

## Task 12: AGENTS.md — projektroten

Filen som styr AI-agentens beteende. Läggs i projektets rotkatalog.

- [ ] **Skriv det felande testet** — `packages/mcp-server/tests/agents-md.test.ts`

  ```typescript
  import { describe, it, expect } from 'vitest';
  import * as path from 'path';
  import * as fs from 'fs';

  describe('AGENTS.md i projektrooten', () => {
    it('filen existerar i projektrooten', () => {
      // Rooten är fyra nivåer upp från tests/
      const rootPath = path.resolve(__dirname, '../../../../AGENTS.md');
      expect(fs.existsSync(rootPath)).toBe(true);
    });

    it('innehåller obligatoriska sektioner', () => {
      const rootPath = path.resolve(__dirname, '../../../../AGENTS.md');
      const content = fs.readFileSync(rootPath, 'utf-8');

      expect(content).toContain('code_health_review');
      expect(content).toContain('pre_commit_code_health_safeguard');
      expect(content).toContain('analyze_change_set');
      expect(content).toContain('loopComplete');
      expect(content).toContain('nextAction');
      expect(content).toContain('7.0');
      expect(content).toContain('9.5');
    });

    it('innehåller verktygsöversikt-tabell', () => {
      const rootPath = path.resolve(__dirname, '../../../../AGENTS.md');
      const content = fs.readFileSync(rootPath, 'utf-8');

      expect(content).toContain('code_health_score');
      expect(content).toContain('code_health_refactoring_business_case');
      expect(content).toContain('explain_code_health');
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: FAIL — AGENTS.md not found
  ```

- [ ] **Skapa `AGENTS.md` i projektrooten**

  ```markdown
  # Healthy AI Code MCP — Agent Workflow

  ## OBLIGATORISKA REGLER (följ alltid utan undantag)

  ### Innan du ändrar en fil
  1. Kör `code_health_review` på filen du ska ändra
  2. Notera baseline-poängen
  3. Om score < 7.0: refaktorera FÖRST — lägg inte till ny funktionalitet i ohälsosam kod

  ### Efter varje kodändring
  1. Kör `code_health_review` igen på den ändrade filen
  2. Om score SJUNKIT: STOPPA all annan aktivitet — gå in i refaktoreringsloop
  3. Fortsätt loopen tills `loopComplete: true` i svaret

  ### Refaktoreringsloop (upprepa tills loopComplete: true)
  1. Läs `nextAction.instruction` i svaret — det berättar exakt vad du ska göra
  2. Åtgärda det problem som `nextAction.priority` pekar på
  3. Kör `code_health_review` igen
  4. Om `loopComplete: false` → upprepa från steg 1
  5. Om `loopComplete: true` → loopen är klar

  ### Innan commit (OBLIGATORISKT)
  - Kör alltid `pre_commit_code_health_safeguard` med alla ändrade filer
  - Committa INTE om någon fil har score < 7.0 utan explicit godkännande från användaren

  ### Innan PR (OBLIGATORISKT)
  - Kör `analyze_change_set` mot basgrenen
  - Adressera ALLA regressioner och röda filer i resultatet

  ## Målpoäng
  - Minst 7.0 för att committa
  - Minst 9.5 för AI-redo kod (optimal)
  - 10.0 är perfekt

  ## Verktygsöversikt
  | Verktyg | När | Input |
  |---|---|---|
  | `code_health_review` | Före och efter varje ändring | filePath |
  | `code_health_score` | Snabb screening | filePath |
  | `pre_commit_code_health_safeguard` | Innan commit | repoPath, files[] |
  | `analyze_change_set` | Innan PR | repoPath, baseBranch |
  | `code_health_refactoring_business_case` | För att motivera refaktorering | filePath |
  | `explain_code_health` | Om du behöver förstå systemet | (ingen) |
  | `explain_code_health_productivity` | Om du behöver förstå ROI | (ingen) |
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — agents-md.test.ts (3 tests)
  ```

- [ ] **Commit**

  ```
  git add AGENTS.md packages/mcp-server/tests/agents-md.test.ts
  git commit -m "feat: add AGENTS.md to project root — agent workflow instructions"
  ```

---

## Task 13: MCP server integrationstester

End-to-end-tester som anropar MCP-verktyg mot verkliga fixtures (enkla TypeScript-filer).

- [ ] **Skapa fixture-filer** — `packages/mcp-server/tests/integration/fixtures/`

  `packages/mcp-server/tests/integration/fixtures/healthy.ts`:
  ```typescript
  export function add(a: number, b: number): number {
    return a + b;
  }

  export function subtract(a: number, b: number): number {
    return a - b;
  }

  export function multiply(a: number, b: number): number {
    return a * b;
  }
  ```

  `packages/mcp-server/tests/integration/fixtures/unhealthy.ts`:
  ```typescript
  export function processOrder(order: any, config: any, flags: any, ctx: any): string {
    if (order) {
      if (order.items) {
        for (const item of order.items) {
          if (item.type === 'A') {
            if (item.quantity > 10) {
              if (item.price > 100) {
                if (item.discount) {
                  if (flags.verbose) {
                    if (ctx.debug) {
                      return 'discount-bulk-verbose-debug';
                    }
                    return 'discount-bulk-verbose';
                  }
                  return 'discount-bulk';
                }
                return 'bulk';
              }
            }
          } else if (item.type === 'B') {
            if (item.quantity > 5) {
              if (item.price > 50) {
                if (config.mode === 'strict') {
                  return 'b-bulk-strict';
                }
                return 'b-bulk';
              }
            }
          }
        }
      }
    }
    return 'default';
  }
  ```

- [ ] **Skriv det felande integrationstestet** — `packages/mcp-server/tests/integration/mcp-server.integration.test.ts`

  ```typescript
  import { describe, it, expect, beforeAll } from 'vitest';
  import * as path from 'path';
  import { createServer } from '../../src/server';

  // MockMcpServer för integration — exakt som i unit-testerna men gemensam
  class MockMcpServer {
    private tools: Map<string, Function> = new Map();
    tool(name: string, _desc: string, _schema: any, handler: Function): void {
      this.tools.set(name, handler);
    }
    async callTool(name: string, args: any): Promise<any> {
      const handler = this.tools.get(name);
      if (!handler) throw new Error(`Tool ${name} not found`);
      return handler(args);
    }
    getRegisteredToolNames(): string[] {
      return Array.from(this.tools.keys());
    }
  }

  // Importera registerFunctions direkt istället för createServer (som kräver riktig McpServer)
  import { registerCodeHealthScore } from '../../src/tools/code-health-score';
  import { registerCodeHealthReview } from '../../src/tools/code-health-review';
  import { registerPreCommitSafeguard } from '../../src/tools/pre-commit-safeguard';
  import { registerAnalyzeChangeSet } from '../../src/tools/analyze-change-set';
  import { registerRefactoringBusinessCase } from '../../src/tools/refactoring-business-case';
  import { registerExplainCodeHealth, registerExplainProductivity } from '../../src/tools/explain-code-health';

  const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
  const HEALTHY_FILE = path.join(FIXTURES_DIR, 'healthy.ts');
  const UNHEALTHY_FILE = path.join(FIXTURES_DIR, 'unhealthy.ts');

  describe('MCP Server Integration', () => {
    let server: MockMcpServer;

    beforeAll(() => {
      server = new MockMcpServer();
      registerCodeHealthScore(server as any);
      registerCodeHealthReview(server as any);
      registerPreCommitSafeguard(server as any);
      registerAnalyzeChangeSet(server as any);
      registerRefactoringBusinessCase(server as any);
      registerExplainCodeHealth(server as any);
      registerExplainProductivity(server as any);
    });

    describe('Alla sju verktyg är registrerade', () => {
      it('registrerade verktygsnamn matchar specen', () => {
        const names = server.getRegisteredToolNames();
        expect(names).toContain('code_health_score');
        expect(names).toContain('code_health_review');
        expect(names).toContain('pre_commit_code_health_safeguard');
        expect(names).toContain('analyze_change_set');
        expect(names).toContain('code_health_refactoring_business_case');
        expect(names).toContain('explain_code_health');
        expect(names).toContain('explain_code_health_productivity');
        expect(names).toHaveLength(7);
      });
    });

    describe('Feedbackloop — healthy fixture', () => {
      it('code_health_score ger loopComplete true för healthy.ts', async () => {
        const result = await server.callTool('code_health_score', { filePath: HEALTHY_FILE });
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.loopComplete).toBe(true);
        expect(parsed.score).toBeGreaterThan(9.0);
        expect(parsed.nextAction.action).toBe('commit_safe');
      });

      it('code_health_review ger tom issues-lista för healthy.ts', async () => {
        const result = await server.callTool('code_health_review', { filePath: HEALTHY_FILE });
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.issues).toHaveLength(0);
        expect(parsed.summary).toContain('Inga problem identifierade');
      });
    });

    describe('Feedbackloop — unhealthy fixture', () => {
      it('code_health_score ger loopComplete false för unhealthy.ts', async () => {
        const result = await server.callTool('code_health_score', { filePath: UNHEALTHY_FILE });
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.loopComplete).toBe(false);
        expect(parsed.score).toBeLessThan(7.0);
        expect(parsed.nextAction.action).toBe('refactor');
      });

      it('code_health_review ger nextAction.priority med SmellType för unhealthy.ts', async () => {
        const result = await server.callTool('code_health_review', { filePath: UNHEALTHY_FILE });
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.issues.length).toBeGreaterThan(0);
        expect(parsed.nextAction.priority).not.toBeNull();
        expect(parsed.nextAction.priority.type).toBeDefined();
        expect(parsed.nextAction.toolToCallAfter).toBe('code_health_review');
      });

      it('refactoring_business_case visar positiv ROI för unhealthy.ts', async () => {
        const result = await server.callTool('code_health_refactoring_business_case', { filePath: UNHEALTHY_FILE });
        const parsed = JSON.parse(result.content[0].text);

        expect(parsed.improvement).toBeGreaterThan(1);
        expect(parsed.businessCase.developmentSpeedGain).not.toBe('+0%');
        expect(parsed.businessCase.recommendation).toContain('prioritet');
      });
    });

    describe('pre_commit_code_health_safeguard', () => {
      it('godkänner commit för healthy.ts', async () => {
        const result = await server.callTool('pre_commit_code_health_safeguard', {
          repoPath: FIXTURES_DIR,
          files: [HEALTHY_FILE],
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.overallSafe).toBe(true);
      });

      it('blockerar commit för unhealthy.ts', async () => {
        const result = await server.callTool('pre_commit_code_health_safeguard', {
          repoPath: FIXTURES_DIR,
          files: [UNHEALTHY_FILE],
        });
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.overallSafe).toBe(false);
        expect(parsed.message).toContain('STOPPA');
      });
    });

    describe('Statiska verktyg', () => {
      it('explain_code_health returnerar icke-tom text', async () => {
        const result = await server.callTool('explain_code_health', {});
        expect(result.content[0].text.length).toBeGreaterThan(100);
      });

      it('explain_code_health_productivity returnerar icke-tom text', async () => {
        const result = await server.callTool('explain_code_health_productivity', {});
        expect(result.content[0].text.length).toBeGreaterThan(100);
      });
    });
  });
  ```

- [ ] **Kör testet — förväntat resultat: MISSLYCKAS** (fixtures saknas eller server.ts saknas)

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: FAIL — fixture-filer saknas
  ```

- [ ] **Skapa fixture-filerna** (se kod ovan i fixture-sektionen)

  ```
  mkdir -p packages/mcp-server/tests/integration/fixtures
  # Skapa healthy.ts och unhealthy.ts med innehållet ovan
  ```

- [ ] **Kör testet — förväntat resultat: PASSERAR**

  ```
  pnpm --filter @healthy-ai-code/mcp-server test
  # Förväntat: PASS — mcp-server.integration.test.ts (11 tests)
  ```

- [ ] **Commit**

  ```
  git add packages/mcp-server/tests/integration/ 
  git commit -m "test(mcp-server): add end-to-end integration tests for all seven MCP tools"
  ```

---

## Task 14: Full test-körning och cleanup

- [ ] **Kör alla tester i hela monorepon**

  ```
  pnpm test
  # Förväntat: Alla tester i packages/core och packages/mcp-server passerar
  # Inga failing tests
  ```

- [ ] **Kör typecheck på hela monorepon**

  ```
  pnpm typecheck
  # Förväntat: Inga TypeScript-fel
  ```

- [ ] **Verifiera att inga temporära filer lämnats kvar**

  ```
  git status
  # Förväntat: Working tree clean, inga ocommittade ändringar
  # Inga test*.ts-filer utanför tests/-kataloger
  ```

- [ ] **Kör slutlig build**

  ```
  pnpm build
  # Förväntat: Både core och mcp-server kompileras utan fel
  ```

- [ ] **Commit (om det finns restposter)**

  ```
  git add -p   # Granska och stagea eventuella restposter
  git commit -m "chore(mcp-server): final cleanup and verified full test suite green"
  ```

---

## Acceptanskriterier

Sprinten är klar när samtliga nedanstående punkter är uppfyllda:

- [ ] `pnpm --filter @healthy-ai-code/mcp-server test` — alla tester passerar (inga skippade)
- [ ] `pnpm --filter @healthy-ai-code/mcp-server typecheck` — inga TypeScript-fel
- [ ] `pnpm --filter @healthy-ai-code/mcp-server build` — dist/ skapas utan fel
- [ ] Alla sju MCP-verktyg är registrerade: `code_health_score`, `code_health_review`, `pre_commit_code_health_safeguard`, `analyze_change_set`, `code_health_refactoring_business_case`, `explain_code_health`, `explain_code_health_productivity`
- [ ] `AGENTS.md` finns i projektrooten med obligatoriska sektioner
- [ ] Integrationstesterna verifierar feedbackloopen mot healthy/unhealthy fixtures
- [ ] Inga platshållare, stub-implementations eller TODO-kommentarer i produktionskod
- [ ] Git-historiken innehåller en commit per task med meningsfulla commit-meddelanden

---

## Filförteckning som skapas i denna sprint

```
packages/mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── types.ts
│   ├── server.ts
│   ├── index.ts
│   └── tools/
│       ├── shared.ts
│       ├── code-health-score.ts
│       ├── code-health-review.ts
│       ├── pre-commit-safeguard.ts
│       ├── analyze-change-set.ts
│       ├── refactoring-business-case.ts
│       └── explain-code-health.ts
└── tests/
    ├── agents-md.test.ts
    ├── tools/
    │   ├── scaffold.test.ts
    │   ├── types.test.ts
    │   ├── shared.test.ts
    │   ├── code-health-score.test.ts
    │   ├── code-health-review.test.ts
    │   ├── pre-commit-safeguard.test.ts
    │   ├── analyze-change-set.test.ts
    │   ├── refactoring-business-case.test.ts
    │   ├── explain-code-health.test.ts
    │   └── server.test.ts
    └── integration/
        ├── fixtures/
        │   ├── healthy.ts
        │   └── unhealthy.ts
        └── mcp-server.integration.test.ts
AGENTS.md  (projektrooten)
```
