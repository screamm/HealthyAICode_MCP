/**
 * Healthy refactor of unhealthy/complex.ts
 *
 * Tillämpade mönster:
 * - Early returns istället för djup nestning (DeepNesting → ≤2)
 * - Options-objekt istället för 6 positionella parametrar (LongParameterList)
 * - Hjälpfunktioner som delar upp logik (LargeMethod + ComplexMethod)
 * - Lookup-tabell istället for if/else-kedja (ComplexMethod)
 *
 * Originalfixturen i unhealthy/complex.ts lämnas orörd för testerna.
 */

type ProcessOptions = {
  items: number[];
  config: object;
  options: object;
  callback: Function;
  mode: string;
  extra: boolean;
};

const MODE_PATHS: Record<string, string> = {
  fast: 'fast-path',
  slow: 'slow-path',
  normal: 'normal-path',
};

function classifyPositiveItem(item: number, mode: string, extra: boolean): string | null {
  if (item <= 1) return null;
  if (item % 2 === 0) return MODE_PATHS[mode] ?? null;
  return extra ? 'extra-odd' : null;
}

function classifyItem(item: number, mode: string, extra: boolean): string | null {
  if (item > 0) return classifyPositiveItem(item, mode, extra);
  if (item < -10) return 'negative';
  if (item === 0) return 'zero';
  return null;
}

export function processData(opts: ProcessOptions): string {
  const { items, mode, extra } = opts;

  if (items.length === 0) return extra ? 'extra' : 'empty';

  for (const item of items) {
    const result = classifyItem(item, mode, extra);
    if (result !== null) return result;
  }
  return 'default';
}

type ValidateOptions = {
  value: unknown;
  type: string;
  required: boolean;
  min: number;
  max: number;
  pattern: string;
};

function isMissing(value: unknown): boolean {
  return value === null || value === undefined;
}

function validateNumber(value: unknown, min: number, max: number): boolean {
  if (typeof value !== 'number') return false;
  return value >= min && value <= max;
}

function validateString(value: unknown, pattern: string): boolean {
  if (typeof value !== 'string') return false;
  if (!pattern) return true;
  return new RegExp(pattern).test(value);
}

export function validateInput(opts: ValidateOptions): boolean {
  const { value, type, required, min, max, pattern } = opts;

  if (required && isMissing(value)) return false;
  if (type === 'number') return validateNumber(value, min, max);
  if (type === 'string') return validateString(value, pattern);
  return true;
}

type ParseOptions = {
  raw: string;
  strict: boolean;
  fallback: object;
  schema: object;
  version: number;
  debug: boolean;
};

function logIfDebug(strict: boolean, version: number, debug: boolean): void {
  if (debug && strict && version >= 2) {
    console.log('Parsing in strict v2 mode');
  }
}

export function parseConfig(opts: ParseOptions): object {
  const { raw, strict, fallback, version, debug } = opts;

  if (!raw || raw.length === 0) return fallback;

  logIfDebug(strict, version, debug);

  try {
    return JSON.parse(raw);
  } catch {
    if (strict) throw new Error('Parse failed in strict mode');
    return fallback;
  }
}
