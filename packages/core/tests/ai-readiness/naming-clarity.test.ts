import { describe, it, expect } from 'vitest';
import { analyzeNamingClarity } from '../../src/ai-readiness/naming-clarity';

describe('analyzeNamingClarity', () => {
  it('gives a high score to well-named identifiers', () => {
    const src = `
      function calculateOrderTotal(orderItems) {
        const subtotal = orderItems.reduce((sum, item) => sum + item.price, 0);
        const tax = subtotal * 0.25;
        return subtotal + tax;
      }
    `;
    const result = analyzeNamingClarity(src, 'javascript');
    expect(result.score).toBeGreaterThanOrEqual(8);
    expect(result.singleCharVars).toBe(0);
  });

  it('penalises cryptic single-letter variables', () => {
    const src = `
      function f(a, b) {
        const x = a + b;
        const y = a - b;
        const z = x * y;
        return z;
      }
    `;
    const result = analyzeNamingClarity(src, 'javascript');
    expect(result.singleCharVars).toBeGreaterThanOrEqual(4);
    expect(result.score).toBeLessThan(8);
  });

  it('whitelists common loop indices (i, j, k)', () => {
    const src = `
      function multiply(matrixA, matrixB) {
        for (let i = 0; i < matrixA.length; i++) {
          for (let j = 0; j < matrixB.length; j++) {
            result[i][j] = matrixA[i][j] * matrixB[j][i];
          }
        }
      }
    `;
    const result = analyzeNamingClarity(src, 'javascript');
    expect(result.singleCharVars).toBe(0);
  });

  it('flags cryptic short names like tmp, fn, x1', () => {
    const src = `
      function process(tmp, x1) {
        const ab = tmp + x1;
        return ab;
      }
    `;
    const result = analyzeNamingClarity(src, 'javascript');
    expect(result.crypticNames.length).toBeGreaterThan(0);
  });

  it('flags mixed camelCase / snake_case in the same file', () => {
    const src = `
      function calculate_total(order_items) {
        const lineTotal = order_items.reduce((sum, item) => sum + item.price, 0);
        return lineTotal;
      }
    `;
    const result = analyzeNamingClarity(src, 'python');
    expect(result.inconsistentCasing).toBe(1);
  });

  it('clamps the score to the [0, 10] range', () => {
    const cryptic = Array.from({ length: 50 }, (_, idx) => `const a${idx % 10} = ${idx};`).join('\n');
    const result = analyzeNamingClarity(cryptic, 'javascript');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(10);
  });
});
