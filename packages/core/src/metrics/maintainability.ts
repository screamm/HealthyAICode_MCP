import type { SyntaxNode } from 'tree-sitter';

const OPERATOR_KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'return', 'throw', 'try', 'catch', 'finally', 'new', 'delete', 'typeof',
  'instanceof', 'in', 'of', 'void', 'await', 'yield',
]);
const OPERAND_TYPES = new Set(['identifier', 'number', 'string', 'template_string', 'true', 'false', 'null', 'undefined']);

/** Halstead complexity counts for an AST. */
export interface HalsteadMetrics { n1: number; n2: number; N1: number; N2: number; volume: number; difficulty: number; effort: number; }

/** MI score and supporting Halstead data. */
export interface MaintainabilityResult { index: number; halstead: HalsteadMetrics; }

/** Computes the Maintainability Index for a syntax tree. */
export function computeMaintainability(tree: SyntaxNode, avgCyclomaticComplexity: number, linesOfCode: number): MaintainabilityResult {
  const halstead = computeHalstead(tree);
  const hv = Math.max(1, halstead.volume), cc = Math.max(1, avgCyclomaticComplexity), loc = Math.max(1, linesOfCode);
  const raw = 171 - 5.2 * Math.log(hv) - 0.23 * cc - 16.2 * Math.log(loc);
  return { index: Math.max(0, Math.min(100, Math.round((raw * 100) / 171))), halstead };
}

type Bag = { distinct: Set<string>; total: number };
function computeHalstead(tree: SyntaxNode): HalsteadMetrics {
  const ops: Bag = { distinct: new Set(), total: 0 }, opds: Bag = { distinct: new Set(), total: 0 };
  walkTokens(tree, ops, opds);
  const n1 = ops.distinct.size, n2 = opds.distinct.size, N1 = ops.total, N2 = opds.total;
  const vocab = n1 + n2, length = N1 + N2;
  const volume = vocab > 1 ? length * Math.log2(vocab) : 0;
  const difficulty = n2 > 0 ? (n1 / 2) * (N2 / n2) : 0;
  return { n1, n2, N1, N2, volume, difficulty, effort: volume * difficulty };
}

function walkTokens(node: SyntaxNode, ops: Bag, opds: Bag): void {
  if (node.childCount === 0) {
    const text = node.text.trim();
    if (!text) return;
    if (OPERATOR_KEYWORDS.has(text)) { ops.distinct.add(text); ops.total++; }
    else if (OPERAND_TYPES.has(node.type)) { opds.distinct.add(text); opds.total++; }
  }
  for (const child of node.children) walkTokens(child, ops, opds);
}
