import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

const ENVY_RATIO = 0.6;
const MIN_FOREIGN_CALLS = 3;

export function detectFeatureEnvy(tree: SyntaxNode, importedTypeNames: Set<string>): Smell[] {
  const smells: Smell[] = [];
  collectMethods(tree, smells, importedTypeNames);
  return smells;
}

const METHOD_TYPES = new Set(['method_definition', 'function_declaration', 'arrow_function']);

function collectMethods(node: SyntaxNode, acc: Smell[], importedNames: Set<string>): void {
  if (METHOD_TYPES.has(node.type)) {
    checkMethod(node, acc, importedNames);
  }
  for (const child of node.children) collectMethods(child, acc, importedNames);
}

function checkMethod(method: SyntaxNode, acc: Smell[], importedNames: Set<string>): void {
  const foreignCallCounts = new Map<string, number>();
  let ownCalls = 0;
  countCalls(method, foreignCallCounts, importedNames, () => { ownCalls++; });
  if (foreignCallCounts.size === 0) return;

  const totalCalls = ownCalls + [...foreignCallCounts.values()].reduce((s, c) => s + c, 0);
  if (totalCalls === 0) return;

  let maxType = '';
  let maxCount = 0;
  for (const [type, count] of foreignCallCounts) {
    if (count > maxCount) { maxCount = count; maxType = type; }
  }

  if (maxCount >= MIN_FOREIGN_CALLS && maxCount / totalCalls >= ENVY_RATIO) {
    const name = method.childForFieldName?.('name')?.text ?? 'anonymous';
    acc.push({
      type: 'FeatureEnvy',
      severity: 'medium',
      description: `Method "${name}" makes ${maxCount}/${totalCalls} calls to "${maxType}" — more interested in that type than its own class.`,
      suggestion: `Move this method closer to "${maxType}" or extract a service that encapsulates this interaction.`,
      line: method.startPosition.row + 1,
    });
  }
}

function countCalls(
  node: SyntaxNode,
  foreign: Map<string, number>,
  importedNames: Set<string>,
  countOwn: () => void,
): void {
  if (node.type === 'member_expression') {
    const obj = node.childForFieldName?.('object');
    if (obj) {
      if (obj.text === 'this') { countOwn(); }
      else if (importedNames.has(obj.text)) {
        foreign.set(obj.text, (foreign.get(obj.text) ?? 0) + 1);
      }
    }
  }
  for (const child of node.children) countCalls(child, foreign, importedNames, countOwn);
}
