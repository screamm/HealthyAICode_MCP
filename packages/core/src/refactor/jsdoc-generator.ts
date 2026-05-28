import type { HealthResult, Smell } from '../types';

export interface JsDocResult {
  code: string;
  changes: string[];
}

/**
 * Generates JSDoc comments for exported functions that lack them.
 * Returns the transformed code with JSDoc comments inserted.
 */
export function generateMissingJsDoc(code: string, health: HealthResult): JsDocResult {
  const changes: string[] = [];
  const lines = code.split('\n');
  const exportLines = findExportWithoutDoc(lines, health.smells);

  if (exportLines.length === 0) {
    return { code, changes };
  }

  for (let i = exportLines.length - 1; i >= 0; i--) {
    const { lineIdx, params, hasReturn } = exportLines[i];
    const indent = lines[lineIdx].match(/^\s*/)?.[0] || '';

    const docLines: string[] = [`${indent}/**`];
    if (params.length > 0) {
      for (const p of params) {
        docLines.push(`${indent} * @param ${p} - `);
      }
    }
    if (hasReturn) {
      docLines.push(`${indent} * @returns `);
    }
    if (docLines.length === 1) {
      docLines.push(`${indent} * `);
    }
    docLines.push(`${indent} */`);

    lines.splice(lineIdx, 0, ...docLines);
    changes.push(`Added JSDoc to exported function at line ${lineIdx + 1}`);
  }

  return { code: lines.join('\n'), changes };
}

interface ExportDocInfo {
  lineIdx: number;
  params: string[];
  hasReturn: boolean;
}

function findExportWithoutDoc(lines: string[], smells: Smell[]): ExportDocInfo[] {
  const result: ExportDocInfo[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('export ')) continue;

    if (hasJsDocAbove(lines, i)) continue;

    const sig = extractSig(lines, i);
    if (!sig) continue;

    const params = extractParamNames(sig);
    const hasReturn = sig.includes('):');

    result.push({ lineIdx: i, params, hasReturn });
  }

  return result;
}

function hasJsDocAbove(lines: string[], lineIdx: number): boolean {
  for (let i = lineIdx - 1; i >= Math.max(0, lineIdx - 10); i--) {
    const l = lines[i].trim();
    if (l === '') continue;
    if (l === '*/' || l.endsWith('*/')) return true;
    if (l.startsWith('/**')) return true;
    if (l.startsWith('//') || l.startsWith('/*')) return false;
    return false;
  }
  return false;
}

function collectSigText(lines: string[], startIdx: number): string {
  let sig = '';
  for (let i = startIdx; i < Math.min(startIdx + 5, lines.length); i++) {
    sig += lines[i];
    if (sig.includes('{')) break;
  }
  return sig;
}

function extractSig(lines: string[], startIdx: number): string | null {
  const sig = collectSigText(lines, startIdx);
  const fnMatch = sig.match(/(?:function\s+\w+|=>)\s*\([^)]*\)/);
  if (fnMatch) return fnMatch[0];
  const hasFn = sig.includes('function') || sig.includes('=>') || sig.includes('(');
  if (!hasFn) return null;
  const parenMatch = sig.match(/\([^)]*\)/);
  return parenMatch ? parenMatch[0] : null;
}

function extractParamNames(sig: string): string[] {
  const parenMatch = sig.match(/\(([^)]*)\)/);
  if (!parenMatch) return [];
  return parenMatch[1].split(',').map(p => {
    const clean = p.trim().split(':')[0].trim().replace(/^\.\.\./, '');
    return clean;
  }).filter(Boolean);
}
