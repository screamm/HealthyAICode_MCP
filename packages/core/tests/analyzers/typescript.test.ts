import { describe, it, expect } from 'vitest';
import { analyzeTypeScript } from '../../src/analyzers/typescript';

// ---- Helper code snippets ----

const SIMPLE_FUNCTION = `
export function add(a: number, b: number): number {
  return a + b;
}
`.trim();

const COMPLEX_FUNCTION = `
export function processItems(items: number[]): string {
  if (items.length > 0) {
    for (const item of items) {
      if (item > 0) {
        while (item > 1) {
          if (item % 2 === 0) {
            if (item > 100) {
              return 'large-even';
            }
          }
        }
      } else if (item < -10) {
        return 'negative-large';
      }
    }
  } else {
    return 'empty';
  }
  return 'default';
}
`.trim();

const ARROW_FUNCTION = `
const multiply = (a: number, b: number): number => a * b;
`.trim();

const MANY_PARAMS = `
function doSomething(a: string, b: number, c: boolean, d: object, e: string, f: number): void {
  console.log(a, b, c, d, e, f);
}
`.trim();

const EMPTY_FILE = ``;

const TWO_FUNCTIONS = `
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

function farewell(name: string): string {
  return \`Goodbye, \${name}!\`;
}
`.trim();

// ---- Tests ----

describe('analyzeTypeScript — function detection', () => {
  it('detects one function declaration', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions).toHaveLength(1);
    expect(functions[0].name).toBe('add');
  });

  it('reports correct start line for function', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions[0].line).toBe(1);
  });

  it('detects arrow function', () => {
    const { functions } = analyzeTypeScript(ARROW_FUNCTION);
    expect(functions).toHaveLength(1);
  });

  it('exported const arrow function has its variable name', () => {
    const code = `export const multiply = (a: number, b: number): number => a * b;`;
    const { functions } = analyzeTypeScript(code);
    expect(functions).toHaveLength(1);
    expect(functions[0].name).toBe('multiply');
  });

  it('detects two functions in same file', () => {
    const { functions } = analyzeTypeScript(TWO_FUNCTIONS);
    expect(functions).toHaveLength(2);
  });

  it('returns empty functions array for empty file', () => {
    const { functions } = analyzeTypeScript(EMPTY_FILE);
    expect(functions).toHaveLength(0);
  });
});

describe('analyzeTypeScript — cyclomatic complexity', () => {
  it('simple function has cyclomaticComplexity of 1', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions[0].cyclomaticComplexity).toBe(1);
  });

  it('function with if/for/while/if/if has complexity > 5', () => {
    const { functions } = analyzeTypeScript(COMPLEX_FUNCTION);
    expect(functions[0].cyclomaticComplexity).toBeGreaterThan(5);
  });

  it('function with logical && increases complexity', () => {
    const code = `
function check(a: number, b: number): boolean {
  return a > 0 && b > 0;
}`.trim();
    const { functions } = analyzeTypeScript(code);
    // base(1) + if-like && (1) = 2
    expect(functions[0].cyclomaticComplexity).toBeGreaterThanOrEqual(2);
  });
});

describe('analyzeTypeScript — nesting depth', () => {
  it('simple function has nestingDepth of 0', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions[0].nestingDepth).toBe(0);
  });

  it('deeply nested function has nestingDepth > 3', () => {
    const { functions } = analyzeTypeScript(COMPLEX_FUNCTION);
    expect(functions[0].nestingDepth).toBeGreaterThan(3);
  });
});

describe('analyzeTypeScript — parameter count', () => {
  it('function with two params has parameterCount 2', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions[0].parameterCount).toBe(2);
  });

  it('function with six params has parameterCount 6', () => {
    const { functions } = analyzeTypeScript(MANY_PARAMS);
    expect(functions[0].parameterCount).toBe(6);
  });

  it('function with no params has parameterCount 0', () => {
    const code = `function noop(): void {}`.trim();
    const { functions } = analyzeTypeScript(code);
    expect(functions[0].parameterCount).toBe(0);
  });
});

describe('analyzeTypeScript — function length', () => {
  it('single-line function body has length >= 1', () => {
    const { functions } = analyzeTypeScript(SIMPLE_FUNCTION);
    expect(functions[0].length).toBeGreaterThanOrEqual(1);
  });
});

describe('analyzeTypeScript — metrics', () => {
  it('empty file has totalLines >= 0', () => {
    const { metrics } = analyzeTypeScript(EMPTY_FILE);
    expect(metrics.totalLines).toBeGreaterThanOrEqual(0);
  });

  it('totalLines matches line count of code', () => {
    const { metrics } = analyzeTypeScript(SIMPLE_FUNCTION);
    const expected = SIMPLE_FUNCTION.split('\n').length;
    expect(metrics.totalLines).toBe(expected);
  });

  it('metrics.maxNestingDepth equals max over all functions', () => {
    const { functions, metrics } = analyzeTypeScript(TWO_FUNCTIONS);
    const maxDepth = Math.max(...functions.map(f => f.nestingDepth));
    expect(metrics.maxNestingDepth).toBe(maxDepth);
  });

  it('metrics.maxParameterCount equals max over all functions', () => {
    const { functions, metrics } = analyzeTypeScript(MANY_PARAMS);
    const maxParams = Math.max(...functions.map(f => f.parameterCount));
    expect(metrics.maxParameterCount).toBe(maxParams);
  });

  it('empty file metrics have sensible zero defaults', () => {
    const { metrics } = analyzeTypeScript(EMPTY_FILE);
    expect(metrics.cyclomaticComplexity).toBeGreaterThanOrEqual(1);
    expect(metrics.avgFunctionLength).toBe(0);
    expect(metrics.maxFunctionLength).toBe(0);
  });
});
