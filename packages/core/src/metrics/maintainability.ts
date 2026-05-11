import type { SyntaxNode } from 'tree-sitter';

const OPERATOR_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof',
  'instanceof', 'in', 'of', 'void', 'await', 'yield',
]);

const OPERAND_TYPES = new Set([
  'identifier', 'number', 'string', 'template_string', 'true', 'false', 'null', 'undefined',
]);

export interface HalsteadMetrics {
  n1: number;
  n2: number;
  N1: number;
  N2: number;
  volume: number;
  difficulty: number;
  effort: number;
}

export interface MaintainabilityResult {
  index: number;
  halstead: HalsteadMetrics;
}

export function computeMaintainability(
  tree: SyntaxNode,
  avgCyclomaticComplexity: number,
  linesOfCode: number,
): MaintainabilityResult {
  const halstead = computeHalstead(tree);
  const hv = Math.max(1, halstead.volume);
  const cc = Math.max(1, avgCyclomaticComplexity);
  const loc = Math.max(1, linesOfCode);
  const raw = 171 - 5.2 * Math.log(hv) - 0.23 * cc - 16.2 * Math.log(loc);
  const index = Math.max(0, Math.min(100, Math.round((raw * 100) / 171)));
  return { index, halstead };
}

function computeHalstead(tree: SyntaxNode): HalsteadMetrics {
  const operators = { distinct: new Set<string>(), total: 0 };
  const operands = { distinct: new Set<string>(), total: 0 };
  walkTokens(tree, operators, operands);

  const n1 = operators.distinct.size;
  const n2 = operands.distinct.size;
  const N1 = operators.total;
  const N2 = operands.total;
  const vocab = n1 + n2;
  const length = N1 + N2;
  const volume = vocab > 1 ? length * Math.log2(vocab) : 0;
  const difficulty = n2 > 0 ? (n1 / 2) * (N2 / n2) : 0;
  const effort = volume * difficulty;

  return { n1, n2, N1, N2, volume, difficulty, effort };
}

function walkTokens(
  node: SyntaxNode,
  ops: { distinct: Set<string>; total: number },
  opds: { distinct: Set<string>; total: number },
): void {
  if (node.childCount === 0) {
    const text = node.text.trim();
    if (!text) return;
    if (OPERATOR_KEYWORDS.has(text)) {
      ops.distinct.add(text);
      ops.total++;
    } else if (OPERAND_TYPES.has(node.type)) {
      opds.distinct.add(text);
      opds.total++;
    }
  }
  for (const child of node.children) walkTokens(child, ops, opds);
}
