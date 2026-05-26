import { analyzeTypeScript } from './typescript';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { detectSATDFromText } from '../smells/text-detectors';

interface AnalyzerOutput {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
}

/**
 * Extracts the contents of the first `<script>` or `<script setup>` block
 * from a Vue Single-File Component (.vue file).
 * Returns `{ code, isTypeScript }` where `isTypeScript` is true when
 * the block carries `lang="ts"` or `lang="tsx"`.
 */
function extractScriptBlock(source: string): { code: string; isTypeScript: boolean } | null {
  // Match <script ...> ... </script> (non-greedy, handles multiline)
  const scriptTagPattern = /<script(\s[^>]*)?\s*>([\s\S]*?)<\/script>/i;
  const match = source.match(scriptTagPattern);
  if (!match) return null;

  const attrs = match[1] ?? '';
  const code = match[2];
  const isTypeScript = /lang\s*=\s*["'](ts|tsx)["']/i.test(attrs);

  return { code, isTypeScript };
}

/**
 * Tier A Vue.js / Vue 3 SFC analyzer.
 *
 * Extracts the `<script>` or `<script setup>` block from a .vue Single-File
 * Component and delegates analysis to the TypeScript analyzer (when
 * `lang="ts"` is present) or the JavaScript analyzer (default).
 *
 * The `<template>` and `<style>` sections are intentionally ignored — they
 * are not code health relevant at the function/complexity level.
 *
 * If no `<script>` block is found (template-only SFCs) the result contains
 * only SATD comments detected in the full source.
 */
export function analyzeVue(code: string, filePath = '<inline>'): AnalyzerOutput {
  const extracted = extractScriptBlock(code);

  if (!extracted) {
    // Template-only component — no logic to score
    return {
      functions: [],
      smells: detectSATDFromText(code),
      metrics: {
        cyclomaticComplexity: 1,
        cognitiveComplexity: 0,
        maxNestingDepth: 0,
        avgFunctionLength: 0,
        maxFunctionLength: 0,
        avgParameterCount: 0,
        maxParameterCount: 0,
        totalLines: code.split('\n').length,
        duplicationScore: 0,
      },
    };
  }

  // Both TS and JS route through the TypeScript analyzer (it handles JS too)
  const scriptFilePath = extracted.isTypeScript
    ? filePath.replace(/\.vue$/i, '.ts')
    : filePath.replace(/\.vue$/i, '.js');

  return analyzeTypeScript(extracted.code, scriptFilePath);
}
