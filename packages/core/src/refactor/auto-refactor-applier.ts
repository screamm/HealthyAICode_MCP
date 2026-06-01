import type { AutoRefactorResult } from './auto-refactor-analyzer';
import type { RefactoringStrategy } from './smell-instructions';
import { splitByTopLevel, clauseToVarName, capitalize, getFnParams, getFnSig, extraParams } from './code-transform-helpers';

/** A slice of lines with inclusive start/end indices. */
interface LineRange {
  lines: string[];
  from: number;
  to: number;
}

export interface ApplyResult {
  transformedCode: string;
  changes: string[];
  strategy: RefactoringStrategy;
  /**
   * Set by callers (e.g. the async transformer pipeline) when no safe deterministic
   * transform exists for the language/strategy and the fix must be applied by the AI
   * assistant manually. Optional — synchronous template applications omit it.
   */
  requiresManualIntervention?: boolean;
}

export function applyAutoRefactor(
  code: string,
  refactorResult: AutoRefactorResult,
  // Accepted for caller uniformity with the async transformer pipeline. The synchronous
  // template applier targets TS/JS, so the language is informational here.
  _language?: import('../types').Language
): ApplyResult {
  const { refactoringStrategy } = refactorResult;

  switch (refactoringStrategy) {
    case 'early_return':
      return applyEarlyReturn(code, refactorResult);
    case 'simplify_conditional':
      return applySimplifyConditional(code, refactorResult);
    case 'extract_chunks':
      return applyExtractChunksFull(code, refactorResult);
    case 'extract_method':
      return applyExtractMethodFull(code, refactorResult);
    case 'split_at_seam':
      return applySplitAtSeamFull(code, refactorResult);
    case 'introduce_parameter_object':
      return applyIntroduceParameterObjectFull(code, refactorResult);
    case 'inline_variable':
      return applyInlineVariableFull(code, refactorResult);
    default:
      return applyDefault(code, refactorResult);
  }
}

// ─── early_return (kept as-is, proved correct) ─────────────────────────────────

function applyEarlyReturn(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const fnEnd = result.endLine - 1;
  const changes: string[] = [];

  for (let i = fnStart; i <= fnEnd; i++) {
    const matched = extractIfCondition(lines[i]);
    if (!matched) continue;

    const { condition, indent } = matched;
    const guardReturn = fnHasValueReturn({ lines, from: fnStart, to: fnEnd }) ? 'return null;' : 'return';
    lines[i] = `${indent}if (!(${condition})) ${guardReturn}`;

    const closeIdx = findClosingBrace(lines, i + 1, fnEnd);
    if (closeIdx === -1) {
      changes.push(`Found if at line ${i + 1} but could not find matching closing brace`);
      return { transformedCode: code, changes, strategy: 'early_return' };
    }

    lines.splice(closeIdx, 1);
    dedentBlock({ lines, from: i + 1, to: closeIdx - 1 });

    changes.push(`Inverted condition at line ${i + 1}: guard clause with !(${condition})`);
    changes.push('Dedented the if-block body and removed the closing brace');
    return { transformedCode: lines.join('\n'), changes, strategy: 'early_return' };
  }

  changes.push('No `if (condition) {` pattern found to transform');
  return { transformedCode: code, changes, strategy: 'early_return' };
}

/** Extracts an if-condition and indent from a line, or returns null if no match. */
function extractIfCondition(line: string): { condition: string; indent: string } | null {
  const trimmed = line.trim();
  const match = trimmed.match(/^if\s*\((.+)\)\s*\{?$/);
  if (!match || !match[1]) return null;
  return { condition: match[1], indent: line.match(/^\s*/)?.[0] || '' };
}

/** Returns true if any line in the range contains a value-returning return statement. */
function fnHasValueReturn({ lines, from, to }: LineRange): boolean {
  return lines.slice(from, to + 1).some(l => /^\s*return\s+\S/.test(l));
}

/** Finds the closing brace index for an if-block starting after startIdx, up to maxIdx. */
function findClosingBrace(lines: string[], startIdx: number, maxIdx: number): number {
  let depth = 1;
  for (let j = startIdx; j <= maxIdx; j++) {
    const opens = (lines[j].match(/\{/g) || []).length;
    const closes = (lines[j].match(/\}/g) || []).length;
    depth += opens - closes;
    if (depth <= 0) return j;
  }
  return -1;
}

/** Removes one level of indentation (2 spaces or 1 tab) from lines[from..to]. */
function dedentBlock({ lines, from, to }: LineRange): void {
  for (let j = from; j <= to; j++) {
    lines[j] = lines[j].replace(/^( {2}|\t)/, '');
  }
}

// ─── simplify_conditional (kept as-is, proved correct) ─────────────────────────

function applySimplifyConditional(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const fnEnd = result.endLine - 1;
  const changes: string[] = [];

  for (let i = fnStart; i <= fnEnd; i++) {
    const matched = extractIfCondition(lines[i]);
    if (!matched) continue;

    const { condition, indent } = matched;
    const clauses = splitByTopLevel(condition, ['&&', '||']);
    if (clauses.length < 2) continue;

    const { declarations, varRefs } = buildConditionalVars(indent, clauses);
    const originalOp = condition.includes('||') ? '||' : '&&';
    const newCondition = varRefs.join(` ${originalOp} `);
    lines[i] = `${indent}if (${newCondition}) {`;

    for (let k = declarations.length - 1; k >= 0; k--) {
      lines.splice(i, 0, declarations[k]);
    }

    changes.push(`Split complex condition into ${clauses.length} named boolean variables`);
    changes.push(`Declared: ${varRefs.join(', ')}`);
    return { transformedCode: lines.join('\n'), changes, strategy: 'simplify_conditional' };
  }

  changes.push('No complex `if` condition found to simplify');
  return { transformedCode: code, changes, strategy: 'simplify_conditional' };
}

/** Builds declaration lines and var references for a split condition. */
function buildConditionalVars(indent: string, clauses: string[]): { declarations: string[]; varRefs: string[] } {
  const declarations: string[] = [];
  const varRefs: string[] = [];
  for (let k = 0; k < clauses.length; k++) {
    const clause = clauses[k].trim();
    const varName = clauseToVarName(clause, k);
    declarations.push(`${indent}const ${varName} = ${clause};`);
    varRefs.push(varName);
  }
  return { declarations, varRefs };
}

// ─── Shared helpers for section-based extraction ────────────────────────────────

/** Specification for building a helper function code block. */
interface HelperCodeSpec {
  baseIndent: string;
  bodyIndent: string;
  helperName: string;
  paramNames: string;
  bodyLines: string[];
  isAsync: boolean;
  hasReturn: boolean;
  returnType: string | null;
}

function buildHelperCode(spec: HelperCodeSpec): string[] {
  const { baseIndent, helperName, paramNames, bodyLines, isAsync, hasReturn, returnType } = spec;
  const asyncPrefix = isAsync ? 'async ' : '';
  const rt = returnType || (hasReturn ? ': unknown' : ': void');
  const sig = `${baseIndent}${asyncPrefix}function ${helperName}(${paramNames})${rt} {`;
  const close = `${baseIndent}}`;
  return [sig, ...bodyLines, close, ''];
}

function insertAfterFn(lines: string[], fnEnd: number, helperBlocks: string[][]): void {
  for (let i = helperBlocks.length - 1; i >= 0; i--) {
    lines.splice(fnEnd + 1, 0, ...helperBlocks[i]);
  }
}

/** Options for finding the natural split point in a function. */
interface SplitAtRatioOptions {
  lines: string[];
  fnStart: number;
  fnEnd: number;
  ratio: number;
  baseIndent: string;
}

function splitAtRatio({ lines, fnStart, fnEnd, ratio, baseIndent }: SplitAtRatioOptions): number {
  const target = fnStart + Math.floor((fnEnd - fnStart + 1) * ratio);
  for (let i = target; i <= fnEnd; i++) {
    const l = lines[i].trim();
    if (l === '' || l === '}') continue;
    const indent = lines[i].match(/^\s*/)?.[0] || '';
    if (indent.length <= baseIndent.length + 2) return i;
  }
  return target;
}

// ─── extract_method (FULL) ─────────────────────────────────────────────────────

function applyExtractMethodFull(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const fnEnd = result.endLine - 1;
  const fnName = result.targetFunction;
  const changes: string[] = [];

  if (fnEnd - fnStart < 6) {
    changes.push(`Function '${fnName}' is too short (${fnEnd - fnStart + 1} lines) to extract`);
    return { transformedCode: code, changes, strategy: 'extract_method' };
  }

  const baseIndent = lines[fnStart].match(/^\s*/)?.[0] || '';
  const bodyIndent = baseIndent + '  ';

  // Find best split: not too close to start or end
  const split = fnStart + 2 + Math.floor((fnEnd - fnStart - 4) * 0.5);
  const actualSplit = splitAtRatio({ lines, fnStart, fnEnd, ratio: 0.5, baseIndent });
  if (actualSplit <= fnStart + 1 || actualSplit >= fnEnd - 1) {
    changes.push(`Could not find valid split point for '${fnName}'`);
    return { transformedCode: code, changes, strategy: 'extract_method' };
  }

  const helperName = `_${fnName}Body`;
  const sigLine = lines[fnStart];
  const isAsync = sigLine.trim().startsWith('async');
  const sigParams = getFnParams(getFnSig(lines, fnStart));

  // Collect vars crossing boundary
  const firstPart = lines.slice(fnStart, actualSplit);
  const secondPart = lines.slice(actualSplit, fnEnd + 1);
  const extra = extraParams(firstPart, secondPart, sigParams);

  const allP = [...new Set([...sigParams, ...extra])];
  const dedented = secondPart.map(l => l.replace(new RegExp(`^ {0,${bodyIndent.length}}`), bodyIndent));
  const hasRet = secondPart.some(l => /^\s*return\s/.test(l));

  const block = buildHelperCode({ baseIndent, bodyIndent, helperName, paramNames: allP.join(', '), bodyLines: dedented, isAsync, hasReturn: hasRet, returnType: null });
  insertAfterFn(lines, fnEnd, [block]);

  // Replace extracted section with call
  const call = `${bodyIndent}${isAsync ? 'await ' : ''}${helperName}(${allP.join(', ')});`;
  for (let i = fnEnd; i >= actualSplit; i--) lines.splice(i, 1);
  lines.splice(actualSplit, 0, call);

  const removed = fnEnd - actualSplit + 1;
  changes.push(`Extracted ${removed} lines from '${fnName}' into '${helperName}' (${allP.length} params)`);
  changes.push('Reduces cyclomatic complexity and function length');
  return { transformedCode: lines.join('\n'), changes, strategy: 'extract_method' };
}

// ─── extract_chunks (FULL) ─────────────────────────────────────────────────────

function applyExtractChunksFull(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const fnEnd = result.endLine - 1;
  const fnName = result.targetFunction;
  const changes: string[] = [];
  const chunkRanges: Array<{ startLine: number; endLine: number }> = result.smell.chunkRanges ?? [];

  if (chunkRanges.length < 1) {
    changes.push(`No chunk ranges available for '${fnName}'`);
    return { transformedCode: code, changes, strategy: 'extract_chunks' };
  }

  const baseIndent = lines[fnStart].match(/^\s*/)?.[0] || '';
  const bodyIndent = baseIndent + '  ';
  const sigLine = lines[fnStart];
  const isAsync = sigLine.trim().startsWith('async');
  const fnSig = getFnSig(lines, fnStart);
  const sigParams = getFnParams(fnSig);

  // Process in reverse (preserving line numbers)
  const helpers: string[][] = [];
  for (let idx = chunkRanges.length - 1; idx >= 0; idx--) {
    const range = chunkRanges[idx];
    const cs = range.startLine - 1;
    const ce = range.endLine - 1;

    if (cs < fnStart || ce > fnEnd) continue;
    if (ce - cs < 1) continue;

    const firstPart = lines.slice(fnStart, cs);
    const chunkLines = lines.slice(cs, ce + 1);
    const extra = extraParams(firstPart, chunkLines, sigParams);
    const allP = [...new Set([...sigParams, ...extra])];

    const helperName = `_${fnName}C${idx + 1}`;
    const dedented = chunkLines.map(l => l.replace(new RegExp(`^ {0,${bodyIndent.length}}`), bodyIndent));
    const hasRet = chunkLines.some(l => /^\s*return\s/.test(l));

    helpers.push(buildHelperCode({ baseIndent, bodyIndent, helperName, paramNames: allP.join(', '), bodyLines: dedented, isAsync, hasReturn: hasRet, returnType: null }));

    const call = `${bodyIndent}${isAsync ? 'await ' : ''}${helperName}(${allP.join(', ')});`;
    for (let i = ce; i >= cs; i--) lines.splice(i, 1);
    lines.splice(cs, 0, call);
    changes.push(`Extracted chunk ${idx + 1} (L${range.startLine}–${range.endLine}) → '${helperName}'`);
  }

  insertAfterFn(lines, fnEnd, helpers);
  return { transformedCode: lines.join('\n'), changes, strategy: 'extract_chunks' };
}

// ─── split_at_seam (FULL) ──────────────────────────────────────────────────────

function applySplitAtSeamFull(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const fnEnd = result.endLine - 1;
  const fnName = result.targetFunction;
  const changes: string[] = [];

  if (fnEnd - fnStart < 8) {
    changes.push(`Function '${fnName}' is too short (${fnEnd - fnStart + 1} lines) to split`);
    return { transformedCode: code, changes, strategy: 'split_at_seam' };
  }

  const baseIndent = lines[fnStart].match(/^\s*/)?.[0] || '';
  const bodyIndent = baseIndent + '  ';
  const split = splitAtRatio({ lines, fnStart, fnEnd, ratio: 0.5, baseIndent });

  if (split <= fnStart + 2 || split >= fnEnd - 1) {
    changes.push(`Could not find valid split point for '${fnName}'`);
    return { transformedCode: code, changes, strategy: 'split_at_seam' };
  }

  const helperName = `_${fnName}Tail`;
  const sigLine = lines[fnStart];
  const isAsync = sigLine.trim().startsWith('async');
  const fnSig = getFnSig(lines, fnStart);
  const sigParams = getFnParams(fnSig);
  const firstPart = lines.slice(fnStart, split);
  const secondPart = lines.slice(split, fnEnd + 1);
  const extra = extraParams(firstPart, secondPart, sigParams);
  const allP = [...new Set([...sigParams, ...extra])];
  const dedented = secondPart.map(l => l.replace(new RegExp(`^ {0,${bodyIndent.length}}`), bodyIndent));
  const hasRet = secondPart.some(l => /^\s*return\s/.test(l));

  const block = buildHelperCode({ baseIndent, bodyIndent, helperName, paramNames: allP.join(', '), bodyLines: dedented, isAsync, hasReturn: hasRet, returnType: null });
  insertAfterFn(lines, fnEnd, [block]);

  const call = `${bodyIndent}${isAsync ? 'await ' : ''}${helperName}(${allP.join(', ')});`;
  for (let i = fnEnd; i >= split; i--) lines.splice(i, 1);
  lines.splice(split, 0, call);

  const removed = fnEnd - split + 1;
  changes.push(`Split '${fnName}' at L${split + 1} into '${helperName}' (-${removed} lines)`);
  return { transformedCode: lines.join('\n'), changes, strategy: 'split_at_seam' };
}

// ─── introduce_parameter_object (FULL) ─────────────────────────────────────────

function applyIntroduceParameterObjectFull(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const fnName = result.targetFunction;
  const changes: string[] = [];

  const parsed = parseFunctionParams(getFnSig(lines, fnStart));
  if (!parsed) {
    changes.push(`Could not parse parameters for '${fnName}'`);
    return { transformedCode: code, changes, strategy: 'introduce_parameter_object' };
  }
  if (parsed.length < 3) {
    changes.push(`'${fnName}' has only ${parsed.length} params — skipping`);
    return { transformedCode: code, changes, strategy: 'introduce_parameter_object' };
  }

  const baseIndent = lines[fnStart].match(/^\s*/)?.[0] || '';
  const ifaceName = `${capitalize(fnName)}Params`;
  const iface = buildInterfaceLines(baseIndent, ifaceName, parsed);
  const newSigLine = buildNewSignatureLine({ firstSigLine: lines[fnStart], fnName, ifaceName });

  const fullSig = getFnSig(lines, fnStart);
  const sigEnd = fnStart + fullSig.split('\n').length - 1;
  for (let i = sigEnd; i >= fnStart; i--) lines.splice(i, 1);
  lines.splice(fnStart, 0, newSigLine);
  lines.splice(fnStart + 1, 0, `${baseIndent}  const { ${parsed.join(', ')} } = params;`);
  lines.splice(fnStart, 0, ...iface);

  changes.push(`Created '${ifaceName}' (${parsed.length} props) for '${fnName}'`);
  changes.push('Replaced params with destructured interface');
  return { transformedCode: lines.join('\n'), changes, strategy: 'introduce_parameter_object' };
}

/** Parses parameter names from a function signature string. Returns null on parse failure. */
function parseFunctionParams(sig: string): string[] | null {
  const parenOpen = sig.indexOf('(');
  const parenClose = sig.lastIndexOf(')');
  if (parenOpen < 0 || parenClose < 0 || parenClose <= parenOpen) return null;
  const raw = sig.slice(parenOpen + 1, parenClose);
  return raw.split(',').map(p => p.trim().split(':')[0].trim()).filter(Boolean);
}

/** Builds the interface declaration lines for a parameter object. */
function buildInterfaceLines(baseIndent: string, ifaceName: string, params: string[]): string[] {
  return [
    `${baseIndent}interface ${ifaceName} {`,
    ...params.map(p => `${baseIndent}  ${p.replace(/^\.\.\./, '')}: unknown;`),
    `${baseIndent}}`,
    '',
  ];
}

/** Options for building a new function signature line. */
interface BuildNewSignatureLineOptions {
  firstSigLine: string;
  fnName: string;
  ifaceName: string;
}

/** Builds the new function signature line using a parameter object type. */
function buildNewSignatureLine({ firstSigLine, fnName, ifaceName }: BuildNewSignatureLineOptions): string {
  const indent = firstSigLine.match(/^\s*/)?.[0] || '';
  const prefix = firstSigLine.trim().startsWith('export') ? 'export ' : '';
  const asyncP = firstSigLine.trim().startsWith('async') || firstSigLine.trim().startsWith('export async') ? 'async ' : '';
  return `${indent}${prefix}${asyncP}function ${fnName}(params: ${ifaceName}) {`;
}

// ─── inline_variable (FULL) ────────────────────────────────────────────────────

function applyInlineVariableFull(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const fnEnd = result.endLine - 1;
  const changes: string[] = [];

  for (let i = fnStart; i <= fnEnd; i++) {
    const trimmed = lines[i].trim();
    const match = trimmed.match(/^(?:const|let|var)\s+(\w+)\s*=\s*(.+);$/);
    if (!match) continue;
    const varName = match[1];
    const initExpr = match[2];
    if (!initExpr || needsNoInline(initExpr)) continue;

    const usage = findSingleUsage({ lines, varName, excludeIdx: i, range: { lines, from: fnStart, to: fnEnd } });
    if (usage === -1) continue;

    lines[usage] = lines[usage].replace(new RegExp(`\\b${varName}\\b(?!\\s*:)`), initExpr);
    lines.splice(i, 1);
    changes.push(`Inlined '${varName}' (L${i + 1} → L${usage + 1})`);
    return { transformedCode: lines.join('\n'), changes, strategy: 'inline_variable' };
  }

  changes.push('No single-use variable to inline');
  return { transformedCode: code, changes, strategy: 'inline_variable' };
}

/** Options for finding the single usage of a variable within a line range. */
interface FindSingleUsageOptions {
  lines: string[];
  varName: string;
  excludeIdx: number;
  range: LineRange;
}

/** Finds the single usage line of varName in lines[from..to], excluding excludeIdx. Returns -1 if not exactly 1 usage. */
function findSingleUsage({ lines, varName, excludeIdx, range }: FindSingleUsageOptions): number {
  const pattern = new RegExp(`\\b${varName}\\b(?!\\s*:)`);
  let usageCount = 0;
  let usageLine = -1;
  for (let j = range.from; j <= range.to; j++) {
    if (j === excludeIdx) continue;
    const refs = lines[j].match(pattern);
    if (refs) { usageCount += refs.length; usageLine = j; }
    if (usageCount > 1) return -1;
  }
  return usageCount === 1 ? usageLine : -1;
}

function needsNoInline(expr: string): boolean {
  const cs = ['=>', 'function', 'new ', '{', '?.', '||', '&&', 'import('];
  const cleaned = expr.trim();
  if (cleaned.startsWith('`') || cleaned.startsWith('/')) return true;
  for (const c of cs) { if (cleaned.includes(c)) return true; }
  return false;
}

// ─── Default ────────────────────────────────────────────────────────────────────

function applyDefault(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const changes: string[] = [];
  const indent = lines[fnStart]?.match(/^\s*/)?.[0] || '  ';
  lines.splice(fnStart + 1, 0, `${indent}// Note: address '${result.targetFunction}' (${result.smell.type}): ${result.smell.description}`);
  changes.push(`Added TODO for '${result.targetFunction}' (${result.smell.type})`);
  return { transformedCode: lines.join('\n'), changes, strategy: result.refactoringStrategy };
}
