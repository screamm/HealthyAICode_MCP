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
// Tier A — Kotlin (tree-sitter-kotlin, promoted from Tier B)
import { analyzeKotlin } from './kotlin';
// Tier B — language analyzers
import { analyzeBash } from './bash';
import { analyzeLua } from './lua';
import { analyzeElixir } from './elixir'; // Tier A — tree-sitter-elixir
import { analyzeR } from './r';
import { analyzeClojure } from './clojure';
// Tier B — Sprint 25 gap languages
import { analyzeDart } from './dart';
import { analyzeCLang } from './c-lang';
import { analyzeCpp } from './cpp';
import { analyzeScala } from './scala'; // Tier A — tree-sitter-scala
// Tier B — Sprint 30 niche languages
import { analyzeCobol } from './cobol';
import { analyzeApex } from './apex';
import { analyzeFSharp } from './fsharp';
import { analyzeVbNet } from './vbnet';
import { analyzePerl } from './perl';
import { analyzeGroovy } from './groovy';
import { analyzeObjC } from './objc';
import { analyzePowerShell } from './powershell';
// Additional languages
import { analyzeErlang } from './erlang';
// Tier A — new languages (tree-sitter AST)
import { analyzeHaskell } from './haskell'; // promoted from Tier B to Tier A
import { analyzeJulia } from './julia';
import { analyzeOCaml } from './ocaml';
// Tier B — new languages
import { analyzeZig } from './zig';
import { analyzeNim } from './nim';
import { analyzeCrystal } from './crystal';
import { analyzeVue } from './vue';
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
/** Analyzes Kotlin source files (Tier A — tree-sitter-kotlin). */
export { analyzeKotlin } from './kotlin';
/** Analyzes Bash/Shell source files. */
export { analyzeBash } from './bash';
/** Analyzes Lua source files. */
export { analyzeLua } from './lua';
/** Analyzes Elixir source files (Tier A — tree-sitter-elixir). */
export { analyzeElixir } from './elixir';
/** Analyzes Haskell source files (Tier A — tree-sitter-haskell). */
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
/** Analyzes Scala source files (Tier A — tree-sitter-scala). */
export { analyzeScala } from './scala';
/** Analyzes COBOL source files (Tier B). */
export { analyzeCobol } from './cobol';
/** Analyzes Apex (Salesforce) source files (Tier B). */
export { analyzeApex } from './apex';
/** Analyzes F# source files (Tier B). */
export { analyzeFSharp } from './fsharp';
/** Analyzes VB.NET source files (Tier B). */
export { analyzeVbNet } from './vbnet';
/** Analyzes Perl source files (Tier B). */
export { analyzePerl } from './perl';
/** Analyzes Groovy source files (Tier B). */
export { analyzeGroovy } from './groovy';
/** Analyzes Objective-C source files (Tier B). */
export { analyzeObjC } from './objc';
/** Analyzes PowerShell source files (Tier B). */
export { analyzePowerShell } from './powershell';
/** Analyzes Erlang source files (Tier B). */
export { analyzeErlang } from './erlang';
/** Analyzes Julia source files (Tier A — tree-sitter-julia). */
export { analyzeJulia } from './julia';
/** Analyzes OCaml source files (Tier A — tree-sitter-ocaml). */
export { analyzeOCaml } from './ocaml';
/** Analyzes Zig source files (Tier B). */
export { analyzeZig } from './zig';
/** Analyzes Nim source files (Tier B). */
export { analyzeNim } from './nim';
/** Analyzes Crystal source files (Tier B). */
export { analyzeCrystal } from './crystal';
/** Analyzes Vue.js Single-File Components — extracts script block and routes to TS/JS analyzer. */
export { analyzeVue } from './vue';
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

type LanguageAnalyzer = (code: string, filePath: string) => AnalyzerOutput;

/**
 * Dispatch table mapping each supported language to its analyzer function.
 * Replaces a large switch statement to reduce cyclomatic complexity.
 */
const LANGUAGE_DISPATCH: Partial<Record<Language, LanguageAnalyzer>> = {
  // Tier A — full AST (tree-sitter)
  typescript: analyzeTypeScript,
  javascript: analyzeTypeScript,
  python: analyzePython,
  java: analyzeJava,
  kotlin: analyzeKotlin,
  csharp: analyzeCSharp,
  go: analyzeGo,
  rust: analyzeRust,
  php: analyzePhp,
  ruby: analyzeRuby,
  swift: analyzeSwift,
  elixir: analyzeElixir,
  scala: analyzeScala,
  haskell: analyzeHaskell,
  julia: analyzeJulia,
  ocaml: analyzeOCaml,
  // Tier B — regex-based
  bash: analyzeBash,
  lua: analyzeLua,
  r: analyzeR,
  clojure: analyzeClojure,
  dart: analyzeDart,
  c: analyzeCLang,
  cpp: analyzeCpp,
  cobol: analyzeCobol,
  apex: analyzeApex,
  fsharp: analyzeFSharp,
  vbnet: analyzeVbNet,
  perl: analyzePerl,
  groovy: analyzeGroovy,
  objc: analyzeObjC,
  powershell: analyzePowerShell,
  erlang: analyzeErlang,
  zig: analyzeZig,
  nim: analyzeNim,
  crystal: analyzeCrystal,
  vue: analyzeVue,
  // Tier C — structural
  yaml: analyzeYaml,
  json: analyzeJson,
  dockerfile: analyzeDockerfile,
  hcl: analyzeHcl,
  makefile: analyzeMakefile,
  sql: analyzeStructuralTierC,
  html: analyzeStructuralTierC,
  css: analyzeStructuralTierC,
  markdown: analyzeStructuralTierC,
  toml: analyzeStructuralTierC,
};

/** Dispatches analysis to the appropriate language analyzer and returns functions, metrics, and smells. */
export function analyzeByLanguage(code: string, language: Language, filePath = '<inline>'): AnalyzerOutput {
  const analyzer = LANGUAGE_DISPATCH[language];
  if (analyzer) {
    return analyzer(code, filePath);
  }
  return unsupportedOutput(code);
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
