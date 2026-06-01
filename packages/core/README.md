# @healthy-ai-code/core

> AST-based code health analysis engine — 28 biomarkers, 46 languages

The analysis engine powering [@healthy-ai-code/mcp-server](https://www.npmjs.com/package/@healthy-ai-code/mcp-server). Provides synchronous and async analysis entry points, a scoring formula, temporal/git-history analysis, security scanning, architecture debt, and AI-readiness metrics.

---

## Installation

```bash
npm install @healthy-ai-code/core
# or
pnpm add @healthy-ai-code/core
```

---

## Quick Start

```typescript
import { analyzeCode, analyzeFile, analyzeFileWithHistory } from '@healthy-ai-code/core';

// Inline analysis — synchronous, no disk access
const result = analyzeCode(sourceCode, 'typescript');
console.log(result.score);       // 0.0–10.0
console.log(result.smells);      // detected biomarkers

// File analysis — async, reads from disk
const fileResult = await analyzeFile('/path/to/file.ts');

// File + git history — includes MethodTemporalCoupling
const histResult = await analyzeFileWithHistory('/path/to/file.ts', '/path/to/repo');
```

---

## API

### Three analysis entry points

| Function | Signature | When to use |
|---|---|---|
| `analyzeCode()` | `(code: string, language, filePath?)` — **sync** | Inline analysis, no disk access, no git |
| `analyzeFile()` | `(filePath: string)` — **async** | Reads file from disk, no git |
| `analyzeFileWithHistory()` | `(filePath, repoPath)` — **async** | Adds `MethodTemporalCoupling` smells from git history |

### Key exports

```typescript
// Core analysis
import { analyzeCode, analyzeFile, analyzeFileWithHistory } from '@healthy-ai-code/core';

// Diff/changeset analysis
import { analyzeChangeset } from '@healthy-ai-code/core';

// Architecture analysis
import { analyzeArchitectureDebt, computeFanInFanOut } from '@healthy-ai-code/core';

// Temporal / git-history analysis
import { analyzeBusFactor, analyzeHotspots, analyzeFileCoupling } from '@healthy-ai-code/core';

// Security
import { auditSecurity, detectSecrets, formatAsSarif } from '@healthy-ai-code/core';

// AI readiness
import { analyzeAIReadiness, analyzeNamingClarity, analyzeTypeCoverage } from '@healthy-ai-code/core';

// Auto-refactor
import { analyzeForAutoRefactor, runRefactoringLoop } from '@healthy-ai-code/core';

// Debt goals
import { loadGoals, setGoal, removeGoal, listGoals } from '@healthy-ai-code/core';

// Configuration
import { setConfig, getConfig } from '@healthy-ai-code/core';
```

---

## Health Score

```
score = 10 − Σ(weight × √count)   per smell type
floor = 1.0
```

| Score | Category | Meaning |
|-------|----------|---------|
| 9.5–10.0 | Green | AI-ready |
| 9.0–9.4 | Green | Healthy |
| 6.0–8.9 | Yellow | Technical debt present |
| 1.0–5.9 | Red | Severe technical debt |

---

## Biomarkers (28)

### Method-level

| Biomarker | Weight |
|-----------|--------|
| `ComplexMethod` | 1.5 |
| `BrainMethod` | 1.2 |
| `DeepNesting` | 1.2 |
| `BumpyRoad` | 0.8 |
| `CognitiveComplexity` | 0.8 |
| `LargeMethod` | 0.6 |
| `ComplexConditional` | 0.5 |
| `LongParameterList` | 0.4 |
| `MagicNumber` | 0.4 |
| `LowDocCoverage` | 0.3 |

### Class / module level

| Biomarker | Weight |
|-----------|--------|
| `GodClass` | 1.5 |
| `KnowledgeLoss` | 1.0 |
| `HardcodedCredential` | 2.0 |
| `HardcodedApiKey` | 2.0 |
| `SqlInjectionRisk` | 1.5 |
| `XssRisk` | 1.5 |
| `CommandInjectionRisk` | 1.5 |
| `FeatureEnvy` | 0.7 |
| `TypeSafetyEscape` | 0.7 |
| `SATD` | 0.6 |
| `LargeFile` | 0.3 |
| `MethodTemporalCoupling` | 0.3 |

### Organisational / temporal

| Biomarker | Weight |
|-----------|--------|
| `DeveloperCongestion` | 0.7 |
| `CodeChurn` | 0.6 |
| `DataClumps` | 0.5 |
| `MessageChain` | 0.5 |
| `TestProximity` | 0.5 |
| `PrimitiveObsession` | 0.5 |
| `LowMaintainability` | 0.4 |

---

## Supported Languages (46)

**Tier A — Full AST (tree-sitter) · 17 languages:**
TypeScript, JavaScript, Python, Java, C#, Kotlin, Scala, Swift, Ruby, Rust, Go, PHP, Vue.js, Elixir, Haskell, Julia, OCaml

**Tier B — Regex · 19 languages:**
Bash, Lua, R, Clojure, Dart, C, C++, COBOL, Apex, F#, VB.NET, Perl, Groovy, Objective-C, PowerShell, Erlang, Zig, Nim, Crystal

**Tier C — Structural · 10 formats:**
YAML, JSON, Dockerfile, HCL/Terraform, Makefile, SQL, HTML, CSS, Markdown, TOML

---

## Requirements

- Node.js ≥ 18.0.0

---

## Links

- [GitHub repository](https://github.com/screamm/HealthyAICode_MCP)
- [MCP server package](https://www.npmjs.com/package/@healthy-ai-code/mcp-server)
- [Issues](https://github.com/screamm/HealthyAICode_MCP/issues)

---

## License

MIT — see [LICENSE](./LICENSE)
