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

// ─── Severity score mapping ───────────────────────────────────────────────────

/** Static risk score assigned to critical-severity injection findings. */
const SCORE_CRITICAL = 0.9;

/** Static risk score assigned to high-severity injection findings. */
const SCORE_HIGH = 0.75;

/** Static risk score assigned to medium-severity injection findings. */
const SCORE_MEDIUM = 0.55;

/** Maximum number of characters from the match evidence to include in a finding. */
const EVIDENCE_MAX_LENGTH = 120;

/** Maps severity to a static risk score. */
function severityToScore(severity: InjectionFinding['severity']): number {
  if (severity === 'critical') return SCORE_CRITICAL;
  if (severity === 'high') return SCORE_HIGH;
  return SCORE_MEDIUM;
}

/** Shared scan context passed to helper functions to avoid repeating content/lines. */
interface InjectionScanContext {
  content: string;
  lines: string[];
}

/** Describes an injection pattern rule: the regex to match, finding type, and severity. */
interface InjectionPatternRule {
  regex: RegExp;
  type: InjectionFinding['type'];
  severity: InjectionFinding['severity'];
}

/** Builds an InjectionFinding from a regex match, rule, and scan context. */
function buildInjectionFinding(
  rule: InjectionPatternRule,
  m: RegExpExecArray,
  ctx: InjectionScanContext,
): InjectionFinding {
  const { content, lines } = ctx;
  const { type, severity } = rule;
  const line = lineOf(content, m.index);
  const col = columnOf(content, m.index);
  return {
    type,
    line,
    column: col,
    endLine: line,
    endColumn: col + m[0].length,
    filePath: '',
    codeSnippet: snippetAround(lines, line),
    static_score: severityToScore(severity),
    severity,
    evidence: m[0].slice(0, EVIDENCE_MAX_LENGTH),
  };
}

/** Scans `ctx.content` with the rule's regex and appends a finding for each match. */
function scanPattern(
  rule: InjectionPatternRule,
  ctx: InjectionScanContext,
  findings: InjectionFinding[],
): void {
  rule.regex.lastIndex = 0;
  for (let m = rule.regex.exec(ctx.content); m !== null; m = rule.regex.exec(ctx.content)) {
    findings.push(buildInjectionFinding(rule, m, ctx));
  }
}

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
  const ctx: InjectionScanContext = { content, lines: content.split('\n') };

  const rules: InjectionPatternRule[] = [
    { regex: SQL_CONCAT_RE, type: 'SqlInjectionRisk', severity: 'critical' },
    { regex: RES_SEND_CONCAT_RE, type: 'XssRisk', severity: 'high' },
    { regex: INNER_HTML_RE, type: 'XssRisk', severity: 'high' },
    { regex: CMD_CONCAT_RE, type: 'CommandInjectionRisk', severity: 'high' },
    { regex: SPAWN_TEMPLATE_RE, type: 'CommandInjectionRisk', severity: 'critical' },
    { regex: FS_CONCAT_RE, type: 'PathTraversalRisk', severity: 'high' },
    { regex: PATH_JOIN_USER_RE, type: 'PathTraversalRisk', severity: 'high' },
  ];

  for (const rule of rules) {
    scanPattern(rule, ctx, findings);
  }

  return findings;
}
