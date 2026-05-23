import type { Smell, SmellType, FunctionResult } from '../types';

export type RefactoringStrategy =
  | 'extract_method'
  | 'early_return'
  | 'introduce_parameter_object'
  | 'split_at_seam'
  | 'extract_chunks'
  | 'simplify_conditional'
  | 'inline_variable';

export interface RefactoringTemplate {
  strategy: RefactoringStrategy;
  instructions: (smell: Smell, code: string, fnResult: FunctionResult) => string[];
  skeletonHint: string;
  expectedScoreImprovement: number; // 0-3 points
}

/** Returns the refactoring template for a given smell and function context. */
export function getRefactoringTemplate(smell: Smell, fn: FunctionResult, code: string): RefactoringTemplate {
  const type = smell.type as SmellType;

  switch (type) {
    case 'ComplexMethod':
      return buildExtractMethodTemplate(smell, fn, code);

    case 'BrainMethod':
      return buildAggressiveExtractTemplate(smell, fn, code);

    case 'DeepNesting':
      return buildEarlyReturnTemplate(smell, fn, code);

    case 'BumpyRoad':
      return buildExtractChunksTemplate(smell, fn, code);

    case 'LargeMethod':
      return buildSplitAtSeamTemplate(smell, fn, code);

    case 'LongParameterList':
      return buildParameterObjectTemplate(smell, fn, code);

    case 'ComplexConditional':
      return buildSimplifyConditionalTemplate(smell, fn, code);

    default:
      return buildGenericTemplate(smell, fn, code);
  }
}

// ─── Private helpers ───────────────────────────────────────────────────────────

function buildExtractMethodTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;
  const totalLines = fn.length;
  const thirds = Math.floor(totalLines / 3);
  const startLine = fn.line;

  return {
    strategy: 'extract_method',
    instructions: () => [
      `1. Identify logically cohesive sections within '${fnName}' (each section should do one thing).`,
      `2. Extract lines ${startLine}–${startLine + thirds} into a helper function named after what that section does (e.g., 'validate${capitalize(fnName)}Input').`,
      `3. Extract the next cohesive section into a second helper (e.g., 'process${capitalize(fnName)}Result').`,
      `4. Replace each extracted block with a call to the new helper function.`,
      `5. Ensure the main function '${fnName}' now reads as a sequence of named calls.`,
    ],
    skeletonHint: `function ${fnName}(...args) {\n  const validated = validate${capitalize(fnName)}Input(args);\n  const result = process${capitalize(fnName)}Result(validated);\n  return result;\n}`,
    expectedScoreImprovement: 2.5,
  };
}

function buildAggressiveExtractTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'extract_method',
    instructions: () => [
      `1. '${fnName}' is a Brain Method — it does too much. Identify ALL distinct responsibilities.`,
      `2. Extract each responsibility into its own well-named function (aim for 3–5 helpers).`,
      `3. Each extracted helper should be independently testable.`,
      `4. The refactored '${fnName}' should contain only high-level orchestration calls — no inline logic.`,
      `5. Verify cyclomatic complexity drops below 10 after extraction.`,
    ],
    skeletonHint: `function ${fnName}(...args) {\n  const data = prepareData(args);\n  validate(data);\n  const result = computeResult(data);\n  return formatOutput(result);\n}`,
    expectedScoreImprovement: 3.0,
  };
}

function buildEarlyReturnTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'early_return',
    instructions: () => [
      `1. Identify the outermost conditional in '${fnName}' (the one causing deep nesting).`,
      `2. Invert the condition and return early: instead of 'if (valid) { ... }' write 'if (!valid) return;'.`,
      `3. Remove one level of nesting by replacing the else-branch with a guard clause.`,
      `4. Repeat for each nested conditional until nesting depth is ≤ 2.`,
      `5. Each guard clause should express a precondition — use descriptive names in the condition.`,
    ],
    skeletonHint: `function ${fnName}(...args) {\n  if (!preconditionA) return null;\n  if (!preconditionB) return defaultValue;\n  // main logic here — no deep nesting\n}`,
    expectedScoreImprovement: 2.0,
  };
}

function buildExtractChunksTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;
  const ranges = smell.chunkRanges ?? [];

  return {
    strategy: 'extract_chunks',
    instructions: (s) => {
      const chunkRanges = s.chunkRanges ?? [];
      if (chunkRanges.length === 0) {
        return [
          `1. Identify each sequential control-flow chunk in '${fnName}' (if/for/while blocks that run in sequence).`,
          `2. Extract each chunk into a named helper function that describes what it does.`,
          `3. Replace each chunk with a call to the corresponding helper.`,
          `4. The refactored '${fnName}' should read as a narrative of named steps.`,
        ];
      }
      return [
        `1. '${fnName}' has ${chunkRanges.length} sequential control-flow chunks to extract.`,
        ...chunkRanges.map((r, i) =>
          `${i + 2}. Extract lines ${r.startLine}–${r.endLine} into a helper named 'handle${capitalize(fnName)}Step${i + 1}' (or a more descriptive name).`
        ),
        `${chunkRanges.length + 2}. Replace each chunk with a call to its helper — preserve execution order and side effects.`,
        `${chunkRanges.length + 3}. The refactored '${fnName}' should contain only the sequential calls with no inline logic.`,
      ];
    },
    skeletonHint: ranges.length > 0
      ? `function ${fnName}(...args) {\n${ranges.map((_, i) => `  handle${capitalize(fnName)}Step${i + 1}(args);`).join('\n')}\n}`
      : `function ${fnName}(...args) {\n  handleStep1(args);\n  handleStep2(args);\n  handleStep3(args);\n}`,
    expectedScoreImprovement: 2.0,
  };
}

function buildSplitAtSeamTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;
  const midpoint = fn.line + Math.floor(fn.length / 2);

  return {
    strategy: 'split_at_seam',
    instructions: () => [
      `1. Find the natural seam in '${fnName}' where one concern ends and another begins (around line ${midpoint}).`,
      `2. Extract the second half into a new function named after what it does (not where it comes from).`,
      `3. Pass the necessary data as parameters to the new function — do not use shared mutable state.`,
      `4. The original '${fnName}' should be reduced to roughly half its current size.`,
      `5. Both resulting functions should have a single, clear responsibility.`,
    ],
    skeletonHint: `function ${fnName}(...args) {\n  const intermediate = computeFirstHalf(args);\n  return computeSecondHalf(intermediate);\n}`,
    expectedScoreImprovement: 1.5,
  };
}

function buildParameterObjectTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'introduce_parameter_object',
    instructions: () => [
      `1. Identify all parameters of '${fnName}' that belong to the same conceptual group.`,
      `2. Create an interface/type for the parameter object (e.g., '${capitalize(fnName)}Options').`,
      `3. Replace the individual parameters with a single options object parameter.`,
      `4. Update all call sites to pass an object literal instead of positional arguments.`,
      `5. Destructure the options object at the top of '${fnName}' for readability.`,
    ],
    skeletonHint: `interface ${capitalize(fnName)}Options {\n  // group related params here\n}\n\nfunction ${fnName}(options: ${capitalize(fnName)}Options) {\n  const { /* destructured params */ } = options;\n  // ...\n}`,
    expectedScoreImprovement: 1.0,
  };
}

function buildSimplifyConditionalTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'simplify_conditional',
    instructions: () => [
      `1. Identify the complex conditional expression in '${fnName}'.`,
      `2. Extract each condition clause into a named boolean variable that describes what it tests.`,
      `3. Replace the complex expression with the named variables joined by && or ||.`,
      `4. If the entire conditional block belongs together, extract it into a named predicate function.`,
      `5. The resulting condition should read like a sentence describing the business rule.`,
    ],
    skeletonHint: `function ${fnName}(...args) {\n  const isValid = checkValidity(args);\n  const meetsThreshold = checkThreshold(args);\n  if (isValid && meetsThreshold) {\n    // ...\n  }\n}`,
    expectedScoreImprovement: 1.5,
  };
}

function buildGenericTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'extract_method',
    instructions: (s) => [
      `1. Address the '${s.type}' smell in '${fnName}': ${s.description}`,
      `2. ${s.suggestion}`,
      `3. Extract any reusable logic into clearly named helper functions.`,
      `4. Ensure the refactored code has a single, clear responsibility.`,
      `5. Run tests after refactoring to confirm no behaviour change.`,
    ],
    skeletonHint: `// Refactor '${fnName}' to address: ${smell.type}`,
    expectedScoreImprovement: 1.0,
  };
}

function capitalize(name: string): string {
  if (!name) return '';
  return name.charAt(0).toUpperCase() + name.slice(1);
}
