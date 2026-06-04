import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectTidyOpportunity } from '../../src/smells/tidy-opportunity';
import { SMELL_WEIGHTS } from '../../src/scoring/weights';
import { analyzeCode } from '../../src';

const parser = new Parser();
parser.setLanguage((TypeScript as unknown as Record<string, unknown>).typescript);

const FN_TYPES = new Set([
  'function_declaration', 'method_definition', 'arrow_function', 'function_expression',
]);

function firstFunction(code: string): Parser.SyntaxNode {
  const tree = parser.parse(code);
  let found: Parser.SyntaxNode | null = null;
  function visit(n: Parser.SyntaxNode): void {
    if (found) return;
    if (FN_TYPES.has(n.type)) { found = n; return; }
    for (const c of n.children) visit(c);
  }
  visit(tree.rootNode);
  if (!found) throw new Error('no function found in fixture');
  return found;
}

describe('detectTidyOpportunity — below the advisory window', () => {
  it('returns null for a 0-chunk function', () => {
    const code = `function f(a) { return a + 1; }`;
    expect(detectTidyOpportunity(firstFunction(code))).toBeNull();
  });

  it('returns null for a 1-chunk function', () => {
    const code = `
      function f(a) {
        if (a) { doA(); }
      }
    `;
    expect(detectTidyOpportunity(firstFunction(code))).toBeNull();
  });
});

describe('detectTidyOpportunity — inside the 2–3 chunk window', () => {
  it('flags a 2-chunk function', () => {
    const code = `
      function checkout(order, customer) {
        if (customer.active) { apply(order); }
        for (const item of order.items) { register(item); }
      }
    `;
    const smell = detectTidyOpportunity(firstFunction(code));
    expect(smell).not.toBeNull();
    expect(smell!.type).toBe('TidyOpportunity');
    expect(smell!.chunkRanges).toHaveLength(2);
  });

  it('flags a 3-chunk function', () => {
    const code = `
      function f(a, xs, cond) {
        if (a) { doA(); }
        for (const x of xs) { doX(x); }
        while (cond) { doC(); }
      }
    `;
    const smell = detectTidyOpportunity(firstFunction(code));
    expect(smell).not.toBeNull();
    expect(smell!.chunkRanges).toHaveLength(3);
  });

  it('uses severity "low" (never "info" — the MCP severity enum has no "info")', () => {
    const code = `
      function f(a, xs) {
        if (a) { doA(); }
        for (const x of xs) { doX(x); }
      }
    `;
    expect(detectTidyOpportunity(firstFunction(code))!.severity).toBe('low');
  });
});

describe('detectTidyOpportunity — at or above the BumpyRoad threshold', () => {
  it('returns null for a 4-chunk function (BumpyRoad territory — never double-reported)', () => {
    const code = `
      function f(a, b, xs, cond) {
        if (a) { doA(); }
        if (b) { doB(); }
        for (const x of xs) { doX(x); }
        while (cond) { doC(); }
      }
    `;
    expect(detectTidyOpportunity(firstFunction(code))).toBeNull();
  });
});

describe('detectTidyOpportunity — nested chunks are NOT counted', () => {
  it('counts only top-level siblings (single outer if = 1 chunk → null)', () => {
    const code = `
      function outer(a, b, xs) {
        if (a) {
          if (b) {
            for (const x of xs) { use(x); }
          }
        }
      }
    `;
    expect(detectTidyOpportunity(firstFunction(code))).toBeNull();
  });
});

describe('detectTidyOpportunity — smell metadata', () => {
  it('includes functionName and start line', () => {
    const code =
`// pad line 1
function tidyHandler(a, xs) {
  if (a) { doA(); }
  for (const x of xs) { doX(x); }
}`;
    const smell = detectTidyOpportunity(firstFunction(code));
    expect(smell!.functionName).toBe('tidyHandler');
    expect(smell!.line).toBe(2);
  });

  it('suggestion mentions extraction', () => {
    const code = `
      function f(a, xs) {
        if (a) { doA(); }
        for (const x of xs) { doX(x); }
      }
    `;
    expect(detectTidyOpportunity(firstFunction(code))!.suggestion.toLowerCase()).toMatch(/extract|named/);
  });
});

describe('TidyOpportunity is non-scored (weight 0)', () => {
  it('has weight 0 in SMELL_WEIGHTS', () => {
    expect(SMELL_WEIGHTS.TidyOpportunity).toBe(0);
  });
});

describe('TidyOpportunity end-to-end via analyzeCode', () => {
  const twoChunkDocumented = `
/** Applies discount and shipping rules to an order. */
function checkout(order, customer) {
  if (customer.active) {
    apply(order);
  }
  for (const item of order.items) {
    register(item);
  }
}
`;
  const oneChunkDocumented = `
/** Applies a single rule to an order. */
function checkout(order, customer) {
  if (customer.active) {
    apply(order);
  }
}
`;

  it('surfaces a TidyOpportunity smell for a 2-chunk function', () => {
    const result = analyzeCode(twoChunkDocumented, 'javascript');
    expect(result.smells.some((s) => s.type === 'TidyOpportunity')).toBe(true);
  });

  it('does not lower the score (weight 0 → still 10.0)', () => {
    const result = analyzeCode(twoChunkDocumented, 'javascript');
    expect(result.score).toBe(10);
  });

  it('does not fire for a 1-chunk function', () => {
    const result = analyzeCode(oneChunkDocumented, 'javascript');
    expect(result.smells.some((s) => s.type === 'TidyOpportunity')).toBe(false);
  });

  it('is suppressed when the same function already has a scored smell (no redundant nudge)', () => {
    // Two top-level chunks (would normally be a TidyOpportunity) but CC ≈ 15 → ComplexMethod.
    // The function will be refactored for the real issue anyway, so the advisory is redundant.
    const complexButTwoChunks = `
/** Heavy branching but only two top-level chunks. */
function complexButTwoChunks(a, b, items) {
  if (a > 0 && b > 0 && a < 10 && b < 10 && a !== b && a + b > 5 && a * b < 50) {
    handle(a, b);
  }
  for (const x of items) {
    if (x.valid && x.ready && x.count > 0 && x.count < 100 && x.flag && !x.skip) process(x);
  }
}
`;
    const result = analyzeCode(complexButTwoChunks, 'javascript');
    expect(result.smells.some((s) => s.type === 'ComplexMethod')).toBe(true);
    expect(result.smells.some((s) => s.type === 'TidyOpportunity')).toBe(false);
  });

  it('is NOT suppressed by a non-structural smell (bilden checkoutOrder: 2 chunks + MagicNumber)', () => {
    // bilden's exact "before" example: 2 top-level chunks (for + if), low complexity (CC ~6, no
    // structural smell), but several magic numbers. MagicNumber is orthogonal to "extract each
    // chunk", so the tidy advisory must still be surfaced — this is the motivating case.
    const checkoutOrder = `
function checkoutOrder(order, customer) {
  let discount = 0;
  for (const item of order.items) {
    if (item.category === 'sale') {
      if (customer.tier === 'gold') {
        discount += item.price * 0.20;
      } else {
        discount += item.price * 0.10;
      }
    }
  }
  let shipping = 0;
  if (order.method === 'express') {
    if (order.weight > 5) {
      shipping = 25;
    } else {
      shipping = 15;
    }
  }
  return order.subtotal - discount + shipping;
}
`;
    const result = analyzeCode(checkoutOrder, 'javascript');
    expect(result.smells.some((s) => s.type === 'MagicNumber')).toBe(true);
    expect(result.smells.some((s) => s.type === 'TidyOpportunity')).toBe(true);
    // Score is unchanged by the advisory (weight 0): still 9.6, only the MagicNumber counts.
    expect(result.score).toBe(9.6);
  });
});
