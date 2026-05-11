import type { SyntaxNode } from 'tree-sitter';
import type { Smell, SmellType } from '../types';

const CLUMP_SIZE = 3;
const MIN_OCCURRENCES = 2;
const PARAM_LIST_NODES = new Set(['formal_parameters', 'parameter_list']);

interface ParamGroup { names: Set<string>; line: number }

export function detectDataClumps(tree: SyntaxNode): Smell[] {
  const groups = collectGroups(tree);
  return groups.length < MIN_OCCURRENCES ? [] : findClumps(groups);
}

function collectGroups(node: SyntaxNode): ParamGroup[] {
  const result: ParamGroup[] = [];
  walkForParams(node, result);
  return result;
}

function walkForParams(node: SyntaxNode, acc: ParamGroup[]): void {
  if (PARAM_LIST_NODES.has(node.type)) {
    const names = new Set<string>();
    for (const child of node.namedChildren) {
      const id = child.type === 'identifier' ? child.text
        : child.childForFieldName?.('pattern')?.text ?? '';
      if (id && !id.startsWith('_')) names.add(id);
    }
    if (names.size >= CLUMP_SIZE) acc.push({ names, line: node.startPosition.row + 1 });
  }
  for (const child of node.children) walkForParams(child, acc);
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
        // @ts-ignore - DataClumps added to SmellType in Wave 2 integration
        type: 'DataClumps' as SmellType,
        severity: 'medium',
        description: `Parameters [${[...common].join(', ')}] appear together in multiple signatures — missing abstraction.`,
        suggestion: 'Extract these parameters into a dedicated interface or type.',
        line: groups[i].line,
      });
    }
  }
  return smells;
}
