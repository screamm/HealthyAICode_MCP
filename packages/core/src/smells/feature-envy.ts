import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';
import type { LanguageProfile } from './language-profile';

const ENVY_RATIO = 0.6;
const MIN_FOREIGN_CALLS = 3;

export function detectFeatureEnvy(tree: SyntaxNode, importedTypeNames: Set<string>, profile: LanguageProfile): Smell[] {
  const smells: Smell[] = [];
  collectMethods(tree, smells, importedTypeNames, profile);
  return smells;
}

function collectMethods(node: SyntaxNode, acc: Smell[], importedNames: Set<string>, profile: LanguageProfile): void {
  if (profile.methodNodeTypes.has(node.type)) {
    checkMethod(node, acc, importedNames, profile);
  }
  for (const child of node.children) collectMethods(child, acc, importedNames, profile);
}

function checkMethod(method: SyntaxNode, acc: Smell[], importedNames: Set<string>, profile: LanguageProfile): void {
  const foreignCallCounts = new Map<string, number>();
  let ownCalls = 0;
  countCalls(method, foreignCallCounts, importedNames, profile, () => { ownCalls++; });
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
  profile: LanguageProfile,
  countOwn: () => void,
): void {
  if (node.type === profile.memberAccessNodeType) {
    const obj = node.childForFieldName?.(profile.memberObjectField);
    if (obj) {
      if (obj.text === profile.selfKeyword) { countOwn(); }
      else if (importedNames.has(obj.text)) {
        foreign.set(obj.text, (foreign.get(obj.text) ?? 0) + 1);
      }
    }
  }
  for (const child of node.children) countCalls(child, foreign, importedNames, profile, countOwn);
}
