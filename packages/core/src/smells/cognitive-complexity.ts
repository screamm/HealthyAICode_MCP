import type { SyntaxNode } from 'tree-sitter';
import type { LanguageProfile } from './language-profile';

/**
 * Computes SonarSource S3776 Cognitive Complexity for a node.
 * Rules (simplified):
 *  - +1 for each control flow node (if/loop/switch/catch/conditional)
 *  - +nesting for each nested one
 *  - +1 per logical operator in a boolean chain after the first
 */
export function computeCognitiveComplexity(node: SyntaxNode, profile: LanguageProfile): number {
  let score = 0;

  function walk(n: SyntaxNode, nesting: number): void {
    const incrementsNesting =
      profile.controlFlowNodeTypes.has(n.type) || n.type === profile.catchNodeType;

    if (incrementsNesting) {
      score += 1 + nesting;
    }

    // Boolean chain: count logical operators
    if (n.type === profile.binaryExpressionNodeType) {
      const op = n.childForFieldName(profile.binaryOperatorField)?.text;
      if (op && profile.logicalOperators.has(op)) {
        score += 1;
      }
    }

    const nextNesting = incrementsNesting ? nesting + 1 : nesting;
    for (const child of n.children) walk(child, nextNesting);
  }

  walk(node, 0);
  return score;
}
