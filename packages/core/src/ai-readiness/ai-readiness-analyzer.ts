/**
 * AI-Readiness Analyzer — composite scorer combining five dimensions:
 *
 *   namingClarity     (weight 0.20)
 *   typeCoverage      (weight 0.25)
 *   contextWindowFit  (weight 0.20)
 *   docSignal         (weight 0.20) — derived from per-file docCoverageRatio
 *   modularity        (weight 0.15) — inverse of avg cognitive complexity
 *
 * The orchestrator does not parse files itself — callers pass in pre-analyzed
 * file data so that the heavy AST work can be reused across other analyzers.
 */

import { analyzeNamingClarity } from './naming-clarity';
import { analyzeTypeCoverage } from './type-coverage';
import { analyzeContextWindowFit, type ContextWindowFitInput } from './context-window-fit';

export interface AIReadinessFile {
  path: string;
  content: string;
  language: string;
  functions?: ContextWindowFitInput[];
  cognitiveComplexity?: number;
  /** Ratio in [0,1] of exported symbols carrying documentation. Undefined means "unknown — treat as 0.5". */
  docCoverageRatio?: number;
}

export interface AIBlocker {
  filePath: string;
  issue: string;
  impact: 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface AIReadinessResult {
  /** Composite 0..10 weighted score across the five dimensions. */
  score: number;
  dimensions: {
    namingClarity: number;
    typeCoverage: number;
    contextWindowFit: number;
    docSignal: number;
    modularity: number;
  };
  aiBlockers: AIBlocker[];
  /** Short human-readable summary, e.g. `AI-readiness: Good (7.4) — top issues: ...`. */
  summary: string;
}

const WEIGHTS = {
  namingClarity: 0.20,
  typeCoverage: 0.25,
  contextWindowFit: 0.20,
  docSignal: 0.20,
  modularity: 0.15,
} as const;

const MAX_BLOCKERS = 10;

/**
 * Compute the AI-readiness score for a set of files.
 *
 * Empty input → score 10 with no blockers (vacuous truth).
 */
export function analyzeAIReadiness(files: AIReadinessFile[]): AIReadinessResult {
  if (files.length === 0) return emptyResult();

  let namingTotal = 0;
  let typeTotal = 0;
  let fitTotal = 0;
  let docTotal = 0;
  let modularityTotal = 0;
  const blockers: AIBlocker[] = [];

  for (const file of files) {
    const naming = analyzeNamingClarity(file.content, file.language);
    namingTotal += naming.score;
    if (naming.score < 5) {
      blockers.push({
        filePath: file.path,
        issue: `Låg naming clarity (${naming.score}/10): ${naming.singleCharVars} enbokstavs-variabler, ${naming.crypticNames.length} kryptiska namn`,
        impact: naming.score < 3 ? 'high' : 'medium',
        recommendation: 'Byt ut korta namn mot intention-avslöjande identifierare; håll en konsekvent casing-konvention per fil.',
      });
    }

    const tc = analyzeTypeCoverage(file.content, file.language);
    typeTotal += tc.score;
    if (tc.score < 5 && tc.totalFunctions > 0) {
      blockers.push({
        filePath: file.path,
        issue: `Låg type coverage (${tc.score}/10): ${tc.annotatedParams}/${tc.totalParams} parametrar och ${tc.annotatedReturns}/${tc.totalFunctions} returvärden annoterade`,
        impact: tc.score < 3 ? 'high' : 'medium',
        recommendation: 'Lägg till explicita typannoteringar på publika funktioner — det halverar AI-hallucinationsrisk.',
      });
    }

    const functions = file.functions ?? [];
    const fit = analyzeContextWindowFit(functions);
    fitTotal += fit.score;
    if (fit.functionsExceedingContext > 0) {
      blockers.push({
        filePath: file.path,
        issue: `${fit.functionsExceedingContext} funktion(er) överstiger 2 000 tokens (max ${fit.maxFunctionTokens} tokens)`,
        impact: fit.maxFunctionTokens > 4000 ? 'high' : 'medium',
        recommendation: 'Bryt upp långa funktioner i mindre, fokuserade enheter så att AI-assistenter kan redigera dem atomärt.',
      });
    }

    const docSignal = file.docCoverageRatio === undefined ? 5 : roundOne(file.docCoverageRatio * 10);
    docTotal += docSignal;
    if (docSignal < 4 && functions.length > 0) {
      blockers.push({
        filePath: file.path,
        issue: `Låg doc signal (${docSignal}/10): få exporterade symboler har docstring/JSDoc`,
        impact: 'low',
        recommendation: 'Skriv en kort intent-beskrivning ovanför varje exporterad funktion — fokus på *varför*, inte *vad*.',
      });
    }

    const cc = file.cognitiveComplexity ?? 0;
    const modularity = Math.max(0, 10 - cc);
    modularityTotal += modularity;
    if (modularity < 4) {
      blockers.push({
        filePath: file.path,
        issue: `Hög kognitiv komplexitet (avg CC ≈ ${cc.toFixed(1)}): modularity-score ${modularity.toFixed(1)}/10`,
        impact: modularity < 2 ? 'high' : 'medium',
        recommendation: 'Extrahera djupt nästlade block och tidiga returer; minska antal logiska operatorer per funktion.',
      });
    }
  }

  const n = files.length;
  const dimensions = {
    namingClarity: roundOne(namingTotal / n),
    typeCoverage: roundOne(typeTotal / n),
    contextWindowFit: roundOne(fitTotal / n),
    docSignal: roundOne(docTotal / n),
    modularity: roundOne(modularityTotal / n),
  };

  const score = roundOne(
    dimensions.namingClarity * WEIGHTS.namingClarity +
    dimensions.typeCoverage * WEIGHTS.typeCoverage +
    dimensions.contextWindowFit * WEIGHTS.contextWindowFit +
    dimensions.docSignal * WEIGHTS.docSignal +
    dimensions.modularity * WEIGHTS.modularity
  );

  const sortedBlockers = blockers
    .sort((a, b) => impactRank(a.impact) - impactRank(b.impact))
    .slice(0, MAX_BLOCKERS);

  return {
    score,
    dimensions,
    aiBlockers: sortedBlockers,
    summary: buildSummary(score, dimensions, sortedBlockers),
  };
}

function emptyResult(): AIReadinessResult {
  return {
    score: 10,
    dimensions: { namingClarity: 10, typeCoverage: 10, contextWindowFit: 10, docSignal: 10, modularity: 10 },
    aiBlockers: [],
    summary: 'AI-readiness: Good (10.0) — no files analyzed',
  };
}

function impactRank(impact: 'high' | 'medium' | 'low'): number {
  return impact === 'high' ? 0 : impact === 'medium' ? 1 : 2;
}

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

function buildSummary(score: number, dims: AIReadinessResult['dimensions'], blockers: AIBlocker[]): string {
  const grade = score >= 7.5 ? 'Good' : score >= 5 ? 'Fair' : 'Poor';
  const weakest = (Object.entries(dims) as Array<[keyof typeof dims, number]>)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 3)
    .map(([name, value]) => `${name}=${value}`)
    .join(', ');
  const top = blockers.slice(0, 3).map(b => b.issue).join('; ');
  const tail = top ? ` — top issues: ${top}` : '';
  return `AI-readiness: ${grade} (${score.toFixed(1)}) — weakest: ${weakest}${tail}`;
}
