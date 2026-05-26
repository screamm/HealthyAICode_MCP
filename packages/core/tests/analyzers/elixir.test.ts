import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeElixir } from '../../src/analyzers/elixir';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('analyzeElixir (Tier A)', () => {
  describe('basic function detection', () => {
    it('detects a def declaration', () => {
      const code = 'def add(a, b), do: a + b';
      const result = analyzeElixir(code, 'math.ex');
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('add');
    });

    it('detects a defp declaration', () => {
      const code = 'defp validate(user), do: :ok';
      const result = analyzeElixir(code, 'service.ex');
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('validate');
    });

    it('detects multiple def declarations', () => {
      const code = `
def add(a, b), do: a + b
def subtract(a, b), do: a - b
def multiply(a, b), do: a * b
`;
      const result = analyzeElixir(code, 'math.ex');
      expect(result.functions).toHaveLength(3);
      expect(result.functions.map(f => f.name)).toContain('add');
      expect(result.functions.map(f => f.name)).toContain('subtract');
      expect(result.functions.map(f => f.name)).toContain('multiply');
    });

    it('detects def inside a defmodule', () => {
      const code = `
defmodule Foo do
  def bar(x), do: x + 1
  defp baz(x), do: x - 1
end
`;
      const result = analyzeElixir(code, 'foo.ex');
      expect(result.functions.some(f => f.name === 'bar')).toBe(true);
      expect(result.functions.some(f => f.name === 'baz')).toBe(true);
    });

    it('handles multi-clause functions', () => {
      const code = `
def multi_clause(0), do: :zero
def multi_clause(n) when n > 0, do: :positive
def multi_clause(_), do: :negative
`;
      const result = analyzeElixir(code, 'multi.ex');
      expect(result.functions).toHaveLength(3);
      expect(result.functions.every(f => f.name === 'multi_clause')).toBe(true);
    });

    it('handles empty input without throwing', () => {
      expect(() => analyzeElixir('', 'empty.ex')).not.toThrow();
      const result = analyzeElixir('', 'empty.ex');
      expect(result.functions).toHaveLength(0);
    });

    it('returns valid metrics', () => {
      const code = 'def add(a, b), do: a + b';
      const result = analyzeElixir(code, 'add.ex');
      expect(result.metrics).toHaveProperty('totalLines');
      expect(result.metrics).toHaveProperty('cyclomaticComplexity');
    });
  });

  describe('parameter counting', () => {
    it('counts parameters correctly', () => {
      const code = 'def greet(name, age, greeting), do: "#{greeting} #{name}"';
      const result = analyzeElixir(code, 'greet.ex');
      expect(result.functions[0].parameterCount).toBe(3);
    });

    it('counts zero params for no-param function', () => {
      const code = 'def hello(), do: "hello"';
      const result = analyzeElixir(code, 'hello.ex');
      expect(result.functions[0].parameterCount).toBe(0);
    });

    it('handles when guard correctly', () => {
      const code = 'def classify(x) when is_integer(x), do: :integer';
      const result = analyzeElixir(code, 'classify.ex');
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('classify');
      expect(result.functions[0].parameterCount).toBe(1);
    });
  });

  describe('cyclomatic complexity', () => {
    it('simple function has CC of 1', () => {
      const code = 'def add(a, b), do: a + b';
      const result = analyzeElixir(code, 'add.ex');
      expect(result.functions[0].cyclomaticComplexity).toBe(1);
    });

    it('if expression increments CC', () => {
      const code = `
def classify(x) do
  if x > 0 do
    :positive
  else
    :non_positive
  end
end
`;
      const result = analyzeElixir(code, 'classify.ex');
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(1);
    });

    it('case expression increments CC', () => {
      const code = `
def describe(x) do
  case x do
    1 -> "one"
    2 -> "two"
    _ -> "other"
  end
end
`;
      const result = analyzeElixir(code, 'describe.ex');
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(2);
    });

    it('cond expression increments CC', () => {
      const code = `
def classify(x) do
  cond do
    x < 0 -> :negative
    x == 0 -> :zero
    true -> :positive
  end
end
`;
      const result = analyzeElixir(code, 'classify.ex');
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(2);
    });
  });

  describe('nesting depth', () => {
    it('detects non-zero nesting depth for nested constructs', () => {
      const code = `
def nested(x, y) do
  if x > 0 do
    case y do
      :a -> :ok
      :b -> :error
    end
  end
end
`;
      const result = analyzeElixir(code, 'nested.ex');
      expect(result.functions[0].nestingDepth).toBeGreaterThanOrEqual(2);
    });
  });

  describe('smell detection', () => {
    it('detects SATD in Elixir comments', () => {
      const code = `
def hack() do
  # TODO: replace with proper implementation
  :ok
end
`;
      const result = analyzeElixir(code, 'hack.ex');
      expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
    });

    it('no false-positive SATD on clean code', () => {
      const code = 'def add(a, b), do: a + b';
      const result = analyzeElixir(code, 'clean.ex');
      expect(result.smells.filter(s => s.type === 'SATD')).toHaveLength(0);
    });

    it('smells is always an array', () => {
      const result = analyzeElixir('def add(a, b), do: a + b', 'add.ex');
      expect(Array.isArray(result.smells)).toBe(true);
    });
  });

  describe('healthy fixture — simple.ex', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'simple.ex'), 'utf-8');
    let result: ReturnType<typeof analyzeElixir>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeElixir(code); }).not.toThrow();
    });

    it('detects functions', () => {
      result = analyzeElixir(code);
      expect(result.functions.length).toBeGreaterThan(0);
    });

    it('detects add function', () => {
      result = analyzeElixir(code);
      expect(result.functions.some(f => f.name === 'add')).toBe(true);
    });

    it('healthy code has low cyclomatic complexity', () => {
      result = analyzeElixir(code);
      const maxCC = Math.max(...result.functions.map(f => f.cyclomaticComplexity));
      expect(maxCC).toBeLessThanOrEqual(2);
    });
  });

  describe('unhealthy fixture — complex.ex', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'complex.ex'), 'utf-8');
    let result: ReturnType<typeof analyzeElixir>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeElixir(code); }).not.toThrow();
    });

    it('detects process_order function', () => {
      result = analyzeElixir(code);
      expect(result.functions.some(f => f.name === 'process_order')).toBe(true);
    });

    it('complex function has high cyclomatic complexity', () => {
      result = analyzeElixir(code);
      const fn = result.functions.find(f => f.name === 'process_order');
      expect(fn?.cyclomaticComplexity).toBeGreaterThan(5);
    });

    it('detects SATD comment', () => {
      result = analyzeElixir(code);
      expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
    });
  });
});
