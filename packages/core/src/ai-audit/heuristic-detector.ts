// packages/core/src/ai-audit/heuristic-detector.ts
import type { AiSignal } from './types';

// Extended result that includes the isLikelyAIGenerated convenience field
export interface AiHeuristicResult {
  filePath: string;
  confidence: number;
  signals: AiSignal[];
  isLikelyAIGenerated: boolean;
}

// Weights for each heuristic (must sum to 1.0)
const WEIGHTS = {
  commentStyle: 0.30,
  namingPattern: 0.25,
  boilerplate: 0.25,
  structure: 0.20,
};

/**
 * Measures the comment-density score: AI-generated code tends to have
 * 20-40% comment lines, verbose JSDoc on every public function, and
 * natural-language sentences inside comments.
 */
export function commentStyleScore(code: string): number {
  if (!code || code.trim().length === 0) return 0;
  const lines = code.split('\n');
  const total = lines.length;
  if (total === 0) return 0;

  const commentLines = lines.filter(l => {
    const trimmed = l.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
  });
  const commentRatio = commentLines.length / total;

  // AI code typically has 20-40% comment lines
  if (commentRatio > 0.30) return 0.9;
  if (commentRatio > 0.20) return 0.7;
  if (commentRatio > 0.10) return 0.4;
  return 0.1;
}

/**
 * Detects over-descriptive identifier names (>25 chars) which are common
 * in AI-generated code, and also `// This function...` / `// This method...`
 * style comments.
 */
export function namingPatternScore(code: string, _language: string): number {
  let score = 0;

  // AI pattern: "// This function..." or "// This method..."
  const thisFunctionPattern = /\/\/\s+This (function|method)\b/gi;
  const thisFunctionMatches = (code.match(thisFunctionPattern) ?? []).length;
  if (thisFunctionMatches > 0) score += 0.25;

  // AI pattern: "// Helper function to..."
  const helperPattern = /\/\/\s+Helper function to\b/gi;
  if (helperPattern.test(code)) score += 0.15;

  // Generic variable names that AI overuses
  const genericVarPattern = /\b(result|data|response|output|temp|item|element|value)\s*[=:]/g;
  const genericMatches = (code.match(genericVarPattern) ?? []).length;
  if (genericMatches >= 3) score += 0.20;
  else if (genericMatches >= 1) score += 0.10;

  // Very long function/variable names (>25 chars) — AI tends to be verbose
  const longIdentifierPattern = /\b[a-zA-Z][a-zA-Z0-9]{25,}\b/g;
  const longMatches = (code.match(longIdentifierPattern) ?? []).length;
  if (longMatches >= 2) score += 0.20;
  else if (longMatches >= 1) score += 0.10;

  // JSDoc with @param {type} name pattern
  const jsdocParamPattern = /@param\s+\{[^}]+\}\s+\w+/g;
  if (jsdocParamPattern.test(code)) score += 0.15;

  return Math.min(score, 1.0);
}

/**
 * Detects AI boilerplate phrases and section comment markers.
 */
export function boilerplateScore(code: string): number {
  let score = 0;

  const boilerplatePhrases = [
    { pattern: /\/\/\s*(Initialize|Initialization)\b/gi, weight: 0.12 },
    { pattern: /\/\/\s*Main logic\b/gi, weight: 0.12 },
    { pattern: /\/\/\s*Return result\b/gi, weight: 0.12 },
    { pattern: /\/\/\s*TODO:\s*Add error handling/gi, weight: 0.15 },
    { pattern: /\/\/\s*Handle the case where\b/gi, weight: 0.12 },
    { pattern: /\/\/\s*This ensures (that\b|the\b)/gi, weight: 0.10 },
    { pattern: /\/\/\s*Step \d+:/gi, weight: 0.12 },
  ];

  for (const { pattern, weight } of boilerplatePhrases) {
    if (pattern.test(code)) score += weight;
  }

  // Consistently using const for all declarations (AI pattern)
  const constDecls = (code.match(/\bconst\s+\w/g) ?? []).length;
  const letDecls = (code.match(/\blet\s+\w/g) ?? []).length;
  if (constDecls > 3 && letDecls === 0) score += 0.08;

  return Math.min(score, 1.0);
}

/**
 * Detects section-divider comments and rigid block structure typical of AI output.
 */
export function structureScore(code: string): number {
  let score = 0;

  // Section divider comments: // --- Foo --- or // ===
  const sectionDividerPattern = /\/\/\s*[-=]{3,}\s*\w/g;
  const dividerCount = (code.match(sectionDividerPattern) ?? []).length;
  if (dividerCount >= 3) score += 0.45;
  else if (dividerCount >= 2) score += 0.30;
  else if (dividerCount >= 1) score += 0.15;

  // Multiline JSDoc blocks on nearly every function
  const jsdocBlockCount = (code.match(/\/\*\*[\s\S]*?\*\//g) ?? []).length;
  const functionCount = (code.match(/\bfunction\s+\w+|\b\w+\s*[=:]\s*(async\s+)?\(/g) ?? []).length;
  if (functionCount > 0 && jsdocBlockCount / functionCount > 0.7) score += 0.30;
  else if (jsdocBlockCount >= 2) score += 0.15;

  // Verbose function names with "process", "handle", "manage" + domain noun
  const verboseNamePattern = /\b(process|handle|manage|execute|perform)\w{6,}\b/g;
  if (verboseNamePattern.test(code)) score += 0.20;

  return Math.min(score, 1.0);
}

/**
 * Runs all four heuristics and returns a weighted AI-confidence score in [0, 1].
 */
export function detectAiHeuristics(
  code: string,
  filePath: string,
  language: string,
): AiHeuristicResult {
  const commentScore = commentStyleScore(code);
  const namingScore = namingPatternScore(code, language);
  const bpScore = boilerplateScore(code);
  const structScore = structureScore(code);

  const signals: AiSignal[] = [
    {
      name: 'comment_style',
      weight: WEIGHTS.commentStyle,
      score: commentScore,
      evidence: `Comment line ratio scored ${commentScore.toFixed(2)}`,
    },
    {
      name: 'naming_pattern',
      weight: WEIGHTS.namingPattern,
      score: namingScore,
      evidence: `Naming pattern heuristics scored ${namingScore.toFixed(2)}`,
    },
    {
      name: 'boilerplate',
      weight: WEIGHTS.boilerplate,
      score: bpScore,
      evidence: `Boilerplate phrase detection scored ${bpScore.toFixed(2)}`,
    },
    {
      name: 'structure',
      weight: WEIGHTS.structure,
      score: structScore,
      evidence: `Code structure analysis scored ${structScore.toFixed(2)}`,
    },
  ];

  const confidence = signals.reduce((acc, s) => acc + s.weight * s.score, 0);
  const clamped = Math.max(0, Math.min(1, confidence));

  return {
    filePath,
    confidence: clamped,
    signals,
    isLikelyAIGenerated: clamped >= 0.5,
  };
}
