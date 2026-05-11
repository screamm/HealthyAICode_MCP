import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { calculateCognitiveComplexity } from './cognitive-complexity';
import { detectTypeSafetyEscapes } from '../smells/type-safety-escape';
import { detectMagicNumbers } from '../smells/magic-number';
import { detectLowDocCoverage } from '../smells/doc-coverage';
import { detectComplexConditional } from '../smells/complex-conditional';
import { detectMessageChain } from '../smells/message-chain';
import { detectDataClumps } from '../smells/data-clumps';
import { detectSATD } from '../smells/satd';
import { detectGodClass } from '../smells/god-class';
import { detectFeatureEnvy } from '../smells/feature-envy';
import { computeMaintainability } from '../metrics/maintainability';

const parser = new Parser();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
parser.setLanguage((TypeScript as any).typescript);

const CYCLOMATIC_NODE_TYPES = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'for_of_statement',
  'while_statement',
  'do_statement',
  'ternary_expression',
  'catch_clause',
  'switch_case',
]);

const NESTING_NODE_TYPES = new Set([
  'if_statement',
  'for_statement',
  'for_in_statement',
  'for_of_statement',
  'while_statement',
  'do_statement',
  'switch_statement',
  'try_statement',
]);

const FUNCTION_NODE_TYPES = new Set([
  'function_declaration',
  'method_definition',
  'arrow_function',
  'function_expression',
]);

function calculateCyclomaticComplexity(node: Parser.SyntaxNode): number {
  let complexity = 1;

  function traverse(n: Parser.SyntaxNode): void {
    if (CYCLOMATIC_NODE_TYPES.has(n.type)) {
      complexity++;
    } else if (n.type === 'binary_expression') {
      const op = n.childForFieldName('operator')?.text;
      if (op === '&&' || op === '||' || op === '??') complexity++;
    }
    for (const child of n.children) traverse(child);
  }

  traverse(node);
  return complexity;
}

function calculateMaxNestingDepth(node: Parser.SyntaxNode): number {
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

function getParameterCount(node: Parser.SyntaxNode): number {
  const params = node.childForFieldName('parameters');
  if (!params) return 0;
  return params.namedChildren.filter(c => c.type !== 'comment').length;
}

function getFunctionName(node: Parser.SyntaxNode): string {
  if (node.type === 'function_declaration' || node.type === 'method_definition') {
    return node.childForFieldName('name')?.text ?? '<anonymous>';
  }
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') {
    return parent.childForFieldName('name')?.text ?? '<anonymous>';
  }
  return '<anonymous>';
}

function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;
  const name = getFunctionName(node);
  return {
    name,
    line: startLine,
    length: endLine - startLine + 1,
    cyclomaticComplexity: calculateCyclomaticComplexity(node),
    cognitiveComplexity: calculateCognitiveComplexity(node, name),
    nestingDepth: calculateMaxNestingDepth(node),
    parameterCount: getParameterCount(node),
    smells: [],
  };
}

function collectFunctions(root: Parser.SyntaxNode): FunctionResult[] {
  const functions: FunctionResult[] = [];
  function visit(node: Parser.SyntaxNode): void {
    if (FUNCTION_NODE_TYPES.has(node.type)) {
      functions.push(extractFunction(node));
    }
    for (const child of node.children) visit(child);
  }
  visit(root);
  return functions;
}

function extractImportedNames(root: Parser.SyntaxNode): Set<string> {
  const names = new Set<string>();
  for (const node of root.namedChildren) {
    if (node.type === 'import_declaration') {
      for (const child of node.namedChildren) {
        if (child.type === 'import_clause') {
          for (const id of child.namedChildren) {
            if (id.type === 'identifier') names.add(id.text);
          }
        }
      }
    }
  }
  return names;
}

export function analyzeTypeScript(code: string, filePath = '<inline>'): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
} {
  const tree = parser.parse(code);
  const rootNode = tree.rootNode;
  const functions = collectFunctions(rootNode);
  const totalLines = code === '' ? 0 : code.split('\n').length;

  const avgCC = functions.length > 0
    ? functions.reduce((s, f) => s + f.cyclomaticComplexity, 0) / functions.length
    : 1;
  const mi = computeMaintainability(rootNode, avgCC, totalLines);
  const metrics = buildMetrics(functions, totalLines, mi.index);

  const importedNames = extractImportedNames(rootNode);

  const smells: Smell[] = [
    ...(detectTypeSafetyEscapes(rootNode, code) as Smell[]),
    ...(detectMagicNumbers(rootNode, filePath) as Smell[]),
    ...(detectLowDocCoverage(rootNode, code) as Smell[]),
    ...detectComplexConditional(rootNode),
    ...detectMessageChain(rootNode),
    ...detectDataClumps(rootNode),
    ...detectSATD(rootNode),
    ...detectGodClass(rootNode, importedNames),
    ...detectFeatureEnvy(rootNode, importedNames),
  ];

  if (mi.index < 40) {
    smells.push({
      type: 'LowMaintainability',
      severity: mi.index < 20 ? 'medium' : 'low',
      line: 1,
      description: `Maintainability Index är ${mi.index}/100 — filen är svår att underhålla (Halstead Volume=${Math.round(mi.halstead.volume)}, CC=${Math.round(avgCC)}).`,
      suggestion: 'Minska filens komplexitet: extrahera funktioner, förenkla logik, reducera cyklomatisk komplexitet.',
    } as Smell);
  }

  return { functions, metrics, smells };
}

function buildMetrics(functions: FunctionResult[], totalLines: number, maintainabilityIndex: number): MetricBreakdown {
  if (functions.length === 0) return emptyMetrics(totalLines, maintainabilityIndex);
  return {
    cyclomaticComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)),
    cognitiveComplexity: Math.max(...functions.map(f => f.cognitiveComplexity)),
    maxNestingDepth: Math.max(...functions.map(f => f.nestingDepth)),
    avgFunctionLength: Math.round(
      functions.reduce((s, f) => s + f.length, 0) / functions.length,
    ),
    maxFunctionLength: Math.max(...functions.map(f => f.length)),
    avgParameterCount: parseFloat(
      (functions.reduce((s, f) => s + f.parameterCount, 0) / functions.length).toFixed(1),
    ),
    maxParameterCount: Math.max(...functions.map(f => f.parameterCount)),
    totalLines,
    duplicationScore: 0,
    maintainabilityIndex,
  };
}

function emptyMetrics(totalLines: number, maintainabilityIndex = 100): MetricBreakdown {
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
    maintainabilityIndex,
  };
}
