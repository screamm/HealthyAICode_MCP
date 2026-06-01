import Parser from 'tree-sitter';
import { loadCSharpGrammar } from './csharp-grammar';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';
import { csharpProfile } from '../smells/language-profile';
import { detectGodClass } from '../smells/god-class';
import { detectFeatureEnvy } from '../smells/feature-envy';
import { detectMessageChain } from '../smells/message-chain';
import { detectDataClumps } from '../smells/data-clumps';
import { detectPrimitiveObsession } from '../smells/primitive-obsession';
import { detectComplexConditional } from '../smells/complex-conditional';
import { detectLowDocCoverage } from '../smells/doc-coverage';
import { computeCognitiveComplexity } from '../smells/cognitive-complexity';
import { detectBumpyRoadChunks } from '../smells/bumpy-road';

// Lazily initialise the parser on first use. The C# grammar binding ships as an
// async ES module (top-level await), so loading it at module-evaluation time would
// break `require()` of the compiled CJS bundle (ERR_REQUIRE_ASYNC_MODULE).
// `loadCSharpGrammar()` resolves it synchronously without degrading analysis.
let cachedParser: Parser | null = null;

function getCSharpParser(): Parser {
  if (cachedParser !== null) return cachedParser;
  const grammar = loadCSharpGrammar();
  const p = new Parser();
  p.setLanguage(grammar as unknown as Parameters<(typeof p)['setLanguage']>[0]);
  cachedParser = p;
  return p;
}

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'foreach_statement',
  'while_statement', 'do_statement', 'conditional_expression',
  'catch_clause', 'case_switch_label',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'foreach_statement',
  'while_statement', 'do_statement', 'try_statement',
]);

const METHOD_NODE_TYPES = new Set([
  'method_declaration', 'constructor_declaration', 'local_function_statement',
]);

function csharpBinaryCheck(n: Parser.SyntaxNode): boolean {
  if (n.type !== 'binary_expression') return false;
  const op = n.childForFieldName('operator')?.text;
  return op === '&&' || op === '||' || op === '??';
}

export function analyzeCSharp(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  const tree = getCSharpParser().parse(code);

  // Collect method nodes for per-function analysis
  const fnNodes: Parser.SyntaxNode[] = [];
  const fns: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (METHOD_NODE_TYPES.has(node.type)) {
      fnNodes.push(node);
      fns.push(extractFunction(node));
    }
    for (const child of node.children) visit(child);
  }
  visit(tree.rootNode);

  const totalLines = code === '' ? 0 : code.split('\n').length;

  // Text-based detectors (language-agnostic)
  const smells: Smell[] = [
    ...detectSATDFromText(code),
    ...detectMagicNumbersFromText(code, filePath),
  ];

  // AST-based profile detectors
  const emptyNames = new Set<string>();
  smells.push(
    ...detectGodClass(tree.rootNode, emptyNames, csharpProfile),
    ...detectFeatureEnvy(tree.rootNode, emptyNames, csharpProfile),
    ...detectMessageChain(tree.rootNode, csharpProfile),
    ...detectDataClumps(tree.rootNode, csharpProfile),
    ...detectPrimitiveObsession(tree.rootNode, csharpProfile),
    ...detectComplexConditional(tree.rootNode, csharpProfile),
    ...detectLowDocCoverage(tree.rootNode, code, csharpProfile),
  );

  // Per-function BumpyRoad detection
  for (const fnNode of fnNodes) {
    const br = detectBumpyRoadChunks(fnNode);
    if (br) smells.push(br);
  }

  return { functions: fns, metrics: buildSimpleMetrics(fns, totalLines), smells };
}

function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const params = node.childForFieldName('parameters');
  const paramCount = params
    ? params.namedChildren.filter(c => c.type === 'parameter').length
    : 0;
  return {
    name: node.childForFieldName('name')?.text ?? '<anonymous>',
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES, csharpBinaryCheck),
    cognitiveComplexity: computeCognitiveComplexity(node, csharpProfile),
    nestingDepth: calculateMaxNestingDepth(node, NESTING_NODE_TYPES),
    parameterCount: paramCount,
    smells: [],
  };
}
