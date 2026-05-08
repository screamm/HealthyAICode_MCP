import type { Language, FunctionResult, MetricBreakdown } from '../types';
import { analyzeTypeScript } from './typescript';
import { analyzePython } from './python';
import { analyzeJava } from './java';
import { analyzeCSharp } from './csharp';

export { analyzeTypeScript } from './typescript';
export { analyzePython } from './python';
export { analyzeJava } from './java';
export { analyzeCSharp } from './csharp';

export function analyzeByLanguage(
  code: string,
  language: Language,
): {
  functions: FunctionResult[];
  metrics: MetricBreakdown;
  smells: never[];
} {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return analyzeTypeScript(code);
    case 'python':
      return analyzePython(code);
    case 'java':
    case 'kotlin':
      return analyzeJava(code);
    case 'csharp':
      return analyzeCSharp(code);
    default: {
      const totalLines = code.split('\n').length;
      return {
        functions: [],
        smells: [],
        metrics: {
          cyclomaticComplexity: 1,
          cognitiveComplexity: 0, // not computed; placeholder
          maxNestingDepth: 0,
          avgFunctionLength: 0,
          maxFunctionLength: 0,
          avgParameterCount: 0,
          maxParameterCount: 0,
          totalLines,
          duplicationScore: 0,
        },
      };
    }
  }
}
