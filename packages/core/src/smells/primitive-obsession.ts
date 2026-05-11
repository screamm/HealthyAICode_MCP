import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

const PRIMITIVE_TYPES = new Set(['string', 'number', 'boolean']);
const MIN_PRIMITIVE_PARAMS = 3;

const FUNCTION_NODE_TYPES = new Set([
  'function_declaration',
  'method_definition',
  'arrow_function',
  'function_expression',
]);

export function detectPrimitiveObsession(root: SyntaxNode): Smell[] {
  const smells: Smell[] = [];
  traverse(root, smells);
  return smells;
}

function traverse(node: SyntaxNode, acc: Smell[]): void {
  if (FUNCTION_NODE_TYPES.has(node.type)) {
    checkFunction(node, acc);
  }
  for (const child of node.children) traverse(child, acc);
}

function countPrimitiveParams(params: SyntaxNode): { count: number; names: string[] } {
  let count = 0;
  const names: string[] = [];
  for (const param of params.namedChildren) {
    if (param.type === 'comment') continue;
    const ann = param.childForFieldName('type');
    if (!ann) continue;
    const typeNode = ann.namedChildren[0];
    if (typeNode?.type === 'predefined_type' && PRIMITIVE_TYPES.has(typeNode.text)) {
      count++;
      names.push(param.childForFieldName('pattern')?.text ?? param.text.split(':')[0].trim());
    }
  }
  return { count, names };
}

function checkFunction(node: SyntaxNode, acc: Smell[]): void {
  const params = node.childForFieldName('parameters');
  if (!params) return;
  const { count, names } = countPrimitiveParams(params);
  if (count < MIN_PRIMITIVE_PARAMS) return;
  const fnName = getFunctionName(node);
  acc.push({ type: 'PrimitiveObsession', severity: count >= 5 ? 'high' : 'medium', line: node.startPosition.row + 1, functionName: fnName, description: `'${fnName}' tar ${count} primitiva parametrar (${names.join(', ')}) — saknar domänabstraktion.`, suggestion: `Gruppera de primitiva parametrarna till ett välnamngivet domänobjekt (t.ex. interface ${capitalize(fnName)}Options) för att förbättra typsäkerheten och läsbarheten.` });
}

function getFunctionName(node: SyntaxNode): string {
  if (node.type === 'function_declaration' || node.type === 'method_definition') {
    return node.childForFieldName('name')?.text ?? '<anonymous>';
  }
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') {
    return parent.childForFieldName('name')?.text ?? '<anonymous>';
  }
  return '<anonymous>';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
