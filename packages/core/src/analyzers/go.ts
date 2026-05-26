import Parser from 'tree-sitter';
import Go from 'tree-sitter-go';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { buildSimpleMetrics } from './metrics-builder';
import { countCyclomaticNodes, calculateMaxNestingDepth } from './traversal-helpers';
import { detectSATDFromText, detectMagicNumbersFromText } from '../smells/text-detectors';
import { goProfile } from '../smells/language-profile';
import { detectGodClass } from '../smells/god-class';
import { detectFeatureEnvy } from '../smells/feature-envy';
import { detectMessageChain } from '../smells/message-chain';
import { detectDataClumps } from '../smells/data-clumps';
import { detectPrimitiveObsession } from '../smells/primitive-obsession';
import { detectComplexConditional } from '../smells/complex-conditional';
import { detectLowDocCoverage } from '../smells/doc-coverage';
import { detectBumpyRoadChunks } from '../smells/bumpy-road';

const parser = new Parser();
parser.setLanguage(Go as unknown as Parameters<(typeof parser)['setLanguage']>[0]);

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'expression_case', 'type_case',
  'select_statement', 'communication_case',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement', 'for_statement', 'select_statement',
]);

const FUNCTION_NODE_TYPES = new Set([
  'function_declaration', 'method_declaration', 'func_literal',
]);

function goBinaryCheck(n: Parser.SyntaxNode): boolean {
  if (n.type !== 'binary_expression') return false;
  const op = n.childForFieldName('operator')?.text;
  return op === '&&' || op === '||';
}

export function analyzeGo(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  const tree = parser.parse(code);
  const fnNodes: Parser.SyntaxNode[] = [];
  const fns: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (FUNCTION_NODE_TYPES.has(node.type)) {
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

  // AST-based profile detectors — Go has no imported type system concept,
  // so we pass an empty Set for god-class/feature-envy importedTypeNames.
  const emptyNames = new Set<string>();
  smells.push(
    ...detectGodClass(tree.rootNode, emptyNames, goProfile),
    ...detectFeatureEnvy(tree.rootNode, emptyNames, goProfile),
    ...detectMessageChain(tree.rootNode, goProfile),
    ...detectDataClumps(tree.rootNode, goProfile),
    ...detectPrimitiveObsession(tree.rootNode, goProfile),
    ...detectComplexConditional(tree.rootNode, goProfile),
    ...detectLowDocCoverage(tree.rootNode, code, goProfile),
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
  return {
    name: node.childForFieldName('name')?.text ?? '<anonymous>',
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: countCyclomaticNodes(node, CYCLOMATIC_NODE_TYPES, goBinaryCheck),
    cognitiveComplexity: 0,
    nestingDepth: calculateMaxNestingDepth(node, NESTING_NODE_TYPES),
    parameterCount: countParameters(node),
    smells: [],
  };
}

function countParameters(node: Parser.SyntaxNode): number {
  const params = node.childForFieldName('parameters');
  if (!params) return 0;
  // Go groups params: "a, b int" → two identifier children under one parameter_declaration
  let count = 0;
  for (const child of params.namedChildren) {
    if (child.type === 'parameter_declaration') {
      // Count the named identifiers in the declaration
      const names = child.namedChildren.filter(c => c.type === 'identifier');
      count += names.length > 0 ? names.length : 1;
    } else if (child.type === 'variadic_parameter_declaration') {
      count += 1;
    }
  }
  return count;
}
