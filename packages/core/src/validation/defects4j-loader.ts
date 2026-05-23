import * as fs from 'fs/promises';
import type { BugRecord } from './dataset-runner';

/** A single entry from a Defects4J-format JSON export. */
export interface Defects4JEntry {
  /** Project identifier, e.g. "Lang" or "Math". */
  project: string;
  /** Bug identifier, e.g. "1b" or "2b". */
  bugId: string;
  /** Fully-qualified Java class name. */
  className: string;
  /** Source code AFTER the bug was fixed (clean). */
  fixedCode: string;
  /** Source code BEFORE the fix was applied (buggy). */
  buggyCode: string;
}

/**
 * Loads a Defects4J JSON file (`Defects4JEntry[]`) and converts it to
 * `BugRecord[]` pairs: one buggy record (hasBug: true) and one clean
 * record (hasBug: false) per entry.
 */
export async function loadDefects4JFromJson(jsonPath: string): Promise<BugRecord[]> {
  const raw = await fs.readFile(jsonPath, 'utf-8');
  const entries: Defects4JEntry[] = JSON.parse(raw);

  const records: BugRecord[] = [];
  for (const entry of entries) {
    const baseName = `${entry.project}_${entry.bugId}_${entry.className}`;
    records.push({
      filePath: `${baseName}.buggy.java`,
      language: 'java',
      code: entry.buggyCode,
      hasBug: true,
      bugCount: 1,
    });
    records.push({
      filePath: `${baseName}.fixed.java`,
      language: 'java',
      code: entry.fixedCode,
      hasBug: false,
      bugCount: 0,
    });
  }
  return records;
}

/**
 * Returns a small hard-coded TypeScript benchmark (5 buggy + 5 clean functions)
 * so that validation tests can run without any external data files.
 *
 * Buggy files deliberately contain code smells (DeepNesting, ComplexMethod)
 * that push the health score down. Clean files are simple one-liner functions.
 */
export function createSyntheticBenchmark(): BugRecord[] {
  const buggyRecords: BugRecord[] = [
    {
      filePath: 'buggy/deeply-nested.ts',
      language: 'typescript',
      hasBug: true,
      bugCount: 3,
      code: `
export function process(data: unknown): string {
  if (data) {
    if (typeof data === 'object') {
      if (Array.isArray(data)) {
        if (data.length > 0) {
          if (data[0] !== null) {
            if (typeof data[0] === 'string') {
              if (data[0].length > 0) {
                return data[0].toUpperCase();
              }
            }
          }
        }
      }
    }
  }
  return '';
}
`.trim(),
    },
    {
      filePath: 'buggy/complex-switch.ts',
      language: 'typescript',
      hasBug: true,
      bugCount: 2,
      code: `
export function classify(x: number, y: number, z: number, w: number, v: number): string {
  if (x > 0 && y > 0) {
    if (z > 0) {
      if (w > 0) {
        if (v > 0) { return 'all-positive'; }
        else { return 'v-negative'; }
      } else if (w < -10) {
        return 'w-very-negative';
      } else {
        return 'w-slightly-negative';
      }
    } else if (z < -10) {
      return 'z-very-negative';
    } else {
      return 'z-slightly-negative';
    }
  } else if (x < 0 && y < 0) {
    if (z < 0 && w < 0 && v < 0) {
      return 'all-negative';
    }
    return 'mixed-negative';
  }
  return 'unknown';
}
`.trim(),
    },
    {
      filePath: 'buggy/long-chain.ts',
      language: 'typescript',
      hasBug: true,
      bugCount: 2,
      code: `
export function compute(
  a: number, b: number, c: number, d: number,
  e: number, f: number, g: number
): number {
  let result = 0;
  if (a > 0) {
    if (b > 0) {
      result += a * b;
      if (c > 0) {
        result += c;
        if (d > 0) {
          result += d;
          if (e > 0) {
            result += e;
            if (f > 0) {
              result += f;
              if (g > 0) {
                result += g;
              } else {
                result -= g;
              }
            } else {
              result -= f;
            }
          } else {
            result -= e;
          }
        }
      }
    } else {
      result -= b;
    }
  } else {
    result = -a;
  }
  return result;
}
`.trim(),
    },
    {
      filePath: 'buggy/many-params.ts',
      language: 'typescript',
      hasBug: true,
      bugCount: 1,
      code: `
export function buildUrl(
  protocol: string, host: string, port: number, path: string,
  query: string, fragment: string, username: string, password: string,
  timeout: number, retries: number
): string {
  const auth = username && password ? \`\${username}:\${password}@\` : '';
  const portStr = port !== 80 && port !== 443 ? \`:\${port}\` : '';
  const queryStr = query ? \`?\${query}\` : '';
  const hashStr = fragment ? \`#\${fragment}\` : '';
  for (let i = 0; i < retries; i++) {
    if (timeout > 0) {
      try {
        return \`\${protocol}://\${auth}\${host}\${portStr}\${path}\${queryStr}\${hashStr}\`;
      } catch {
        if (i === retries - 1) throw new Error('Max retries reached');
      }
    }
  }
  return '';
}
`.trim(),
    },
    {
      filePath: 'buggy/complex-conditions.ts',
      language: 'typescript',
      hasBug: true,
      bugCount: 2,
      code: `
export function validate(
  name: string | null | undefined,
  age: number,
  email: string,
  role: string
): boolean {
  if (
    name !== null && name !== undefined && name.length > 0 && name.length < 100 &&
    age >= 0 && age <= 150 &&
    email.includes('@') && email.includes('.') && email.length > 5 &&
    (role === 'admin' || role === 'user' || role === 'moderator' || role === 'guest')
  ) {
    if (role === 'admin' && age < 18) {
      return false;
    }
    if (role === 'moderator' && (age < 16 || !email.endsWith('.com'))) {
      return false;
    }
    return true;
  }
  return false;
}
`.trim(),
    },
  ];

  const cleanRecords: BugRecord[] = [
    {
      filePath: 'clean/add.ts',
      language: 'typescript',
      hasBug: false,
      bugCount: 0,
      code: `export function add(a: number, b: number): number { return a + b; }`,
    },
    {
      filePath: 'clean/greet.ts',
      language: 'typescript',
      hasBug: false,
      bugCount: 0,
      code: `export function greet(name: string): string { return \`Hello, \${name}!\`; }`,
    },
    {
      filePath: 'clean/clamp.ts',
      language: 'typescript',
      hasBug: false,
      bugCount: 0,
      code: `export function clamp(value: number, min: number, max: number): number { return Math.min(Math.max(value, min), max); }`,
    },
    {
      filePath: 'clean/isEven.ts',
      language: 'typescript',
      hasBug: false,
      bugCount: 0,
      code: `export function isEven(n: number): boolean { return n % 2 === 0; }`,
    },
    {
      filePath: 'clean/toUpperCase.ts',
      language: 'typescript',
      hasBug: false,
      bugCount: 0,
      code: `export function toUpperCase(s: string): string { return s.toUpperCase(); }`,
    },
  ];

  return [...buggyRecords, ...cleanRecords];
}
