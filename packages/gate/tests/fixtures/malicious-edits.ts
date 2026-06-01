/**
 * Genuinely-bad edit corpus — the negative control for the false-positive
 * measurement.
 *
 * Every entry here MUST be denied by the gate. Their purpose is to prove that
 * any tuning done to lower the false-positive rate on the benign corpus did NOT
 * also blind the gate to real regressions (i.e. that the gate is still a gate,
 * not a rubber stamp). The categories mirror the gate's deny rules:
 *
 *   - security smell introduced  (CryptographicMisuseRisk, command injection)
 *   - AI-native / supply-chain smell introduced (slopsquatted import)
 *   - score regression / below-floor (complexity + nesting explosion)
 *
 * These exercise smells that flow through the gate's own detector pipeline
 * (analyzeCode + collectSecuritySmells), not the separate auditSecurity API.
 */
import type { Language } from '@healthy-ai-code/core';

export interface MaliciousEdit {
  id: string;
  /** Which deny reason we expect (for assertion granularity). */
  expectedReason: 'new_security_smell' | 'new_ai_native_smell' | 'below_floor' | 'score_regression';
  filePath: string;
  language: Language;
  before: string;
  after: string;
}

const HEALTHY_TS = `import crypto from 'crypto';

export function add(a: number, b: number): number {
  return a + b;
}

export function fingerprint(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
`;

export const MALICIOUS_EDITS: MaliciousEdit[] = [
  {
    id: 'sec-md5-misuse',
    expectedReason: 'new_security_smell',
    filePath: 'src/hash.ts',
    language: 'typescript',
    before: HEALTHY_TS,
    after: HEALTHY_TS.replace("createHash('sha256')", "createHash('md5')"),
  },
  {
    // SQL string built by concatenation inside a db.query() call — matches
    // core's SQL_CONCAT_RE (SqlInjectionRisk, critical). Reliably detected by
    // the gate's own detector pipeline (detectInjectionRisks).
    id: 'sec-sql-injection',
    expectedReason: 'new_security_smell',
    filePath: 'src/users.ts',
    language: 'typescript',
    before: `export function findUser(db: { query: (s: string) => unknown }, id: string) {
  return db.query('SELECT * FROM users WHERE id = 1');
}
`,
    after: `export function findUser(db: { query: (s: string) => unknown }, id: string) {
  return db.query('SELECT * FROM users WHERE id = ' + id);
}
`,
  },
  {
    // Shell argument string assembled by concatenation into a local — matches
    // core's CMD_CONCAT_RE (CommandInjectionRisk, high).
    id: 'sec-command-injection',
    expectedReason: 'new_security_smell',
    filePath: 'src/run.ts',
    language: 'typescript',
    before: `import { execFileSync } from 'child_process';

export function listFiles(dir: string): string {
  return execFileSync('ls', [dir]).toString();
}
`,
    after: `import { execSync } from 'child_process';

export function listFiles(dir: string): string {
  const cmd = 'ls ' + dir;
  return execSync(cmd).toString();
}
`,
  },
  {
    id: 'complexity-explosion-below-floor',
    expectedReason: 'score_regression',
    filePath: 'src/tangled.ts',
    language: 'typescript',
    before: HEALTHY_TS,
    after:
      HEALTHY_TS +
      `
export function tangled(items: number[]): number {
  let r = 0;
  for (let i = 0; i < items.length; i++) {
    if (items[i] > 0) {
      if (items[i] % 2 === 0) {
        for (let j = 0; j < items.length; j++) {
          if (j > i) {
            if (items[j] > items[i]) {
              if (j % 3 === 0) {
                r += items[j];
              } else if (j % 3 === 1) {
                r -= items[j];
              } else {
                r *= 2;
              }
            } else if (items[j] === items[i]) {
              r += 1;
            } else {
              r -= 1;
            }
          }
        }
      } else {
        r += items[i];
      }
    } else if (items[i] < 0) {
      r -= items[i];
    } else {
      r = 0;
    }
  }
  return r;
}
`,
  },
];
