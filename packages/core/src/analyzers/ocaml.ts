import Parser from 'tree-sitter';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';

// tree-sitter-ocaml uses `export = {ocaml, ocaml_interface, ocaml_type}` (CJS object),
// so we use require() to destructure without TypeScript's esModuleInterop restrictions.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ocaml: OCamlGrammar } = require('tree-sitter-ocaml') as { ocaml: unknown };

const parser = new Parser();
type ParserLanguage = Parameters<(typeof parser)['setLanguage']>[0];
parser.setLanguage(OCamlGrammar as ParserLanguage);

// Node types that increase cyclomatic complexity
const CYCLOMATIC_NODE_TYPES = new Set([
  'if_expression',    // if/then/else
  'match_case',       // each branch in a match expression
  'try_expression',   // try block
  'for_expression',   // for loop
  'while_expression', // while loop
]);

// Nesting depth contributors
const NESTING_NODE_TYPES = new Set([
  'if_expression',
  'match_expression',
  'for_expression',
  'while_expression',
  'try_expression',
]);

// OCaml function is a let_binding with at least one parameter
// The binding lives inside a value_definition node.
const FUNCTION_DEF_TYPE = 'value_definition';

export function analyzeOCaml(code: string, filePath = '<inline>'): {
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
    if (node.type === FUNCTION_DEF_TYPE) {
      const binding = node.namedChildren.find(c => c.type === 'let_binding');
      if (binding && isFunction(binding)) {
        fns.push(extractFunction(binding));
        // Don't recurse — nested let definitions will be handled as part of parent
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

/** Returns true if the let_binding node has at least one 'parameter' child (making it a function). */
function isFunction(binding: Parser.SyntaxNode): boolean {
  return binding.namedChildren.some(c => c.type === 'parameter');
}

function extractFunction(binding: Parser.SyntaxNode): FunctionResult {
  const startLine = binding.startPosition.row + 1;
  const endLine = binding.endPosition.row + 1;
  const nameNode = binding.namedChildren.find(c => c.type === 'value_name');
  const name = nameNode?.text ?? '<anonymous>';
  const paramCount = binding.namedChildren.filter(c => c.type === 'parameter').length;

  return {
    name,
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: computeCC(binding),
    cognitiveComplexity: 0,
    nestingDepth: computeNesting(binding),
    parameterCount: paramCount,
    smells: [],
  };
}

function computeCC(bindingNode: Parser.SyntaxNode): number {
  let cc = 1;
  function traverse(node: Parser.SyntaxNode): void {
    if (CYCLOMATIC_NODE_TYPES.has(node.type)) cc++;
    for (const child of node.children) traverse(child);
  }
  traverse(bindingNode);
  return cc;
}

function computeNesting(bindingNode: Parser.SyntaxNode): number {
  let maxDepth = 0;
  function traverse(node: Parser.SyntaxNode, depth: number): void {
    const isNesting = NESTING_NODE_TYPES.has(node.type);
    const newDepth = isNesting ? depth + 1 : depth;
    if (isNesting) maxDepth = Math.max(maxDepth, newDepth);
    for (const child of node.children) traverse(child, newDepth);
  }
  traverse(bindingNode, 0);
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
