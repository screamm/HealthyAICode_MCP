import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

const CLOJURE_CONFIG: TierBConfig = {
  language: 'clojure',
  functionPatterns: [
    // (defn name or (defn- name (private)
    /\(defn-?\s+(\w[\w!?*+.<>-]*)/,
  ],
  // if/when/cond/case/loop/doseq/dotimes
  controlFlowKeywords: /\b(if|when|cond|case|loop|doseq|dotimes)\b/g,
  commentPrefix: ';',
};

/**
 * Tier B Clojure analyzer.
 * Extracts defn/defn- definitions and cyclomatic complexity via regex.
 * Handles Clojure naming conventions including !, ?, *, +, -, ., <, > suffixes.
 */
export function analyzeClojure(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, CLOJURE_CONFIG);
}
