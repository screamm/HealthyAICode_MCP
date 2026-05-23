// packages/core/tests/ai-audit/ai-smell-detector.test.ts
import { describe, it, expect } from 'vitest';
import {
  detectAbstractionLeakage,
  detectHardcodedAssumptions,
  detectMissingEdgeCases,
  detectStyleInconsistency,
} from '../../src/ai-audit/enhanced-checks';

describe('detectAbstractionLeakage', () => {
  it('flags destructuring parameter with more than 3 fields', () => {
    const code = `
      function processUser({
        id, name, email, age, role
      }: { id: string; name: string; email: string; age: number; role: string }) {
        return name;
      }
    `;
    const smells = detectAbstractionLeakage(code, 'typescript');
    expect(smells.some(s => s.type === 'AbstractionLeakage')).toBe(true);
  });

  it('flags inline parameter type with 4+ fields', () => {
    const code = `
      function processOrder(order: { orderId: string; customerId: string; total: number; currency: string; status: string }) {
        return order.total;
      }
    `;
    const smells = detectAbstractionLeakage(code, 'typescript');
    expect(smells.some(s => s.type === 'AbstractionLeakage')).toBe(true);
  });

  it('does NOT flag parameter with named interface type', () => {
    const code = `
      function processUser(user: User) {
        return user.name;
      }
    `;
    const smells = detectAbstractionLeakage(code, 'typescript');
    expect(smells.filter(s => s.type === 'AbstractionLeakage')).toHaveLength(0);
  });

  it('does NOT flag destructuring with only 3 fields', () => {
    const code = `function greet({ name, age, city }: { name: string; age: number; city: string }) { return name; }`;
    const smells = detectAbstractionLeakage(code, 'typescript');
    expect(smells.filter(s => s.type === 'AbstractionLeakage')).toHaveLength(0);
  });

  it('returns AiSpecificSmell with correct type', () => {
    const code = `function fn({ a, b, c, d, e }: { a: string; b: string; c: string; d: string; e: string }) { return a; }`;
    const smells = detectAbstractionLeakage(code, 'typescript');
    const leakage = smells.find(s => s.type === 'AbstractionLeakage');
    expect(leakage).toBeDefined();
    expect(leakage?.severity).toBe('medium');
    expect(leakage?.description).toBeTruthy();
    expect(leakage?.suggestion).toBeTruthy();
  });
});

describe('detectHardcodedAssumptions', () => {
  it('flags magic number in if-condition comparison', () => {
    const code = `
      function retry(fn: () => void, count: number) {
        if (count > 3) throw new Error('Max retries exceeded');
        fn();
      }
    `;
    const smells = detectHardcodedAssumptions(code, 'typescript');
    expect(smells.some(s => s.type === 'HardcodedAssumption')).toBe(true);
  });

  it('does NOT flag when named constant is used', () => {
    const code = `
      const MAX_RETRIES = 3;
      function retry(fn: () => void, count: number) {
        if (count > MAX_RETRIES) throw new Error('Max retries exceeded');
        fn();
      }
    `;
    const smells = detectHardcodedAssumptions(code, 'typescript');
    expect(smells.filter(s => s.type === 'HardcodedAssumption')).toHaveLength(0);
  });

  it('does NOT flag trivial values 0 and 1', () => {
    const code = `if (count > 0) doSomething(); if (items.length > 1) process();`;
    const smells = detectHardcodedAssumptions(code, 'typescript');
    expect(smells.filter(s => s.type === 'HardcodedAssumption')).toHaveLength(0);
  });

  it('flags timeout magic number', () => {
    const code = `if (elapsed > 5000) throw new Error('Timeout');`;
    const smells = detectHardcodedAssumptions(code, 'typescript');
    expect(smells.some(s => s.type === 'HardcodedAssumption')).toBe(true);
  });

  it('returns smell with correct structure', () => {
    const code = `if (retries >= 10) return null;`;
    const smells = detectHardcodedAssumptions(code, 'typescript');
    const smell = smells.find(s => s.type === 'HardcodedAssumption');
    expect(smell?.severity).toBe('low');
    expect(smell?.line).toBeGreaterThan(0);
  });
});

describe('detectMissingEdgeCases', () => {
  it('flags Array.find() without null check', () => {
    const code = `
      function getUserName(users: User[], id: string): string {
        return users.find(u => u.id === id).name;
      }
    `;
    const smells = detectMissingEdgeCases(code, 'typescript');
    expect(smells.some(s => s.type === 'MissingEdgeCase')).toBe(true);
  });

  it('does NOT flag find() with optional chaining', () => {
    const code = `
      function getUserName(users: User[], id: string): string | undefined {
        return users.find(u => u.id === id)?.name;
      }
    `;
    const smells = detectMissingEdgeCases(code, 'typescript');
    expect(smells.filter(s => s.type === 'MissingEdgeCase')).toHaveLength(0);
  });

  it('flags async function with await but no try/catch', () => {
    const code = `
      async function fetchData(url: string) {
        const result = await fetch(url);
        return result.json();
      }
    `;
    const smells = detectMissingEdgeCases(code, 'typescript');
    expect(smells.some(s => s.type === 'MissingEdgeCase')).toBe(true);
  });

  it('does NOT flag async function with try/catch', () => {
    const code = `
      async function fetchData(url: string) {
        try {
          const result = await fetch(url);
          return result.json();
        } catch (err) {
          console.error(err);
        }
      }
    `;
    const smells = detectMissingEdgeCases(code, 'typescript');
    expect(smells.filter(s => s.type === 'MissingEdgeCase')).toHaveLength(0);
  });

  it('returns smell with correct type and severity', () => {
    const code = `function find(items: string[], val: string) { return items.find(i => i === val).length; }`;
    const smells = detectMissingEdgeCases(code, 'typescript');
    const smell = smells.find(s => s.type === 'MissingEdgeCase');
    expect(smell).toBeDefined();
    expect(smell?.severity).toMatch(/high|medium|low/);
  });
});

describe('detectStyleInconsistency', () => {
  it('flags snake_case variable in camelCase file', () => {
    const existingStyle = { convention: 'camelCase' as const };
    const code = `
      const user_name = 'Alice';
      const userEmail = 'alice@example.com';
    `;
    const smells = detectStyleInconsistency(code, existingStyle, 'typescript');
    expect(smells.some(s => s.type === 'StyleInconsistency')).toBe(true);
  });

  it('does NOT flag consistent camelCase', () => {
    const existingStyle = { convention: 'camelCase' as const };
    const code = `
      const userName = 'Alice';
      const userEmail = 'alice@example.com';
    `;
    const smells = detectStyleInconsistency(code, existingStyle, 'typescript');
    expect(smells.filter(s => s.type === 'StyleInconsistency')).toHaveLength(0);
  });

  it('flags camelCase in snake_case project', () => {
    const existingStyle = { convention: 'snake_case' as const };
    const code = `const userName = 'Alice';`;
    const smells = detectStyleInconsistency(code, existingStyle, 'typescript');
    expect(smells.some(s => s.type === 'StyleInconsistency')).toBe(true);
  });

  it('does NOT flag consistent snake_case', () => {
    const existingStyle = { convention: 'snake_case' as const };
    const code = `const user_name = 'Alice'; const user_email = 'a@b.com';`;
    const smells = detectStyleInconsistency(code, existingStyle, 'typescript');
    expect(smells.filter(s => s.type === 'StyleInconsistency')).toHaveLength(0);
  });

  it('returns smell with correct structure', () => {
    const existingStyle = { convention: 'camelCase' as const };
    const code = `const first_name = 'Bob';`;
    const smells = detectStyleInconsistency(code, existingStyle, 'typescript');
    const smell = smells.find(s => s.type === 'StyleInconsistency');
    expect(smell?.severity).toBe('low');
    expect(smell?.description).toContain('snake_case');
    expect(smell?.suggestion).toContain('camelCase');
  });
});
