/**
 * Tests for biomarker-plugin.ts — Sprint 60
 *
 * Verifies:
 *  - Plugin registration and uniqueness enforcement
 *  - Language filtering (plugin only runs for declared languages)
 *  - Error isolation (throwing plugin doesn't break other plugins)
 *  - runPlugins() composition
 *  - Registry operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerPlugin,
  unregisterPlugin,
  getActivePlugins,
  clearPluginRegistry,
  runPlugins,
  resolvePluginSmellWeight,
  type BiomarkerPlugin,
  type PluginMetadata,
} from '../../src/plugins/biomarker-plugin';
import { examplePluginHealthy } from '../fixtures/plugins/example-plugin-healthy';
import { examplePluginUnhealthy } from '../fixtures/plugins/example-plugin-unhealthy';
import type { Language, Smell } from '../../src/types';

// ─── Test Setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearPluginRegistry();
});

// ─── Plugin Registration ───────────────────────────────────────────────────────

describe('registerPlugin()', () => {
  it('registers a plugin successfully', () => {
    registerPlugin(examplePluginHealthy);
    expect(getActivePlugins()).toHaveLength(1);
    expect(getActivePlugins()[0]!.name).toBe('example-plugin-healthy');
  });

  it('throws if a plugin with the same name is already registered', () => {
    registerPlugin(examplePluginHealthy);
    expect(() => registerPlugin(examplePluginHealthy)).toThrow(/already registered/);
  });

  it('allows registering multiple distinct plugins', () => {
    registerPlugin(examplePluginHealthy);
    registerPlugin(examplePluginUnhealthy);
    expect(getActivePlugins()).toHaveLength(2);
  });

  it('warns on reserved smell type keys in smellWeights (does not throw)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const pluginWithReservedWeight: BiomarkerPlugin = {
      name: 'test-reserved-weight',
      version: '1.0.0',
      metadata: {
        supportedLanguages: 'all',
        smellWeights: {
          ComplexMethod: 99, // reserved — should warn, not throw
        },
        description: 'Test',
        author: 'Test',
        license: 'MIT',
      },
      detect(): Smell[] { return []; },
    };

    expect(() => registerPlugin(pluginWithReservedWeight)).not.toThrow();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('ComplexMethod'));
    stderrSpy.mockRestore();
  });
});

// ─── Plugin Unregistration ─────────────────────────────────────────────────────

describe('unregisterPlugin()', () => {
  it('removes a registered plugin and returns true', () => {
    registerPlugin(examplePluginHealthy);
    expect(getActivePlugins()).toHaveLength(1);
    const removed = unregisterPlugin('example-plugin-healthy');
    expect(removed).toBe(true);
    expect(getActivePlugins()).toHaveLength(0);
  });

  it('returns false if the plugin is not registered', () => {
    const removed = unregisterPlugin('nonexistent-plugin');
    expect(removed).toBe(false);
  });

  it('allows re-registration after unregistration', () => {
    registerPlugin(examplePluginHealthy);
    unregisterPlugin('example-plugin-healthy');
    expect(() => registerPlugin(examplePluginHealthy)).not.toThrow();
    expect(getActivePlugins()).toHaveLength(1);
  });
});

// ─── getActivePlugins() ────────────────────────────────────────────────────────

describe('getActivePlugins()', () => {
  it('returns empty array when no plugins registered', () => {
    expect(getActivePlugins()).toHaveLength(0);
  });

  it('returns a copy — modifying result does not affect registry', () => {
    registerPlugin(examplePluginHealthy);
    const plugins = getActivePlugins();
    plugins.pop();
    expect(getActivePlugins()).toHaveLength(1);
  });
});

// ─── runPlugins() — Basic ─────────────────────────────────────────────────────

describe('runPlugins() — basic composition', () => {
  it('returns empty array when no plugins registered', () => {
    const smells = runPlugins('const x = 1;', 'typescript');
    expect(smells).toHaveLength(0);
  });

  it('returns empty array from healthy plugin', () => {
    registerPlugin(examplePluginHealthy);
    const smells = runPlugins('const x = 1;', 'typescript');
    expect(smells).toHaveLength(0);
  });

  it('returns smells from unhealthy plugin', () => {
    registerPlugin(examplePluginUnhealthy);
    const smells = runPlugins('const x = 1;', 'typescript');
    expect(smells).toHaveLength(1);
    expect(smells[0]!.type).toBe('ComplexMethod');
  });

  it('concatenates smells from multiple plugins', () => {
    registerPlugin(examplePluginHealthy);  // returns []
    registerPlugin(examplePluginUnhealthy); // returns [ComplexMethod]

    const smells = runPlugins('const x = 1;', 'typescript');
    expect(smells).toHaveLength(1);
  });

  it('passes filePath through to plugin', () => {
    const receivedPaths: Array<string | undefined> = [];

    const pathCapturingPlugin: BiomarkerPlugin = {
      name: 'path-capturing',
      version: '1.0.0',
      metadata: {
        supportedLanguages: 'all',
        smellWeights: {},
        description: 'Captures filePath',
        author: 'Test',
        license: 'MIT',
      },
      detect(_code, _lang, filePath): Smell[] {
        receivedPaths.push(filePath);
        return [];
      },
    };

    registerPlugin(pathCapturingPlugin);
    runPlugins('code', 'typescript', '/some/path.ts');
    expect(receivedPaths).toHaveLength(1);
    expect(receivedPaths[0]).toBe('/some/path.ts');
  });
});

// ─── runPlugins() — Language Filtering ────────────────────────────────────────

describe('runPlugins() — language filtering', () => {
  it('does NOT call plugin when language is not in supportedLanguages', () => {
    let callCount = 0;

    const pythonOnlyPlugin: BiomarkerPlugin = {
      name: 'python-only',
      version: '1.0.0',
      metadata: {
        supportedLanguages: ['python'],
        smellWeights: {},
        description: 'Python only',
        author: 'Test',
        license: 'MIT',
      },
      detect(): Smell[] {
        callCount++;
        return [];
      },
    };

    registerPlugin(pythonOnlyPlugin);
    runPlugins('const x = 1;', 'typescript'); // TypeScript — should be skipped

    expect(callCount).toBe(0);
  });

  it('DOES call plugin when language matches supportedLanguages', () => {
    let callCount = 0;

    const pythonOnlyPlugin: BiomarkerPlugin = {
      name: 'python-only-2',
      version: '1.0.0',
      metadata: {
        supportedLanguages: ['python'],
        smellWeights: {},
        description: 'Python only',
        author: 'Test',
        license: 'MIT',
      },
      detect(): Smell[] {
        callCount++;
        return [];
      },
    };

    registerPlugin(pythonOnlyPlugin);
    runPlugins('def foo(): pass', 'python');

    expect(callCount).toBe(1);
  });

  it('calls plugin with supportedLanguages: "all" for any language', () => {
    registerPlugin(examplePluginUnhealthy); // supportedLanguages: 'all'

    const tsSmells = runPlugins('code', 'typescript');
    const pySmells = runPlugins('code', 'python');
    const javaSmells = runPlugins('code', 'java');

    expect(tsSmells).toHaveLength(1);
    expect(pySmells).toHaveLength(1);
    expect(javaSmells).toHaveLength(1);
  });

  it('runs only language-matched plugins among multiple registered', () => {
    const pythonOnlyPlugin: BiomarkerPlugin = {
      name: 'python-only-3',
      version: '1.0.0',
      metadata: {
        supportedLanguages: ['python'],
        smellWeights: {},
        description: 'Python only',
        author: 'Test',
        license: 'MIT',
      },
      detect(): Smell[] {
        return [
          {
            type: 'GodClass',
            severity: 'high',
            line: 1,
            description: 'Python GodClass from plugin',
            suggestion: 'Split the class',
          },
        ];
      },
    };

    registerPlugin(examplePluginUnhealthy);  // 'all' → always fires
    registerPlugin(pythonOnlyPlugin);         // 'python' only

    const tsSmells = runPlugins('const x = 1;', 'typescript');
    // Only examplePluginUnhealthy runs for TypeScript
    expect(tsSmells).toHaveLength(1);
    expect(tsSmells[0]!.type).toBe('ComplexMethod');

    const pySmells = runPlugins('class Big: pass', 'python');
    // Both plugins run for Python
    expect(pySmells).toHaveLength(2);
    const types = pySmells.map(s => s.type).sort();
    expect(types).toContain('ComplexMethod');
    expect(types).toContain('GodClass');
  });
});

// ─── runPlugins() — Error Isolation ───────────────────────────────────────────

describe('runPlugins() — error isolation', () => {
  it('does not propagate a plugin exception', () => {
    const throwingPlugin: BiomarkerPlugin = {
      name: 'throwing-plugin',
      version: '1.0.0',
      metadata: {
        supportedLanguages: 'all',
        smellWeights: {},
        description: 'Throws on every call',
        author: 'Test',
        license: 'MIT',
      },
      detect(): Smell[] {
        throw new Error('Intentional test error from plugin');
      },
    };

    registerPlugin(throwingPlugin);
    expect(() => runPlugins('const x = 1;', 'typescript')).not.toThrow();
  });

  it('returns smells from healthy plugins even when one plugin throws', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const throwingPlugin: BiomarkerPlugin = {
      name: 'throwing-plugin-2',
      version: '1.0.0',
      metadata: {
        supportedLanguages: 'all',
        smellWeights: {},
        description: 'Throws on every call',
        author: 'Test',
        license: 'MIT',
      },
      detect(): Smell[] {
        throw new Error('Intentional test error');
      },
    };

    registerPlugin(throwingPlugin);
    registerPlugin(examplePluginUnhealthy); // should still run

    const smells = runPlugins('const x = 1;', 'typescript');
    // examplePluginUnhealthy should still have contributed its smell
    expect(smells).toHaveLength(1);
    expect(smells[0]!.type).toBe('ComplexMethod');

    // Error should have been logged
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('throwing-plugin-2'));
    stderrSpy.mockRestore();
  });
});

// ─── resolvePluginSmellWeight() ────────────────────────────────────────────────

describe('resolvePluginSmellWeight()', () => {
  it('returns core weight for reserved SmellType names', () => {
    // ComplexMethod has weight 1.5 in SMELL_WEIGHTS
    const weight = resolvePluginSmellWeight('ComplexMethod');
    expect(weight).toBe(1.5);
  });

  it('returns plugin-declared weight for custom (non-core) smell type strings', () => {
    const customPlugin: BiomarkerPlugin = {
      name: 'custom-weight-plugin',
      version: '1.0.0',
      metadata: {
        supportedLanguages: 'all',
        smellWeights: {
          'CustomSmellXYZ': 0.75,
        },
        description: 'Declares a custom smell weight',
        author: 'Test',
        license: 'MIT',
      },
      detect(): Smell[] { return []; },
    };

    registerPlugin(customPlugin);
    const weight = resolvePluginSmellWeight('CustomSmellXYZ');
    expect(weight).toBe(0.75);
  });

  it('returns 0 and warns for unknown smell types with no registered weight', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const weight = resolvePluginSmellWeight('CompletelyUnknownSmell');
    expect(weight).toBe(0);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('CompletelyUnknownSmell'));
    stderrSpy.mockRestore();
  });

  it('core weight takes precedence over plugin weight for reserved names', () => {
    // Even though plugin declares weight 99 for ComplexMethod, core weight (1.5) wins
    // (plugin was warned at registration but registration still succeeded)
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const overridePlugin: BiomarkerPlugin = {
      name: 'override-attempt',
      version: '1.0.0',
      metadata: {
        supportedLanguages: 'all',
        smellWeights: { ComplexMethod: 99 },
        description: 'Tries to override core weight',
        author: 'Test',
        license: 'MIT',
      },
      detect(): Smell[] { return []; },
    };

    registerPlugin(overridePlugin);
    const weight = resolvePluginSmellWeight('ComplexMethod');
    expect(weight).toBe(1.5); // core weight, not 99

    stderrSpy.mockRestore();
  });
});

// ─── Sample Plugin Integration ─────────────────────────────────────────────────

describe('Sample plugin: end-to-end registration and detection', () => {
  it('examplePluginHealthy registers, runs, and returns no smells', () => {
    registerPlugin(examplePluginHealthy);
    const smells = runPlugins('const x: number = 1;', 'typescript', '/src/clean.ts');
    expect(smells).toHaveLength(0);
  });

  it('examplePluginUnhealthy registers, runs, and returns a ComplexMethod smell', () => {
    registerPlugin(examplePluginUnhealthy);
    const smells = runPlugins('function messy() {}', 'typescript', '/src/messy.ts');
    expect(smells).toHaveLength(1);

    const smell = smells[0]!;
    expect(smell.type).toBe('ComplexMethod');
    expect(smell.severity).toBe('high');
    expect(smell.line).toBe(1);
    expect(smell.description).toContain('ComplexMethod');
  });

  it('plugin with language-specific detection works end-to-end', () => {
    const multiLangPlugin: BiomarkerPlugin = {
      name: 'multi-lang-test',
      version: '1.0.0',
      metadata: {
        supportedLanguages: ['typescript', 'javascript'],
        smellWeights: {},
        description: 'Only detects in TS/JS',
        author: 'Test',
        license: 'MIT',
      },
      detect(_code, lang): Smell[] {
        return [
          {
            type: 'MagicNumber',
            severity: 'low',
            line: 1,
            description: `MagicNumber — detected in ${lang}`,
            suggestion: 'Extract to named constant',
          },
        ];
      },
    };

    registerPlugin(multiLangPlugin);

    const tsSmells = runPlugins('const x = 42;', 'typescript');
    expect(tsSmells).toHaveLength(1);
    expect(tsSmells[0]!.type).toBe('MagicNumber');

    const pySmells = runPlugins('x = 42', 'python'); // NOT in supportedLanguages
    expect(pySmells).toHaveLength(0);
  });
});
