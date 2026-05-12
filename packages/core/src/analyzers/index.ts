import type { Language, FunctionResult, MetricBreakdown, Smell } from '../types';
import { analyzeTypeScript } from './typescript';
import { analyzePython } from './python';
import { analyzeJava } from './java';
import { analyzeCSharp } from './csharp';

/** Analyzes TypeScript and JavaScript source files. */
export { analyzeTypeScript } from './typescript';
/** Analyzes Python source files. */
export { analyzePython } from './python';
/** Analyzes Java and Kotlin source files. */
export { analyzeJava } from './java';
/** Analyzes C# source files. */
export { analyzeCSharp } from './csharp';

interface AnalyzerOutput {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: Smell[];
}

/** Dispatches analysis to the appropriate language analyzer and returns functions, metrics, and smells. */
export function analyzeByLanguage(code: string, language: Language, filePath = '<inline>'): AnalyzerOutput {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return analyzeTypeScript(code, filePath);
    case 'python':
      return analyzePython(code, filePath);
    case 'java':
    case 'kotlin':
      return analyzeJava(code, filePath);
    case 'csharp':
      return analyzeCSharp(code, filePath);
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
