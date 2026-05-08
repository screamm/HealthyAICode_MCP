# Healthy AI Code — MCP

An AST-based code health analysis engine exposed as a **Model Context Protocol (MCP)** server. Gives AI assistants (Claude, Copilot, etc.) real-time feedback on code quality so they can generate healthier code from the start.

## What it does

- Parses source files with [Tree-sitter](https://tree-sitter.github.io/) — no runtime needed
- Detects code smells: long functions, deep nesting, high complexity, too many parameters, large files
- Produces a **health score (0–100)** with per-smell breakdown
- Exposes analysis results over MCP so any compatible AI tool can query them

## Supported languages

| Language | Status |
|---|---|
| TypeScript / JavaScript | Stable |
| Python | Stable |
| Java | Stable |
| C# | Stable |

## Project layout

```
healthy-ai-code-mcp/
├── packages/
│   └── core/               # Analysis engine (@healthy-ai-code/core)
│       ├── src/
│       │   ├── analyzers/  # Language-specific AST analyzers
│       │   ├── smells/     # Smell detectors
│       │   ├── scoring/    # Health score calculation
│       │   ├── language-detect.ts
│       │   ├── types.ts
│       │   └── index.ts    # Public API
│       └── tests/
├── package.json            # Workspace root (pnpm)
└── pnpm-workspace.yaml
```

## Requirements

- Node.js >= 18
- pnpm >= 8

## Getting started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Type-check
pnpm typecheck
```

## Public API

```typescript
import { analyzeFile, analyzeCode, analyzeChangeset } from "@healthy-ai-code/core";

// Analyze a file on disk
const result = await analyzeFile("src/utils.ts");

// Analyze a code string directly
const result = await analyzeCode(sourceCode, { language: "typescript" });

// Analyze a git changeset
const result = await analyzeChangeset({ base: "main", head: "HEAD" });

// result.score        — 0–100 health score
// result.smells       — detected code smells with locations
// result.metrics      — raw metrics (LOC, complexity, etc.)
```

## Health score

| Range | Label |
|---|---|
| 80–100 | Healthy |
| 60–79 | Needs attention |
| 40–59 | Unhealthy |
| 0–39 | Critical |

## License

MIT
