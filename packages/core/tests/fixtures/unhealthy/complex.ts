/**
 * Unhealthy fixture — expected score: 1.0 (floor — saturates with current weights)
 *
 * Contains:
 * - ComplexMethod (processData + validateInput: cyclomaticComplexity > 10)
 * - DeepNesting (processData depth 6, parseConfig depth 5)
 * - LongParameterList (all 3 functions: parameterCount = 6)
 * - LargeMethod (all 3 functions: length > 30)
 *
 * NOTE (Sprint 17): BumpyRoad is NOT triggered by this file under the new chunk-based definition.
 * - processData: 1 top-level chunk (single if/else-if/else chain)
 * - validateInput: 2 top-level chunks (if(required) + if(type==='number')/else-if chain)
 * - parseConfig: 1 top-level chunk (single if)
 * None reach the threshold of 4 top-level sibling control-flow chunks.
 * For an actual BumpyRoad fixture, see tests/fixtures/unhealthy/bumpy-road-fixture.ts
 */

export function processData(
  items: number[],
  config: object,
  options: object,
  callback: Function,
  mode: string,
  extra: boolean,
): string {
  if (items.length > 0) {
    for (const item of items) {
      if (item > 0) {
        while (item > 1) {
          if (item % 2 === 0) {
            if (mode === 'fast') {
              return 'fast-path';
            } else if (mode === 'slow') {
              return 'slow-path';
            } else if (mode === 'normal') {
              return 'normal-path';
            }
          } else {
            if (extra) {
              return 'extra-odd';
            }
          }
        }
      } else if (item < -10) {
        return 'negative';
      } else if (item === 0) {
        return 'zero';
      }
    }
  } else if (extra) {
    return 'extra';
  } else {
    return 'empty';
  }
  return 'default';
}

export function validateInput(
  value: unknown,
  type: string,
  required: boolean,
  min: number,
  max: number,
  pattern: string,
): boolean {
  if (required) {
    if (value === null || value === undefined) {
      return false;
    }
  }
  if (type === 'number') {
    if (typeof value === 'number') {
      if (value < min) {
        return false;
      } else if (value > max) {
        return false;
      }
    } else {
      return false;
    }
  } else if (type === 'string') {
    if (typeof value === 'string') {
      if (pattern) {
        if (!new RegExp(pattern).test(value)) {
          return false;
        }
      }
    } else {
      return false;
    }
  }
  return true;
}

export function parseConfig(
  raw: string,
  strict: boolean,
  fallback: object,
  schema: object,
  version: number,
  debug: boolean,
): object {
  if (raw && raw.length > 0) {
    try {
      if (strict) {
        if (version >= 2) {
          if (debug) {
            console.log('Parsing in strict v2 mode');
          }
          return JSON.parse(raw);
        } else {
          return JSON.parse(raw);
        }
      } else {
        return JSON.parse(raw);
      }
    } catch {
      if (strict) {
        throw new Error('Parse failed in strict mode');
      }
      return fallback;
    }
  }
  return fallback;
}
