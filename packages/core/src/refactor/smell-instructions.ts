import type { Smell, SmellType, FunctionResult } from '../types';

/** Identifies which refactoring approach should be applied to address a detected code smell. */
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

/**
 * Encapsulates step-by-step instructions and a skeleton hint for a single improvement strategy.
 * Returned by {@link getRefactoringTemplate} and consumed by the auto-improvement pipeline.
 */
export interface RefactoringTemplate {
  strategy: RefactoringStrategy;
  instructions: (smell: Smell, code: string, fnResult: FunctionResult) => string[];
  skeletonHint: string;
  expectedScoreImprovement: number; // 0-3 points
}

/** Bundles the three arguments shared by every template-builder to eliminate DataClumps. */
interface TemplateBuilderArgs {
  smell: Smell;
  fn: FunctionResult;
  code: string;
}

type TemplateBuilder = (args: TemplateBuilderArgs) => RefactoringTemplate;

/** Maps each SmellType to its corresponding template-builder function. */
const TEMPLATE_BUILDERS: Partial<Record<SmellType, TemplateBuilder>> = {
  ComplexMethod: buildExtractMethodTemplate,
  CognitiveComplexity: buildExtractMethodTemplate,
  BrainMethod: buildAggressiveExtractTemplate,
  DeepNesting: buildEarlyReturnTemplate,
  BumpyRoad: buildExtractChunksTemplate,
  LargeMethod: buildSplitAtSeamTemplate,
  LongParameterList: buildParameterObjectTemplate,
  // Reuse existing templates for structurally equivalent smells.
  PrimitiveObsession: buildParameterObjectTemplate,
  DataClumps: buildParameterObjectTemplate,
  ComplexConditional: buildSimplifyConditionalTemplate,
  LowDocCoverage: buildAddDocstringsTemplate,
  DocumentationDebt: buildAddDocstringsTemplate,
  MagicNumber: buildExtractConstantsTemplate,
  MessageChain: buildMessageChainTemplate,
  GodClass: buildGodClassTemplate,
  FeatureEnvy: buildMoveMethodTemplate,
  SATD: buildSATDTemplate,
  TypeSafetyEscape: buildTypeSafetyTemplate,
};

/** Returns the refactoring template for a given smell and function context. */
export function getRefactoringTemplate(smell: Smell, fn: FunctionResult, code: string): RefactoringTemplate {
  const builder = TEMPLATE_BUILDERS[smell.type as SmellType];
  const args: TemplateBuilderArgs = { smell, fn, code };
  if (builder) return builder(args);
  return buildGenericTemplate(args);
}

// ─── Private helpers ───────────────────────────────────────────────────────────

function buildExtractMethodTemplate({ smell, fn, code }: TemplateBuilderArgs): RefactoringTemplate {
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
      `2. Extract lines ${startLine}–${firstSeam - 1} into a helper with a verb-phrase name describing what it does (e.g., 'validate${capitalize(fnName)}Input'). Verb-first names signal intent — 'parseUserData' beats 'userData'.`,
      `3. Extract lines ${firstSeam}–${secondSeam - 1} into a second verb-phrase helper (e.g., 'process${capitalize(fnName)}Result', 'formatOutput').`,
      `4. Replace each extracted block with a call to the new helper function.`,
      `5. Ensure the main function '${fnName}' now reads as a sequence of named calls.`,
      `VERIFY: Re-read '${fnName}' after applying — confirm (1) behaviour unchanged, (2) no new side-effects, (3) all call sites still valid, (4) each extracted helper receives all required variables as explicit parameters (no implicit closure captures — these cause 76 % of LLM refactoring hallucinations per arXiv 2401.15298), (5) all existing comments preserved. If compilation or tests fail, revert to currentCode and attempt a narrower extraction.`,
    ],
    skeletonHint: `<before>\nfunction ${fnName}(...args) {\n  // [inline logic A — lines ${startLine}–${firstSeam - 1}]\n  // [inline logic B — lines ${firstSeam}–${secondSeam - 1}]\n}\n</before>\n\n<after>\nfunction ${fnName}(...args) {\n  const validated = validate${capitalize(fnName)}Input(args);\n  const result = process${capitalize(fnName)}Result(validated);\n  return result;\n}\n</after>`,
    expectedScoreImprovement: 2.5,
  };
}

function buildAggressiveExtractTemplate({ fn }: TemplateBuilderArgs): RefactoringTemplate {
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
      `VERIFY: Mentally trace 2 representative inputs through the refactored '${fnName}' and confirm identical outputs. Then confirm (1) behaviour unchanged, (2) no new side-effects, (3) all call sites still valid, (4) existing comments preserved. If compilation or tests fail, revert to currentCode and extract fewer responsibilities.`,
    ],
    skeletonHint: `<after>\nfunction ${fnName}(...args) {\n  const data = prepareData(args);\n  validate(data);\n  const result = computeResult(data);\n  return formatOutput(result);\n}\n</after>`,
    expectedScoreImprovement: 3.0,
  };
}

function buildEarlyReturnTemplate({ fn }: TemplateBuilderArgs): RefactoringTemplate {
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
    skeletonHint: `<before>\nfunction ${fnName}(...args) {\n  if (valid) {\n    // [nested logic A]\n    if (ready) {\n      // [nested logic B]\n    }\n  }\n}\n</before>\n\n<after>\nfunction ${fnName}(...args) {\n  if (!preconditionA) return null;\n  if (!preconditionB) return defaultValue;\n  // main logic here — no deep nesting\n}\n</after>`,
    expectedScoreImprovement: 2.0,
  };
}

function buildExtractChunksTemplate({ smell, fn }: TemplateBuilderArgs): RefactoringTemplate {
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
      ? `<after>\nfunction ${fnName}(...args) {\n${ranges.map((_, i) => `  handle${capitalize(fnName)}Step${i + 1}(args);`).join('\n')}\n}\n</after>`
      : `<after>\nfunction ${fnName}(...args) {\n  handleStep1(args);\n  handleStep2(args);\n  handleStep3(args);\n}\n</after>`,
    expectedScoreImprovement: 2.0,
  };
}

function buildSplitAtSeamTemplate({ fn, code }: TemplateBuilderArgs): RefactoringTemplate {
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
    skeletonHint: `<after>\nfunction ${fnName}(...args) {\n  const intermediate = computeFirstHalf(args);\n  return computeSecondHalf(intermediate);\n}\n</after>`,
    expectedScoreImprovement: 1.5,
  };
}

function buildParameterObjectTemplate({ fn }: TemplateBuilderArgs): RefactoringTemplate {
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
    skeletonHint: `<before>\nfunction ${fnName}(userId: string, timeout: number, retries: number, verbose: boolean) {\n  // ... uses all four params\n}\n</before>\n\n<after>\ninterface ${capitalize(fnName)}Options {\n  userId: string;\n  timeout: number;\n  retries: number;\n  verbose: boolean;\n}\nfunction ${fnName}(options: ${capitalize(fnName)}Options) {\n  const { userId, timeout, retries, verbose } = options;\n  // ...\n}\n</after>`,
    expectedScoreImprovement: 1.0,
  };
}

function buildSimplifyConditionalTemplate({ fn }: TemplateBuilderArgs): RefactoringTemplate {
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
    skeletonHint: `<before>\nfunction ${fnName}(user, order) {\n  if (user.active && !user.suspended && order.total > 0 && order.items.length > 0 && order.currency === 'USD') {\n    // process ...\n  }\n}\n</before>\n\n<after>\nfunction ${fnName}(user, order) {\n  const isUserEligible = user.active && !user.suspended;\n  const isValidOrder = order.total > 0 && order.items.length > 0 && order.currency === 'USD';\n  if (isUserEligible && isValidOrder) {\n    // process ...\n  }\n}\n</after>`,
    expectedScoreImprovement: 1.5,
  };
}

function buildAddDocstringsTemplate({ fn }: TemplateBuilderArgs): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'add_docstrings',
    instructions: () => [
      `1. SCOPE: Document EVERY undocumented public function and type in the entire file — not just '${fnName}'. LowDocCoverage is a file-wide smell.`,
      `2. For each undocumented symbol, add a documentation comment immediately above it: one sentence describing what it does.`,
      `3. Document each parameter: name, type, and purpose.`,
      `4. Document the return value: what is returned and when it can be null/undefined.`,
      `5. If the function throws, has side effects, or is async, document those too.`,
      `6. Use the appropriate format for the language (JSDoc /** */ for JS/TS, """docstring""" for Python, /** Javadoc */ for Java).`,
    ],
    skeletonHint: `<before>\nexport function ${fnName}(userId: string, includeDeleted: boolean): Promise<User[]> {\n  // ...\n}\n</before>\n\n<after>\n/**\n * Retrieves all users matching the given criteria.\n * @param userId    - The ID of the requesting user (used for access control).\n * @param includeDeleted - When true, soft-deleted users are included in results.\n * @returns Array of matching User objects; empty array when none found.\n */\nexport function ${fnName}(userId: string, includeDeleted: boolean): Promise<User[]> {\n  // ...\n}\n</after>`,
    expectedScoreImprovement: 1.5,
  };
}

function buildExtractConstantsTemplate({ fn }: TemplateBuilderArgs): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'extract_constants',
    instructions: () => [
      `1. Scan THE ENTIRE FILE (not just '${fnName}') and list every magic number and magic string — literal values whose meaning is not immediately obvious.`,
      `2. For each magic value, declare a named constant at module/class level: use SCREAMING_SNAKE_CASE (e.g., MAX_RETRY_COUNT = 3, DEFAULT_TIMEOUT_MS = 5000).`,
      `3. The constant name must read like a business rule: prefer MAX_LOGIN_ATTEMPTS over LIMIT, FLUSH_INTERVAL_MS over 5000.`,
      `4. Replace EVERY occurrence of each magic value throughout the entire file with its named constant — not just the one in '${fnName}'.`,
      `5. Group related constants together with a describing comment when 3 or more belong to the same domain.`,
    ],
    skeletonHint: `<before>\nfunction ${fnName}() {\n  if (items.length > 100) throw new Error('limit exceeded');\n  setTimeout(flush, 5000);\n  const factor = 1.15;\n}\n</before>\n\n<after>\n// --- Configuration constants ---\nconst MAX_ITEMS = 100;\nconst FLUSH_INTERVAL_MS = 5_000;\nconst TAX_RATE = 1.15;\n\nfunction ${fnName}() {\n  if (items.length > MAX_ITEMS) throw new Error('limit exceeded');\n  setTimeout(flush, FLUSH_INTERVAL_MS);\n  const factor = TAX_RATE;\n}\n</after>`,
    expectedScoreImprovement: 0.8,
  };
}

function buildGodClassTemplate({ fn }: TemplateBuilderArgs): RefactoringTemplate {
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
      `VERIFY: Mentally trace the primary use-case through all affected classes and confirm identical behaviour. Then confirm (1) no circular dependencies introduced, (2) all call sites still valid, (3) existing comments preserved. If compilation fails, revert to currentCode and extract one fewer class.`,
    ],
    skeletonHint: `<before>\n// ${fnName} has 400+ lines — validates, persists, formats, notifies\n</before>\n\n<after>\nclass ${fnName}Validator { validate(data) { ... } }\nclass ${fnName}Repository { save(data) { ... } }\nclass ${fnName} {\n  constructor(\n    private readonly validator: ${fnName}Validator,\n    private readonly repository: ${fnName}Repository,\n  ) {}\n  process(data) {\n    this.validator.validate(data);\n    return this.repository.save(data);\n  }\n}\n</after>`,
    expectedScoreImprovement: 3.0,
  };
}

function buildMoveMethodTemplate({ fn }: TemplateBuilderArgs): RefactoringTemplate {
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
      `VERIFY: Mentally trace the method's primary use-case in its new location and confirm identical behaviour. Then confirm (1) no new coupling introduced, (2) all call sites still valid, (3) existing comments preserved. If compilation fails, revert to currentCode and add the delegation stub back.`,
    ],
    skeletonHint: `<before>\n// method in ClassA accessing ClassB's data — Feature Envy\nclass ClassA {\n  compute(b: ClassB) { return b.x + b.y + b.z; }\n}\n</before>\n\n<after>\n// method moved to ClassB where the data lives\nclass ClassB {\n  compute() { return this.x + this.y + this.z; }\n}\nclass ClassA {\n  compute(b: ClassB) { return b.compute(); } // thin delegate, remove if unused\n}\n</after>`,
    expectedScoreImprovement: 1.5,
  };
}

function buildMessageChainTemplate({ fn }: TemplateBuilderArgs): RefactoringTemplate {
  const fnName = fn.name;

  return {
    strategy: 'introduce_intermediary',
    instructions: () => [
      `0. PLAN: List ALL message chains in '${fnName}' you will break, and name the intermediate variable for each.`,
      `1. SCOPE: Find every message chain in '${fnName}' (call chains like a.getB().getC().getD()) — fix them all in this pass.`,
      `2. For each chain: extract every intermediate object into a named local variable describing what it represents.`,
      `3. If the same chain appears more than once, introduce a helper method that encapsulates the navigation.`,
      `4. The final expression should use at most one dot-access per line — follow the Law of Demeter.`,
      `5. If deeper access is needed, add a method to the intermediate class rather than chaining from outside.`,
    ],
    skeletonHint: `<before>\nfunction ${fnName}() {\n  return obj.getA().getB().getC().value;\n}\n</before>\n\n<after>\nfunction ${fnName}() {\n  const a = obj.getA();\n  const b = a.getB();\n  const c = b.getC();\n  return c.value;\n}\n</after>`,
    expectedScoreImprovement: 0.8,
  };
}

function buildSATDTemplate({ smell, fn }: TemplateBuilderArgs): RefactoringTemplate {
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
    skeletonHint: `<before>\nfunction ${fnName}() {\n  // DEBT: handle edge case where input is null\n  const result = process(input);\n  return result;\n}\n</before>\n\n<after>\nfunction ${fnName}() {\n  if (input == null) throw new Error('${fnName}: input must not be null');\n  const result = process(input);\n  return result;\n}\n</after>`,
    // SATD repayment is hard: only 10.1 % exact-match success (arXiv 2501.09888).
    // Improvement is moderate because resolving a single debt comment rarely moves the score much.
    expectedScoreImprovement: 0.8,
  };
}

function buildTypeSafetyTemplate({ fn }: TemplateBuilderArgs): RefactoringTemplate {
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
    skeletonHint: `<before>\nfunction ${fnName}(raw: unknown) {\n  const data = raw as any;\n  return data.value!;\n}\n</before>\n\n<after>\nfunction is${capitalize(fnName)}Data(v: unknown): v is { value: string } {\n  return typeof v === 'object' && v !== null && 'value' in v;\n}\n\nfunction ${fnName}(raw: unknown) {\n  if (!is${capitalize(fnName)}Data(raw)) throw new Error('Unexpected shape');\n  return raw.value;\n}\n</after>`,
    expectedScoreImprovement: 1.0,
  };
}

function buildGenericTemplate({ smell, fn }: TemplateBuilderArgs): RefactoringTemplate {
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

/** Prefixes that mark a line as a natural seam (comment delimiters in common languages). */
const SEAM_PREFIXES = ['//', '#', '*', '--'];

/** Returns true when a trimmed line represents a natural seam (blank line or comment delimiter). */
function isSeamLine(trimmed: string): boolean {
  if (trimmed === '') return true;
  return SEAM_PREFIXES.some(prefix => trimmed.startsWith(prefix));
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
    if (isSeamLine(fnLines[i].trim())) {
      // Absolute line number
      seams.push(fn.line + i);
    }
  }
  return seams;
}
