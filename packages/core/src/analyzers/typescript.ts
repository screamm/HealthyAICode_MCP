import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import type { FunctionResult, MetricBreakdown, Smell } from '../types';
import { extractFunction } from './typescript-ast-helpers';
import { buildMetrics } from './typescript-metrics';
import { computeMaintainability } from '../metrics/maintainability';
import { collectTypeScriptSmells } from './typescript-smells';

const parser = new Parser();
parser.setLanguage((TypeScript as unknown as Record<string, unknown>).typescript as Parser.Language);
const FN_TYPES = new Set(['function_declaration', 'method_definition', 'arrow_function', 'function_expression']);

function collectFunctions(root: Parser.SyntaxNode): { results: FunctionResult[]; nodes: Parser.SyntaxNode[] } {
  const results: FunctionResult[] = [];
  const nodes: Parser.SyntaxNode[] = [];
  function visit(n: Parser.SyntaxNode): void {
    if (FN_TYPES.has(n.type)) { results.push(extractFunction(n)); nodes.push(n); }
    for (const c of n.children) visit(c);
  }
  visit(root);
  return { results, nodes };
}

function extractImportedNames(root: Parser.SyntaxNode): Set<string> {
  const names = new Set<string>();
  for (const node of root.namedChildren) {
    if (node.type !== 'import_declaration') continue;
    for (const child of node.namedChildren)
      if (child.type === 'import_clause')
        child.namedChildren.filter(id => id.type === 'identifier').forEach(id => names.add(id.text));
  }
  return names;
}

/** Parses and analyses TypeScript/JavaScript source code, returning functions, metrics, and code quality findings. */
export function analyzeTypeScript(code: string, filePath = '<inline>'): { functions: FunctionResult[]; metrics: MetricBreakdown; smells: Smell[] } {
  const tree = parser.parse(code);
  const { results: functions, nodes: functionNodes } = collectFunctions(tree.rootNode);
  const totalLines = code === '' ? 0 : code.split('\n').length;
  const avgCC = functions.length > 0 ? functions.reduce((s, f) => s + f.cyclomaticComplexity, 0) / functions.length : 1;
  const mi = computeMaintainability(tree.rootNode, avgCC, totalLines);
  return { functions, metrics: buildMetrics(functions, totalLines, mi.index), smells: collectTypeScriptSmells(tree.rootNode, { code, filePath }, { names: extractImportedNames(tree.rootNode), mi, avgCC, functionNodes }) };
}
