import type { AutoRefactorResult } from './auto-refactor-analyzer';
import type { RefactoringStrategy } from './smell-instructions';

export interface ApplyResult {
  transformedCode: string;
  changes: string[];
  strategy: RefactoringStrategy;
}

/**
 * @param code - 
 * @param refactorResult - 
 */
export function applyAutoRefactor(
  code: string,
  refactorResult: AutoRefactorResult
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
    const line = lines[i];
    const trimmed = line.trim();
    const match = trimmed.match(/^if\s*\((.+)\)\s*\{?$/);
    if (!match) continue;
    const condition = match[1];
    if (!condition) continue;

    const indent = line.match(/^\s*/)?.[0] || '';
    const hasReturn = lines.slice(fnStart, fnEnd + 1).some(l =>
      /^\s*return\s+\S/.test(l)
    );
    const guardReturn = hasReturn ? 'return null;' : 'return';
    lines[i] = `${indent}if (!(${condition})) ${guardReturn}`;

    let depth = 1;
    let closeIdx = -1;
    for (let j = i + 1; j <= fnEnd; j++) {
      const opens = (lines[j].match(/\{/g) || []).length;
      const closes = (lines[j].match(/\}/g) || []).length;
      depth += opens - closes;
      if (depth <= 0) { closeIdx = j; break; }
    }

    if (closeIdx === -1) {
      changes.push(`Found if at line ${i + 1} but could not find matching closing brace`);
      return { transformedCode: code, changes, strategy: 'early_return' };
    }

    lines.splice(closeIdx, 1);
    for (let j = i + 1; j < closeIdx; j++) {
      lines[j] = lines[j].replace(/^( {2}|\t)/, '');
    }

    changes.push(`Inverted condition at line ${i + 1}: guard clause with !(${condition})`);
    changes.push('Dedented the if-block body and removed the closing brace');
    return { transformedCode: lines.join('\n'), changes, strategy: 'early_return' };
  }

  changes.push('No `if (condition) {` pattern found to transform');
  return { transformedCode: code, changes, strategy: 'early_return' };
}

// ─── simplify_conditional (kept as-is, proved correct) ─────────────────────────

function applySimplifyConditional(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const fnEnd = result.endLine - 1;
  const changes: string[] = [];

  for (let i = fnStart; i <= fnEnd; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const match = trimmed.match(/^if\s*\((.+)\)\s*\{?$/);
    if (!match) continue;
    const condition = match[1];
    if (!condition) continue;

    const clauses = splitByTopLevel(condition, ['&&', '||']);
    if (clauses.length < 2) continue;

    const indent = line.match(/^\s*/)?.[0] || '';
    const declarations: string[] = [];
    const varRefs: string[] = [];

    for (let k = 0; k < clauses.length; k++) {
      const clause = clauses[k].trim();
      const varName = clauseToVarName(clause, k);
      declarations.push(`${indent}const ${varName} = ${clause};`);
      varRefs.push(varName);
    }

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

// ─── Shared helpers for section-based extraction ────────────────────────────────

function buildHelperCode(
  baseIndent: string, bodyIndent: string, helperName: string,
  paramNames: string, bodyLines: string[], isAsync: boolean,
  hasReturn: boolean, returnType: string | null
): string[] {
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

function splitAtRatio(
  lines: string[], fnStart: number, fnEnd: number, ratio: number, baseIndent: string
): number {
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
  const actualSplit = splitAtRatio(lines, fnStart, fnEnd, 0.5, baseIndent);
  if (actualSplit <= fnStart + 1 || actualSplit >= fnEnd - 1) {
    changes.push(`Could not find valid split point for '${fnName}'`);
    return { transformedCode: code, changes, strategy: 'extract_method' };
  }

  const helperName = `_${fnName}Body`;
  const sigLine = lines[fnStart];
  const isAsync = sigLine.trim().startsWith('async');
  const sigParams = getFnParams(sigLine);

  // Collect vars crossing boundary
  const firstPart = lines.slice(fnStart, actualSplit);
  const secondPart = lines.slice(actualSplit, fnEnd + 1);
  const extra = extraParams(firstPart, secondPart, sigParams);

  const allP = [...new Set([...sigParams, ...extra])];
  const dedented = secondPart.map(l => l.replace(new RegExp(`^ {0,${bodyIndent.length}}`), bodyIndent));
  const hasRet = secondPart.some(l => /^\s*return\s/.test(l));

  const block = buildHelperCode(baseIndent, bodyIndent, helperName, allP.join(', '), dedented, isAsync, hasRet, null);
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
  const sigParams = getFnParams(sigLine);

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

    helpers.push(buildHelperCode(baseIndent, bodyIndent, helperName, allP.join(', '), dedented, isAsync, hasRet, null));

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
  const split = splitAtRatio(lines, fnStart, fnEnd, 0.5, baseIndent);

  if (split <= fnStart + 2 || split >= fnEnd - 1) {
    changes.push(`Could not find valid split point for '${fnName}'`);
    return { transformedCode: code, changes, strategy: 'split_at_seam' };
  }

  const helperName = `_${fnName}Tail`;
  const sigLine = lines[fnStart];
  const isAsync = sigLine.trim().startsWith('async');
  const sigParams = getFnParams(sigLine);
  const firstPart = lines.slice(fnStart, split);
  const secondPart = lines.slice(split, fnEnd + 1);
  const extra = extraParams(firstPart, secondPart, sigParams);
  const allP = [...new Set([...sigParams, ...extra])];
  const dedented = secondPart.map(l => l.replace(new RegExp(`^ {0,${bodyIndent.length}}`), bodyIndent));
  const hasRet = secondPart.some(l => /^\s*return\s/.test(l));

  const block = buildHelperCode(baseIndent, bodyIndent, helperName, allP.join(', '), dedented, isAsync, hasRet, null);
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
  const sigLine = lines[fnStart];

  const parenOpen = sigLine.indexOf('(');
  const parenClose = sigLine.indexOf(')');
  if (parenOpen < 0 || parenClose < 0) {
    changes.push(`Could not parse parameters for '${fnName}'`);
    return { transformedCode: code, changes, strategy: 'introduce_parameter_object' };
  }

  const raw = sigLine.slice(parenOpen + 1, parenClose);
  const parsed = raw.split(',').map(p => p.trim().split(':')[0].trim()).filter(Boolean);
  if (parsed.length < 3) {
    changes.push(`'${fnName}' has only ${parsed.length} params — skipping`);
    return { transformedCode: code, changes, strategy: 'introduce_parameter_object' };
  }

  const baseIndent = lines[fnStart].match(/^\s*/)?.[0] || '';
  const ifaceName = `${capitalize(fnName)}Params`;
  const iface = [`${baseIndent}interface ${ifaceName} {`];
  for (const p of parsed) {
    const clean = p.replace(/^\.\.\./, '');
    iface.push(`${baseIndent}  ${clean}: unknown;`);
  }
  iface.push(`${baseIndent}}`, '');

  const newSig = sigLine.slice(0, parenOpen + 1) + `params: ${ifaceName}` + sigLine.slice(parenClose);
  lines[fnStart] = newSig;
  lines.splice(fnStart + 1, 0, `${baseIndent}  const { ${parsed.join(', ')} } = params;`);
  lines.splice(fnStart, 0, ...iface);

  changes.push(`Created '${ifaceName}' (${parsed.length} props) for '${fnName}'`);
  changes.push('Replaced params with destructured interface');
  return { transformedCode: lines.join('\n'), changes, strategy: 'introduce_parameter_object' };
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

    let usageCount = 0;
    let usageLine = -1;
    for (let j = fnStart; j <= fnEnd; j++) {
      if (j === i) continue;
      const refs = lines[j].match(new RegExp(`\\b${varName}\\b(?!\\s*:)`));
      if (refs) { usageCount += refs.length; usageLine = j; }
      if (usageCount > 1) break;
    }
    if (usageCount !== 1) continue;

    lines[usageLine] = lines[usageLine].replace(new RegExp(`\\b${varName}\\b(?!\\s*:)`), initExpr);
    lines.splice(i, 1);
    changes.push(`Inlined '${varName}' (L${i + 1} → L${usageLine + 1})`);
    return { transformedCode: lines.join('\n'), changes, strategy: 'inline_variable' };
  }

  changes.push('No single-use variable to inline');
  return { transformedCode: code, changes, strategy: 'inline_variable' };
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
  lines.splice(fnStart + 1, 0, `${indent}// TODO: Refactor '${result.targetFunction}' to address ${result.smell.type}: ${result.smell.description}`);
  changes.push(`Added TODO for '${result.targetFunction}' (${result.smell.type})`);
  return { transformedCode: lines.join('\n'), changes, strategy: result.refactoringStrategy };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function splitByTopLevel(text: string, operators: string[]): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    if (!(depth === 0)) return null;
    let matched = false;
    for (const op of operators) {
      if (!(text.startsWith(op, i))) return null;
      if (current.trim()) parts.push(current.trim());
      current = '';
      i += op.length;
      matched = true;
      break;
    }
    if (matched) continue;
    current += text[i];
    i++;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function clauseToVarName(clause: string, index: number): string {
  const cleaned = clause.replace(/^\!/, '').trim();
  const varMatch = cleaned.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  if (varMatch) {
    const prefix = clause.startsWith('!') ? 'not' : 'is';
    return `${prefix}${capitalize(varMatch[1])}Valid`;
  }
  return `isCondition${index + 1}`;
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getFnParams(sigLine: string): string[] {
  const m = sigLine.match(/\(([^)]*)\)/);
  if (!m) return [];
  return m[1].split(',').map(p => {
    const s = p.trim();
    const c = s.indexOf(':');
    const e = s.indexOf('=');
    const n = (e > 0 && e < (c > 0 ? c : s.length)) ? s.slice(0, e) : c > 0 ? s.slice(0, c) : s;
    return n.replace(/^\.\.\./, '').trim();
  }).filter(Boolean);
}

const KEYWORDS = new Set(['abstract','await','break','case','catch','class','const','continue','debugger','default','delete','do','else','enum','export','extends','false','finally','for','function','if','import','in','instanceof','interface','let','new','null','return','static','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','undefined','NaN','Infinity','any','boolean','never','number','string','unknown','Error','Promise','Map','Set','Array','console','Object','console','true','false','null','undefined']);

function isKeyword(s: string): boolean {
  return KEYWORDS.has(s) || /^\d/.test(s) || s.length === 0;
}

function collectVars(lines: string[]): Set<string> {
  const refs = new Set<string>();
  for (const line of lines) {
    const found = line.match(/\b([a-z_$][a-zA-Z0-9_$]*)\b/g);
    if (!found) continue;
    for (const id of found) {
      if (!isKeyword(id) && id !== 'true' && id !== 'false') refs.add(id);
    }
  }
  return refs;
}

function extraParams(before: string[], extracted: string[], declared: string[]): string[] {
  const used = collectVars(extracted);
  const defined = collectVars(before);
  const result: string[] = [];
  for (const v of used) {
    if (defined.has(v) && !declared.includes(v)) result.push(v);
  }
  return result;
}
