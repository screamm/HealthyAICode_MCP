import { analyzeByLanguage } from './index';
import { detectLanguage } from '../language-detect';
import type { DocDebtResult, Smell } from '../types';

const MAX_COGNITIVE_THRESHOLD = 50;
const HIGH_DDI_THRESHOLD = 0.60;
const MEDIUM_DDI_THRESHOLD = 0.30;

/**
 * Counts JSDoc blocks (`/** ... *\/`) and the function/arrow-function declarations
 * that immediately follow them (within 3 source lines).
 *
 * Returns: { documentedFunctions, totalFunctions }
 */
function countDocumentedFunctions(content: string): { documented: number; total: number } {
  const lines = content.split('\n');
  const totalFunctions = countTotalFunctions(content);
  if (totalFunctions === 0) return { documented: 0, total: 0 };

  // Collect line numbers (0-indexed) where a JSDoc block ends
  const jsdocEndLines: number[] = [];
  let inJsdoc = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!inJsdoc && trimmed.startsWith('/**')) {
      inJsdoc = true;
    }
    if (inJsdoc && trimmed.includes('*/')) {
      jsdocEndLines.push(i);
      inJsdoc = false;
    }
  }

  // For each JSDoc end line, check if a function declaration appears within 3 lines after
  const FUNCTION_RE = /\b(?:function\s+\w+|(?:async\s+)?(?:export\s+)?(?:default\s+)?function|\w+\s*(?:=\s*(?:async\s*)?\([^)]*\)\s*=>|\([^)]*\)\s*{))/;
  let documented = 0;
  for (const endLine of jsdocEndLines) {
    for (let j = endLine + 1; j <= Math.min(endLine + 3, lines.length - 1); j++) {
      if (FUNCTION_RE.test(lines[j])) {
        documented++;
        break;
      }
    }
  }

  return { documented, total: totalFunctions };
}

/** Counts total function declarations in content using simple regexp heuristics. */
function countTotalFunctions(content: string): number {
  const namedFn = (content.match(/\bfunction\s+\w+\s*\(/g) ?? []).length;
  const arrowFn = (content.match(/(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g) ?? []).length;
  const methodFn = (content.match(/^\s*(?:async\s+)?\w+\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/gm) ?? []).length;
  return namedFn + arrowFn + methodFn;
}

/**
 * Computes documentation coverage for a source file.
 * Returns a value in [0, 1] where 1 = all functions documented, 0 = none.
 *
 * Exported for unit-testability.
 */
export function computeDocCoverage(content: string, _language: string): number {
  const { documented, total } = countDocumentedFunctions(content);
  if (total === 0) return 1; // No functions → no coverage debt
  return Math.min(1, documented / total);
}

function buildDocDebtSmell(filePath: string, ddi: number): Smell | null {
  if (ddi <= 0) return null;

  let severity: Smell['severity'];
  if (ddi >= HIGH_DDI_THRESHOLD) severity = 'high';
  else if (ddi >= MEDIUM_DDI_THRESHOLD) severity = 'medium';
  else severity = 'low';

  return {
    type: 'DocumentationDebt',
    severity,
    line: 1,
    description:
      `Documentation Debt Index = ${ddi.toFixed(2)} — this file is complex but poorly documented. ` +
      `A new developer cannot understand it without extensive cross-referencing.`,
    suggestion:
      'Add JSDoc comments to public functions. ' +
      'Document the "why" (design intent) not just the "what". ' +
      'Prioritise the most complex functions first.',
  };
}

/**
 * Analyses Documentation Debt for a source file.
 *
 * DDI = normalizedComplexity * (1 − docCoverage)
 *
 * High DDI means the file is both complex and under-documented — the worst combination
 * for onboarding and maintenance.
 */
export function analyzeDocDebt(content: string, filePath: string): DocDebtResult {
  if (!content || content.trim() === '') {
    return { filePath, normalizedComplexity: 0, docCoverage: 1, docDebtIndex: 0, severity: 'none', smell: null };
  }

  const language = detectLanguage(filePath);

  let cognitiveComplexity = 0;
  try {
    const result = analyzeByLanguage(content, language, filePath);
    cognitiveComplexity = result.metrics.cognitiveComplexity;
  } catch {
    cognitiveComplexity = 0;
  }

  const normalizedComplexity = Math.min(1, cognitiveComplexity / MAX_COGNITIVE_THRESHOLD);
  const docCoverage = computeDocCoverage(content, language);
  const docDebtIndex = parseFloat((normalizedComplexity * (1 - docCoverage)).toFixed(4));

  let severity: DocDebtResult['severity'];
  if (docDebtIndex >= HIGH_DDI_THRESHOLD) severity = 'high';
  else if (docDebtIndex >= MEDIUM_DDI_THRESHOLD) severity = 'medium';
  else if (docDebtIndex > 0) severity = 'low';
  else severity = 'none';

  const smell = buildDocDebtSmell(filePath, docDebtIndex);

  return { filePath, normalizedComplexity, docCoverage, docDebtIndex, severity, smell };
}
