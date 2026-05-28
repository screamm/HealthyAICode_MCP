/**
 * intent-clarity-patterns.ts
 * Compiled regex patterns and constants used by the intent clarity analyser.
 * Keeping them in a separate module reduces the Halstead Volume of the main analyser file.
 */

/** Detects JSDoc @param / @returns type annotations in JavaScript. */
export const JSDOC_TYPE_RE = /@param\s+\{[^}]+\}|@returns?\s+\{[^}]+\}/g;

/** Checks for a typed return annotation after `)`. */
export const RETURN_TYPE_RE = /\)\s*:\s*\w/;

/** Checks for a typed parameter `name: Type`. */
export const TYPED_PARAM_RE = /^\s*\w+\s*:\s*\w/;

/** Checks for a spread typed parameter `...name: Type`. */
export const SPREAD_TYPED_RE = /^\s*\.\.\.\w+\s*:\s*\w/;

/** Matches named function signatures including optional return type. */
export const NAMED_FN_SIG_RE = /(?:async\s+)?function\s+\w+\s*(\([^)]*\)(?:\s*:\s*[\w<>\[\]|&]+)?)/g;

/** Matches arrow function signatures including optional return type. */
export const ARROW_SIG_RE = /(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?(\([^)]*\)(?:\s*:\s*[\w<>\[\]|&]+)?)\s*=>/g;

/** Matches method signatures (class methods, object methods, etc.). */
export const METHOD_SIG_RE = /^\s*(?:async\s+|public\s+|private\s+|protected\s+)*(\w+)\s*(\([^)]*\)(?:\s*:\s*[\w<>\[\]|&]+)?)\s*(?:\{|=>)/gm;

/** Control-flow keywords excluded from method signature detection. */
export const FLOW_KW = new Set(['if', 'for', 'while', 'switch', 'catch']);

/** Detects loop variable declarations for i/j/k exemption. */
export const LOOP_VAR_RE = /for\s*\([^)]*\b([ijk])\b/g;

/** Detects named function declarations. */
export const NAMED_FN_RE = /\bfunction\s+(\w+)\s*\(/g;

/** Detects arrow function variable declarations. */
export const ARROW_VAR_RE = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g;

/** Detects named function declarations for doc-ratio counting. */
export const DOC_FN_RE = /\bfunction\s+\w+\s*\(/g;

/** Detects arrow function declarations for doc-ratio counting. */
export const DOC_ARROW_RE = /(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;

/** Detects JSDoc comment blocks. */
export const JSDOC_BLOCK_RE = /\/\*\*[\s\S]*?\*\//g;

/** Opening bracket characters for depth tracking in parameter parsing. */
export const OPEN_BRACKETS = '<[{';

/** Closing bracket characters for depth tracking in parameter parsing. */
export const CLOSE_BRACKETS = '>]}';

/** Strips leading `(` from a parameter string. */
export const PARAM_OPEN_RE = /^\s*\(/;

/** Strips trailing `)` and optional return type from a signature. */
export const PARAM_CLOSE_RE = /\)\s*(?::\s*.+)?$/;
