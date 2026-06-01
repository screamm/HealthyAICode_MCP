/**
 * Tests for plugin-conformance.ts — Sprint 60 (plugin-freeze)
 *
 * Verifies:
 *  - Schema validation rejects malformed plugin manifests
 *  - Schema validation accepts well-formed manifests
 *  - detect() behavioural invariants (must be function, must not throw on no-op)
 *  - Reserved name rejection
 *  - TP/TN fixture validation (correct pass/fail signals)
 *  - assertPluginConformance() throws on failure
 *  - Warnings (non-blocking) for advisory cases
 */

import { describe, it, expect } from 'vitest';
import {
  validatePlugin,
  assertPluginConformance,
  type PluginFixture,
} from '../../src/plugins/plugin-conformance';
import { minimalValidManifest } from '../../src/plugins/plugin-schema';
import type { BiomarkerPlugin } from '../../src/plugins/biomarker-plugin';
import type { Smell } from '../../src/types';
import {
  todoDensityPlugin,
  TP_CODE_HIGH_TODO_DENSITY,
  TN_CODE_NO_TODOS,
} from '../fixtures/plugins/sample-external-plugin';
import { examplePluginHealthy } from '../fixtures/plugins/example-plugin-healthy';
import { examplePluginUnhealthy } from '../fixtures/plugins/example-plugin-unhealthy';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal valid BiomarkerPlugin object for inline tests. */
function buildPlugin(overrides?: Partial<BiomarkerPlugin>): BiomarkerPlugin {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    metadata: {
      supportedLanguages: 'all',
      smellWeights: {},
      description: 'Minimal plugin for conformance tests.',
      author: 'Test Author',
      license: 'MIT',
    },
    detect(): Smell[] { return []; },
    ...overrides,
  };
}

// ─── Null / Non-Object ────────────────────────────────────────────────────────

describe('validatePlugin() — null / non-object inputs', () => {
  it('rejects null', () => {
    const r = validatePlugin(null);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/non-null object/);
  });

  it('rejects a string', () => {
    const r = validatePlugin('not-a-plugin');
    expect(r.valid).toBe(false);
  });

  it('rejects a number', () => {
    const r = validatePlugin(42);
    expect(r.valid).toBe(false);
  });

  it('rejects undefined', () => {
    const r = validatePlugin(undefined);
    expect(r.valid).toBe(false);
  });
});

// ─── Missing Required Fields ──────────────────────────────────────────────────

describe('validatePlugin() — missing required fields', () => {
  it('rejects plugin without name', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    delete (p as Record<string, unknown>)['name'];
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/name/);
  });

  it('rejects plugin without version', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    delete (p as Record<string, unknown>)['version'];
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/version/);
  });

  it('rejects plugin without metadata', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    delete (p as Record<string, unknown>)['metadata'];
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/metadata/);
  });

  it('rejects plugin without detect()', () => {
    const obj = { ...buildPlugin() };
    // @ts-expect-error intentional
    delete (obj as Record<string, unknown>)['detect'];
    const r = validatePlugin(obj);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/detect/);
  });

  it('rejects metadata missing description', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    delete p.metadata.description;
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/description/);
  });

  it('rejects metadata missing author', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    delete p.metadata.author;
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/author/);
  });

  it('rejects metadata missing license', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    delete p.metadata.license;
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/license/);
  });
});

// ─── Field Type / Format Errors ────────────────────────────────────────────────

describe('validatePlugin() — field type / format violations', () => {
  it('rejects name that does not match slug pattern (uppercase)', () => {
    const r = validatePlugin(buildPlugin({ name: 'MyPlugin' }));
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/name/);
  });

  it('rejects name that starts with a hyphen', () => {
    const r = validatePlugin(buildPlugin({ name: '-bad-name' }));
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/name/);
  });

  it('rejects empty name', () => {
    const r = validatePlugin(buildPlugin({ name: '' }));
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/name/);
  });

  it('rejects invalid semver version', () => {
    const r = validatePlugin(buildPlugin({ version: 'not-a-version' }));
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/version/);
  });

  it('rejects version like "1.0" (missing patch)', () => {
    const r = validatePlugin(buildPlugin({ version: '1.0' }));
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/version/);
  });

  it('rejects description shorter than 10 characters', () => {
    const p = buildPlugin();
    p.metadata.description = 'Too short';  // 9 chars
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/description/);
  });

  it('rejects empty author', () => {
    const p = buildPlugin();
    p.metadata.author = '';
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/author/);
  });

  it('rejects empty license', () => {
    const p = buildPlugin();
    p.metadata.license = '';
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/license/);
  });

  it('rejects supportedLanguages as an empty array', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    p.metadata.supportedLanguages = [];
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/supportedLanguages/);
  });

  it('rejects supportedLanguages as an invalid string (not "all")', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    p.metadata.supportedLanguages = 'some-language';
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/supportedLanguages/);
  });

  it('rejects smellWeights with a weight <= 0', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    p.metadata.smellWeights = { CustomSmell: 0 };
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/CustomSmell/);
  });

  it('rejects smellWeights with a weight > 10', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    p.metadata.smellWeights = { CustomSmell: 11 };
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/CustomSmell/);
  });

  it('rejects smellWeights key that starts with a digit', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    p.metadata.smellWeights = { '1BadKey': 1.0 };
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/1BadKey/);
  });

  it('rejects metadata with additional unexpected properties', () => {
    const p = buildPlugin();
    // @ts-expect-error intentional
    (p.metadata as Record<string, unknown>)['unexpectedField'] = 'oops';
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unexpectedField/);
  });

  it('rejects detect that is not a function', () => {
    const p = { ...buildPlugin(), detect: 'not-a-function' };
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/detect/);
  });

  it('rejects detect that throws on no-op invocation', () => {
    const p = buildPlugin({
      detect(): Smell[] {
        throw new Error('I always throw');
      },
    });
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/detect/);
  });

  it('rejects detect that returns a non-array', () => {
    const p = buildPlugin({
      // @ts-expect-error intentional
      detect(): unknown { return 'not-an-array'; },
    });
    const r = validatePlugin(p);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/detect/);
  });
});

// ─── Reserved Names ───────────────────────────────────────────────────────────

describe('validatePlugin() — reserved names', () => {
  it('rejects plugin named "core"', () => {
    const r = validatePlugin(buildPlugin({ name: 'core' }));
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/reserved/);
  });

  it('rejects plugin named "system"', () => {
    const r = validatePlugin(buildPlugin({ name: 'system' }));
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/reserved/);
  });

  it('rejects plugin named "__proto__"', () => {
    // __proto__ also fails the name pattern check, so errors contain both issues
    const r = validatePlugin(buildPlugin({ name: '__proto__' }));
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Valid Plugins ────────────────────────────────────────────────────────────

describe('validatePlugin() — accepts valid plugins', () => {
  it('accepts minimal valid plugin', () => {
    const r = validatePlugin(buildPlugin());
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('accepts valid semver pre-release version', () => {
    const r = validatePlugin(buildPlugin({ version: '0.1.0-beta.1' }));
    expect(r.valid).toBe(true);
  });

  it('accepts valid semver build metadata version', () => {
    const r = validatePlugin(buildPlugin({ version: '1.2.3+build.42' }));
    expect(r.valid).toBe(true);
  });

  it('accepts plugin with supportedLanguages array', () => {
    const p = buildPlugin();
    p.metadata.supportedLanguages = ['typescript', 'javascript'];
    const r = validatePlugin(p);
    expect(r.valid).toBe(true);
  });

  it('accepts plugin with valid custom smellWeights', () => {
    const p = buildPlugin();
    // @ts-expect-error custom type name
    p.metadata.smellWeights = { CustomSmellAlpha: 1.5, CustomSmellBeta: 0.3 };
    const r = validatePlugin(p);
    expect(r.valid).toBe(true);
  });

  it('accepts plugin with core smell type in smellWeights (warns but does not fail)', () => {
    // Core weight override is warned but not rejected by conformance validator
    // (the registry warns at registration time)
    const p = buildPlugin();
    // @ts-expect-error
    p.metadata.smellWeights = { ComplexMethod: 2.0 };
    const r = validatePlugin(p);
    // Conformance validator does NOT reject core-weight overrides — it is a registry concern
    // The schema only checks weight is in (0, 10]
    expect(r.valid).toBe(true);
  });

  it('accepts examplePluginHealthy (fixture)', () => {
    const r = validatePlugin(examplePluginHealthy);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('accepts examplePluginUnhealthy (fixture)', () => {
    const r = validatePlugin(examplePluginUnhealthy);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('accepts todoDensityPlugin (sample external plugin)', () => {
    const r = validatePlugin(todoDensityPlugin);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

// ─── Warnings (non-blocking) ──────────────────────────────────────────────────

describe('validatePlugin() — advisory warnings', () => {
  it('warns when smellWeights is empty (custom smells will score 0)', () => {
    const r = validatePlugin(buildPlugin());
    // examplePluginHealthy has empty smellWeights
    expect(r.warnings.some(w => w.includes('smellWeights is empty'))).toBe(true);
  });

  it('warns when supportedLanguages is "all"', () => {
    const r = validatePlugin(buildPlugin());
    expect(r.warnings.some(w => w.includes('"all"'))).toBe(true);
  });

  it('does NOT warn about supportedLanguages when an array is provided', () => {
    const p = buildPlugin();
    p.metadata.supportedLanguages = ['typescript'];
    const r = validatePlugin(p);
    expect(r.warnings.some(w => w.includes('"all"'))).toBe(false);
  });
});

// ─── TP/TN Fixture Validation ─────────────────────────────────────────────────

describe('validatePlugin() — TP/TN fixture validation', () => {
  it('passes when TP fixture produces the expected smell type', () => {
    const fixtures: PluginFixture[] = [
      {
        label: 'high-todo-density',
        kind: 'tp',
        code: TP_CODE_HIGH_TODO_DENSITY,
        language: 'typescript',
        expectedType: 'TodoDensity',
      },
    ];
    const r = validatePlugin(todoDensityPlugin, { fixtures });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('passes when TN fixture produces no smell of the expected type', () => {
    const fixtures: PluginFixture[] = [
      {
        label: 'clean-code-no-todos',
        kind: 'tn',
        code: TN_CODE_NO_TODOS,
        language: 'typescript',
        expectedType: 'TodoDensity',
      },
    ];
    const r = validatePlugin(todoDensityPlugin, { fixtures });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('fails when TP fixture produces NO matching smell (false negative in plugin)', () => {
    // A "healthy" plugin always returns [] — so it fails the TP fixture
    const fixtures: PluginFixture[] = [
      {
        label: 'expects-a-smell',
        kind: 'tp',
        code: TP_CODE_HIGH_TODO_DENSITY,
        language: 'typescript',
        expectedType: 'TodoDensity',
      },
    ];
    const r = validatePlugin(examplePluginHealthy, { fixtures });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('expects-a-smell') && e.includes('TP'))).toBe(true);
  });

  it('fails when TN fixture produces an unwanted smell (false positive in plugin)', () => {
    // examplePluginUnhealthy always returns ComplexMethod — so it fails the TN fixture
    const fixtures: PluginFixture[] = [
      {
        label: 'clean-code-should-be-quiet',
        kind: 'tn',
        code: 'const x = 1;',
        language: 'typescript',
        expectedType: 'ComplexMethod',
      },
    ];
    const r = validatePlugin(examplePluginUnhealthy, { fixtures });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('clean-code-should-be-quiet') && e.includes('TN'))).toBe(true);
  });

  it('passes both TP and TN fixtures for todoDensityPlugin', () => {
    const fixtures: PluginFixture[] = [
      {
        label: 'tp-high-density',
        kind: 'tp',
        code: TP_CODE_HIGH_TODO_DENSITY,
        language: 'typescript',
        expectedType: 'TodoDensity',
      },
      {
        label: 'tn-no-todos',
        kind: 'tn',
        code: TN_CODE_NO_TODOS,
        language: 'typescript',
        expectedType: 'TodoDensity',
      },
    ];
    const r = validatePlugin(todoDensityPlugin, { fixtures });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('reports fixture errors alongside schema errors when both fail', () => {
    // Invalid plugin + bad fixtures — errors from both should accumulate
    const badPlugin = {
      name: 'BadPlugin',  // uppercase — schema violation
      version: '1.0.0',
      metadata: {
        supportedLanguages: 'all',
        smellWeights: {},
        description: 'Bad plugin for test.',
        author: 'Test',
        license: 'MIT',
      },
      detect(): Smell[] { return []; },
    };
    const fixtures: PluginFixture[] = [
      {
        label: 'should-detect-something',
        kind: 'tp',
        code: TP_CODE_HIGH_TODO_DENSITY,
        language: 'typescript',
        expectedType: 'TodoDensity',
      },
    ];
    const r = validatePlugin(badPlugin, { fixtures });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(2); // schema error + fixture error
  });

  it('handles a fixture where detect() throws — counts as error', () => {
    const throwingPlugin = buildPlugin({
      name: 'conditional-thrower',
      detect(code: string): Smell[] {
        if (code.includes('TODO')) {
          throw new Error('Oops, crashed on TODO code');
        }
        return [];
      },
    });

    const fixtures: PluginFixture[] = [
      {
        label: 'todo-code-crashes-plugin',
        kind: 'tp',
        code: TP_CODE_HIGH_TODO_DENSITY,
        language: 'typescript',
        expectedType: 'TodoDensity',
      },
    ];
    const r = validatePlugin(throwingPlugin, { fixtures });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('todo-code-crashes-plugin'))).toBe(true);
  });
});

// ─── assertPluginConformance() ────────────────────────────────────────────────

describe('assertPluginConformance()', () => {
  it('does NOT throw for a valid plugin', () => {
    expect(() => assertPluginConformance(buildPlugin())).not.toThrow();
  });

  it('throws with all errors for a malformed plugin', () => {
    expect(() => assertPluginConformance(null)).toThrow(/conformance failure/);
  });

  it('throws with fixture failure message', () => {
    const fixtures: PluginFixture[] = [
      {
        label: 'must-detect-something',
        kind: 'tp',
        code: TN_CODE_NO_TODOS, // clean code — healthy plugin returns []
        language: 'typescript',
        expectedType: 'ComplexMethod',
      },
    ];
    expect(() =>
      assertPluginConformance(examplePluginHealthy, { fixtures })
    ).toThrow(/must-detect-something/);
  });
});

// ─── minimalValidManifest() helper ───────────────────────────────────────────

describe('minimalValidManifest()', () => {
  it('returns an object that passes validation when a detect() is added', () => {
    const manifest = minimalValidManifest();
    const plugin: BiomarkerPlugin = {
      ...manifest,
      detect(): Smell[] { return []; },
    };
    const r = validatePlugin(plugin);
    expect(r.valid).toBe(true);
  });

  it('returns a deep-clone (mutations do not affect subsequent calls)', () => {
    const m1 = minimalValidManifest();
    m1.metadata.author = 'Modified Author';
    const m2 = minimalValidManifest();
    expect(m2.metadata.author).toBe('Test Author'); // original value
  });
});
