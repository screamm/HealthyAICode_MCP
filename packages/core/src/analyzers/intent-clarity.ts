import type { IntentClarityResult, Smell } from '../types';
import * as P from './intent-clarity-patterns';

const GENERIC_NAMES = new Set(['data','tmp','temp','result','res','val','item','obj','foo','bar','x','y','n','s','e','err']);
const SHORT_NAME_MIN_LENGTH = 3;
const WEIGHT_DOC = 0.40; const WEIGHT_TYPE = 0.35; const WEIGHT_NAME = 0.25;
const LOW_CLARITY_THRESHOLD = 0.40; const MEDIUM_CLARITY_THRESHOLD = 0.65;

/**
 * Computes the ratio of typed parameters and return types for TypeScript/JavaScript.
 * For TypeScript: counts `param: Type` and `): ReturnType` patterns.
 * For JavaScript: uses JSDoc `@param {Type}` / `@returns {Type}` annotations.
 * Exported for unit-testability.
 */
export function computeTypeAnnotationRatio(content: string, language: string): number {
  if (!['typescript', 'javascript'].includes(language)) return 0;
  if (language === 'javascript') return computeJsTypeRatio(content);
  return computeTsAnnotationRatio(content);
}

function computeJsTypeRatio(content: string): number {
  P.JSDOC_TYPE_RE.lastIndex = 0; return P.JSDOC_TYPE_RE.test(content) ? 0.5 : 0;
}

function computeTsAnnotationRatio(content: string): number {
  const sigs = extractFunctionSignatures(content);
  if (sigs.length === 0) return 1;
  let typed = 0, total = 0;
  for (const sig of sigs) { const c = countTyped(sig); typed += c.typed; total += c.total; }
  return total === 0 ? 1 : Math.min(1, typed / total);
}

function countTyped(sig: string): { typed: number; total: number } {
  let typed = 0, total = 1;
  if (P.RETURN_TYPE_RE.test(sig)) typed++;
  for (const p of extractParams(sig)) { total++; if (P.TYPED_PARAM_RE.test(p) || P.SPREAD_TYPED_RE.test(p)) typed++; }
  return { typed, total };
}

function extractFunctionSignatures(content: string): string[] {
  const sigs: string[] = []; let m: RegExpExecArray | null;
  P.NAMED_FN_SIG_RE.lastIndex = 0; while ((m = P.NAMED_FN_SIG_RE.exec(content)) !== null) sigs.push(m[1]);
  P.ARROW_SIG_RE.lastIndex = 0; while ((m = P.ARROW_SIG_RE.exec(content)) !== null) sigs.push(m[1]);
  P.METHOD_SIG_RE.lastIndex = 0; while ((m = P.METHOD_SIG_RE.exec(content)) !== null) if (!P.FLOW_KW.has(m[1])) sigs.push(m[2]);
  return sigs;
}

function extractParams(signature: string): string[] {
  const inner = signature.replace(P.PARAM_OPEN_RE, '').replace(P.PARAM_CLOSE_RE, '');
  if (!inner.trim()) return [];
  const params: string[] = []; let depth = 0, current = '';
  for (const ch of inner) {
    if (P.OPEN_BRACKETS.includes(ch)) depth++;
    else if (P.CLOSE_BRACKETS.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { params.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) params.push(current.trim());
  return params.filter(Boolean);
}

/**
 * Computes a name-quality score in [0, 1].
 * Penalises identifiers shorter than 3 chars or in the generic-names blocklist.
 * Loop variables i / j / k inside for-loops are exempted.
 *
 * @param content - Source code to analyse.
 * @returns Numeric score and list of poorly named identifiers.
 */
export function computeNameQualityScore(content: string): { score: number; poorlyNamed: string[] } {
  const loopVars = collectLoopVars(content);
  const names = collectFunctionNames(content);
  if (names.length === 0) return { score: 1, poorlyNamed: [] };
  const poorlyNamed = names.filter(n => !loopVars.has(n) && (n.length < SHORT_NAME_MIN_LENGTH || GENERIC_NAMES.has(n.toLowerCase())));
  return { score: Math.max(0, 1 - poorlyNamed.length / names.length), poorlyNamed };
}

function collectLoopVars(content: string): Set<string> {
  const vars = new Set<string>(); let m: RegExpExecArray | null;
  P.LOOP_VAR_RE.lastIndex = 0; while ((m = P.LOOP_VAR_RE.exec(content)) !== null) vars.add(m[1]);
  return vars;
}

function collectFunctionNames(content: string): string[] {
  const names: string[] = []; let m: RegExpExecArray | null;
  P.NAMED_FN_RE.lastIndex = 0; while ((m = P.NAMED_FN_RE.exec(content)) !== null) names.push(m[1]);
  P.ARROW_VAR_RE.lastIndex = 0; while ((m = P.ARROW_VAR_RE.exec(content)) !== null) names.push(m[1]);
  return names;
}

function computeDocRatio(content: string): number {
  P.DOC_FN_RE.lastIndex = 0; P.DOC_ARROW_RE.lastIndex = 0;
  const total = (content.match(P.DOC_FN_RE) ?? []).length + (content.match(P.DOC_ARROW_RE) ?? []).length;
  if (total === 0) return 1;
  P.JSDOC_BLOCK_RE.lastIndex = 0;
  return Math.min(1, Math.min((content.match(P.JSDOC_BLOCK_RE) ?? []).length, total) / total);
}

function buildSmell(filePath: string, score: number, poorlyNamed: string[]): Smell | null {
  if (score >= MEDIUM_CLARITY_THRESHOLD) return null;
  const examples = poorlyNamed.slice(0, 3).join(', ');
  return { type: 'IntentClarity', severity: score < LOW_CLARITY_THRESHOLD ? 'high' : 'medium', line: 1,
    description: `Intent Clarity Score = ${score.toFixed(2)} — code intent is hard to infer from the source. ` +
      (poorlyNamed.length > 0 ? `Poorly named identifiers: ${examples}${poorlyNamed.length > 3 ? '...' : ''}. ` : '') +
      'Missing type annotations and documentation reduce readability.',
    suggestion: 'Rename short/generic identifiers to intention-revealing names. Add JSDoc to exported functions. Add return-type and parameter-type annotations.' };
}

/**
 * Computes the Intent Clarity Score for a source file.
 *
 * intentClarityScore = docRatio × 0.40 + typeAnnotationRatio × 0.35 + nameQualityScore × 0.25
 *
 * A score close to 1.0 means the code intent is immediately legible from the source;
 * a score below 0.40 triggers a high-severity smell.
 */
export function analyzeIntentClarity(content: string, filePath: string, language: string): IntentClarityResult {
  if (!content || content.trim() === '') {
    return { filePath, docRatio: 0, typeAnnotationRatio: 0, nameQualityScore: 1, intentClarityScore: 0, poorlyNamedFunctions: [], smell: null };
  }
  const docRatio = computeDocRatio(content);
  const typeAnnotationRatio = computeTypeAnnotationRatio(content, language);
  const { score: nameQualityScore, poorlyNamed } = computeNameQualityScore(content);
  const intentClarityScore = parseFloat((docRatio * WEIGHT_DOC + typeAnnotationRatio * WEIGHT_TYPE + nameQualityScore * WEIGHT_NAME).toFixed(4));
  return { filePath, docRatio, typeAnnotationRatio, nameQualityScore, intentClarityScore, poorlyNamedFunctions: poorlyNamed, smell: buildSmell(filePath, intentClarityScore, poorlyNamed) };
}
