import Parser from 'tree-sitter';
import Julia from 'tree-sitter-julia';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

const parser = new Parser();
type ParserLanguage = Parameters<(typeof parser)['setLanguage']>[0];
parser.setLanguage(Julia as unknown as ParserLanguage);

// Node types that increase cyclomatic complexity
const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement',    // if / elseif / else
  'elseif_clause',   // elseif branch (each adds a path)
  'else_clause',     // else branch
  'for_statement',   // for loop
  'while_statement', // while loop
  'try_statement',   // try block
  'catch_clause',    // catch clause
]);

// Nesting depth contributors
const NESTING_NODE_TYPES = new Set([
  'if_statement',
  'for_statement',
  'while_statement',
  'try_statement',
]);

export function analyzeJulia(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  if (!code || code.trim() === '') {
    return {
      functions: [],
      smells: detectSATDFromText(code),
      metrics: emptyMetrics(0),
    };
  }

  const tree = parser.parse(code);
  const fns: FunctionResult[] = [];

  function visit(node: Parser.SyntaxNode): void {
    if (node.type === 'function_definition') {
      fns.push(extractFunction(node));
      // Recurse to catch nested functions
      for (const child of node.children) visit(child);
      return;
    }
    // Short-form: foo(args) = expr — assignment where LHS is a call_expression
    if (node.type === 'assignment') {
      const lhs = node.namedChildren[0];
      if (lhs?.type === 'call_expression') {
        fns.push(extractShortFormFunction(node));
        return;
      }
    }
    for (const child of node.children) visit(child);
  }
  visit(tree.rootNode);

  const totalLines = code.split('\n').length;
  const smells: Smell[] = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ];

  return { functions: fns, metrics: buildSimpleMetrics(fns, totalLines), smells };
}

function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const { name, paramCount } = getJuliaFunctionMeta(node);
  return {
    name,
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: computeCC(node),
    cognitiveComplexity: 0,
    nestingDepth: computeNesting(node),
    parameterCount: paramCount,
    smells: [],
  };
}

function extractShortFormFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const callNode = node.namedChildren[0]; // call_expression
  const name = callNode?.namedChildren[0]?.text ?? '<anonymous>';
  const argList = callNode?.namedChildren.find(c => c.type === 'argument_list');
  const paramCount = argList
    ? argList.namedChildren.filter(c => c.type !== ',').length
    : 0;
  return {
    name,
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: 1, // short-form functions are always single-expression
    cognitiveComplexity: 0,
    nestingDepth: 0,
    parameterCount: paramCount,
    smells: [],
  };
}

function getJuliaFunctionMeta(node: Parser.SyntaxNode): { name: string; paramCount: number } {
  // function_definition has a 'signature' child, which contains a call_expression
  const signature = node.namedChildren.find(c => c.type === 'signature');
  if (!signature) return { name: '<anonymous>', paramCount: 0 };

  const callExpr = signature.namedChildren.find(c => c.type === 'call_expression');
  if (!callExpr) return { name: '<anonymous>', paramCount: 0 };

  const name = callExpr.namedChildren[0]?.text ?? '<anonymous>';
  const argList = callExpr.namedChildren.find(c => c.type === 'argument_list');
  const paramCount = argList
    ? argList.namedChildren.filter(c => c.type !== ',').length
    : 0;

  return { name, paramCount };
}

function computeCC(node: Parser.SyntaxNode): number {
  let cc = 1;
  function traverse(n: Parser.SyntaxNode): void {
    if (CYCLOMATIC_NODE_TYPES.has(n.type)) cc++;
    for (const child of n.children) traverse(child);
  }
  traverse(node);
  return cc;
}

function computeNesting(node: Parser.SyntaxNode): number {
  let maxDepth = 0;
  function traverse(n: Parser.SyntaxNode, depth: number): void {
    const isNesting = NESTING_NODE_TYPES.has(n.type);
    const newDepth = isNesting ? depth + 1 : depth;
    if (isNesting) maxDepth = Math.max(maxDepth, newDepth);
    for (const child of n.children) traverse(child, newDepth);
  }
  traverse(node, 0);
  return maxDepth;
}

function emptyMetrics(totalLines: number): MetricBreakdown {
  return {
    cyclomaticComplexity: 1,
    cognitiveComplexity: 0,
    maxNestingDepth: 0,
    avgFunctionLength: 0,
    maxFunctionLength: 0,
    avgParameterCount: 0,
    maxParameterCount: 0,
    totalLines,
    duplicationScore: 0,
  };
}
