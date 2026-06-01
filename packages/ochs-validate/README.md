# ochs-validate

Standalone validator for [OCHS](../../docs/ochs/OCHS-v0.1.md) (Open Code Health Score) v0.1 score objects.

**Zero runtime dependencies on `@healthy-ai-code/core`.** Ships a complete copy of the canonical OCHS v0.1 biomarker weights and validates any OCHS score JSON object independently of the reference implementation.

## What it checks

1. **Structural validity** — required fields (`ochsVersion`, `score`, `smells`), value types, score range [1.0, 10.0], recognised smell-type identifiers.
2. **Formula consistency** — re-derives the score from the smell vector using the OCHS formula and compares it with the reported score:

   ```
   score = max(1.0, 10 − Σ(weight_i × sqrt(count_i)))
   ```

## Install

```bash
npm install ochs-validate
# or
pnpm add ochs-validate
```

## CLI

```bash
# Validate a file
ochs-validate result.json

# Read from stdin
cat result.json | ochs-validate

# Strict mode — unknown biomarker types are hard errors
ochs-validate --strict result.json

# JSON output
ochs-validate --json result.json

# Custom formula tolerance (default: 0.05)
ochs-validate --tolerance 0.001 result.json
```

Exit codes: `0` = pass, `1` = fail, `2` = bad arguments or I/O error.

## Library API

```typescript
import { validateOchs, validateOchsJson, deriveScore } from 'ochs-validate';

// Validate a parsed object
const result = validateOchs({
  ochsVersion: '0.1',
  score: 8.5,
  smells: [{ type: 'ComplexMethod', severity: 'high' }],
});

console.log(result.valid);         // true
console.log(result.derivedScore);  // 8.5
console.log(result.derivedCategory); // 'yellow'

// Validate a raw JSON string
const result2 = validateOchsJson(jsonString);

// Re-derive a score from a smell array
const score = deriveScore([{ type: 'ComplexMethod' }, { type: 'DeepNesting' }]);
```

### `validateOchs(input, options?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `scoreTolerance` | `number` | `0.05` | Maximum allowed delta between reported and derived score |
| `strictSmellTypes` | `boolean` | `false` | Treat unknown biomarker types as hard errors (OCHS v0.1 allows extensions) |

Returns a `ValidationResult`:

```typescript
interface ValidationResult {
  valid: boolean;          // true when no hard errors
  errors: string[];        // empty when valid; warnings prefixed with "[warning]"
  derivedScore?: number;   // score re-derived from smell vector
  derivedCategory?: 'green' | 'yellow' | 'red';
  derivedLoopComplete?: boolean;
}
```

## JSON Schema

The published OCHS JSON schema is at `schemas/ochs-schema.json`. You can use it with any JSON Schema validator:

```bash
npx ajv-cli validate -s node_modules/ochs-validate/schemas/ochs-schema.json -d result.json
```

## Score thresholds

| Constant | Value | Meaning |
|---|---|---|
| `AI_READY_THRESHOLD` | 9.5 | `loopComplete: true` (9.7 if `AiAttributedSATD` is present) |
| `HEALTHY_THRESHOLD` | 9.0 | Green category floor |
| `PROBLEMATIC_THRESHOLD` | 6.0 | Yellow/red boundary |

## Conformance

This package validates conformance with [OCHS v0.1](../../docs/ochs/OCHS-v0.1.md). An OCHS score object is conformant when:

- `ochsVersion` is present and follows `major.minor[.patch]` format.
- `score` is a finite number in [1.0, 10.0].
- `smells` is an array of objects each with a `type` string.
- The reported `score` equals `max(1.0, 10 − Σ(weight_i × sqrt(count_i)))` within the configured tolerance.

## License

MIT
