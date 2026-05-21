import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';
import type { LanguageProfile } from './language-profile';

const CLUMP_SIZE = 3;
const MIN_OCCURRENCES = 2;

interface ParamGroup { names: Set<string>; line: number }

export function detectDataClumps(tree: SyntaxNode, profile: LanguageProfile): Smell[] {
  const groups = collectGroups(tree, profile);
  return groups.length < MIN_OCCURRENCES ? [] : findClumps(groups);
}

function collectGroups(node: SyntaxNode, profile: LanguageProfile): ParamGroup[] {
  const result: ParamGroup[] = [];
  walkForParams(node, profile, result);
  return result;
}

function walkForParams(node: SyntaxNode, profile: LanguageProfile, acc: ParamGroup[]): void {
  if (profile.parameterListNodeTypes.has(node.type)) {
    const names = new Set<string>();
    for (const child of node.namedChildren) {
      if (!profile.parameterNodeTypes.has(child.type)) continue;
      const id = child.childForFieldName?.('name')?.text ?? child.text;
      if (id && !profile.implicitParameters.has(id)) names.add(id);
    }
    if (names.size >= CLUMP_SIZE) acc.push({ names, line: node.startPosition.row + 1 });
  }
  for (const child of node.children) walkForParams(child, profile, acc);
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  return new Set([...a].filter(x => b.has(x)));
}

function findClumps(groups: ParamGroup[]): Smell[] {
  const smells: Smell[] = [];
  const reported = new Set<string>();
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const common = intersect(groups[i].names, groups[j].names);
      if (common.size < CLUMP_SIZE) continue;
      const key = [...common].sort().join(',');
      if (reported.has(key)) continue;
      reported.add(key);
      smells.push({
        type: 'DataClumps',
        severity: 'medium',
        description: `Parameters [${[...common].join(', ')}] appear together in multiple signatures — missing abstraction.`,
        suggestion: 'Extract these parameters into a dedicated interface or type.',
        line: groups[i].line,
      });
    }
  }
  return smells;
}
