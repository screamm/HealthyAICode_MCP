import type { Language, FunctionResult, MetricBreakdown, Smell } from '../types';
import { analyzeTypeScript } from './typescript';
import { analyzePython } from './python';
import { analyzeJava } from './java';
import { analyzeCSharp } from './csharp';
import { analyzeGo } from './go';
import { analyzeRust } from './rust';
import { analyzePhp } from './php';
import { analyzeRuby } from './ruby';
import { analyzeSwift } from './swift';
// Tier B — Kotlin native
import { analyzeKotlin } from './kotlin';
// Tier B — new language analyzers
import { analyzeBash } from './bash';
import { analyzeLua } from './lua';
import { analyzeElixir } from './elixir';
import { analyzeHaskell } from './haskell';
import { analyzeR } from './r';
import { analyzeClojure } from './clojure';
// Tier B — Sprint 25 gap languages
import { analyzeDart } from './dart';
import { analyzeCLang } from './c-lang';
import { analyzeCpp } from './cpp';
import { analyzeScala } from './scala';
// Tier C — structural analyzers
import { analyzeYaml } from './yaml';
import { analyzeJson } from './json-lang';
import { analyzeDockerfile } from './dockerfile';
import { analyzeHcl } from './hcl';
import { analyzeMakefile } from './makefile';
import { analyzeStructuralTierC } from './structural-tier-c';

/** Analyzes TypeScript and JavaScript source files. */
export { analyzeTypeScript } from './typescript';
/** Analyzes Python source files. */
export { analyzePython } from './python';
/** Analyzes Java source files. */
export { analyzeJava } from './java';
/** Analyzes C# source files. */
export { analyzeCSharp } from './csharp';
/** Analyzes Go source files. */
export { analyzeGo } from './go';
/** Analyzes Rust source files. */
export { analyzeRust } from './rust';
/** Analyzes PHP source files. */
export { analyzePhp } from './php';
/** Analyzes Ruby source files. */
export { analyzeRuby } from './ruby';
/** Analyzes Swift source files. */
export { analyzeSwift } from './swift';
/** Analyzes Kotlin source files (native Tier B). */
export { analyzeKotlin } from './kotlin';
/** Analyzes Bash/Shell source files. */
export { analyzeBash } from './bash';
/** Analyzes Lua source files. */
export { analyzeLua } from './lua';
/** Analyzes Elixir source files. */
export { analyzeElixir } from './elixir';
/** Analyzes Haskell source files. */
export { analyzeHaskell } from './haskell';
/** Analyzes R source files. */
export { analyzeR } from './r';
/** Analyzes Clojure source files. */
export { analyzeClojure } from './clojure';
/** Analyzes Dart source files (Tier B). */
export { analyzeDart } from './dart';
/** Analyzes C source files (Tier B). */
export { analyzeCLang } from './c-lang';
/** Analyzes C++ source files (Tier B). */
export { analyzeCpp } from './cpp';
/** Analyzes Scala source files (Tier B). */
export { analyzeScala } from './scala';
/** Analyzes YAML files (Tier C structural). */
export { analyzeYaml } from './yaml';
/** Analyzes JSON files (Tier C structural). */
export { analyzeJson } from './json-lang';
/** Analyzes Dockerfile files (Tier C structural + layer complexity). */
export { analyzeDockerfile } from './dockerfile';
/** Analyzes Terraform HCL files (Tier C structural). */
export { analyzeHcl } from './hcl';
/** Analyzes Makefiles (Tier C structural). */
export { analyzeMakefile } from './makefile';
/** Generic Tier C structural analyzer for config/data languages. */
export { analyzeStructuralTierC } from './structural-tier-c';

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
      return analyzeJava(code, filePath);
    case 'kotlin':
      return analyzeKotlin(code, filePath);
    case 'csharp':
      return analyzeCSharp(code, filePath);
    case 'go':
      return analyzeGo(code, filePath);
    case 'rust':
      return analyzeRust(code, filePath);
    case 'php':
      return analyzePhp(code, filePath);
    case 'ruby':
      return analyzeRuby(code, filePath);
    case 'swift':
      return analyzeSwift(code, filePath);
    // Tier B languages
    case 'bash':
      return analyzeBash(code, filePath);
    case 'lua':
      return analyzeLua(code, filePath);
    case 'elixir':
      return analyzeElixir(code, filePath);
    case 'haskell':
      return analyzeHaskell(code, filePath);
    case 'r':
      return analyzeR(code, filePath);
    case 'clojure':
      return analyzeClojure(code, filePath);
    // Tier B — Sprint 25 gap languages
    case 'dart':
      return analyzeDart(code, filePath);
    case 'c':
      return analyzeCLang(code, filePath);
    case 'cpp':
      return analyzeCpp(code, filePath);
    case 'scala':
      return analyzeScala(code, filePath);
    // Tier C languages
    case 'yaml':
      return analyzeYaml(code, filePath);
    case 'json':
      return analyzeJson(code, filePath);
    case 'dockerfile':
      return analyzeDockerfile(code, filePath);
    case 'hcl':
      return analyzeHcl(code, filePath);
    case 'makefile':
      return analyzeMakefile(code, filePath);
    case 'sql':
    case 'html':
    case 'css':
    case 'markdown':
    case 'toml':
      return analyzeStructuralTierC(code, filePath);
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

// Architecture debt analysis modules — exported individually from src/index.ts to avoid conflicts
// These are kept here for internal use but not re-exported to avoid duplicate export errors

export * from './project-file-reader';
