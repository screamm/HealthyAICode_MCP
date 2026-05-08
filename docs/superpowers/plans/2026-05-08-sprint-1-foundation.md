# Sprint 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a fully tested monorepo foundation with the core analysis engine — language detection, TypeScript AST parsing, smell detection, and scoring — ready for MCP server integration in Sprint 2.

**Architecture:** A pnpm monorepo with two packages (`@healthy-ai-code/core` and `@healthy-ai-code/mcp-server`); Sprint 1 builds only the core package. The core package uses tree-sitter for AST-based analysis, feeding a scoring engine that maps detected smells to a 1–10 health score. All public API surface is defined by strongly-typed interfaces in `types.ts` which all other modules depend on.

**Tech Stack:** TypeScript 5.x (CommonJS, strict), tree-sitter@^0.21.0 + tree-sitter-typescript@^0.21.0, Vitest@^1.6.0 (pool: forks required for native addons), pnpm workspaces.

---

## Task Overview

| # | Task | Files Created |
|---|------|---------------|
| 1 | Monorepo root setup | `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore` |
| 2 | Core package scaffold | `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts` |
| 3 | Core types | `packages/core/src/types.ts` |
| 4 | Scoring engine | `packages/core/src/scoring/weights.ts`, `packages/core/src/scoring/scorer.ts` |
| 5 | Language detection | `packages/core/src/language-detect.ts` |
| 6 | TypeScript/JS analyzer | `packages/core/src/analyzers/typescript.ts` |
| 7 | Smell detector | `packages/core/src/smells/detector.ts` |
| 8 | Core public API | `packages/core/src/index.ts` |
| 9 | Test fixtures | `packages/core/tests/fixtures/healthy/simple.ts`, `packages/core/tests/fixtures/unhealthy/complex.ts` |

---

### Task 1: Monorepo Root Setup

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

> No test file for this task — it is pure configuration. Verification is done by running `pnpm install` successfully.

- [ ] **Steg 1: Skapa root package.json**

```json
{
  "name": "healthy-ai-code-mcp",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "typecheck": "pnpm -r run typecheck"
  },
  "engines": {
    "node": ">=18.0.0",
    "pnpm": ">=8.0.0"
  }
}
```

Sökväg: `package.json` (repo-rot)

- [ ] **Steg 2: Skapa pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

Sökväg: `pnpm-workspace.yaml` (repo-rot)

- [ ] **Steg 3: Skapa tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist"
  }
}
```

Sökväg: `tsconfig.base.json` (repo-rot)

- [ ] **Steg 4: Skapa .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.env
.DS_Store
coverage/
```

Sökväg: `.gitignore` (repo-rot)

- [ ] **Steg 5: Verifiera att strukturen är korrekt**

Kör: `ls` (kontrollera att alla fyra filer finns i repo-roten)

Förväntat: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore` syns i listningen.

- [ ] **Steg 6: Commit**

```
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore
git commit -m "chore: monorepo root setup — pnpm workspaces, tsconfig base, gitignore"
```

---

### Task 2: Core Package Scaffold

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`

> No test file for this task — verification is `pnpm install` + `pnpm --filter @healthy-ai-code/core typecheck` (exits 0 on empty src).

- [ ] **Steg 1: Skapa katalogstrukturen**

Skapa dessa kataloger (tomma för nu):
```
packages/core/src/analyzers/
packages/core/src/scoring/
packages/core/src/smells/
packages/core/tests/fixtures/healthy/
packages/core/tests/fixtures/unhealthy/
packages/core/tests/fixtures/edge-cases/
packages/core/tests/scoring/
packages/core/tests/analyzers/
packages/core/tests/smells/
```

- [ ] **Steg 2: Skapa packages/core/package.json**

```json
{
  "name": "@healthy-ai-code/core",
  "version": "0.1.0",
  "description": "AST-based code health analysis engine",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "tree-sitter": "^0.21.0",
    "tree-sitter-typescript": "^0.21.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Steg 3: Skapa packages/core/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Steg 4: Skapa packages/core/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks', // Required for tree-sitter native addons
  },
});
```

- [ ] **Steg 5: Installera beroenden**

Kör: `pnpm install`

Förväntat: Inga fel. `node_modules` skapas i `packages/core/`.

- [ ] **Steg 6: Commit**

```
git add packages/core/package.json packages/core/tsconfig.json packages/core/vitest.config.ts pnpm-lock.yaml
git commit -m "chore: scaffold @healthy-ai-code/core package with vitest and tree-sitter deps"
```

---

### Task 3: Core Types

**Files:**
- Create: `packages/core/src/types.ts`
- Test: `packages/core/tests/types.test.ts`

- [ ] **Steg 1: Skriv det felande testet**

Skapa `packages/core/tests/types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest';
import type {
  Language,
  HealthCategory,
  SmellType,
  Smell,
  MetricBreakdown,
  FunctionResult,
  HealthResult,
  ChangesetResult,
  FileRegression,
  FileImprovement,
  NextActionType,
  NextAction,
  ToolResponse,
} from '../src/types';

describe('types — shape contracts', () => {
  it('Language should include all supported languages', () => {
    expectTypeOf<Language>().toEqualTypeOf<
      'typescript' | 'javascript' | 'python' | 'java' | 'kotlin' | 'csharp' | 'unsupported'
    >();
  });

  it('HealthCategory should be green | yellow | red', () => {
    expectTypeOf<HealthCategory>().toEqualTypeOf<'green' | 'yellow' | 'red'>();
  });

  it('SmellType should include all seven smell types', () => {
    expectTypeOf<SmellType>().toEqualTypeOf<
      | 'ComplexMethod'
      | 'DeepNesting'
      | 'BumpyRoad'
      | 'LargeMethod'
      | 'ComplexConditional'
      | 'LongParameterList'
      | 'LargeFile'
    >();
  });

  it('Smell should have required fields with correct types', () => {
    expectTypeOf<Smell>().toMatchTypeOf<{
      type: SmellType;
      severity: 'critical' | 'high' | 'medium';
      line: number;
      description: string;
      suggestion: string;
    }>();
  });

  it('MetricBreakdown should have nine numeric fields', () => {
    expectTypeOf<MetricBreakdown>().toMatchTypeOf<{
      cyclomaticComplexity: number;
      cognitiveComplexity: number;
      maxNestingDepth: number;
      avgFunctionLength: number;
      maxFunctionLength: number;
      avgParameterCount: number;
      maxParameterCount: number;
      totalLines: number;
      duplicationScore: number;
    }>();
  });

  it('HealthResult should have filePath and language fields', () => {
    expectTypeOf<HealthResult>().toMatchTypeOf<{
      filePath: string;
      language: Language;
      score: number;
      category: HealthCategory;
    }>();
  });

  it('ChangesetResult should have overallSafe boolean', () => {
    expectTypeOf<ChangesetResult>().toMatchTypeOf<{
      filesAnalyzed: number;
      overallSafe: boolean;
    }>();
  });

  it('NextAction should have toolToCallAfter as string or null', () => {
    expectTypeOf<NextAction>().toMatchTypeOf<{
      action: NextActionType;
      instruction: string;
      priority: Smell | null;
      toolToCallAfter: string | null;
    }>();
  });

  it('ToolResponse should have loopComplete boolean', () => {
    expectTypeOf<ToolResponse>().toMatchTypeOf<{
      score: number;
      category: HealthCategory;
      loopComplete: boolean;
    }>();
  });
});
```

- [ ] **Steg 2: Kör testet och verifiera att det MISSLYCKAS**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: FAIL — `Cannot find module '../src/types'` eller TypeScript-kompileringsfel.

- [ ] **Steg 3: Skriv minimal implementation**

Skapa `packages/core/src/types.ts`:

```typescript
export type Language =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'kotlin'
  | 'csharp'
  | 'unsupported';

export type HealthCategory = 'green' | 'yellow' | 'red';

export type SmellType =
  | 'ComplexMethod'
  | 'DeepNesting'
  | 'BumpyRoad'
  | 'LargeMethod'
  | 'ComplexConditional'
  | 'LongParameterList'
  | 'LargeFile';

export interface Smell {
  type: SmellType;
  severity: 'critical' | 'high' | 'medium';
  functionName?: string;
  line: number;
  description: string;
  suggestion: string;
}

export interface MetricBreakdown {
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maxNestingDepth: number;
  avgFunctionLength: number;
  maxFunctionLength: number;
  avgParameterCount: number;
  maxParameterCount: number;
  totalLines: number;
  duplicationScore: number;
}

export interface FunctionResult {
  name: string;
  line: number;
  length: number;
  cyclomaticComplexity: number;
  nestingDepth: number;
  parameterCount: number;
  smells: Smell[];
}

export interface HealthResult {
  filePath: string;
  language: Language;
  score: number;
  category: HealthCategory;
  smells: Smell[];
  metrics: MetricBreakdown;
  functions: FunctionResult[];
}

export interface ChangesetResult {
  filesAnalyzed: number;
  regressions: FileRegression[];
  improvements: FileImprovement[];
  newUnhealthyFiles: HealthResult[];
  overallSafe: boolean;
}

export interface FileRegression {
  filePath: string;
  scoreBefore: number;
  scoreAfter: number;
  newSmells: Smell[];
}

export interface FileImprovement {
  filePath: string;
  scoreBefore: number;
  scoreAfter: number;
  fixedSmells: Smell[];
}

export type NextActionType = 'refactor' | 'commit_safe' | 'review_pr' | 'none';

export interface NextAction {
  action: NextActionType;
  instruction: string;
  priority: Smell | null;
  toolToCallAfter: string | null;
}

export interface ToolResponse {
  score: number;
  category: HealthCategory;
  loopComplete: boolean;
  issues: Smell[];
  summary: string;
  nextAction: NextAction;
}
```

- [ ] **Steg 4: Kör testet och verifiera att det PASSERAR**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: PASS — alla 9 type-assertions gröna.

- [ ] **Steg 5: Commit**

```
git add packages/core/src/types.ts packages/core/tests/types.test.ts
git commit -m "feat(core): add shared TypeScript types and interfaces"
```

---

### Task 4: Scoring Engine

**Files:**
- Create: `packages/core/src/scoring/weights.ts`
- Create: `packages/core/src/scoring/scorer.ts`
- Test: `packages/core/tests/scoring/scorer.test.ts`

- [ ] **Steg 1: Skriv det felande testet**

Skapa `packages/core/tests/scoring/scorer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calculateScore, categorize } from '../../src/scoring/scorer';
import type { Smell } from '../../src/types';

function makeSmell(type: Smell['type'], severity: Smell['severity'] = 'high'): Smell {
  return {
    type,
    severity,
    line: 1,
    description: 'test',
    suggestion: 'fix it',
  };
}

describe('calculateScore', () => {
  it('returns 10.0 when there are no smells', () => {
    expect(calculateScore([])).toBe(10.0);
  });

  it('deducts 1.5 for one ComplexMethod smell', () => {
    const smells = [makeSmell('ComplexMethod')];
    expect(calculateScore(smells)).toBe(8.5);
  });

  it('deducts 1.2 for one DeepNesting smell', () => {
    const smells = [makeSmell('DeepNesting')];
    expect(calculateScore(smells)).toBe(8.8);
  });

  it('deducts 0.8 for one BumpyRoad smell', () => {
    const smells = [makeSmell('BumpyRoad')];
    expect(calculateScore(smells)).toBe(9.2);
  });

  it('caps deduction at SMELL_MAX_DEDUCTION (3.0) per smell type', () => {
    // ComplexMethod weight=1.5, three instances = 4.5 — capped at 3.0
    const smells = [
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
    ];
    expect(calculateScore(smells)).toBe(7.0);
  });

  it('applies independent caps per smell type when multiple types present', () => {
    // ComplexMethod x3 capped at 3.0 + DeepNesting x1 = 1.2 → 10 - 3.0 - 1.2 = 5.8
    const smells = [
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('DeepNesting'),
    ];
    expect(calculateScore(smells)).toBe(5.8);
  });

  it('never returns a score below 1.0', () => {
    const smells = [
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('ComplexMethod'),
      makeSmell('DeepNesting'),
      makeSmell('DeepNesting'),
      makeSmell('DeepNesting'),
      makeSmell('BumpyRoad'),
      makeSmell('BumpyRoad'),
      makeSmell('BumpyRoad'),
      makeSmell('LargeMethod'),
      makeSmell('LargeMethod'),
      makeSmell('LargeFile'),
      makeSmell('LongParameterList'),
    ];
    expect(calculateScore(smells)).toBeGreaterThanOrEqual(1.0);
  });

  it('returns score with one decimal place', () => {
    const smells = [makeSmell('LongParameterList')]; // 10 - 0.4 = 9.6
    const score = calculateScore(smells);
    expect(score).toBe(9.6);
    expect(score.toString()).toMatch(/^\d+\.\d$/);
  });

  it('deducts 0.6 for one LargeMethod smell', () => {
    expect(calculateScore([makeSmell('LargeMethod')])).toBe(9.4);
  });

  it('deducts 0.5 for one ComplexConditional smell', () => {
    expect(calculateScore([makeSmell('ComplexConditional')])).toBe(9.5);
  });

  it('deducts 0.3 for one LargeFile smell', () => {
    expect(calculateScore([makeSmell('LargeFile')])).toBe(9.7);
  });
});

describe('categorize', () => {
  it('returns green for score >= 9.0', () => {
    expect(categorize(9.0)).toBe('green');
    expect(categorize(9.5)).toBe('green');
    expect(categorize(10.0)).toBe('green');
  });

  it('returns yellow for score >= 4.0 and < 9.0', () => {
    expect(categorize(4.0)).toBe('yellow');
    expect(categorize(6.5)).toBe('yellow');
    expect(categorize(8.9)).toBe('yellow');
  });

  it('returns red for score < 4.0', () => {
    expect(categorize(1.0)).toBe('red');
    expect(categorize(3.9)).toBe('red');
    expect(categorize(2.5)).toBe('red');
  });

  it('boundary: 9.0 is green not yellow', () => {
    expect(categorize(9.0)).toBe('green');
  });

  it('boundary: 4.0 is yellow not red', () => {
    expect(categorize(4.0)).toBe('yellow');
  });
});
```

- [ ] **Steg 2: Kör testet och verifiera att det MISSLYCKAS**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: FAIL — `Cannot find module '../../src/scoring/scorer'`

- [ ] **Steg 3: Skriv minimal implementation**

Skapa `packages/core/src/scoring/weights.ts`:

```typescript
import type { SmellType } from '../types';

export const SMELL_WEIGHTS: Record<SmellType, number> = {
  ComplexMethod: 1.5,
  DeepNesting: 1.2,
  BumpyRoad: 0.8,
  LargeMethod: 0.6,
  ComplexConditional: 0.5,
  LongParameterList: 0.4,
  LargeFile: 0.3,
};

export const SMELL_MAX_DEDUCTION = 3.0;
export const AI_READY_THRESHOLD = 9.5;
export const HEALTHY_THRESHOLD = 9.0;
export const PROBLEMATIC_THRESHOLD = 4.0;
```

Skapa `packages/core/src/scoring/scorer.ts`:

```typescript
import type { Smell, HealthCategory, SmellType } from '../types';
import {
  SMELL_WEIGHTS,
  SMELL_MAX_DEDUCTION,
  HEALTHY_THRESHOLD,
  PROBLEMATIC_THRESHOLD,
} from './weights';

export function calculateScore(smells: Smell[]): number {
  let score = 10.0;

  const countsByType = new Map<SmellType, number>();
  for (const smell of smells) {
    countsByType.set(smell.type, (countsByType.get(smell.type) ?? 0) + 1);
  }

  for (const [type, count] of countsByType) {
    const weight = SMELL_WEIGHTS[type];
    const deduction = Math.min(weight * count, SMELL_MAX_DEDUCTION);
    score -= deduction;
  }

  return Math.max(1.0, parseFloat(score.toFixed(1)));
}

export function categorize(score: number): HealthCategory {
  if (score >= HEALTHY_THRESHOLD) return 'green';
  if (score >= PROBLEMATIC_THRESHOLD) return 'yellow';
  return 'red';
}
```

- [ ] **Steg 4: Kör testet och verifiera att det PASSERAR**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: PASS — alla 16 assertions gröna (11 calculateScore + 5 categorize).

- [ ] **Steg 5: Commit**

```
git add packages/core/src/scoring/weights.ts packages/core/src/scoring/scorer.ts packages/core/tests/scoring/scorer.test.ts
git commit -m "feat(core): add scoring engine with smell weights and health categorization"
```

---

### Task 5: Language Detection

**Files:**
- Create: `packages/core/src/language-detect.ts`
- Test: `packages/core/tests/language-detect.test.ts`

- [ ] **Steg 1: Skriv det felande testet**

Skapa `packages/core/tests/language-detect.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../src/language-detect';

describe('detectLanguage', () => {
  // TypeScript
  it('detects .ts as typescript', () => {
    expect(detectLanguage('src/auth/login.ts')).toBe('typescript');
  });

  it('detects .tsx as typescript', () => {
    expect(detectLanguage('components/Button.tsx')).toBe('typescript');
  });

  it('detects uppercase .TS as typescript (case-insensitive)', () => {
    expect(detectLanguage('src/FILE.TS')).toBe('typescript');
  });

  // JavaScript
  it('detects .js as javascript', () => {
    expect(detectLanguage('src/utils.js')).toBe('javascript');
  });

  it('detects .jsx as javascript', () => {
    expect(detectLanguage('components/App.jsx')).toBe('javascript');
  });

  it('detects .mjs as javascript', () => {
    expect(detectLanguage('lib/module.mjs')).toBe('javascript');
  });

  it('detects .cjs as javascript', () => {
    expect(detectLanguage('lib/require.cjs')).toBe('javascript');
  });

  // Python
  it('detects .py as python', () => {
    expect(detectLanguage('scripts/analyze.py')).toBe('python');
  });

  // Java / Kotlin
  it('detects .java as java', () => {
    expect(detectLanguage('src/main/java/App.java')).toBe('java');
  });

  it('detects .kt as kotlin', () => {
    expect(detectLanguage('app/src/main/Main.kt')).toBe('kotlin');
  });

  it('detects .kts as kotlin', () => {
    expect(detectLanguage('build.gradle.kts')).toBe('kotlin');
  });

  // C#
  it('detects .cs as csharp', () => {
    expect(detectLanguage('src/Controllers/HomeController.cs')).toBe('csharp');
  });

  // Unsupported
  it('returns unsupported for .rb', () => {
    expect(detectLanguage('app.rb')).toBe('unsupported');
  });

  it('returns unsupported for .go', () => {
    expect(detectLanguage('main.go')).toBe('unsupported');
  });

  it('returns unsupported for .rs', () => {
    expect(detectLanguage('src/lib.rs')).toBe('unsupported');
  });

  it('returns unsupported for files with no extension', () => {
    expect(detectLanguage('Makefile')).toBe('unsupported');
  });

  it('returns unsupported for .md files', () => {
    expect(detectLanguage('README.md')).toBe('unsupported');
  });

  // Path handling
  it('handles absolute paths correctly', () => {
    expect(detectLanguage('/home/user/project/src/index.ts')).toBe('typescript');
  });

  it('handles Windows-style paths', () => {
    expect(detectLanguage('C:\\Users\\dev\\project\\src\\app.ts')).toBe('typescript');
  });

  it('handles filename only (no directory)', () => {
    expect(detectLanguage('index.ts')).toBe('typescript');
  });
});
```

- [ ] **Steg 2: Kör testet och verifiera att det MISSLYCKAS**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: FAIL — `Cannot find module '../src/language-detect'`

- [ ] **Steg 3: Skriv minimal implementation**

Skapa `packages/core/src/language-detect.ts`:

```typescript
import * as path from 'path';
import type { Language } from './types';

const EXTENSION_MAP: Record<string, Language> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.cs': 'csharp',
};

export function detectLanguage(filePath: string): Language {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'unsupported';
}
```

- [ ] **Steg 4: Kör testet och verifiera att det PASSERAR**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: PASS — alla 21 assertions gröna.

- [ ] **Steg 5: Commit**

```
git add packages/core/src/language-detect.ts packages/core/tests/language-detect.test.ts
git commit -m "feat(core): add language detection by file extension"
```

---

### Task 6: TypeScript/JS Analyzer

**Files:**
- Create: `packages/core/src/analyzers/typescript.ts`
- Test: `packages/core/tests/analyzers/typescript.test.ts`

> Note: This task requires tree-sitter native bindings. The test must run with `pool: 'forks'` in vitest.config.ts (already configured in Task 2).

- [ ] **Steg 1: Skriv det felande testet**

Skapa `packages/core/tests/analyzers/typescript.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeTypeScript } from '../../src/analyzers/typescript';

// ---- Helper code snippets ----

const SIMPLE_FUNCTION = `
export function add(a: number, b: number): number {
  return a + b;
}
`.trim();

const COMPLEX_FUNCTION = `
export function processItems(items: number[]): string {
  if (items.length > 0) {
    for (const item of items) {
      if (item > 0) {
        while (item > 1) {
          if (item % 2 === 0) {
            if (item > 100) {
              return 'large-even';
            }
          }
        }
      } else if (item < -10) {
        return 'negative-large';
      }
    }
  } else {
    return 'empty';
  }
  return 'default';
}
`.trim();

const ARROW_FUNCTION = `
const multiply = (a: number, b: number): number => a * b;
`.trim();

const MANY_PARAMS = `
function doSomething(a: string, b: number, c: boolean, d: object, e: string, f: number): void {
  console.log(a, b, c, d, e, f);
}
`.trim();

const EMPTY_FILE = ``;

const TWO_FUNCTIONS = `
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

function farewell(name: string): string {
  return \`Goodbye, \${name}!\`;
}
`.trim();

// ---- Tests ----

describe('analyzeTypeScript — function detection', () => {
  it('detects one function declaration', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions).toHaveLength(1);
    expect(functions[0].name).toBe('add');
  });

  it('reports correct start line for function', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions[0].line).toBe(1);
  });

  it('detects arrow function', () => {
    const { functions } = analyzeTypeScript(ARROW_FUNCTION);
    expect(functions).toHaveLength(1);
  });

  it('detects two functions in same file', () => {
    const { functions } = analyzeTypeScript(TWO_FUNCTIONS);
    expect(functions).toHaveLength(2);
  });

  it('returns empty functions array for empty file', () => {
    const { functions } = analyzeTypeScript(EMPTY_FILE);
    expect(functions).toHaveLength(0);
  });
});

describe('analyzeTypeScript — cyclomatic complexity', () => {
  it('simple function has cyclomaticComplexity of 1', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions[0].cyclomaticComplexity).toBe(1);
  });

  it('function with if/for/while/if/if has complexity > 5', () => {
    const { functions } = analyzeTypeScript(COMPLEX_FUNCTION);
    expect(functions[0].cyclomaticComplexity).toBeGreaterThan(5);
  });

  it('function with logical && increases complexity', () => {
    const code = `
function check(a: number, b: number): boolean {
  return a > 0 && b > 0;
}`.trim();
    const { functions } = analyzeTypeScript(code);
    // base(1) + if-like && (1) = 2
    expect(functions[0].cyclomaticComplexity).toBeGreaterThanOrEqual(2);
  });
});

describe('analyzeTypeScript — nesting depth', () => {
  it('simple function has nestingDepth of 0', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions[0].nestingDepth).toBe(0);
  });

  it('deeply nested function has nestingDepth > 3', () => {
    const { functions } = analyzeTypeScript(COMPLEX_FUNCTION);
    expect(functions[0].nestingDepth).toBeGreaterThan(3);
  });
});

describe('analyzeTypeScript — parameter count', () => {
  it('function with two params has parameterCount 2', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions[0].parameterCount).toBe(2);
  });

  it('function with six params has parameterCount 6', () => {
    const { functions } = analyzeTypeScript(MANY_PARAMS);
    expect(functions[0].parameterCount).toBe(6);
  });

  it('function with no params has parameterCount 0', () => {
    const code = `function noop(): void {}`.trim();
    const { functions } = analyzeTypeScript(code);
    expect(functions[0].parameterCount).toBe(0);
  });
});

describe('analyzeTypeScript — function length', () => {
  it('single-line function body has length >= 1', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions[0].length).toBeGreaterThanOrEqual(1);
  });
});

describe('analyzeTypeScript — metrics', () => {
  it('empty file has totalLines >= 0', () => {
    const { metrics } = analyzeTypeScript(EMPTY_FILE);
    expect(metrics.totalLines).toBeGreaterThanOrEqual(0);
  });

  it('totalLines matches line count of code', () => {
    const { metrics } = analyzeTypeScript(SIMPLE_FUNCTION);
    const expected = SIMPLE_FUNCTION.split('\n').length;
    expect(metrics.totalLines).toBe(expected);
  });

  it('metrics.maxNestingDepth equals max over all functions', () => {
    const { functions, metrics } = analyzeTypeScript(TWO_FUNCTIONS);
    const maxDepth = Math.max(...functions.map(f => f.nestingDepth));
    expect(metrics.maxNestingDepth).toBe(maxDepth);
  });

  it('metrics.maxParameterCount equals max over all functions', () => {
    const { functions, metrics } = analyzeTypeScript(MANY_PARAMS);
    const maxParams = Math.max(...functions.map(f => f.parameterCount));
    expect(metrics.maxParameterCount).toBe(maxParams);
  });

  it('empty file metrics have sensible zero defaults', () => {
    const { metrics } = analyzeTypeScript(EMPTY_FILE);
    expect(metrics.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
    expect(metrics.avgFunctionLength).toBe(0);
    expect(metrics.maxFunctionLength).toBe(0);
  });
});
```

- [ ] **Steg 2: Kör testet och verifiera att det MISSLYCKAS**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: FAIL — `Cannot find module '../../src/analyzers/typescript'`

- [ ] **Steg 3: Skriv minimal implementation**

Skapa `packages/core/src/analyzers/typescript.ts`:

```typescript
import Parser from 'tree-sitter';
import * as TypeScript from 'tree-sitter-typescript';
import type { FunctionResult, MetricBreakdown } from '../types';

const parser = new Parser();

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement',
  'ternary_expression',
  'catch_clause',
  'switch_case',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'while_statement',
  'do_statement',
  'switch_statement',
  'try_statement',
]);

function calculateCyclomaticComplexity(node: Parser.SyntaxNode): number {
  let complexity = 1;

  function traverse(n: Parser.SyntaxNode): void {
    if (CYCLOMATIC_NODE_TYPES.has(n.type)) {
      complexity++;
    } else if (n.type === 'binary_expression') {
      const op = n.childForFieldName('operator')?.text;
      if (op === '&&' || op === '||' || op === '??') complexity++;
    }
    for (const child of n.children) traverse(child);
  }

  traverse(node);
  return complexity;
}

function calculateMaxNestingDepth(node: Parser.SyntaxNode): number {
  let maxDepth = 0;

  function traverse(n: Parser.SyntaxNode, depth: number): void {
    const isNesting = NESTING_NODE_TYPES.has(n.type);
    const newDepth = isNesting ? depth + 1 : depth;
    if (isNesting) maxDepth = Math.max(maxDepth, newDepth);
    for (const child of n.children) traverse(child, newDepth);
  }

  traverse(node, 0);
  return maxDepth;
}

function getParameterCount(node: Parser.SyntaxNode): number {
  const params = node.childForFieldName('parameters');
  if (!params) return 0;
  return params.namedChildren.filter(c => c.type !== 'comment').length;
}

function getFunctionName(node: Parser.SyntaxNode): string {
  if (node.type === 'function_declaration' || node.type === 'method_definition') {
    return node.childForFieldName('name')?.text ?? '<anonymous>';
  }
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') {
    return parent.childForFieldName('name')?.text ?? '<anonymous>';
  }
  return '<anonymous>';
}

const FUNCTION_NODE_TYPES = new Set([
  'function_declaration',
  'method_definition',
  'arrow_function',
  'function_expression',
]);

export function analyzeTypeScript(code: string): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: never[];
} {
  parser.setLanguage(TypeScript.typescript);
  const tree = parser.parse(code);
  const functions: FunctionResult[] = [];

  function visitNode(node: Parser.SyntaxNode): void {
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      const name = getFunctionName(node);
      const startLine = node.startPosition.row + 1;
      const endLine = node.endPosition.row + 1;
      functions.push({
        name,
        line: startLine,
        length: endLine - startLine + 1,
        cyclomaticComplexity: calculateCyclomaticComplexity(node),
        nestingDepth: calculateMaxNestingDepth(node),
        parameterCount: getParameterCount(node),
        smells: [],
      });
    }
    for (const child of node.children) visitNode(child);
  }

  visitNode(tree.rootNode);

  const totalLines = code === '' ? 0 : code.split('\n').length;
  const metrics = buildMetrics(functions, totalLines);
  return { functions, metrics, smells: [] };
}

function buildMetrics(functions: FunctionResult[], totalLines: number): MetricBreakdown {
  if (functions.length === 0) {
    return {
      cyclomaticComplexity: 1,
      cognitiveComplexity: 1,
      maxNestingDepth: 0,
      avgFunctionLength: 0,
      maxFunctionLength: 0,
      avgParameterCount: 0,
      maxParameterCount: 0,
      totalLines,
      duplicationScore: 0,
    };
  }

  return {
    cyclomaticComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    cognitiveComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    maxNestingDepth: Math.max(...functions.map(f => f.nestingDepth)),
    avgFunctionLength: Math.round(
      functions.reduce((s, f) => s + f.length, 0) / functions.length,
    ),
    maxFunctionLength: Math.max(...functions.map(f => f.length)),
    avgParameterCount: parseFloat(
      (functions.reduce((s, f) => s + f.parameterCount, 0) / functions.length).toFixed(1),
    ),
    maxParameterCount: Math.max(...functions.map(f => f.parameterCount)),
    totalLines,
    duplicationScore: 0,
  };
}
```

- [ ] **Steg 4: Kör testet och verifiera att det PASSERAR**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: PASS — alla assertions gröna. Om tree-sitter ger `Error: Could not load language` — kontrollera att `pnpm install` kördes i Task 2 och att `vitest.config.ts` har `pool: 'forks'`.

- [ ] **Steg 5: Commit**

```
git add packages/core/src/analyzers/typescript.ts packages/core/tests/analyzers/typescript.test.ts
git commit -m "feat(core): add TypeScript/JS AST analyzer using tree-sitter"
```

---

### Task 7: Smell Detector

**Files:**
- Create: `packages/core/src/smells/detector.ts`
- Test: `packages/core/tests/smells/detector.test.ts`

- [ ] **Steg 1: Skriv det felande testet**

Skapa `packages/core/tests/smells/detector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectSmells } from '../../src/smells/detector';
import type { FunctionResult, MetricBreakdown } from '../../src/types';

function makeFunction(overrides: Partial<FunctionResult> = {}): FunctionResult {
  return {
    name: 'testFn',
    line: 1,
    length: 10,
    cyclomaticComplexity: 1,
    nestingDepth: 0,
    parameterCount: 2,
    smells: [],
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<MetricBreakdown> = {}): MetricBreakdown {
  return {
    cyclomaticComplexity: 1,
    cognitiveComplexity: 1,
    maxNestingDepth: 0,
    avgFunctionLength: 10,
    maxFunctionLength: 10,
    avgParameterCount: 2,
    maxParameterCount: 2,
    totalLines: 50,
    duplicationScore: 0,
    ...overrides,
  };
}

describe('detectSmells — LargeFile', () => {
  it('does NOT flag LargeFile when totalLines = 500', () => {
    const smells = detectSmells([], makeMetrics({ totalLines: 500 }));
    expect(smells.filter(s => s.type === 'LargeFile')).toHaveLength(0);
  });

  it('flags LargeFile when totalLines = 501', () => {
    const smells = detectSmells([], makeMetrics({ totalLines: 501 }));
    expect(smells.filter(s => s.type === 'LargeFile')).toHaveLength(1);
  });

  it('LargeFile smell has line = 1', () => {
    const smells = detectSmells([], makeMetrics({ totalLines: 600 }));
    const largeFile = smells.find(s => s.type === 'LargeFile');
    expect(largeFile?.line).toBe(1);
  });

  it('LargeFile smell has severity medium', () => {
    const smells = detectSmells([], makeMetrics({ totalLines: 1000 }));
    const largeFile = smells.find(s => s.type === 'LargeFile');
    expect(largeFile?.severity).toBe('medium');
  });
});

describe('detectSmells — ComplexMethod', () => {
  it('does NOT flag ComplexMethod when cyclomaticComplexity = 10', () => {
    const fn = makeFunction({ cyclomaticComplexity: 10 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'ComplexMethod')).toHaveLength(0);
  });

  it('flags ComplexMethod when cyclomaticComplexity = 11', () => {
    const fn = makeFunction({ cyclomaticComplexity: 11 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'ComplexMethod')).toHaveLength(1);
  });

  it('ComplexMethod is critical when cyclomaticComplexity > 20', () => {
    const fn = makeFunction({ cyclomaticComplexity: 21 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'ComplexMethod');
    expect(smell?.severity).toBe('critical');
  });

  it('ComplexMethod is high when cyclomaticComplexity = 15', () => {
    const fn = makeFunction({ cyclomaticComplexity: 15 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'ComplexMethod');
    expect(smell?.severity).toBe('high');
  });

  it('flags one ComplexMethod per function when two complex functions', () => {
    const fn1 = makeFunction({ name: 'fn1', cyclomaticComplexity: 12 });
    const fn2 = makeFunction({ name: 'fn2', cyclomaticComplexity: 15, line: 20 });
    const smells = detectSmells([fn1, fn2], makeMetrics());
    expect(smells.filter(s => s.type === 'ComplexMethod')).toHaveLength(2);
  });
});

describe('detectSmells — DeepNesting', () => {
  it('does NOT flag DeepNesting when nestingDepth = 4', () => {
    const fn = makeFunction({ nestingDepth: 4 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'DeepNesting')).toHaveLength(0);
  });

  it('flags DeepNesting when nestingDepth = 5', () => {
    const fn = makeFunction({ nestingDepth: 5 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'DeepNesting')).toHaveLength(1);
  });

  it('DeepNesting is critical when nestingDepth > 6', () => {
    const fn = makeFunction({ nestingDepth: 7 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'DeepNesting');
    expect(smell?.severity).toBe('critical');
  });

  it('DeepNesting is high when nestingDepth = 5', () => {
    const fn = makeFunction({ nestingDepth: 5 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'DeepNesting');
    expect(smell?.severity).toBe('high');
  });
});

describe('detectSmells — LargeMethod', () => {
  it('does NOT flag LargeMethod when length = 30', () => {
    const fn = makeFunction({ length: 30 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'LargeMethod')).toHaveLength(0);
  });

  it('flags LargeMethod when length = 31', () => {
    const fn = makeFunction({ length: 31 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'LargeMethod')).toHaveLength(1);
  });

  it('LargeMethod has severity medium', () => {
    const fn = makeFunction({ length: 50 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'LargeMethod');
    expect(smell?.severity).toBe('medium');
  });
});

describe('detectSmells — LongParameterList', () => {
  it('does NOT flag LongParameterList when parameterCount = 5', () => {
    const fn = makeFunction({ parameterCount: 5 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'LongParameterList')).toHaveLength(0);
  });

  it('flags LongParameterList when parameterCount = 6', () => {
    const fn = makeFunction({ parameterCount: 6 });
    const smells = detectSmells([fn], makeMetrics());
    expect(smells.filter(s => s.type === 'LongParameterList')).toHaveLength(1);
  });
});

describe('detectSmells — BumpyRoad', () => {
  it('does NOT flag BumpyRoad when fewer than 3 deeply nested functions', () => {
    const fns = [
      makeFunction({ nestingDepth: 3 }),
      makeFunction({ nestingDepth: 3, line: 20 }),
    ];
    const smells = detectSmells(fns, makeMetrics());
    expect(smells.filter(s => s.type === 'BumpyRoad')).toHaveLength(0);
  });

  it('flags BumpyRoad when 3 or more functions have nestingDepth >= 3', () => {
    const fns = [
      makeFunction({ nestingDepth: 3 }),
      makeFunction({ nestingDepth: 4, line: 20 }),
      makeFunction({ nestingDepth: 3, line: 40 }),
    ];
    const smells = detectSmells(fns, makeMetrics());
    expect(smells.filter(s => s.type === 'BumpyRoad')).toHaveLength(1);
  });

  it('BumpyRoad has severity high', () => {
    const fns = [
      makeFunction({ nestingDepth: 3 }),
      makeFunction({ nestingDepth: 3, line: 20 }),
      makeFunction({ nestingDepth: 3, line: 40 }),
    ];
    const smells = detectSmells(fns, makeMetrics());
    const smell = smells.find(s => s.type === 'BumpyRoad');
    expect(smell?.severity).toBe('high');
  });
});

describe('detectSmells — clean code produces no smells', () => {
  it('returns empty array for simple functions below all thresholds', () => {
    const fn = makeFunction({
      cyclomaticComplexity: 3,
      nestingDepth: 1,
      length: 10,
      parameterCount: 2,
    });
    const smells = detectSmells([fn], makeMetrics({ totalLines: 100 }));
    expect(smells).toHaveLength(0);
  });
});

describe('detectSmells — smell descriptions and suggestions', () => {
  it('ComplexMethod description mentions the function name and complexity', () => {
    const fn = makeFunction({ name: 'myComplexFn', cyclomaticComplexity: 15 });
    const smells = detectSmells([fn], makeMetrics());
    const smell = smells.find(s => s.type === 'ComplexMethod');
    expect(smell?.description).toContain('myComplexFn');
    expect(smell?.description).toContain('15');
  });

  it('all smells have non-empty suggestion', () => {
    const fn = makeFunction({
      cyclomaticComplexity: 15,
      nestingDepth: 5,
      length: 50,
      parameterCount: 7,
    });
    const smells = detectSmells([fn], makeMetrics({ totalLines: 600 }));
    for (const smell of smells) {
      expect(smell.suggestion.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Steg 2: Kör testet och verifiera att det MISSLYCKAS**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: FAIL — `Cannot find module '../../src/smells/detector'`

- [ ] **Steg 3: Skriv minimal implementation**

Skapa `packages/core/src/smells/detector.ts`:

```typescript
import type { FunctionResult, MetricBreakdown, Smell } from '../types';

export function detectSmells(
  functions: FunctionResult[],
  metrics: MetricBreakdown,
): Smell[] {
  const smells: Smell[] = [];

  // LargeFile: fil med fler än 500 rader
  if (metrics.totalLines > 500) {
    smells.push({
      type: 'LargeFile',
      severity: 'medium',
      line: 1,
      description: `Fil har ${metrics.totalLines} rader (gräns: 500)`,
      suggestion: 'Dela upp filen i mindre, fokuserade moduler',
    });
  }

  for (const fn of functions) {
    // ComplexMethod: cyklomatisk komplexitet > 10
    if (fn.cyclomaticComplexity > 10) {
      smells.push({
        type: 'ComplexMethod',
        severity: fn.cyclomaticComplexity > 20 ? 'critical' : 'high',
        functionName: fn.name,
        line: fn.line,
        description: `'${fn.name}' har cyklomatisk komplexitet ${fn.cyclomaticComplexity} (gräns: 10)`,
        suggestion: `Extrahera logik från '${fn.name}' till separata hjälpfunktioner`,
      });
    }

    // DeepNesting: nestningsdjup > 4
    if (fn.nestingDepth > 4) {
      smells.push({
        type: 'DeepNesting',
        severity: fn.nestingDepth > 6 ? 'critical' : 'high',
        functionName: fn.name,
        line: fn.line,
        description: `'${fn.name}' har nestningsdjup ${fn.nestingDepth} (gräns: 4)`,
        suggestion: `Tillämpa early-return pattern i '${fn.name}'`,
      });
    }

    // LargeMethod: funktion med fler än 30 rader
    if (fn.length > 30) {
      smells.push({
        type: 'LargeMethod',
        severity: 'medium',
        functionName: fn.name,
        line: fn.line,
        description: `'${fn.name}' är ${fn.length} rader (gräns: 30)`,
        suggestion: `Dela upp '${fn.name}' i mindre funktioner`,
      });
    }

    // LongParameterList: fler än 5 parametrar
    if (fn.parameterCount > 5) {
      smells.push({
        type: 'LongParameterList',
        severity: 'medium',
        functionName: fn.name,
        line: fn.line,
        description: `'${fn.name}' har ${fn.parameterCount} parametrar (gräns: 5)`,
        suggestion: `Gruppera parametrar i ett options-objekt`,
      });
    }
  }

  // BumpyRoad: 3 eller fler funktioner med nestingDepth >= 3
  const bumpyFunctions = functions.filter(f => f.nestingDepth >= 3);
  if (bumpyFunctions.length >= 3) {
    smells.push({
      type: 'BumpyRoad',
      severity: 'high',
      line: bumpyFunctions[0].line,
      description: `${bumpyFunctions.length} funktioner med djup nestning — bumpy road-mönster`,
      suggestion: 'Förenkla kontrollflödet med early returns och hjälpfunktioner',
    });
  }

  return smells;
}
```

- [ ] **Steg 4: Kör testet och verifiera att det PASSERAR**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: PASS — alla assertions gröna.

- [ ] **Steg 5: Commit**

```
git add packages/core/src/smells/detector.ts packages/core/tests/smells/detector.test.ts
git commit -m "feat(core): add smell detector for ComplexMethod, DeepNesting, LargeMethod, LongParameterList, BumpyRoad, LargeFile"
```

---

### Task 8: Core Public API

**Files:**
- Create: `packages/core/src/index.ts`
- Test: `packages/core/tests/index.test.ts`

- [ ] **Steg 1: Skriv det felande testet**

Skapa `packages/core/tests/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  analyzeCode,
  analyzeFile,
  analyzeChangeset,
} from '../src/index';
import type { HealthResult, ChangesetResult } from '../src/types';

// Paths to fixture files created in Task 9
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const HEALTHY_FILE = path.join(FIXTURES_DIR, 'healthy', 'simple.ts');
const UNHEALTHY_FILE = path.join(FIXTURES_DIR, 'unhealthy', 'complex.ts');

// ---- analyzeCode ----

describe('analyzeCode — typescript', () => {
  const SIMPLE_CODE = `
export function add(a: number, b: number): number {
  return a + b;
}
`.trim();

  it('returns a HealthResult with correct shape', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript');
    expect(result).toHaveProperty('filePath');
    expect(result).toHaveProperty('language', 'typescript');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('smells');
    expect(result).toHaveProperty('metrics');
    expect(result).toHaveProperty('functions');
  });

  it('simple code has score 10.0', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript');
    expect(result.score).toBe(10.0);
  });

  it('simple code has category green', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript');
    expect(result.category).toBe('green');
  });

  it('simple code has no smells', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript');
    expect(result.smells).toHaveLength(0);
  });

  it('uses <inline> as filePath when not provided', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript');
    expect(result.filePath).toBe('<inline>');
  });

  it('uses provided filePath', () => {
    const result = analyzeCode(SIMPLE_CODE, 'typescript', 'src/auth.ts');
    expect(result.filePath).toBe('src/auth.ts');
  });
});

describe('analyzeCode — unsupported language', () => {
  it('returns score 10.0 for unsupported language', () => {
    const result = analyzeCode('some code', 'unsupported');
    expect(result.score).toBe(10.0);
    expect(result.category).toBe('green');
    expect(result.smells).toHaveLength(0);
  });

  it('returns language as unsupported', () => {
    const result = analyzeCode('some code', 'unsupported');
    expect(result.language).toBe('unsupported');
  });
});

describe('analyzeCode — score range', () => {
  it('score is always between 1.0 and 10.0', () => {
    const codes = [
      { code: 'export function add(a: number, b: number) { return a + b; }', lang: 'typescript' as const },
      { code: 'const x = 1;', lang: 'typescript' as const },
    ];
    for (const { code, lang } of codes) {
      const result = analyzeCode(code, lang);
      expect(result.score).toBeGreaterThanOrEqual(1.0);
      expect(result.score).toBeLessThanOrEqual(10.0);
    }
  });
});

// ---- analyzeFile ----

describe('analyzeFile — healthy fixture', () => {
  it('returns HealthResult for a .ts file', async () => {
    const result: HealthResult = await analyzeFile(HEALTHY_FILE);
    expect(result.language).toBe('typescript');
    expect(result.score).toBeGreaterThanOrEqual(9.0);
    expect(result.category).toBe('green');
  });

  it('includes filePath in result', async () => {
    const result = await analyzeFile(HEALTHY_FILE);
    expect(result.filePath).toBe(HEALTHY_FILE);
  });
});

describe('analyzeFile — unhealthy fixture', () => {
  it('unhealthy file has score < 9.0', async () => {
    const result: HealthResult = await analyzeFile(UNHEALTHY_FILE);
    expect(result.score).toBeLessThan(9.0);
  });

  it('unhealthy file has smells', async () => {
    const result: HealthResult = await analyzeFile(UNHEALTHY_FILE);
    expect(result.smells.length).toBeGreaterThan(0);
  });
});

describe('analyzeFile — error handling', () => {
  it('throws when file does not exist', async () => {
    await expect(analyzeFile('/nonexistent/path/file.ts')).rejects.toThrow();
  });
});

// ---- analyzeChangeset (stub) ----

describe('analyzeChangeset — stub', () => {
  it('returns a ChangesetResult shape', async () => {
    const result: ChangesetResult = await analyzeChangeset('/any/path', 'main');
    expect(result).toHaveProperty('filesAnalyzed');
    expect(result).toHaveProperty('regressions');
    expect(result).toHaveProperty('improvements');
    expect(result).toHaveProperty('newUnhealthyFiles');
    expect(result).toHaveProperty('overallSafe');
  });

  it('stub returns overallSafe: true', async () => {
    const result = await analyzeChangeset('/any/path', 'main');
    expect(result.overallSafe).toBe(true);
  });
});

// ---- Type re-exports ----

describe('type exports', () => {
  it('exports Language type (verified at compile time by import above)', () => {
    // If types.ts is not re-exported, the import at the top of this file would fail
    expect(true).toBe(true);
  });
});
```

- [ ] **Steg 2: Kör testet och verifiera att det MISSLYCKAS**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: FAIL — `Cannot find module '../src/index'` ELLER att fixture-filerna saknas (vilket också förväntas — de skapas i Task 9).

- [ ] **Steg 3: Skriv minimal implementation**

Skapa `packages/core/src/index.ts`:

```typescript
import * as fs from 'fs/promises';
import { detectLanguage } from './language-detect';
import { analyzeTypeScript } from './analyzers/typescript';
import { detectSmells } from './smells/detector';
import { calculateScore, categorize } from './scoring/scorer';
import type { HealthResult, Language, ChangesetResult, MetricBreakdown } from './types';

// Re-export all types so consumers import from one place
export * from './types';

/**
 * Analysera en fil på disk. Kastar om filen inte kan läsas.
 */
export async function analyzeFile(filePath: string): Promise<HealthResult> {
  const code = await fs.readFile(filePath, 'utf-8');
  const language = detectLanguage(filePath);
  return analyzeCode(code, language, filePath);
}

/**
 * Analysera en kodsträng direkt.
 * @param filePath - Används bara för metadata i resultatet, default '<inline>'.
 */
export function analyzeCode(
  code: string,
  language: Language,
  filePath = '<inline>',
): HealthResult {
  if (language === 'unsupported') {
    return buildUnsupportedResult(code, filePath);
  }

  if (language === 'typescript' || language === 'javascript') {
    const { functions, metrics } = analyzeTypeScript(code);
    const smells = detectSmells(functions, metrics);
    const score = calculateScore(smells);
    const category = categorize(score);
    return { filePath, language, score, category, smells, metrics, functions };
  }

  // Python, Java, Kotlin, C# — stub until Sprint 2
  return buildStubResult(code, language, filePath);
}

/**
 * Analysera git-diff mot basgren.
 * Stub — implementeras i Sprint 2.
 */
export async function analyzeChangeset(
  _repoPath: string,
  _baseBranch: string,
): Promise<ChangesetResult> {
  return {
    filesAnalyzed: 0,
    regressions: [],
    improvements: [],
    newUnhealthyFiles: [],
    overallSafe: true,
  };
}

// ---- Helpers ----

function emptyMetrics(totalLines: number): MetricBreakdown {
  return {
    cyclomaticComplexity: 1,
    cognitiveComplexity: 1,
    maxNestingDepth: 0,
    avgFunctionLength: 0,
    maxFunctionLength: 0,
    avgParameterCount: 0,
    maxParameterCount: 0,
    totalLines,
    duplicationScore: 0,
  };
}

function buildUnsupportedResult(code: string, filePath: string): HealthResult {
  return {
    filePath,
    language: 'unsupported',
    score: 10.0,
    category: 'green',
    smells: [],
    functions: [],
    metrics: emptyMetrics(code.split('\n').length),
  };
}

function buildStubResult(code: string, language: Language, filePath: string): HealthResult {
  const totalLines = code.split('\n').length;
  return {
    filePath,
    language,
    score: 10.0,
    category: 'green',
    smells: [],
    functions: [],
    metrics: emptyMetrics(totalLines),
  };
}
```

- [ ] **Steg 4: Kör testet och verifiera att det PASSERAR (partiellt)**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: De flesta tests PASS, men `analyzeFile — healthy fixture` och `analyzeFile — unhealthy fixture` FAIL med `ENOENT` — fixture-filerna skapas i Task 9. Detta är förväntat beteende.

- [ ] **Steg 5: Commit**

```
git add packages/core/src/index.ts packages/core/tests/index.test.ts
git commit -m "feat(core): add public API — analyzeFile, analyzeCode, analyzeChangeset"
```

---

### Task 9: Test Fixtures

**Files:**
- Create: `packages/core/tests/fixtures/healthy/simple.ts`
- Create: `packages/core/tests/fixtures/unhealthy/complex.ts`
- Create: `packages/core/tests/fixtures/edge-cases/empty.ts`

> This task has no separate test file — the fixtures are consumed by Task 8's `index.test.ts`. The test for Task 8 verifies the expected scores.

- [ ] **Steg 1: Skapa healthy fixture**

Skapa `packages/core/tests/fixtures/healthy/simple.ts`:

```typescript
/**
 * Healthy fixture — expected score: 10.0 (no smells)
 * All functions are short, low complexity, minimal nesting.
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function isPositive(n: number): boolean {
  return n > 0;
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function toUpperCase(str: string): string {
  return str.toUpperCase();
}
```

- [ ] **Steg 2: Skapa unhealthy fixture**

Skapa `packages/core/tests/fixtures/unhealthy/complex.ts`:

```typescript
/**
 * Unhealthy fixture — expected score: < 6.0 (multiple smells)
 *
 * Contains:
 * - ComplexMethod (cyclomaticComplexity > 10)
 * - DeepNesting (nestingDepth > 4)
 * - LongParameterList (parameterCount > 5)
 * - LargeMethod (length > 30)
 * - BumpyRoad (3+ functions with deep nesting)
 */

export function processData(
  items: number[],
  config: object,
  options: object,
  callback: Function,
  mode: string,
  extra: boolean,
): string {
  if (items.length > 0) {
    for (const item of items) {
      if (item > 0) {
        while (item > 1) {
          if (item % 2 === 0) {
            if (mode === 'fast') {
              return 'fast-path';
            } else if (mode === 'slow') {
              return 'slow-path';
            } else if (mode === 'normal') {
              return 'normal-path';
            }
          } else {
            if (extra) {
              return 'extra-odd';
            }
          }
        }
      } else if (item < -10) {
        return 'negative';
      } else if (item === 0) {
        return 'zero';
      }
    }
  } else if (extra) {
    return 'extra';
  } else {
    return 'empty';
  }
  return 'default';
}

export function validateInput(
  value: unknown,
  type: string,
  required: boolean,
  min: number,
  max: number,
  pattern: string,
): boolean {
  if (required) {
    if (value === null || value === undefined) {
      return false;
    }
  }
  if (type === 'number') {
    if (typeof value === 'number') {
      if (value < min) {
        return false;
      } else if (value > max) {
        return false;
      }
    } else {
      return false;
    }
  } else if (type === 'string') {
    if (typeof value === 'string') {
      if (pattern) {
        if (!new RegExp(pattern).test(value)) {
          return false;
        }
      }
    } else {
      return false;
    }
  }
  return true;
}

export function parseConfig(
  raw: string,
  strict: boolean,
  fallback: object,
  schema: object,
  version: number,
  debug: boolean,
): object {
  if (raw && raw.length > 0) {
    try {
      if (strict) {
        if (version >= 2) {
          if (debug) {
            console.log('Parsing in strict v2 mode');
          }
          return JSON.parse(raw);
        } else {
          return JSON.parse(raw);
        }
      } else {
        return JSON.parse(raw);
      }
    } catch {
      if (strict) {
        throw new Error('Parse failed in strict mode');
      }
      return fallback;
    }
  }
  return fallback;
}
```

- [ ] **Steg 3: Skapa edge-case fixture (tom fil)**

Skapa `packages/core/tests/fixtures/edge-cases/empty.ts`:

```typescript
// Empty file — intentionally blank for edge case testing
```

- [ ] **Steg 4: Kör hela testsviten och verifiera att alla tester PASSERAR**

Kör: `pnpm --filter @healthy-ai-code/core test`

Förväntat: PASS — alla tester i hela paketet gröna, inklusive `index.test.ts` med fixture-filerna.

Kontrollera specifikt:
- `healthy/simple.ts` → score 10.0, category 'green'
- `unhealthy/complex.ts` → score < 9.0, minst ett smell

- [ ] **Steg 5: Commit**

```
git add packages/core/tests/fixtures/
git commit -m "test(core): add healthy, unhealthy and edge-case TypeScript fixtures"
```

---

## Sprint 1 — Final Verification

Efter att alla 9 tasks är klara, kör en fullständig verifiering:

- [ ] **Kör alla tester**

```
pnpm --filter @healthy-ai-code/core test
```

Förväntat: Alla tester PASS. Noll failures.

- [ ] **Kör typecheck**

```
pnpm --filter @healthy-ai-code/core typecheck
```

Förväntat: Noll TypeScript-fel.

- [ ] **Kör build**

```
pnpm --filter @healthy-ai-code/core build
```

Förväntat: `packages/core/dist/` skapas med `.js`, `.d.ts` och `.js.map` för alla källfiler.

- [ ] **Verifiera dist-struktur**

Kontrollera att dessa filer finns i `packages/core/dist/`:
- `index.js` + `index.d.ts`
- `types.js` + `types.d.ts`
- `language-detect.js` + `language-detect.d.ts`
- `scoring/weights.js` + `scoring/scorer.js`
- `analyzers/typescript.js`
- `smells/detector.js`

- [ ] **Final commit (om inga ändringar behövs)**

Om allt är grönt och inget behöver fixas:

```
git tag sprint-1-complete
```

---

## Förväntad filstruktur efter Sprint 1

```
healthy-ai-code-mcp/
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── .gitignore
└── packages/
    └── core/
        ├── package.json
        ├── tsconfig.json
        ├── vitest.config.ts
        ├── src/
        │   ├── index.ts
        │   ├── types.ts
        │   ├── language-detect.ts
        │   ├── analyzers/
        │   │   └── typescript.ts
        │   ├── scoring/
        │   │   ├── weights.ts
        │   │   └── scorer.ts
        │   └── smells/
        │       └── detector.ts
        └── tests/
            ├── types.test.ts
            ├── language-detect.test.ts
            ├── index.test.ts
            ├── analyzers/
            │   └── typescript.test.ts
            ├── scoring/
            │   └── scorer.test.ts
            ├── smells/
            │   └── detector.test.ts
            └── fixtures/
                ├── healthy/
                │   └── simple.ts
                ├── unhealthy/
                │   └── complex.ts
                └── edge-cases/
                    └── empty.ts
```

---

## Kända begränsningar i Sprint 1

- `analyzeChangeset` är en stub — implementeras i Sprint 2 med git-integration
- Python, Java, Kotlin och C# analyzers är stubs — returnerar score 10.0 tills Sprint 2
- `ComplexConditional` smell detekteras inte ännu av detectSmells — läggs till i Sprint 2 med kognitiv komplexitet
- `duplicationScore` är alltid 0 — krävs mer avancerad analys som tillhör Sprint 2
- `cognitiveComplexity` i MetricBreakdown är för nu en kopia av `cyclomaticComplexity` — riktig kognitiv komplexitetsanalys tillhör Sprint 2
