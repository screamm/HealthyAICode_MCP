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
import { detectPrimitiveObsession } from '../smells/primitive-obsession';
import { computeMaintainability } from '../metrics/maintainability';

const parser = new Parser();
parser.setLanguage((TypeScript as unknown as Record<string, unknown>).typescript);

const CYCLOMATIC_NODE_TYPES = new Set(['if_statement','for_statement','for_in_statement','for_of_statement','while_statement','do_statement','ternary_expression','catch_clause','switch_case']);
const NESTING_NODE_TYPES = new Set(['if_statement','for_statement','for_in_statement','for_of_statement','while_statement','do_statement','switch_statement','try_statement']);
const FUNCTION_NODE_TYPES = new Set(['function_declaration','method_definition','arrow_function','function_expression']);

function countCC(n: Parser.SyntaxNode, acc: { v: number }): void {
  if (CYCLOMATIC_NODE_TYPES.has(n.type)) { acc.v++; }
  else if (n.type === 'binary_expression') { const op = n.childForFieldName('operator')?.text; if (op === '&&' || op === '||' || op === '??') acc.v++; }
  for (const child of n.children) countCC(child, acc);
}
function calculateCyclomaticComplexity(node: Parser.SyntaxNode): number {
  const acc = { v: 1 }; countCC(node, acc); return acc.v;
}

function countNesting(n: Parser.SyntaxNode, depth: number, max: { v: number }): void {
  const d = NESTING_NODE_TYPES.has(n.type) ? depth + 1 : depth;
  if (d > max.v) max.v = d;
  for (const child of n.children) countNesting(child, d, max);
}
function calculateMaxNestingDepth(node: Parser.SyntaxNode): number {
  const max = { v: 0 }; countNesting(node, 0, max); return max.v;
}

function getParameterCount(node: Parser.SyntaxNode): number {
  const params = node.childForFieldName('parameters');
  if (!params) return 0;
  return params.namedChildren.filter(c => c.type !== 'comment').length;
}

function getFunctionName(node: Parser.SyntaxNode): string {
  if (node.type === 'function_declaration' || node.type === 'method_definition') return node.childForFieldName('name')?.text ?? '<anonymous>';
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') return parent.childForFieldName('name')?.text ?? '<anonymous>';
  return '<anonymous>';
}

function extractFunction(node: Parser.SyntaxNode): FunctionResult {
  const startLine = node.startPosition.row + 1, endLine = node.endPosition.row + 1, name = getFunctionName(node);
  return { name, line: startLine, length: endLine - startLine + 1, cyclomaticComplexity: calculateCyclomaticComplexity(node), cognitiveComplexity: calculateCognitiveComplexity(node, name), nestingDepth: calculateMaxNestingDepth(node), parameterCount: getParameterCount(node), smells: [] };
}

function visitFn(node: Parser.SyntaxNode, out: FunctionResult[]): void {
  if (FUNCTION_NODE_TYPES.has(node.type)) out.push(extractFunction(node));
  for (const child of node.children) visitFn(child, out);
}
function collectFunctions(root: Parser.SyntaxNode): FunctionResult[] {
  const out: FunctionResult[] = []; visitFn(root, out); return out;
}

function extractImportedNames(root: Parser.SyntaxNode): Set<string> {
  const names = new Set<string>();
  for (const node of root.namedChildren) {
    if (node.type !== 'import_declaration') continue;
    for (const child of node.namedChildren) {
      if (child.type !== 'import_clause') continue;
      child.namedChildren.filter(id => id.type === 'identifier').forEach(id => names.add(id.text));
    }
  }
  return names;
}

interface SmellCtx { code: string; filePath: string; }
function collectSmells(root: Parser.SyntaxNode, ctx: SmellCtx, names: Set<string>, mi: ReturnType<typeof computeMaintainability>, avgCC: number): Smell[] {
  const smells: Smell[] = [
    ...(detectTypeSafetyEscapes(root, ctx.code) as Smell[]),
    ...(detectMagicNumbers(root, ctx.filePath) as Smell[]),
    ...(detectLowDocCoverage(root, ctx.code) as Smell[]),
    ...detectComplexConditional(root), ...detectMessageChain(root), ...detectDataClumps(root),
    ...detectSATD(root), ...detectGodClass(root, names), ...detectFeatureEnvy(root, names), ...detectPrimitiveObsession(root),
  ];
  if (mi.index < 40) smells.push({ type: 'LowMaintainability', severity: mi.index < 20 ? 'medium' : 'low', line: 1, description: `Maintainability Index är ${mi.index}/100 — filen är svår att underhålla (Halstead Volume=${Math.round(mi.halstead.volume)}, CC=${Math.round(avgCC)}).`, suggestion: 'Minska filens komplexitet: extrahera funktioner, förenkla logik, reducera cyklomatisk komplexitet.' } as Smell);
  return smells;
}

export function analyzeTypeScript(code: string, filePath = '<inline>'): { functions: FunctionResult[]; metrics: MetricBreakdown; smells: Smell[] } {
  const tree = parser.parse(code), root = tree.rootNode;
  const functions = collectFunctions(root);
  const totalLines = code === '' ? 0 : code.split('\n').length;
  const avgCC = functions.length > 0 ? functions.reduce((s, f) => s + f.cyclomaticComplexity, 0) / functions.length : 1;
  const mi = computeMaintainability(root, avgCC, totalLines);
  return { functions, metrics: buildMetrics(functions, totalLines, mi.index), smells: collectSmells(root, { code, filePath }, extractImportedNames(root), mi, avgCC) };
}

function buildMetrics(functions: FunctionResult[], totalLines: number, maintainabilityIndex: number): MetricBreakdown {
  if (functions.length === 0) return emptyMetrics(totalLines, maintainabilityIndex);
  return { cyclomaticComplexity: Math.max(...functions.map(f => f.cyclomaticComplexity)), cognitiveComplexity: Math.max(...functions.map(f => f.cognitiveComplexity)), maxNestingDepth: Math.max(...functions.map(f => f.nestingDepth)), avgFunctionLength: Math.round(functions.reduce((s, f) => s + f.length, 0) / functions.length), maxFunctionLength: Math.max(...functions.map(f => f.length)), avgParameterCount: parseFloat((functions.reduce((s, f) => s + f.parameterCount, 0) / functions.length).toFixed(1)), maxParameterCount: Math.max(...functions.map(f => f.parameterCount)), totalLines, duplicationScore: 0, maintainabilityIndex };
}

function emptyMetrics(totalLines: number, maintainabilityIndex = 100): MetricBreakdown {
  return { cyclomaticComplexity: 1, cognitiveComplexity: 0, maxNestingDepth: 0, avgFunctionLength: 0, maxFunctionLength: 0, avgParameterCount: 0, maxParameterCount: 0, totalLines, duplicationScore: 0, maintainabilityIndex };
}
