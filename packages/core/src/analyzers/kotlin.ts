import { analyzeGenericTierB } from './generic-tier-b';
import type { TierBConfig } from './generic-tier-b';

/**
 * Kotlin-specific Tier B configuration.
 * Kotlin uses `fun` instead of Java's method declaration syntax.
 * Key Kotlin constructs that Java-grammar misses:
 * - function_declaration: `fun name(`
 * - Extension functions: `fun Type.name(`
 * - when_expression (pattern matching) as CC contributor
 * - Elvis operator (?:) as CC contributor
 * - Coroutine keywords (suspend fun) handled as regular functions
 */
const KOTLIN_CONFIG: TierBConfig = {
  language: 'kotlin',
  functionPatterns: [
    // Regular function: fun name( or suspend fun name(
    /^\s*(?:(?:private|public|protected|internal|override|suspend|inline|operator|infix)\s+)*fun\s+(\w+)\s*[(<]/,
    // Extension function: fun Type.name(
    /^\s*(?:(?:private|public|protected|internal|override|suspend|inline|operator|infix)\s+)*fun\s+\w+\.(\w+)\s*\(/,
  ],
  // Kotlin control flow: if/when/for/while/do/try + Elvis operator + logical operators
  controlFlowKeywords: /\b(if|when|for|while|do|catch)\b|\?:|&&|\|\|/g,
  commentPrefix: '//',
};

/**
 * Native Kotlin analyzer (Tier B).
 *
 * Replaces the previous Java-routing for Kotlin (Sprint 25).
 * Uses Kotlin-specific `fun` patterns and `when` expression recognition.
 * Kotlin-specific constructs beyond basic Tier B (coroutines, sealed classes)
 * are planned for a future Tier A tree-sitter-kotlin analyzer.
 */
export function analyzeKotlin(code: string, filePath = '<inline>') {
  return analyzeGenericTierB(code, filePath, KOTLIN_CONFIG);
}
