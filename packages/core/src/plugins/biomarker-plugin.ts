/**
 * BiomarkerPlugin API — Sprint 60
 *
 * Stable public interface for external biomarker plugins. Plugin authors can
 * register custom detectors that integrate into the analyzeByLanguage() flow
 * without modifying core source.
 *
 * Design decisions:
 *  - Plugins use existing SmellType literals OR declare custom names with weights
 *    in PluginMetadata.smellWeights.
 *  - Registration validates uniqueness and rejects reserved SmellType names for
 *    custom weights (to prevent overriding core calibration).
 *  - runPlugins() isolates plugin crashes: a throwing plugin never stops others.
 *  - Language filtering: plugins only run for their declared supportedLanguages.
 *
 * Usage:
 *   import { registerPlugin, runPlugins } from './biomarker-plugin';
 *   registerPlugin(myPlugin);
 *   const smells = runPlugins(code, 'typescript', '/path/to/file.ts');
 */

import type { Language, SmellType, Smell } from '../types';
import { SMELL_WEIGHTS } from '../scoring/weights';

// ─── Public Types ──────────────────────────────────────────────────────────────

/**
 * Metadata declared by a plugin. Controls language targeting, custom weights,
 * and provenance information for the plugin registry.
 */
export interface PluginMetadata {
  /**
   * Languages this plugin applies to. Use 'all' to run on every language.
   * Plugins with unmatched supportedLanguages are silently skipped.
   */
  supportedLanguages: Language[] | 'all';
  /**
   * Custom smell-type weights for scoring. Keys are smell type strings.
   * If the key matches an existing SmellType in SMELL_WEIGHTS, the plugin
   * weight is IGNORED and the core weight is used (no overrides of core calibration).
   * For truly new smell types not in SmellType, the plugin must declare the weight here.
   * Note: custom smell type strings must NOT conflict with existing SmellType literals.
   */
  smellWeights: Partial<Record<string, number>>;
  /** Human-readable description of what this plugin detects. */
  description: string;
  /** Plugin author name or organization. */
  author: string;
  /** SPDX license identifier (e.g. 'MIT', 'Apache-2.0'). */
  license: string;
}

/**
 * Public interface that all biomarker plugins must implement.
 * Plugins are pure functions from code → Smell[]; no side effects permitted.
 */
export interface BiomarkerPlugin {
  /** Unique plugin name. Used as registry key — must not clash with other plugins. */
  readonly name: string;
  /** Semver version string for the plugin. */
  readonly version: string;
  /** Plugin metadata: languages, weights, provenance. */
  readonly metadata: PluginMetadata;
  /**
   * Core detection function. Returns Smell[] for the given code.
   * MUST be pure and synchronous. Must NOT access filesystem or network.
   * Must NOT throw — caught errors are logged to stderr and ignored.
   *
   * @param code      Full source code of the file being analyzed.
   * @param language  Detected language of the file.
   * @param filePath  Optional absolute file path (for reference only; do NOT read file).
   * @returns         Array of detected smells. Empty array if no issues found.
   */
  detect(code: string, language: Language, filePath?: string): Smell[];
}

// ─── Registry State ────────────────────────────────────────────────────────────

/** Module-local plugin registry. Map from plugin.name → plugin. */
const _registry = new Map<string, BiomarkerPlugin>();

/**
 * Set of reserved smell type names (all existing SmellType literals).
 * Plugin smellWeights keys must not override these.
 */
const RESERVED_SMELL_TYPES: ReadonlySet<string> = new Set(
  Object.keys(SMELL_WEIGHTS) as SmellType[]
);

// ─── Registry Operations ───────────────────────────────────────────────────────

/**
 * Registers a biomarker plugin with the global registry.
 *
 * Validation:
 *  - `name` must be unique (throws if already registered).
 *  - `smellWeights` keys must not collide with reserved core SmellType names (warns, ignores).
 *
 * @param plugin  Plugin to register.
 * @throws        Error if a plugin with the same name is already registered.
 */
export function registerPlugin(plugin: BiomarkerPlugin): void {
  if (_registry.has(plugin.name)) {
    throw new Error(
      `BiomarkerPlugin registration failed: plugin "${plugin.name}" is already registered. ` +
      `Unregister it first with unregisterPlugin("${plugin.name}").`
    );
  }

  // Warn about reserved smell type overrides (do not throw — partial registration is allowed)
  const customWeights = plugin.metadata.smellWeights;
  for (const key of Object.keys(customWeights)) {
    if (RESERVED_SMELL_TYPES.has(key)) {
      process.stderr.write(
        `[BiomarkerPlugin] Warning: plugin "${plugin.name}" declares smellWeights key ` +
        `"${key}" which is a reserved core SmellType. The core weight will be used for scoring; ` +
        `plugin weight is ignored for this key.\n`
      );
    }
  }

  _registry.set(plugin.name, plugin);
}

/**
 * Unregisters a plugin by name.
 *
 * @param name  The plugin name to remove.
 * @returns     true if the plugin was found and removed; false if not registered.
 */
export function unregisterPlugin(name: string): boolean {
  return _registry.delete(name);
}

/**
 * Returns a snapshot of all currently registered plugins.
 * The returned array is a copy — modifying it does not affect the registry.
 */
export function getActivePlugins(): BiomarkerPlugin[] {
  return [..._registry.values()];
}

/**
 * Clears all registered plugins. Primarily for use in tests.
 */
export function clearPluginRegistry(): void {
  _registry.clear();
}

// ─── Plugin Runner ─────────────────────────────────────────────────────────────

/**
 * Executes all registered plugins that support the given language.
 * Catches and logs any plugin errors without propagating them.
 *
 * Plugins are run in registration order. Results are concatenated.
 * If no plugins are registered, returns [] with zero overhead.
 *
 * @param code      Source code to analyze.
 * @param language  Language of the source file.
 * @param filePath  Optional file path (passed through to plugins for reference).
 * @returns         Combined smell array from all applicable plugins.
 */
export function runPlugins(code: string, language: Language, filePath?: string): Smell[] {
  if (_registry.size === 0) {
    return [];
  }

  const results: Smell[] = [];

  for (const plugin of _registry.values()) {
    // Language filtering: skip if plugin doesn't apply to this language
    if (
      plugin.metadata.supportedLanguages !== 'all' &&
      !plugin.metadata.supportedLanguages.includes(language)
    ) {
      continue;
    }

    // Isolation: catch any plugin error and log to stderr without propagating
    try {
      const smells = plugin.detect(code, language, filePath);
      results.push(...smells);
    } catch (err) {
      process.stderr.write(
        `[BiomarkerPlugin] Plugin "${plugin.name}" threw during detect(): ` +
        `${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }

  return results;
}

/**
 * Looks up the effective weight for a smell type emitted by plugins.
 * Core SmellType weights always take precedence; plugin-declared weights
 * are used only for custom (non-core) smell type strings.
 *
 * @param smellTypeName  The smell type string to look up.
 * @returns              The weight to apply in scoring, or 0 if unknown.
 */
export function resolvePluginSmellWeight(smellTypeName: string): number {
  // Core weights take precedence
  if (RESERVED_SMELL_TYPES.has(smellTypeName)) {
    return SMELL_WEIGHTS[smellTypeName as SmellType];
  }

  // Search all registered plugins for a declared weight
  for (const plugin of _registry.values()) {
    const w = plugin.metadata.smellWeights[smellTypeName];
    if (typeof w === 'number' && w > 0) {
      return w;
    }
  }

  // Unknown smell type — warn and return 0
  process.stderr.write(
    `[BiomarkerPlugin] Warning: unknown smell type "${smellTypeName}" has no weight. ` +
    `Scoring impact will be 0. Declare a weight in PluginMetadata.smellWeights.\n`
  );
  return 0;
}
