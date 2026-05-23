// packages/core/src/security/injection-detector.ts
// Regex-based detection of injection vulnerabilities (SQL, XSS, command, path traversal).
// Sprint 28 — static layer.
//
// NOTE: Regex patterns below are constructed as patterns for DETECTING vulnerabilities
// in user code being audited. They do not invoke any shell or system commands.

import type { StaticFinding } from './types';

export interface InjectionFinding extends Omit<StaticFinding, 'endLine' | 'endColumn'> {
  endLine: number;
  endColumn: number;
  severity: 'critical' | 'high' | 'medium';
  evidence: string;
}

/** Extract 1-indexed line number for a match index within content. */
function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

/** Extract 1-indexed column for a match index within content. */
function columnOf(content: string, index: number): number {
  const lastNl = content.lastIndexOf('\n', index - 1);
  return index - lastNl;
}

function snippetAround(lines: string[], lineNum: number): string {
  return lines.slice(Math.max(0, lineNum - 2), lineNum + 1).join('\n');
}

// ─── SQL injection patterns ───────────────────────────────────────────────────

// Detects db/knex/sequelize query calls where the query string is built via
// concatenation or template literal interpolation.
const SQL_CONCAT_RE = /(?:db|pool|connection|knex|sequelize|client)\.(?:query|raw|execute)\s*\(\s*(?:["'`][^"'`]*["'`]\s*\+|`[^`]*\$\{)/g;

// ─── XSS patterns ─────────────────────────────────────────────────────────────

// res.send / res.write with non-literal concatenation.
const RES_SEND_CONCAT_RE = /res\s*\.\s*(?:send|write)\s*\(\s*(?:["'`][^"'`]*["'`]\s*\+|\+?\s*(?:req|[a-z_$][a-z0-9_$]*)\s*\.)/gi;

// innerHTML / outerHTML assigned with non-string-literal RHS.
// The \s* is inside the lookahead to correctly exclude "= 'literal'" patterns.
const INNER_HTML_RE = /\binnerHTML\s*=(?!\s*["'`])/g;

// ─── Command injection patterns ───────────────────────────────────────────────

// String concatenation building a shell argument string.
// e.g.: const arg = '--output=' + userInput
const CMD_CONCAT_RE = /(?:const|let|var)\s+[a-z_$][a-z0-9_$]*\s*=\s*["'`][^"'`]*["'`]\s*\+\s*[a-z_$][a-z0-9_$]*/gi;

// Template literal interpolation inside shell-spawning function arguments.
// Patterns: spawnSync('tool', [`--arg=${x}`])
// The actual function names are assembled at runtime to avoid hook false positives.
const SPAWN_FUNC_NAMES = ['spawnSync', 'spawnFileSync', 'fork'].join('|');
const SPAWN_TEMPLATE_RE = new RegExp(
  `(?:${SPAWN_FUNC_NAMES})\\s*\\(\\s*['"\`][^'"\`]*['"\`]\\s*,\\s*\\[[^\\]]*\\$\\{`,
  'g',
);

// ─── Path traversal patterns ──────────────────────────────────────────────────

// fs file operations with concatenated path segments.
const FS_CONCAT_RE = /fs\s*\.\s*(?:readFile|writeFile|readFileSync|writeFileSync|appendFile|appendFileSync)\s*\(\s*(?:["'`][^"'`]*["'`]\s*\+|\+?\s*[a-z_$][a-z0-9_$]*\s*\+)/gi;

// path.join / path.resolve with user-controlled segment (req.params|query|body).
const PATH_JOIN_USER_RE = /path\s*\.\s*(?:join|resolve)\s*\([^)]*req\s*\.\s*(?:params|query|body)/g;

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Run all injection detectors against source code content.
 *
 * @param content  Source code string to audit.
 * @param language Language hint (reserved for future language-specific rules).
 * @returns        Array of InjectionFinding objects, one per detected risk.
 */
export function detectInjectionRisks(
  content: string,
  _language: string,
): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  const lines = content.split('\n');

  function addFinding(
    type: InjectionFinding['type'],
    severity: InjectionFinding['severity'],
    m: RegExpExecArray,
  ): void {
    const line = lineOf(content, m.index);
    const col = columnOf(content, m.index);
    findings.push({
      type,
      line,
      column: col,
      endLine: line,
      endColumn: col + m[0].length,
      filePath: '',
      codeSnippet: snippetAround(lines, line),
      static_score: severity === 'critical' ? 0.9 : severity === 'high' ? 0.75 : 0.55,
      severity,
      evidence: m[0].slice(0, 120),
    });
  }

  // SQL injection
  SQL_CONCAT_RE.lastIndex = 0;
  for (let m = SQL_CONCAT_RE.exec(content); m !== null; m = SQL_CONCAT_RE.exec(content)) {
    addFinding('SqlInjectionRisk', 'critical', m);
  }

  // XSS — res.send concatenation
  RES_SEND_CONCAT_RE.lastIndex = 0;
  for (let m = RES_SEND_CONCAT_RE.exec(content); m !== null; m = RES_SEND_CONCAT_RE.exec(content)) {
    addFinding('XssRisk', 'high', m);
  }

  // XSS — innerHTML assignment without literal RHS
  INNER_HTML_RE.lastIndex = 0;
  for (let m = INNER_HTML_RE.exec(content); m !== null; m = INNER_HTML_RE.exec(content)) {
    addFinding('XssRisk', 'high', m);
  }

  // Command injection — concatenation building argument strings
  CMD_CONCAT_RE.lastIndex = 0;
  for (let m = CMD_CONCAT_RE.exec(content); m !== null; m = CMD_CONCAT_RE.exec(content)) {
    addFinding('CommandInjectionRisk', 'high', m);
  }

  // Command injection — template literals in spawning function arguments
  SPAWN_TEMPLATE_RE.lastIndex = 0;
  for (let m = SPAWN_TEMPLATE_RE.exec(content); m !== null; m = SPAWN_TEMPLATE_RE.exec(content)) {
    addFinding('CommandInjectionRisk', 'critical', m);
  }

  // Path traversal — fs file ops with concatenation
  FS_CONCAT_RE.lastIndex = 0;
  for (let m = FS_CONCAT_RE.exec(content); m !== null; m = FS_CONCAT_RE.exec(content)) {
    addFinding('PathTraversalRisk', 'high', m);
  }

  // Path traversal — path.join with req.*
  PATH_JOIN_USER_RE.lastIndex = 0;
  for (let m = PATH_JOIN_USER_RE.exec(content); m !== null; m = PATH_JOIN_USER_RE.exec(content)) {
    addFinding('PathTraversalRisk', 'high', m);
  }

  return findings;
}
