import type { SyntaxNode } from 'tree-sitter';
import type { Smell } from '../types';

/**
 * AiAttributedSATD — GenAI-Induced Self-Admitted Technical Debt (GIST, Sprint 57)
 *
 * Based on arXiv 2601.07786: detects comments combining an AI reference with a SATD marker.
 * Hit rate: 1.47 % of AI-referencing comments; inter-annotator agreement κ = 0.896.
 *
 * Detection strategy:
 *   1. An AI attribution term must appear: LLM | AI | GPT | ChatGPT | Copilot | Gemini | Claude
 *   2. A SATD marker must appear: TODO | FIXME | HACK | XXX
 *   3. Both must be in the same comment node / same line.
 *   4. If an uncertainty phrase also appears (no clue | not sure | don't understand | unclear why),
 *      severity is elevated to 'medium'; otherwise 'low'.
 */

const AI_TERMS = /\b(LLM|AI|GPT|ChatGPT|Copilot|Gemini|Claude)\b/i;
const SATD_MARKERS = /\b(TODO|FIXME|HACK|XXX)\b/i;
const UNCERTAINTY_PHRASES = /\b(no clue|not sure|don't understand|unclear why|unsure)\b/i;

const COMMENT_NODES = new Set(['comment', 'line_comment', 'block_comment']);

function buildSmell(text: string, line: number): Smell | null {
  if (!AI_TERMS.test(text)) return null;
  if (!SATD_MARKERS.test(text)) return null;

  const aiMatch = AI_TERMS.exec(text);
  const satdMatch = SATD_MARKERS.exec(text);
  const hasUncertainty = UNCERTAINTY_PHRASES.test(text);

  const aiTerm = aiMatch?.[1] ?? 'AI';
  const satdMarker = satdMatch?.[1]?.toUpperCase() ?? 'SATD';
  const severity = hasUncertainty ? 'medium' : 'low';

  return {
    type: 'AiAttributedSATD',
    severity,
    line,
    description: `AI-attributerad SATD: "${aiTerm}" kombinerat med "${satdMarker}" — GenAI-inducerad teknisk skuld identifierad.`,
    suggestion:
      'Lös den AI-inducerade skulden omedelbart eller addera ett spårat issue — kräver score ≥ 9.7 för loopComplete.',
  };
}

/**
 * AST-based detector for Tier A languages.
 * Traverses all comment nodes in the syntax tree.
 */
export function detectAiAttributedSATD(tree: SyntaxNode): Smell[] {
  const smells: Smell[] = [];
  visitAll(tree, smells);
  return smells;
}

function visitAll(node: SyntaxNode, acc: Smell[]): void {
  if (COMMENT_NODES.has(node.type)) {
    const smell = buildSmell(node.text, node.startPosition.row + 1);
    if (smell) acc.push(smell);
  }
  for (const child of node.children) visitAll(child, acc);
}

/**
 * Text-based detector for Tier B/C languages (no AST).
 * Scans line-by-line for comment patterns.
 */
export function detectAiAttributedSATDFromText(code: string): Smell[] {
  const smells: Smell[] = [];
  const lines = code.split('\n');

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    // Match typical comment prefixes: //, #, --, ;, *, /*
    if (!/(?:\/\/|#\s|--\s|;\s|\*\s|\/\*)/.test(line) && !line.trim().startsWith('*')) {
      // Also check for bare comment-like lines (no prefix check but still test both patterns)
      // We still want to test multi-line block comment continuation lines
      if (!line.trim().startsWith('//') && !line.trim().startsWith('#') &&
          !line.trim().startsWith('--') && !line.trim().startsWith(';') &&
          !line.trim().startsWith('*') && !line.trim().startsWith('/*')) {
        continue;
      }
    }

    const smell = buildSmell(line, idx + 1);
    if (smell) smells.push(smell);
  }

  return smells;
}
