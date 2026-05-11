import Parser from 'tree-sitter';
import type { Smell } from '../types';

const COMMENT_PATTERNS: Array<{ regex: RegExp; severity: Smell['severity']; suggestion: string }> = [
  { regex: /@ts-nocheck/, severity: 'critical', suggestion: 'Ta bort @ts-nocheck och fixa typfelen' },
  { regex: /@ts-ignore/, severity: 'high', suggestion: 'Ersätt @ts-ignore med korrekt typning eller @ts-expect-error' },
  { regex: /@ts-expect-error/, severity: 'low', suggestion: 'OK när den parar med ett förväntat fel; överväg att lösa felet' },
];

export function detectTypeSafetyEscapes(root: Parser.SyntaxNode, source: string): Smell[] {
  const smells: Smell[] = [];
  collectCommentDirectives(source, smells);
  walkForAnyUsage(root, smells);
  return smells;
}

function collectCommentDirectives(source: string, smells: Smell[]): void {
  const lines = source.split('\n');
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    // Only check actual comment lines to avoid false positives from pattern strings in code
    if (!trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')) return;
    for (const { regex, severity, suggestion } of COMMENT_PATTERNS) {
      if (regex.test(line)) {
        smells.push({
          type: 'TypeSafetyEscape',
          severity,
          line: idx + 1,
          description: `Type-safety escape: ${trimmed}`,
          suggestion,
        });
      }
    }
  });
}

function walkForAnyUsage(node: Parser.SyntaxNode, smells: Smell[]): void {
  if (node.type === 'any' || (node.type === 'predefined_type' && node.text === 'any')) {
    smells.push({
      type: 'TypeSafetyEscape',
      severity: 'medium',
      line: node.startPosition.row + 1,
      description: `Användning av 'any' på rad ${node.startPosition.row + 1}`,
      suggestion: "Ersätt 'any' med 'unknown' eller en specifik typ",
    });
  }
  for (const child of node.children) walkForAnyUsage(child, smells);
}
