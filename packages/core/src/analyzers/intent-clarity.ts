import type { IntentClarityResult, Smell } from '../types';

const GENERIC_NAMES = new Set([
  'data', 'tmp', 'temp', 'result', 'res', 'val', 'item', 'obj',
  'foo', 'bar', 'x', 'y', 'n', 's', 'e', 'err',
]);
const SHORT_NAME_MIN_LENGTH = 3;

const WEIGHT_DOC = 0.40;
const WEIGHT_TYPE = 0.35;
const WEIGHT_NAME = 0.25;
const LOW_CLARITY_THRESHOLD = 0.40;
const MEDIUM_CLARITY_THRESHOLD = 0.65;

/**
 * Computes the ratio of typed parameters and return types for TypeScript/JavaScript.
 *
 * For TypeScript: counts param: Type patterns and ): ReturnType patterns.
 * For JavaScript: returns 0 (no static types).
 *
 * Exported for unit-testability.
 */
export function computeTypeAnnotationRatio(content: string, language: string): number {
  if (!['typescript', 'javascript'].includes(language)) return 0;
  if (language === 'javascript') {
    const hasJsDocTypes = /@param\s+\{[^}]+\}|@returns?\s+\{[^}]+\}/g.test(content);
    return hasJsDocTypes ? 0.5 : 0;
  }

  const functionBodies = extractFunctionSignatures(content);
  if (functionBodies.length === 0) return 1;

  let typedCount = 0;
  let totalCount = 0;

  for (const sig of functionBodies) {
    const hasReturnType = /\)\s*:\s*\w/.test(sig);
    totalCount++;
    if (hasReturnType) typedCount++;

    const params = extractParams(sig);
    for (const param of params) {
      totalCount++;
      if (/^\s*\w+\s*:\s*\w/.test(param) || /^\s*\.\.\.\w+\s*:\s*\w/.test(param)) {
        typedCount++;
      }
    }
  }

  if (totalCount === 0) return 1;
  return Math.min(1, typedCount / totalCount);
}

function extractFunctionSignatures(content: string): string[] {
  const signatures: string[] = [];
  let m: RegExpExecArray | null;

  const namedFnRe = /(?:async\s+)?function\s+\w+\s*(\([^)]*\)(?:\s*:\s*[\w<>\[\]|&]+)?)/g;
  while ((m = namedFnRe.exec(content)) !== null) {
    signatures.push(m[1]);
  }

  const arrowRe = /(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?(\([^)]*\)(?:\s*:\s*[\w<>\[\]|&]+)?)\s*=>/g;
  while ((m = arrowRe.exec(content)) !== null) {
    signatures.push(m[1]);
  }

  const methodRe = /^\s*(?:async\s+|public\s+|private\s+|protected\s+)*(\w+)\s*(\([^)]*\)(?:\s*:\s*[\w<>\[\]|&]+)?)\s*(?:\{|=>)/gm;
  while ((m = methodRe.exec(content)) !== null) {
    if (!['if', 'for', 'while', 'switch', 'catch'].includes(m[1])) {
      signatures.push(m[2]);
    }
  }

  return signatures;
}

function extractParams(signature: string): string[] {
  const inner = signature.replace(/^\s*\(/, '').replace(/\)\s*(?::\s*.+)?$/, '');
  if (!inner.trim()) return [];

  const params: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if ('<[{'.includes(ch)) depth++;
    else if ('>]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) {
      params.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) params.push(current.trim());
  return params.filter(Boolean);
}

/**
 * Computes a name-quality score in [0, 1].
 * Penalises functions and variables whose names are shorter than 3 chars or in the
 * generic-names blocklist. Loop variables i / j / k in for-loops are exempted.
 *
 * Returns { score, poorlyNamed: string[] } for unit-testability.
 */
export function computeNameQualityScore(content: string): { score: number; poorlyNamed: string[] } {
  const loopVarRe = /for\s*\([^)]*\b([ijk])\b/g;
  const loopVars = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = loopVarRe.exec(content)) !== null) {
    loopVars.add(m[1]);
  }

  const names: string[] = [];
  const namedFnRe = /\bfunction\s+(\w+)\s*\(/g;
  while ((m = namedFnRe.exec(content)) !== null) names.push(m[1]);

  const arrowRe = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  while ((m = arrowRe.exec(content)) !== null) names.push(m[1]);

  if (names.length === 0) return { score: 1, poorlyNamed: [] };

  const poorlyNamed: string[] = [];
  for (const name of names) {
    const isTooShort = name.length < SHORT_NAME_MIN_LENGTH;
    const isGeneric = GENERIC_NAMES.has(name.toLowerCase());
    const isExemptLoopVar = loopVars.has(name);

    if (!isExemptLoopVar && (isTooShort || isGeneric)) {
      poorlyNamed.push(name);
    }
  }

  const score = Math.max(0, 1 - poorlyNamed.length / names.length);
  return { score, poorlyNamed };
}

function computeDocRatio(content: string): number {
  const totalFns = (content.match(/\bfunction\s+\w+\s*\(/g) ?? []).length
    + (content.match(/(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g) ?? []).length;
  if (totalFns === 0) return 1;

  const jsdocRe = /\/\*\*[\s\S]*?\*\//g;
  const jsdocMatches = content.match(jsdocRe) ?? [];
  const documented = Math.min(jsdocMatches.length, totalFns);
  return Math.min(1, documented / totalFns);
}

function buildIntentClaritySmell(
  filePath: string,
  score: number,
  poorlyNamed: string[],
): Smell | null {
  if (score >= MEDIUM_CLARITY_THRESHOLD) return null;

  const severity: Smell['severity'] = score < LOW_CLARITY_THRESHOLD ? 'high' : 'medium';
  const examples = poorlyNamed.slice(0, 3).join(', ');

  return {
    type: 'IntentClarity',
    severity,
    line: 1,
    description:
      `Intent Clarity Score = ${score.toFixed(2)} — code intent is hard to infer from the source. ` +
      (poorlyNamed.length > 0
        ? `Poorly named identifiers: ${examples}${poorlyNamed.length > 3 ? '...' : ''}. `
        : '') +
      'Missing type annotations and documentation reduce readability.',
    suggestion:
      'Rename short/generic identifiers to intention-revealing names. ' +
      'Add JSDoc to exported functions. ' +
      'Add return-type and parameter-type annotations.',
  };
}

/**
 * Computes the Intent Clarity Score for a source file.
 *
 * intentClarityScore = docRatio x 0.40 + typeAnnotationRatio x 0.35 + nameQualityScore x 0.25
 *
 * A score close to 1.0 means the code intent is immediately legible from the source;
 * a score below 0.40 triggers a high-severity smell.
 */
export function analyzeIntentClarity(
  content: string,
  filePath: string,
  language: string,
): IntentClarityResult {
  if (!content || content.trim() === '') {
    return {
      filePath,
      docRatio: 0,
      typeAnnotationRatio: 0,
      nameQualityScore: 1,
      intentClarityScore: 0,
      poorlyNamedFunctions: [],
      smell: null,
    };
  }

  const docRatio = computeDocRatio(content);
  const typeAnnotationRatio = computeTypeAnnotationRatio(content, language);
  const { score: nameQualityScore, poorlyNamed } = computeNameQualityScore(content);

  const intentClarityScore = parseFloat(
    (docRatio * WEIGHT_DOC + typeAnnotationRatio * WEIGHT_TYPE + nameQualityScore * WEIGHT_NAME).toFixed(4),
  );

  const smell = buildIntentClaritySmell(filePath, intentClarityScore, poorlyNamed);

  return {
    filePath,
    docRatio,
    typeAnnotationRatio,
    nameQualityScore,
    intentClarityScore,
    poorlyNamedFunctions: poorlyNamed,
    smell,
  };
}
