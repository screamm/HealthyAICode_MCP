import type { Language, FunctionResult, MetricBreakdown, Smell } from '../types';
import { analyzeTypeScript } from './typescript';
import { analyzePython } from './python';
import { analyzeJava } from './java';
import { analyzeCSharp } from './csharp';

export { analyzeTypeScript } from './typescript';
export { analyzePython } from './python';
export { analyzeJava } from './java';
export { analyzeCSharp } from './csharp';

interface AnalyzerOutput {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
}

export function analyzeByLanguage(code: string, language: Language, filePath = '<inline>'): AnalyzerOutput {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return analyzeTypeScript(code, filePath);
    case 'python':
      return { ...analyzePython(code), smells: [] };
    case 'java':
    case 'kotlin':
      return { ...analyzeJava(code), smells: [] };
    case 'csharp':
      return { ...analyzeCSharp(code), smells: [] };
    default:
      return unsupportedOutput(code);
  }
}

function unsupportedOutput(code: string): AnalyzerOutput {
  return {
    functions: [],
    smells: [],
    metrics: stubMetrics(code.split('\n').length),
  };
}

function stubMetrics(totalLines: number): MetricBreakdown {
  return {
    cyclomaticComplexity: 1,
    cognitiveComplexity: 0,
    maxNestingDepth: 0,
    avgFunctionLength: 0,
    maxFunctionLength: 0,
    avgParameterCount: 0,
    maxParameterCount: 0,
    totalLines,
    duplicationScore: 0,
  };
}
