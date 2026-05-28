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

function findDominantForeignType(foreignCallCounts: Map<string, number>): { maxType: string; maxCount: number } {
  let maxType = '';
  let maxCount = 0;
  for (const [type, count] of foreignCallCounts) {
    if (count > maxCount) { maxCount = count; maxType = type; }
  }
  return { maxType, maxCount };
}

interface EnvySmellContext {
  method: SyntaxNode;
  maxType: string;
  maxCount: number;
  totalCalls: number;
}

function buildFeatureEnvySmell({ method, maxType, maxCount, totalCalls }: EnvySmellContext): Smell {
  const name = method.childForFieldName?.('name')?.text ?? 'anonymous';
  return {
    type: 'FeatureEnvy',
    severity: 'medium',
    description: `Method "${name}" makes ${maxCount}/${totalCalls} calls to "${maxType}" — more interested in that type than its own class.`,
    suggestion: `Move this method closer to "${maxType}" or extract a service that encapsulates this interaction.`,
    line: method.startPosition.row + 1,
  };
}

function checkMethod(method: SyntaxNode, acc: Smell[], importedNames: Set<string>, profile: LanguageProfile): void {
  const foreignCallCounts = new Map<string, number>();
  let ownCalls = 0;
  countCalls(method, { foreign: foreignCallCounts, importedNames, profile, countOwn: () => { ownCalls++; } });
  if (foreignCallCounts.size === 0) return;

  const totalCalls = ownCalls + [...foreignCallCounts.values()].reduce((s, c) => s + c, 0);
  if (totalCalls === 0) return;

  const { maxType, maxCount } = findDominantForeignType(foreignCallCounts);
  if (maxCount >= MIN_FOREIGN_CALLS && maxCount / totalCalls >= ENVY_RATIO) {
    acc.push(buildFeatureEnvySmell({ method, maxType, maxCount, totalCalls }));
  }
}

interface CallCountContext {
  foreign: Map<string, number>;
  importedNames: Set<string>;
  profile: LanguageProfile;
  countOwn: () => void;
}

function countCalls(node: SyntaxNode, ctx: CallCountContext): void {
  const { foreign, importedNames, profile, countOwn } = ctx;
  if (node.type === profile.memberAccessNodeType) {
    const obj = node.childForFieldName?.(profile.memberObjectField);
    if (obj) {
      if (obj.text === profile.selfKeyword) { countOwn(); }
      else if (importedNames.has(obj.text)) {
        foreign.set(obj.text, (foreign.get(obj.text) ?? 0) + 1);
      }
    }
  }
  for (const child of node.children) countCalls(child, ctx);
}
