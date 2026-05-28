/**
 * Low-level code transformation helpers shared by the auto-refactor applier.
 * Extracted to keep auto-refactor-applier.ts within file-size health thresholds.
 */

/** Splits a string by top-level operators (respecting parenthesis depth). */
export function splitByTopLevel(text: string, operators: string[]): string[] {
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

/** Derives a boolean variable name from a condition clause. */
export function clauseToVarName(clause: string, index: number): string {
  const cleaned = clause.replace(/^\!/, '').trim();
  const varMatch = cleaned.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  if (varMatch) {
    const prefix = clause.startsWith('!') ? 'not' : 'is';
    return `${prefix}${capitalize(varMatch[1])}Valid`;
  }
  return `isCondition${index + 1}`;
}

export function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Extracts parameter names from a function signature line. */
export function getFnParams(sigLine: string): string[] {
  const parenOpen = sigLine.indexOf('(');
  if (parenOpen < 0) return [];
  const rest = sigLine.slice(parenOpen + 1);
  if (!rest.includes(')')) return [];
  const raw = rest.slice(0, rest.indexOf(')'));
  return raw.split(',').map(p => extractParamName(p)).filter(Boolean);
}

/** Extracts just the parameter name from a raw param token (strips type and default). */
function extractParamName(param: string): string {
  const s = param.trim();
  const colonIdx = s.indexOf(':');
  const equalsIdx = s.indexOf('=');
  let name: string;
  if (equalsIdx > 0 && equalsIdx < (colonIdx > 0 ? colonIdx : s.length)) {
    name = s.slice(0, equalsIdx).trim();
  } else if (colonIdx > 0) {
    name = s.slice(0, colonIdx).trim();
  } else {
    name = s;
  }
  return name.replace(/^\.\.\./, '');
}

/** Extracts a function signature from a multi-line array, following parenthesis depth. */
export function getFnSig(lines: string[], fnLine: number): string {
  let sig = '';
  let depth = 0;
  let foundOpen = false;
  for (let i = fnLine; i < Math.min(fnLine + 10, lines.length); i++) {
    for (const ch of lines[i]) {
      sig += ch;
      if (ch === '(') { depth++; foundOpen = true; }
      else if (ch === ')') { depth--; if (foundOpen && depth === 0) return sig; }
    }
    sig += '\n';
  }
  return sig.split('\n')[0] || '';
}

const KEYWORDS = new Set(['abstract','await','break','case','catch','class','const','continue','debugger',
  'default','delete','do','else','enum','export','extends','false','finally','for','function','if','import',
  'in','instanceof','interface','let','new','null','return','static','super','switch','this','throw','true',
  'try','typeof','var','void','while','with','yield','undefined','NaN','Infinity','any','boolean','never',
  'number','string','unknown','Error','Promise','Map','Set','Array','console','Object']);

function isKeyword(s: string): boolean {
  return KEYWORDS.has(s) || /^\d/.test(s) || s.length === 0;
}

/** Collects all identifier-like tokens from a set of lines. */
export function collectVars(lines: string[]): Set<string> {
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

/**
 * Finds identifiers used in `extracted` lines that were defined in `before` lines
 * and are not already in `declared` (the function's signature params).
 */
export function extraParams(before: string[], extracted: string[], declared: string[]): string[] {
  const used = collectVars(extracted);
  const defined = collectVars(before);
  const result: string[] = [];
  for (const v of used) {
    if (defined.has(v) && !declared.includes(v)) result.push(v);
  }
  return result;
}
