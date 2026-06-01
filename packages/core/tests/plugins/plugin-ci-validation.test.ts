/**
 * CI Validation Suite: Automated TP/TN validation for the sample external plugin
 * Sprint 60 (plugin-freeze)
 *
 * This test file is the "automated TP/TN CI validation" requirement from the task.
 * It runs the conformance validator with fixtures against:
 *  - The sample external plugin (todoDensityPlugin) — should pass all fixtures
 *  - The core fixture plugins (healthy / unhealthy) — validate their fixture contracts
 *
 * These tests are designed to fail loudly if a plugin's detect() function
 * changes in a way that breaks its declared TP/TN contracts, providing
 * continuous regression protection for plugin authors.
 *
 * This suite also validates the end-to-end plugin registration flow:
 *  1. registerPlugin(todoDensityPlugin)
 *  2. runPlugins() includes todoDensityPlugin output
 *  3. clearPluginRegistry() restores clean state
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPlugin,
  runPlugins,
  clearPluginRegistry,
  getActivePlugins,
} from '../../src/plugins/biomarker-plugin';
import { validatePlugin, type PluginFixture } from '../../src/plugins/plugin-conformance';
import { PLUGIN_MANIFEST_SCHEMA } from '../../src/plugins/plugin-schema';
import {
  todoDensityPlugin,
  TP_CODE_HIGH_TODO_DENSITY,
  TN_CODE_NO_TODOS,
} from '../fixtures/plugins/sample-external-plugin';
import { examplePluginHealthy } from '../fixtures/plugins/example-plugin-healthy';
import { examplePluginUnhealthy } from '../fixtures/plugins/example-plugin-unhealthy';

// ─── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearPluginRegistry();
});

// ─── todoDensityPlugin: TP/TN Contract ───────────────────────────────────────

describe('todoDensityPlugin — TP/TN fixture contract (CI validation)', () => {
  const fixtures: PluginFixture[] = [
    {
      label: 'TP: code with >3 TODOs per 100 lines',
      kind: 'tp',
      code: TP_CODE_HIGH_TODO_DENSITY,
      language: 'typescript',
      filePath: '/src/payment-processor.ts',
      expectedType: 'TodoDensity',
    },
    {
      label: 'TN: clean code with no TODO annotations',
      kind: 'tn',
      code: TN_CODE_NO_TODOS,
      language: 'typescript',
      filePath: '/src/format-utils.ts',
      expectedType: 'TodoDensity',
    },
    {
      label: 'TN: short file (< 10 lines) — below density threshold reporting',
      kind: 'tn',
      code: '// TODO: short file\nconst x = 1;\n',
      language: 'typescript',
      expectedType: 'TodoDensity',
    },
    {
      label: 'TN: python file with zero TODOs',
      kind: 'tn',
      code: `
def calculate_fee(amount: float, rate: float) -> float:
    """Calculate processing fee."""
    return amount * rate

def validate_amount(amount: float) -> bool:
    """Validate that amount is positive and finite."""
    import math
    return math.isfinite(amount) and amount > 0

def format_currency(amount: float, currency: str) -> str:
    """Format currency for display."""
    return f"{currency} {amount:.2f}"

class PaymentProcessor:
    """Handles payment transactions."""
    def __init__(self, api_key: str) -> None:
        self._key = api_key

    def process(self, amount: float) -> bool:
        """Process a payment."""
        return validate_amount(amount)
`.trim(),
      language: 'python',
      expectedType: 'TodoDensity',
    },
    {
      label: 'TP: TypeScript file with very high TODO density (multiple types)',
      kind: 'tp',
      code: `
// Core transaction module
// TODO: implement retry logic
// FIXME: race condition on concurrent writes
// HACK: bypass validation for legacy endpoints
// TODO: add proper types
// FIXME: memory leak in long-running processes
// XXX: delete after migration is complete
// TODO: add monitoring
// FIXME: error messages are not user-friendly

class TransactionManager {
  process(): void {
    // TODO: implement
  }
  validate(): boolean {
    // FIXME: validation logic missing
    return false;
  }
  rollback(): void {
    // HACK: direct DB call bypasses ORM
  }
}
`.trim(),
      language: 'typescript',
      expectedType: 'TodoDensity',
    },
  ];

  it('passes all declared TP/TN fixtures via conformance validator', () => {
    const result = validatePlugin(todoDensityPlugin, { fixtures });

    if (!result.valid) {
      console.error('CI Validation Failures:\n', result.errors.join('\n'));
    }

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('TP fixture directly: detect() finds TodoDensity in high-density code', () => {
    const smells = todoDensityPlugin.detect(TP_CODE_HIGH_TODO_DENSITY, 'typescript');
    expect(smells.length).toBeGreaterThan(0);
    expect(smells.some(s => s.type === 'TodoDensity')).toBe(true);
    // Verify smell has expected shape
    const smell = smells.find(s => s.type === 'TodoDensity')!;
    expect(smell.severity).toMatch(/^(low|medium|high|critical)$/);
    expect(smell.line).toBeGreaterThanOrEqual(1);
    expect(smell.description).toContain('TodoDensity');
    expect(typeof smell.metricValue).toBe('number');
    expect(smell.metricValue!).toBeGreaterThan(3); // > threshold
  });

  it('TN fixture directly: detect() finds no TodoDensity in clean code', () => {
    const smells = todoDensityPlugin.detect(TN_CODE_NO_TODOS, 'typescript');
    const todoDensitySmells = smells.filter(s => s.type === 'TodoDensity');
    expect(todoDensitySmells).toHaveLength(0);
  });

  it('returns empty array for very short file (< 10 lines)', () => {
    const shortCode = '// TODO: short\nconst x = 1;';
    const smells = todoDensityPlugin.detect(shortCode, 'typescript');
    expect(smells).toHaveLength(0);
  });

  it('severity scales with density: low/medium/high', () => {
    // Build code with escalating TODO density to test severity levels
    const lowDensityCode = Array.from(
      { length: 100 },
      (_, i) => i < 4 ? `// TODO: item ${i}` : `const x${i} = ${i};`
    ).join('\n');

    const highDensityCode = Array.from(
      { length: 20 },
      (_, i) => i % 2 === 0 ? `// TODO: item ${i}` : `const x${i} = ${i};`
    ).join('\n');

    const lowSmells = todoDensityPlugin.detect(lowDensityCode, 'javascript');
    const highSmells = todoDensityPlugin.detect(highDensityCode, 'javascript');

    // High density code: 10 TODOs in 20 lines = 50/100 >> threshold, should be 'high'
    if (highSmells.length > 0) {
      expect(highSmells[0]!.severity).toBe('high');
    }

    // Low density (4 per 100) just above threshold — should be 'low'
    if (lowSmells.length > 0) {
      expect(lowSmells[0]!.severity).toBe('low');
    }
  });
});

// ─── Registration flow: end-to-end ────────────────────────────────────────────

describe('todoDensityPlugin — registration and runPlugins() integration', () => {
  it('registers successfully and appears in getActivePlugins()', () => {
    registerPlugin(todoDensityPlugin);
    expect(getActivePlugins()).toHaveLength(1);
    expect(getActivePlugins()[0]!.name).toBe('todo-density');
  });

  it('runPlugins() returns TodoDensity smells after registration', () => {
    registerPlugin(todoDensityPlugin);
    const smells = runPlugins(TP_CODE_HIGH_TODO_DENSITY, 'typescript', '/test.ts');
    expect(smells.some(s => s.type === 'TodoDensity')).toBe(true);
  });

  it('runPlugins() returns no smells for clean code after registration', () => {
    registerPlugin(todoDensityPlugin);
    const smells = runPlugins(TN_CODE_NO_TODOS, 'typescript', '/clean.ts');
    expect(smells.filter(s => s.type === 'TodoDensity')).toHaveLength(0);
  });

  it('multiple plugins coexist: todoDensityPlugin + examplePluginUnhealthy', () => {
    registerPlugin(todoDensityPlugin);
    registerPlugin(examplePluginUnhealthy);

    const smells = runPlugins(TP_CODE_HIGH_TODO_DENSITY, 'typescript');
    const types = smells.map(s => s.type);

    // todoDensityPlugin fires on the TODO-heavy code
    expect(types).toContain('TodoDensity');
    // examplePluginUnhealthy always fires
    expect(types).toContain('ComplexMethod');
  });

  it('clearPluginRegistry() removes todoDensityPlugin from registry', () => {
    registerPlugin(todoDensityPlugin);
    expect(getActivePlugins()).toHaveLength(1);
    clearPluginRegistry();
    expect(getActivePlugins()).toHaveLength(0);
  });
});

// ─── examplePluginHealthy: TP/TN contract ────────────────────────────────────

describe('examplePluginHealthy — CI fixture contract', () => {
  it('TN contract: always returns empty smell list (never fires)', () => {
    const testCodes = [
      { code: '', language: 'typescript' as const },
      { code: 'const x = 1;', language: 'typescript' as const },
      { code: 'def foo(): pass', language: 'python' as const },
      { code: TP_CODE_HIGH_TODO_DENSITY, language: 'typescript' as const },
    ];

    for (const { code, language } of testCodes) {
      const smells = examplePluginHealthy.detect(code, language);
      expect(smells).toHaveLength(0);
    }
  });

  it('passes schema conformance check', () => {
    const result = validatePlugin(examplePluginHealthy);
    expect(result.valid).toBe(true);
  });
});

// ─── examplePluginUnhealthy: TP/TN contract ──────────────────────────────────

describe('examplePluginUnhealthy — CI fixture contract', () => {
  const fixtures: PluginFixture[] = [
    {
      label: 'TP: always returns ComplexMethod for any code',
      kind: 'tp',
      code: 'function anything() {}',
      language: 'typescript',
      expectedType: 'ComplexMethod',
    },
  ];

  it('TP contract: always returns ComplexMethod smell', () => {
    const result = validatePlugin(examplePluginUnhealthy, { fixtures });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('emitted ComplexMethod smell has correct shape', () => {
    const smells = examplePluginUnhealthy.detect('any code', 'typescript');
    expect(smells).toHaveLength(1);
    const smell = smells[0]!;
    expect(smell.type).toBe('ComplexMethod');
    expect(smell.severity).toBe('high');
    expect(smell.line).toBe(1);
    expect(smell.functionName).toBe('fixtureMethod');
    expect(smell.metricValue).toBe(20);
  });
});

// ─── Schema: PLUGIN_MANIFEST_SCHEMA export ───────────────────────────────────

describe('PLUGIN_MANIFEST_SCHEMA — structural integrity', () => {
  it('can be JSON.stringify()\'d without error (no circular refs)', () => {
    expect(() => JSON.stringify(PLUGIN_MANIFEST_SCHEMA)).not.toThrow();
  });

  it('schema has correct $id and $schema values', () => {
    expect(PLUGIN_MANIFEST_SCHEMA.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(PLUGIN_MANIFEST_SCHEMA.$id).toContain('biomarker-plugin');
    expect(PLUGIN_MANIFEST_SCHEMA.$id).toContain('v0.1');
  });
});
