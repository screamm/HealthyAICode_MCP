import { describe, it, expect } from 'vitest';
import { analyzeKotlin } from '../../src/analyzers/kotlin';

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

describe('analyzeKotlin', () => {
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
