/**
 * BiomarkerPlugin JSON Schema v0.1 — Sprint 60 (plugin-freeze)
 *
 * Defines the authoritative JSON Schema (Draft-07) for plugin manifests.
 * Used by the conformance validator to reject malformed plugin declarations
 * before they are admitted into the registry.
 *
 * This schema is intentionally conservative — it validates shape and
 * invariants that cannot be expressed purely in TypeScript's type system
 * (e.g. non-empty string constraints, weight range bounds, semver pattern).
 *
 * Schema version: 0.1.0
 * Schema ID:      https://healthy-ai-code.dev/schemas/biomarker-plugin/v0.1.json
 */

// ─── Schema Object (JSON Schema Draft-07) ─────────────────────────────────────

/**
 * JSON Schema representation for a BiomarkerPlugin manifest.
 * Consumers can `JSON.stringify(PLUGIN_MANIFEST_SCHEMA)` to emit the schema
 * file, or pass it directly to any Draft-07-compatible validator.
 */
export const PLUGIN_MANIFEST_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://healthy-ai-code.dev/schemas/biomarker-plugin/v0.1.json',
  title: 'BiomarkerPlugin',
  description:
    'Manifest schema for a BiomarkerPlugin v0.1 — used by the conformance validator ' +
    'to ensure plugin metadata is well-formed before admission to the registry.',
  type: 'object',
  required: ['name', 'version', 'metadata'],
  additionalProperties: true, // allows the `detect` function field (not representable in JSON Schema)
  properties: {
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
      pattern: '^[a-z0-9][a-z0-9-_.]*$',
      description:
        'Unique plugin identifier. Must be lowercase alphanumeric, hyphens, underscores, or dots. ' +
        'Must not start with a hyphen, underscore, or dot.',
    },
    version: {
      type: 'string',
      pattern: '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?$',
      description: 'Semver 2.0.0 version string (e.g. "1.0.0", "0.2.1-beta.1").',
    },
    metadata: {
      type: 'object',
      required: ['supportedLanguages', 'smellWeights', 'description', 'author', 'license'],
      additionalProperties: false,
      properties: {
        supportedLanguages: {
          description:
            'Languages this plugin applies to. Use the string "all" to run on every language, ' +
            'or an array of Language identifiers (non-empty).',
          oneOf: [
            {
              type: 'string',
              const: 'all',
            },
            {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
              uniqueItems: true,
            },
          ],
        },
        smellWeights: {
          type: 'object',
          description:
            'Map from smell-type name to numeric weight. Keys that match core SmellType names ' +
            'are ignored at scoring time (core weight takes precedence). For custom smell types, ' +
            'the weight must be in (0, 10].',
          additionalProperties: {
            type: 'number',
            exclusiveMinimum: 0,
            maximum: 10,
          },
        },
        description: {
          type: 'string',
          minLength: 10,
          maxLength: 512,
          description: 'Human-readable description of what this plugin detects (min 10 chars).',
        },
        author: {
          type: 'string',
          minLength: 1,
          maxLength: 128,
          description: 'Plugin author name or organization.',
        },
        license: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
          description: 'SPDX license identifier (e.g. "MIT", "Apache-2.0", "GPL-3.0-only").',
        },
      },
    },
  },
} as const;

// ─── Fixture Shape (for conformance test suites) ───────────────────────────────

/**
 * Minimal valid plugin manifest object (serialisable — no `detect` function).
 * Used as the canonical baseline in conformance tests and documentation examples.
 */
export interface PluginManifest {
  name: string;
  version: string;
  metadata: {
    supportedLanguages: string[] | 'all';
    smellWeights: Record<string, number>;
    description: string;
    author: string;
    license: string;
  };
}

/**
 * Returns a deep-clone of the canonical minimal-valid plugin manifest.
 * Tests can mutate the clone to produce "just-broken" variants without
 * affecting other tests.
 */
export function minimalValidManifest(): PluginManifest {
  return {
    name: 'example-plugin',
    version: '1.0.0',
    metadata: {
      supportedLanguages: 'all',
      smellWeights: {},
      description: 'Minimal valid plugin for conformance testing.',
      author: 'Test Author',
      license: 'MIT',
    },
  };
}
