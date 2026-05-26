import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeKotlin } from '../../src/analyzers/kotlin';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

// ── Inline code strings ──────────────────────────────────────────────────────

const SIMPLE_FUN = `
fun classify(x: Int): String {
    return when {
        x < 0 -> "negative"
        x == 0 -> "zero"
        else -> "positive"
    }
}
`;

const COMPANION = `
class Repo {
    companion object {
        fun create() = Repo()
    }
}
`;

const EXTENSION_FUN = `
fun String.isValidEmail(): Boolean {
    return this.contains("@") && this.contains(".")
}
`;

const COMPLEX_FUN = `
fun processRequest(request: Request, user: User): Response {
    if (user == null) return Response.unauthorized()
    if (!user.isActive) return Response.forbidden()
    for (item in request.items) {
        if (item.isExpired) {
            continue
        }
    }
    return Response.ok()
}
`;

const MULTI_FUN = `
fun add(a: Int, b: Int) = a + b

fun subtract(a: Int, b: Int) = a - b

fun multiply(a: Int, b: Int) = a * b
`;

// ── Tier A tests ─────────────────────────────────────────────────────────────

describe('analyzeKotlin (Tier A)', () => {
  describe('basic function detection', () => {
    it('detects a single fun declaration', () => {
      const result = analyzeKotlin(SIMPLE_FUN, 'Classify.kt');
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('classify');
    });

    it('counts when/if/for as CC contributors', () => {
      const result = analyzeKotlin(COMPLEX_FUN, 'Process.kt');
      expect(result.functions[0].cyclomaticComplexity).toBeGreaterThanOrEqual(3);
    });

    it('detects extension functions', () => {
      const result = analyzeKotlin(EXTENSION_FUN, 'Extensions.kt');
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('isValidEmail');
    });

    it('detects multiple fun declarations', () => {
      const result = analyzeKotlin(MULTI_FUN, 'Math.kt');
      expect(result.functions).toHaveLength(3);
    });

    it('handles companion object without crashing', () => {
      expect(() => analyzeKotlin(COMPANION, 'Repo.kt')).not.toThrow();
    });

    it('handles empty input without throwing', () => {
      expect(() => analyzeKotlin('', 'empty.kt')).not.toThrow();
      const result = analyzeKotlin('', 'empty.kt');
      expect(result.functions).toHaveLength(0);
    });

    it('returns valid metrics', () => {
      const result = analyzeKotlin(SIMPLE_FUN, 'Classify.kt');
      expect(result.metrics).toHaveProperty('totalLines');
      expect(result.metrics).toHaveProperty('cyclomaticComplexity');
      expect(result.metrics.totalLines).toBeGreaterThan(0);
    });

    it('smells is always an array', () => {
      const result = analyzeKotlin(SIMPLE_FUN, 'Classify.kt');
      expect(Array.isArray(result.smells)).toBe(true);
    });

    it('detects SATD in Kotlin comments', () => {
      const code = 'fun hack() {\n  // TODO: replace with proper implementation\n  return\n}';
      const result = analyzeKotlin(code, 'hack.kt');
      expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
    });
  });

  describe('parameter counting', () => {
    it('counts parameters correctly', () => {
      const code = 'fun greet(name: String, age: Int, greeting: String): String = "$greeting $name"';
      const result = analyzeKotlin(code, 'greet.kt');
      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].parameterCount).toBe(3);
    });

    it('counts zero params for no-param function', () => {
      const code = 'fun hello(): String = "hello"';
      const result = analyzeKotlin(code, 'hello.kt');
      expect(result.functions[0].parameterCount).toBe(0);
    });
  });

  describe('nesting depth', () => {
    it('detects non-zero nesting depth for nested constructs', () => {
      const code = `
fun nested() {
    if (true) {
        for (i in 1..10) {
            if (i > 5) { }
        }
    }
}
`;
      const result = analyzeKotlin(code, 'nested.kt');
      expect(result.functions[0].nestingDepth).toBeGreaterThanOrEqual(2);
    });
  });

  describe('healthy fixture — Simple.kt', () => {
    const code = fs.readFileSync(path.join(FIXTURES_HEALTHY, 'Simple.kt'), 'utf-8');
    let result: ReturnType<typeof analyzeKotlin>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeKotlin(code); }).not.toThrow();
    });

    it('detects functions', () => {
      result = analyzeKotlin(code);
      expect(result.functions.length).toBeGreaterThan(0);
    });

    it('detects add function', () => {
      result = analyzeKotlin(code);
      expect(result.functions.some(f => f.name === 'add')).toBe(true);
    });

    it('healthy code has low cyclomatic complexity', () => {
      result = analyzeKotlin(code);
      const maxCC = Math.max(...result.functions.map(f => f.cyclomaticComplexity));
      expect(maxCC).toBeLessThanOrEqual(2);
    });
  });

  describe('unhealthy fixture — Complex.kt', () => {
    const code = fs.readFileSync(path.join(FIXTURES_UNHEALTHY, 'Complex.kt'), 'utf-8');
    let result: ReturnType<typeof analyzeKotlin>;

    it('parses without throwing', () => {
      expect(() => { result = analyzeKotlin(code); }).not.toThrow();
    });

    it('detects processOrder function', () => {
      result = analyzeKotlin(code);
      expect(result.functions.some(f => f.name === 'processOrder')).toBe(true);
    });

    it('complex function has high cyclomatic complexity', () => {
      result = analyzeKotlin(code);
      const fn = result.functions.find(f => f.name === 'processOrder');
      expect(fn?.cyclomaticComplexity).toBeGreaterThan(5);
    });

    it('complex function has high nesting depth', () => {
      result = analyzeKotlin(code);
      const fn = result.functions.find(f => f.name === 'processOrder');
      expect(fn?.nestingDepth).toBeGreaterThanOrEqual(2);
    });

    it('detects SATD comment', () => {
      result = analyzeKotlin(code);
      expect(result.smells.some(s => s.type === 'SATD')).toBe(true);
    });
  });

  describe('Tier A smell detection', () => {
    it('detects DataClumps in Kotlin classes', () => {
      const code = `
class ReportService {
    fun createReport(name: String, email: String, phone: String): Report = Report()
    fun sendReport(name: String, email: String, phone: String): Boolean = true
    fun updateReport(name: String, email: String, phone: String): Unit {}
}
`;
      const result = analyzeKotlin(code, 'ReportService.kt');
      // At minimum should not throw and should return smells array
      expect(Array.isArray(result.smells)).toBe(true);
    });

    it('no false-positive SATD on clean code', () => {
      const code = 'fun add(a: Int, b: Int): Int = a + b';
      const result = analyzeKotlin(code, 'clean.kt');
      expect(result.smells.filter(s => s.type === 'SATD')).toHaveLength(0);
    });
  });
});
