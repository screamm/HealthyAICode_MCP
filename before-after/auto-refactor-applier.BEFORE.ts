import type { AutoRefactorResult } from './auto-refactor-analyzer';
import type { RefactoringStrategy } from './smell-instructions';

export interface ApplyResult {
  transformedCode: string;
  changes: string[];
  strategy: RefactoringStrategy;
}

/**
 * Applies a mechanical refactoring to source code based on an AutoRefactorResult.
 *
 * For strategies where full mechanical transformation is possible (early_return,
 * simplify_conditional) the transformation is applied completely.
 * For partial-only strategies (extract_method, split_at_seam, extract_chunks)
 * TODO comments and structural markers are inserted.
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
      return applyExtractChunks(code, refactorResult);
    case 'extract_method':
      return applyExtractMethod(code, refactorResult);
    case 'split_at_seam':
      return applySplitAtSeam(code, refactorResult);
    case 'introduce_parameter_object':
      return applyIntroduceParameterObject(code, refactorResult);
    case 'inline_variable':
      return applyInlineVariable(code, refactorResult);
    default:
      return applyDefault(code, refactorResult);
  }
}

// ─── Strategy Implementations ─────────────────────────────────────────────────

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
      if (depth <= 0) {
        closeIdx = j;
        break;
      }
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

function applyExtractChunks(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const changes: string[] = [];

  const fnName = result.targetFunction;
  const chunkRanges = result.smell.chunkRanges ?? [];

  if (chunkRanges.length === 0) {
    changes.push(`No chunk ranges available for '${fnName}' — unable to mark boundaries`);
    return { transformedCode: code, changes, strategy: 'extract_chunks' };
  }

  const inserted: Array<{ line: number; text: string }> = [];

  for (let i = 0; i < chunkRanges.length; i++) {
    const range = chunkRanges[i];
    const lineIdx = range.startLine - 1;
    const currentIndent = lines[lineIdx]?.match(/^\s*/)?.[0] || '  ';
    const comment = `${currentIndent}// TODO: Extract chunk ${i + 1} (lines ${range.startLine}–${range.endLine}) into helper function — handle${capitalize(fnName)}Step${i + 1}`;
    inserted.push({ line: lineIdx, text: comment });
  }

  for (let i = inserted.length - 1; i >= 0; i--) {
    lines.splice(inserted[i].line, 0, inserted[i].text);
  }

  changes.push(`Marked ${chunkRanges.length} chunk boundaries with TODO comments for '${fnName}'`);

  return { transformedCode: lines.join('\n'), changes, strategy: 'extract_chunks' };
}

function applyExtractMethod(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const fnEnd = result.endLine - 1;
  const fnName = result.targetFunction;
  const fnLength = fnEnd - fnStart + 1;
  const changes: string[] = [];

  const third = Math.floor(fnLength / 3);
  const firstSplit = fnStart + third;
  const secondSplit = fnStart + third * 2;

  const indent = lines[fnStart]?.match(/^\s*/)?.[0] || '  ';
  const indentMore = indent + '  ';

  const firstComment = `${indentMore}// TODO: Extract lines ${firstSplit + 1}–${secondSplit} into a helper (e.g. validate${capitalize(fnName)}Input)`;
  const secondComment = `${indentMore}// TODO: Extract lines ${secondSplit + 1}–${fnEnd + 1} into a helper (e.g. process${capitalize(fnName)}Result)`;

  if (secondSplit > fnStart && secondSplit <= fnEnd) {
    lines.splice(secondSplit, 0, secondComment);
  }
  if (firstSplit > fnStart && firstSplit <= fnEnd) {
    lines.splice(firstSplit, 0, firstComment);
  }

  changes.push(`Marked logical sections at 1/3 and 2/3 of '${fnName}' with extract-method TODO comments`);

  return { transformedCode: lines.join('\n'), changes, strategy: 'extract_method' };
}

function applySplitAtSeam(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const fnEnd = result.endLine - 1;
  const fnName = result.targetFunction;
  const changes: string[] = [];

  const midpoint = fnStart + Math.floor((fnEnd - fnStart + 1) / 2);

  const indent = lines[midpoint]?.match(/^\s*/)?.[0] || '  ';
  const comment = `${indent}// TODO: Split '${fnName}' at natural seam — extract lines ${midpoint + 1}–${fnEnd + 1} into a separate function`;

  lines.splice(midpoint, 0, comment);

  changes.push(`Marked the mid-point seam of '${fnName}' with a split-at-seam TODO comment`);

  return { transformedCode: lines.join('\n'), changes, strategy: 'split_at_seam' };
}

function applyIntroduceParameterObject(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const fnName = result.targetFunction;
  const changes: string[] = [];

  const indent = lines[fnStart]?.match(/^\s*/)?.[0] || '  ';
  const comment = `${indent}// TODO: Introduce parameter object for '${fnName}' — group related params into an interface/type`;

  lines.splice(fnStart, 0, comment);

  changes.push(`Added introduce-parameter-object TODO for '${fnName}'`);

  return { transformedCode: lines.join('\n'), changes, strategy: 'introduce_parameter_object' };
}

function applyInlineVariable(_code: string, _result: AutoRefactorResult): ApplyResult {
  return {
    transformedCode: _code,
    changes: ['Inline-variable refactoring requires semantic understanding — add a TODO to re-evaluate variable usage'],
    strategy: 'inline_variable',
  };
}

function applyDefault(code: string, result: AutoRefactorResult): ApplyResult {
  const lines = code.split('\n');
  const fnStart = result.startLine - 1;
  const changes: string[] = [];

  const indent = lines[fnStart]?.match(/^\s*/)?.[0] || '  ';
  const comment = `${indent}// TODO: Refactor '${result.targetFunction}' to address ${result.smell.type}: ${result.smell.description}`;

  lines.splice(fnStart + 1, 0, comment);
  changes.push(`Added refactoring TODO for '${result.targetFunction}' (${result.smell.type})`);

  return { transformedCode: lines.join('\n'), changes, strategy: result.refactoringStrategy };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function splitByTopLevel(text: string, operators: string[]): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  let i = 0;

  while (i < text.length) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;

    if (depth === 0) {
      let matched = false;
      for (const op of operators) {
        if (text.startsWith(op, i)) {
          if (current.trim()) parts.push(current.trim());
          current = '';
          i += op.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }

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
    const name = varMatch[1];
    const prefix = clause.startsWith('!') ? 'not' : 'is';
    return `${prefix}${capitalize(name)}Valid`;
  }
  return `isCondition${index + 1}`;
}

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
