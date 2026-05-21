import { describe, it, expect } from 'vitest';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { detectBumpyRoadChunks } from '../../src/smells/bumpy-road';

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

describe('detectBumpyRoadChunks — under threshold', () => {
  it('returns null for a single-chunk function', () => {
    const code = `
      function process() {
        if (true) { doA(); doB(); }
      }
    `;
    expect(detectBumpyRoadChunks(firstFunction(code))).toBeNull();
  });

  it('returns null for a 3-chunk function (below default threshold of 4)', () => {
    const code = `
      function process() {
        if (a) { doA(); }
        for (const x of xs) { doX(x); }
        while (cond) { doC(); }
      }
    `;
    expect(detectBumpyRoadChunks(firstFunction(code))).toBeNull();
  });
});

describe('detectBumpyRoadChunks — at or above threshold', () => {
  it('flags a 4-chunk function', () => {
    const code = `
      function process(req) {
        if (req.auth) { validate(req.auth); }
        for (const item of req.items) { enqueue(item); }
        if (req.flush) { drain(); }
        while (req.queue.length) { next(); }
      }
    `;
    const smell = detectBumpyRoadChunks(firstFunction(code));
    expect(smell).not.toBeNull();
    expect(smell!.type).toBe('BumpyRoad');
    expect(smell!.chunkRanges).toHaveLength(4);
  });

  it('chunk ranges have correct start/end lines', () => {
    const code =
`function process(req) {
  if (req.auth) {
    validate();
  }
  for (const item of req.items) {
    enqueue(item);
  }
  if (req.flush) {
    drain();
  }
  while (req.queue.length) {
    next();
  }
}`;
    const smell = detectBumpyRoadChunks(firstFunction(code));
    expect(smell!.chunkRanges![0]).toEqual({ startLine: 2, endLine: 4 });
    expect(smell!.chunkRanges![1]).toEqual({ startLine: 5, endLine: 7 });
    expect(smell!.chunkRanges![2]).toEqual({ startLine: 8, endLine: 10 });
    expect(smell!.chunkRanges![3]).toEqual({ startLine: 11, endLine: 13 });
  });

  it('flags a 5-chunk function with severity high', () => {
    const code = `
      function process() {
        if (a) { doA(); }
        if (b) { doB(); }
        for (const x of xs) { doX(x); }
        while (c) { doC(); }
        switch (d) { case 1: doD(); break; }
      }
    `;
    const smell = detectBumpyRoadChunks(firstFunction(code));
    expect(smell).not.toBeNull();
    expect(smell!.severity).toBe('high');
    expect(smell!.chunkRanges).toHaveLength(5);
  });
});

describe('detectBumpyRoadChunks — nested chunks are NOT counted', () => {
  it('counts only top-level siblings, not nested ones', () => {
    const code = `
      function outer() {
        if (a) {
          if (b) {
            for (const x of xs) { use(x); }
          }
          while (c) { doC(); }
        }
      }
    `;
    // Endast en sibling på toppnivå (yttersta if). Inget smell.
    expect(detectBumpyRoadChunks(firstFunction(code))).toBeNull();
  });

  it('flags 4 top-level siblings even when each contains nested control flow', () => {
    const code = `
      function process() {
        if (a) { if (a2) { doA(); } }
        for (const x of xs) { if (x.ok) { doX(x); } }
        if (b) { while (cond) { doB(); } }
        switch (d) { case 1: if (e) doE(); break; }
      }
    `;
    const smell = detectBumpyRoadChunks(firstFunction(code));
    expect(smell).not.toBeNull();
    expect(smell!.chunkRanges).toHaveLength(4);
  });
});

describe('detectBumpyRoadChunks — smell metadata', () => {
  it('includes functionName from the AST', () => {
    const code = `
      function bigHandler() {
        if (a) {} if (b) {} for (const x of xs) {} while (c) {}
      }
    `;
    const smell = detectBumpyRoadChunks(firstFunction(code));
    expect(smell!.functionName).toBe('bigHandler');
  });

  it('line is the start line of the function', () => {
    const code =
`// pad line 1
function bigHandler() {
  if (a) {}
  if (b) {}
  for (const x of xs) {}
  while (c) {}
}`;
    const smell = detectBumpyRoadChunks(firstFunction(code));
    expect(smell!.line).toBe(2);
  });

  it('description mentions chunk count', () => {
    const code = `
      function bigHandler() {
        if (a) {} if (b) {} for (const x of xs) {} while (c) {}
      }
    `;
    const smell = detectBumpyRoadChunks(firstFunction(code));
    expect(smell!.description).toContain('4');
  });

  it('suggestion mentions extraction', () => {
    const code = `
      function bigHandler() {
        if (a) {} if (b) {} for (const x of xs) {} while (c) {}
      }
    `;
    const smell = detectBumpyRoadChunks(firstFunction(code));
    expect(smell!.suggestion.toLowerCase()).toMatch(/extract|extrahera/);
  });
});
