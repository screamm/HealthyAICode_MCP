import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeScala } from '../../src/analyzers/scala';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

describe('analyzeScala (Tier A)', () => {
  describe('basic function detection', () => {
    it('detects a def declaration', () => {
      const code = 'def add(a: Int, b: Int): Int = a + b';
      const result = analyzeScala(code, 'math.scala');
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('add');
    });

    it('detects multiple def declarations', () => {
      const code = `
def add(a: Int, b: Int): Int = a + b
def subtract(a: Int, b: Int): Int = a - b
def multiply(a: Int, b: Int): Int = a * b
`;
      const result = analyzeScala(code, 'math.scala');
      expect(result.functions).toHaveLength(3);
      expect(result.functions.map(f => f.name)).toEqual(['add', 'subtract', 'multiply']);
    });

    it('detects def inside a class', () => {
      const code = `
class Foo {
  def bar(x: String): Int = x.length
  def baz(): Unit = {}
}
`;
      const result = analyzeScala(code, 'Foo.scala');
      expect(result.functions.length).toBeGreaterThanOrEqual(2);
      expect(result.functions.some(f => f.name === 'bar')).toBe(true);
      expect(result.functions.some(f => f.name === 'baz')).toBe(true);
    });

    it('detects def inside an object', () => {
      const code = `
object Utils {
  def helper(): String = "ok"
}
`;
      const result = analyzeScala(code, 'Utils.scala');
      expect(result.functions.some(f => f.name === 'helper')).toBe(true);
    });

    it('handles empty input without throwing', () => {
      expect(() => analyzeScala('', 'empty.scala')).not.toThrow();
      const result = analyzeScala('', 'empty.scala');
      expect(result.functions).toHaveLength(0);
    });

    it('returns valid metrics', () => {
      const code = 'def add(a: Int, b: Int): Int = a + b';
      const result = analyzeScala(code, 'add.scala');
      expect(result.metrics).toHaveProperty('totalLines');
      expect(result.metrics).toHaveProperty('cyclomaticComplexity');
    });
  });

  describe('parameter counting', () => {
    it('counts parameters correctly', () => {
      const code = 'def greet(name: String, age: Int, greeting: String): String = s"$greeting $name"';
      const result = analyzeScala(code, 'greet.scala');
      expect(result.functions[0].parameterCount).toBe(3);
    });

    it('counts zero params for no-param def', () => {
      const code = 'def hello(): String = "hello"';
      const result = analyzeScala(code, 'hello.scala');
      expect(result.functions[0].parameterCount).toBe(0);
    });
  });

  describe('cyclomatic complexity', () => {
    it('simple function has CC of 1', () => {
      const code = 'def add(a: Int, b: Int): Int = a + b';
      const result = analyzeScala(code, 'add.scala');
      expect(result.functions[0].cyclomaticComplexity).toBe(1);
    });

    it('if_expression increments CC', () => {
      const code = `
def classify(x: Int): String = {
  if (x < 0) "negative"
  else if (x == 0) "zero"
  else "positive"
}
`;
      const result = analyzeScala(code, 'classify.scala');
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(1);
    });

    it('case_clause increments CC', () => {
      const code = `
def describe(x: Int): String = x match {
  case 1 => "one"
  case 2 => "two"
  case _ => "other"
}
`;
      const result = analyzeScala(code, 'describe.scala');
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(2);
    });

    it('for_expression increments CC', () => {
      const code = `
def sumList(xs: List[Int]): Int = {
  var sum = 0
  for (x <- xs) sum += x
  sum
}
`;
      const result = analyzeScala(code, 'sum.scala');
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThan(1);
    });
  });

  describe('nesting depth', () => {
    it('detects non-zero nesting depth for nested constructs', () => {
      const code = `
def nested(): Unit = {
  if (true) {
    for (i <- 1 to 10) {
      if (i > 5) println(i)
    }
  }
}
`;
      const result = analyzeScala(code, 'nested.scala');
      expect(result.functions[0].nestingDepth).toBeGreaterThanOrEqual(2);
    });
  });

  describe('smell detection', () => {
    it('detects SATD in Scala comments', () => {
      const code = `
def hack(): Unit = {
  // TODO: replace with proper implementation
}
`;
      const result = analyzeScala(code, 'hack.scala');
      expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
    });

    it('no false-positive SATD on clean code', () => {
      const code = 'def add(a: Int, b: Int): Int = a + b';
      const result = analyzeScala(code, 'clean.scala');
      expect(result.smells.filter(s => s.type === 'SATD')).toHaveLength(0);
    });

    it('smells is always an array', () => {
      const result = analyzeScala('def add(a: Int, b: Int): Int = a + b', 'add.scala');
      expect(Array.isArray(result.smells)).toBe(true);
    });
  });

  describe('healthy fixture — simple.scala', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'simple.scala'), 'utf-8');
    let result: ReturnType<typeof analyzeScala>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeScala(code); }).not.toThrow();
    });

    it('detects functions', () => {
      result = analyzeScala(code);
      expect(result.functions.length).toBeGreaterThan(0);
    });

    it('detects add function', () => {
      result = analyzeScala(code);
      expect(result.functions.some(f => f.name === 'add')).toBe(true);
    });

    it('healthy code has low cyclomatic complexity', () => {
      result = analyzeScala(code);
      const maxCC = Math.max(...result.functions.map(f => f.cyclomaticComplexity));
      expect(maxCC).toBeLessThanOrEqual(2);
    });
  });

  describe('unhealthy fixture — complex.scala', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'complex.scala'), 'utf-8');
    let result: ReturnType<typeof analyzeScala>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeScala(code); }).not.toThrow();
    });

    it('detects processOrder function', () => {
      result = analyzeScala(code);
      expect(result.functions.some(f => f.name === 'processOrder')).toBe(true);
    });

    it('complex function has high cyclomatic complexity', () => {
      result = analyzeScala(code);
      const fn = result.functions.find(f => f.name === 'processOrder');
      expect(fn?.cyclomaticComplexity).toBeGreaterThan(5);
    });

    it('detects SATD comment', () => {
      result = analyzeScala(code);
      expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
    });
  });
});
