import type { Smell, SmellType, FunctionResult } from '../types';

export type RefactoringStrategy =
  | 'extract_method'
  | 'early_return'
  | 'introduce_parameter_object'
  | 'split_at_seam'
  | 'extract_chunks'
  | 'simplify_conditional'
  | 'inline_variable'
  | 'add_docstrings'
  | 'extract_constants'
  | 'introduce_intermediary'
  | 'extract_class'
  | 'move_method'
  | 'resolve_debt'
  | 'strengthen_types';

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

    case 'PrimitiveObsession':
      return buildParameterObjectTemplate(smell, fn, code);

    case 'CognitiveComplexity':
      return buildExtractMethodTemplate(smell, fn, code);

    case 'LowDocCoverage':
      return buildAddDocstringsTemplate(smell, fn, code);

    case 'MagicNumber':
      return buildExtractConstantsTemplate(smell, fn, code);

    case 'MessageChain':
      return buildMessageChainTemplate(smell, fn, code);

    case 'GodClass':
      return buildGodClassTemplate(smell, fn, code);

    case 'FeatureEnvy':
      return buildMoveMethodTemplate(smell, fn, code);

    case 'SATD':
      return buildSATDTemplate(smell, fn, code);

    case 'TypeSafetyEscape':
      return buildTypeSafetyTemplate(smell, fn, code);

    // Reuse existing templates for structurally equivalent smells.
    case 'DataClumps':
      return buildParameterObjectTemplate(smell, fn, code);

    case 'DocumentationDebt':
      return buildAddDocstringsTemplate(smell, fn, code);

    default:
      return buildGenericTemplate(smell, fn, code);
  }
}

// ─── Private helpers ───────────────────────────────────────────────────────────

function buildExtractMethodTemplate(smell: Smell, fn: FunctionResult, code: string): RefactoringTemplate {
  const fnName = fn.name;
  const startLine = fn.line;
  const seams = findNaturalSeams(code, fn);
  // Use detected natural seams; fall back to thirds when no seams are found.
  const thirds = Math.floor(fn.length / 3);
  const firstSeam = seams.length > 0 ? seams[0] : startLine + thirds;
  const secondSeam = seams.length > 1 ? seams[1] : startLine + thirds * 2;

  return {
    strategy: 'extract_method',
    instructions: () => [
      `0. PLAN: In 1 sentence, name the helper functions you will extract and state what each will contain.`,
      `1. Identify logically cohesive sections within '${fnName}' (each section should do one thing).`,
      `2. Extract lines ${startLine}–${firstSeam - 1} into a helper function named after what that section does (e.g., 'validate${capitalize(fnName)}Input').`,
      `3. Extract lines ${firstSeam}–${secondSeam - 1} into a second helper (e.g., 'process${capitalize(fnName)}Result').`,
      `4. Replace each extracted block with a call to the new helper function.`,
      `5. Ensure the main function '${fnName}' now reads as a sequence of named calls.`,
      `VERIFY: Re-read '${fnName}' after applying — confirm (1) behaviour unchanged, (2) no new side-effects, (3) all call sites still valid, (4) each extracted helper receives all required variables as explicit parameters (no implicit closure captures — these cause 76 % of LLM refactoring hallucinations per arXiv 2401.15298), (5) all existing comments preserved. If compilation or tests fail, revert to currentCode and attempt a narrower extraction.`,
    ],
    skeletonHint: [
      `// Before:`,
      `function ${fnName}(...args) {`,
      `  // [inline logic A — lines ${startLine}–${firstSeam - 1}]`,
      `  // [inline logic B — lines ${firstSeam}–${secondSeam - 1}]`,
      `}`,
      ``,
      `// After:`,
      `function ${fnName}(...args) {`,
      `  const validated = validate${capitalize(fnName)}Input(args);`,
      `  const result = process${capitalize(fnName)}Result(validated);`,
      `  return result;`,
      `}`,
    ].join('\n'),
    expectedScoreImprovement: 2.5,
  };
}

function buildAggressiveExtractTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'extract_method',
    instructions: () => [
      `0. PLAN: In 1 sentence, list every responsibility you will extract and the helper name for each.`,
      `1. '${fnName}' is a Brain Method — it does too much. Identify ALL distinct responsibilities.`,
      `2. Extract each responsibility into its own well-named function (aim for 3–5 helpers).`,
      `3. Each extracted helper should be independently testable.`,
      `4. The refactored '${fnName}' should contain only high-level orchestration calls — no inline logic.`,
      `5. Verify cyclomatic complexity drops below 10 after extraction.`,
      `VERIFY: Re-read '${fnName}' after applying — confirm (1) behaviour unchanged, (2) no new side-effects, (3) all call sites still valid, (4) existing comments preserved. If compilation or tests fail, revert to currentCode and extract fewer responsibilities.`,
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
      `VERIFY: Re-read '${fnName}' after applying — confirm (1) behaviour unchanged, (2) no new side-effects, (3) all call sites still valid, (4) existing comments preserved. If compilation or tests fail, revert to currentCode and reduce the number of guard clauses inverted.`,
    ],
    skeletonHint: [
      `// Before:`,
      `function ${fnName}(...args) {`,
      `  if (valid) {`,
      `    // [nested logic A]`,
      `    if (ready) {`,
      `      // [nested logic B]`,
      `    }`,
      `  }`,
      `}`,
      ``,
      `// After:`,
      `function ${fnName}(...args) {`,
      `  if (!preconditionA) return null;`,
      `  if (!preconditionB) return defaultValue;`,
      `  // main logic here — no deep nesting`,
      `}`,
    ].join('\n'),
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
      const verify = `VERIFY: Re-read '${fnName}' after applying — confirm (1) behaviour unchanged, (2) execution order preserved, (3) all call sites still valid, (4) existing comments preserved. If compilation or tests fail, revert to currentCode and extract fewer chunks.`;
      if (chunkRanges.length === 0) {
        return [
          `0. PLAN: In 1 sentence, name each step function you will introduce and describe what it handles.`,
          `1. Identify each sequential control-flow chunk in '${fnName}' (if/for/while blocks that run in sequence).`,
          `2. Extract each chunk into a named helper function that describes what it does.`,
          `3. Replace each chunk with a call to the corresponding helper.`,
          `4. The refactored '${fnName}' should read as a narrative of named steps.`,
          verify,
        ];
      }
      return [
        `0. PLAN: In 1 sentence, name each step function you will introduce and describe what it handles.`,
        `1. '${fnName}' has ${chunkRanges.length} sequential control-flow chunks to extract.`,
        ...chunkRanges.map((r, i) =>
          `${i + 2}. Extract lines ${r.startLine}–${r.endLine} into a helper named 'handle${capitalize(fnName)}Step${i + 1}' (or a more descriptive name).`
        ),
        `${chunkRanges.length + 2}. Replace each chunk with a call to its helper — preserve execution order and side effects.`,
        `${chunkRanges.length + 3}. The refactored '${fnName}' should contain only the sequential calls with no inline logic.`,
        verify,
        ];
    },
    skeletonHint: ranges.length > 0
      ? `function ${fnName}(...args) {\n${ranges.map((_, i) => `  handle${capitalize(fnName)}Step${i + 1}(args);`).join('\n')}\n}`
      : `function ${fnName}(...args) {\n  handleStep1(args);\n  handleStep2(args);\n  handleStep3(args);\n}`,
    expectedScoreImprovement: 2.0,
  };
}

function buildSplitAtSeamTemplate(smell: Smell, fn: FunctionResult, code: string): RefactoringTemplate {
  const fnName = fn.name;
  const seams = findNaturalSeams(code, fn);
  // Prefer the first detected blank/comment seam; fall back to the structural midpoint.
  const midpoint = fn.line + Math.floor(fn.length / 2);
  const seamLine = seams.length > 0 ? seams[0] : midpoint;

  return {
    strategy: 'split_at_seam',
    instructions: () => [
      `1. Find the natural seam in '${fnName}' where one concern ends and another begins (at line ${seamLine}).`,
      `2. Extract the second half (lines ${seamLine}–${fn.line + fn.length - 1}) into a new function named after what it does (not where it comes from).`,
      `3. Pass the necessary data as parameters to the new function — do not use shared mutable state.`,
      `4. The original '${fnName}' should be reduced to roughly half its current size.`,
      `5. Both resulting functions should have a single, clear responsibility.`,
      `VERIFY: Re-read both functions after applying — confirm (1) behaviour unchanged, (2) no shared mutable state, (3) all call sites still valid, (4) existing comments preserved. If compilation fails, revert to currentCode and move the split point.`,
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
      `VERIFY: Re-read '${fnName}' after applying — confirm (1) all call sites updated, (2) no positional arguments remain, (3) behaviour unchanged, (4) existing comments preserved. If compilation fails, revert to currentCode and update call sites one at a time.`,
    ],
    skeletonHint: [
      `// Before:`,
      `function ${fnName}(userId: string, timeout: number, retries: number, verbose: boolean) {`,
      `  // ... uses all four params`,
      `}`,
      ``,
      `// After:`,
      `interface ${capitalize(fnName)}Options {`,
      `  userId: string;`,
      `  timeout: number;`,
      `  retries: number;`,
      `  verbose: boolean;`,
      `}`,
      `function ${fnName}(options: ${capitalize(fnName)}Options) {`,
      `  const { userId, timeout, retries, verbose } = options;`,
      `  // ...`,
      `}`,
    ].join('\n'),
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
      `VERIFY: Re-read '${fnName}' after applying — confirm (1) boolean logic is equivalent (test edge cases mentally), (2) no conditions removed or reordered, (3) all call sites still valid, (4) existing comments preserved. If logic differs, revert to currentCode and extract one variable at a time.`,
    ],
    skeletonHint: [
      `// Before:`,
      `function ${fnName}(user, order) {`,
      `  if (user.active && !user.suspended && order.total > 0 && order.items.length > 0 && order.currency === 'USD') {`,
      `    // process ...`,
      `  }`,
      `}`,
      ``,
      `// After:`,
      `function ${fnName}(user, order) {`,
      `  const isUserEligible = user.active && !user.suspended;`,
      `  const isValidOrder = order.total > 0 && order.items.length > 0 && order.currency === 'USD';`,
      `  if (isUserEligible && isValidOrder) {`,
      `    // process ...`,
      `  }`,
      `}`,
    ].join('\n'),
    expectedScoreImprovement: 1.5,
  };
}

function buildAddDocstringsTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'add_docstrings',
    instructions: () => [
      `1. Add a documentation comment immediately above '${fnName}' that describes what it does in one sentence.`,
      `2. Document each parameter: name, type, and purpose.`,
      `3. Document the return value: what is returned and when it can be null or undefined.`,
      `4. If the function throws or has important side effects, document those too.`,
      `5. Use the appropriate format for the language (JSDoc /** */ for JS/TS, """docstring""" for Python, /** Javadoc */ for Java).`,
      `6. Apply the same pattern to ALL other undocumented public functions in the file to fully resolve LowDocCoverage.`,
    ],
    skeletonHint: [
      `// Before:`,
      `export function ${fnName}(userId: string, includeDeleted: boolean): Promise<User[]> {`,
      `  // ...`,
      `}`,
      ``,
      `// After:`,
      `/**`,
      ` * Retrieves all users matching the given criteria.`,
      ` * @param userId    - The ID of the requesting user (used for access control).`,
      ` * @param includeDeleted - When true, soft-deleted users are included in results.`,
      ` * @returns Array of matching User objects; empty array when none found.`,
      ` */`,
      `export function ${fnName}(userId: string, includeDeleted: boolean): Promise<User[]> {`,
      `  // ...`,
      `}`,
    ].join('\n'),
    expectedScoreImprovement: 1.5,
  };
}

function buildExtractConstantsTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'extract_constants',
    instructions: () => [
      `1. Identify ALL magic numbers and magic strings in '${fnName}' (literal values whose meaning is not immediately obvious).`,
      `2. For each magic value, declare a named constant at module/class level that explains its purpose.`,
      `3. Use SCREAMING_SNAKE_CASE for constants (e.g., MAX_RETRY_COUNT = 3, DEFAULT_TIMEOUT_MS = 5000).`,
      `4. Replace EVERY occurrence of each magic value throughout the file with its named constant.`,
      `5. The constant name should read like a business rule: prefer MAX_LOGIN_ATTEMPTS over LIMIT.`,
      `6. Group related constants together and add a comment describing the group if there are 3 or more.`,
    ],
    skeletonHint: [
      `// Before:`,
      `function ${fnName}() {`,
      `  if (items.length > 100) throw new Error('limit exceeded');`,
      `  setTimeout(flush, 5000);`,
      `  const factor = 1.15;`,
      `}`,
      ``,
      `// After:`,
      `// --- Configuration constants ---`,
      `const MAX_ITEMS = 100;`,
      `const FLUSH_INTERVAL_MS = 5_000;`,
      `const TAX_RATE = 1.15;`,
      ``,
      `function ${fnName}() {`,
      `  if (items.length > MAX_ITEMS) throw new Error('limit exceeded');`,
      `  setTimeout(flush, FLUSH_INTERVAL_MS);`,
      `  const factor = TAX_RATE;`,
      `}`,
    ].join('\n'),
    expectedScoreImprovement: 0.8,
  };
}

function buildGodClassTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'extract_class',
    instructions: () => [
      `0. PLAN: In 1 sentence, name each new class you will extract and describe the single responsibility it will own.`,
      `1. Identify ALL distinct responsibilities inside '${fnName}' — group methods and fields by the data they operate on.`,
      `2. Extract each responsibility group into a new, well-named class (e.g., '${fnName}Validator', '${fnName}Repository').`,
      `3. Each new class should own its data: move the relevant fields in alongside the methods.`,
      `4. Make '${fnName}' delegate to the new classes instead of implementing the logic inline.`,
      `5. Ensure each new class exposes a minimal, cohesive public interface — no more than one responsibility.`,
      `VERIFY: Re-read all affected classes — confirm (1) behaviour unchanged, (2) no circular dependencies introduced, (3) all call sites still valid, (4) existing comments preserved. If compilation fails, revert to currentCode and extract one fewer class.`,
    ],
    skeletonHint: [
      `// Before: ${fnName} has 400+ lines — validates, persists, formats, notifies`,
      ``,
      `// After:`,
      `class ${fnName}Validator { validate(data) { ... } }`,
      `class ${fnName}Repository { save(data) { ... } }`,
      `class ${fnName} {`,
      `  constructor(`,
      `    private readonly validator: ${fnName}Validator,`,
      `    private readonly repository: ${fnName}Repository,`,
      `  ) {}`,
      `  process(data) {`,
      `    this.validator.validate(data);`,
      `    return this.repository.save(data);`,
      `  }`,
      `}`,
    ].join('\n'),
    expectedScoreImprovement: 3.0,
  };
}

function buildMoveMethodTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'move_method',
    instructions: () => [
      `0. PLAN: In 1 sentence, name which class '${fnName}' envies (accesses most) and where the method should move.`,
      `1. Identify the class whose data '${fnName}' accesses most — that is where it truly belongs.`,
      `2. Move '${fnName}' to the target class; make it a method of that class (remove the foreign parameter).`,
      `3. In the original location, replace the method body with a delegation call to the new location.`,
      `4. If only part of '${fnName}' shows Feature Envy, extract that part first (Extract Method), then move it.`,
      `5. Remove the delegation stub in the original class if nothing outside calls it there.`,
      `VERIFY: Re-read both classes — confirm (1) behaviour unchanged, (2) no new coupling introduced, (3) all call sites still valid, (4) existing comments preserved. If compilation fails, revert to currentCode and add the delegation stub back.`,
    ],
    skeletonHint: [
      `// Before: method in ClassA accessing ClassB's data — Feature Envy`,
      `class ClassA {`,
      `  compute(b: ClassB) { return b.x + b.y + b.z; }`,
      `}`,
      ``,
      `// After: method moved to ClassB where the data lives`,
      `class ClassB {`,
      `  compute() { return this.x + this.y + this.z; }`,
      `}`,
      `class ClassA {`,
      `  compute(b: ClassB) { return b.compute(); } // thin delegate, remove if unused`,
      `}`,
    ].join('\n'),
    expectedScoreImprovement: 1.5,
  };
}

function buildMessageChainTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'introduce_intermediary',
    instructions: () => [
      `0. PLAN: In 1 sentence, name the intermediate variable(s) you will introduce to break the chain.`,
      `1. Identify the message chain in '${fnName}' (call chains like a.getB().getC().getD()).`,
      `2. Extract each intermediate object into a named local variable that describes what it represents.`,
      `3. If the same chain appears more than once, introduce a helper method that encapsulates the navigation.`,
      `4. The final expression should use at most one dot-access per line — follow the Law of Demeter.`,
      `5. If deeper access is needed, add a method to the intermediate class rather than chaining from outside.`,
    ],
    skeletonHint: [
      `// Before:`,
      `function ${fnName}() {`,
      `  return obj.getA().getB().getC().value;`,
      `}`,
      ``,
      `// After:`,
      `function ${fnName}() {`,
      `  const a = obj.getA();`,
      `  const b = a.getB();`,
      `  const c = b.getC();`,
      `  return c.value;`,
      `}`,
    ].join('\n'),
    expectedScoreImprovement: 0.8,
  };
}

function buildSATDTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'resolve_debt',
    instructions: (s) => [
      `0. PLAN: In 1 sentence, describe what the TODO/FIXME in '${fnName}' is admitting and the concrete action needed to resolve it.`,
      `1. Read the SATD comment carefully: "${s.description}". Understand the original developer's intent before touching any code.`,
      `2. Determine whether the debt is a missing feature, a known bug, a workaround, or a quality shortcut — the resolution differs for each.`,
      `3. For missing features / known bugs: implement the fix properly now rather than leaving the comment. Remove the TODO/FIXME once resolved.`,
      `4. For workarounds / quality shortcuts: refactor to the correct approach. If the correct approach is out of scope, document WHY it is deferred and when it should be revisited (not just "// TODO: fix this").`,
      `5. If the debt comment references external context (ticket, PR, issue), note that context in the replacement comment so future readers can trace the decision.`,
      `VERIFY: Re-read '${fnName}' after applying — confirm (1) the TODO/FIXME is gone or replaced with a time-bounded explanation, (2) behaviour is unchanged or intentionally improved, (3) no new debt comments were added, (4) existing non-debt comments preserved. If tests fail, revert to currentCode and address a narrower aspect of the debt.`,
    ],
    skeletonHint: [
      `// Before:`,
      `function ${fnName}() {`,
      `  // TODO: handle edge case where input is null`,
      `  const result = process(input);`,
      `  return result;`,
      `}`,
      ``,
      `// After:`,
      `function ${fnName}() {`,
      `  if (input == null) throw new Error('${fnName}: input must not be null');`,
      `  const result = process(input);`,
      `  return result;`,
      `}`,
    ].join('\n'),
    // SATD repayment is hard: only 10.1 % exact-match success (arXiv 2501.09888).
    // Improvement is moderate because resolving a single TODO rarely moves the score much.
    expectedScoreImprovement: 0.8,
  };
}

function buildTypeSafetyTemplate(smell: Smell, fn: FunctionResult, _code: string): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'strengthen_types',
    instructions: () => [
      `0. PLAN: In 1 sentence, name each type escape in '${fnName}' ('as any', non-null assertion '!', unsafe cast) and the correct type-safe replacement for each.`,
      `1. Identify every type escape in '${fnName}': 'as any', 'as unknown', '!' (non-null assertion), and raw object casts.`,
      `2. For each 'as any' / 'as unknown': replace with a proper type annotation or a type-guard function that narrows the type safely.`,
      `3. For each '!' non-null assertion: replace with an explicit null-check guard or an assertion function (e.g., 'assertDefined(value)').`,
      `4. For values coming from external sources (JSON.parse, API responses): introduce a validation function with a proper return type instead of a cast.`,
      `5. Do NOT use 'as T' to silence type errors — if the type is genuinely unknown, model it as 'unknown' and narrow with a type predicate.`,
      `VERIFY: Re-read '${fnName}' after applying — confirm (1) TypeScript compiles without 'as any' suppressions, (2) all narrowing paths are covered, (3) runtime behaviour unchanged, (4) existing comments preserved. If compilation fails, revert to currentCode and add the type guard incrementally.`,
    ],
    skeletonHint: [
      `// Before:`,
      `function ${fnName}(raw: unknown) {`,
      `  const data = raw as any;`,
      `  return data.value!;`,
      `}`,
      ``,
      `// After:`,
      `function is${capitalize(fnName)}Data(v: unknown): v is { value: string } {`,
      `  return typeof v === 'object' && v !== null && 'value' in v;`,
      `}`,
      ``,
      `function ${fnName}(raw: unknown) {`,
      `  if (!is${capitalize(fnName)}Data(raw)) throw new Error('Unexpected shape');`,
      `  return raw.value;`,
      `}`,
    ].join('\n'),
    expectedScoreImprovement: 1.0,
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

/**
 * Returns absolute line numbers of natural seams inside a function body.
 * A seam is a blank line or a standalone comment line — places where one
 * logical section ends and another begins. Ignores the first and last two
 * lines of the function to avoid false-positives on opening/closing braces.
 *
 * Research basis: EM-Assist (2024) found that concrete line ranges boost
 * extract-method LLM accuracy from ~23 % to significantly higher rates.
 */
function findNaturalSeams(code: string, fn: FunctionResult): number[] {
  const lines = code.split('\n');
  const fnLines = lines.slice(fn.line - 1, fn.line + fn.length - 1);
  const seams: number[] = [];
  // Skip first 2 and last 2 lines (opening/closing braces / def header)
  for (let i = 2; i < fnLines.length - 2; i++) {
    const trimmed = fnLines[i].trim();
    if (
      trimmed === '' ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('--')
    ) {
      // Absolute line number
      seams.push(fn.line + i);
    }
  }
  return seams;
}
