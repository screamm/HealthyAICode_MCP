/**
 * Builds the score-adaptive follow-up instruction string for auto-refactor results.
 * Extracted from auto-refactor-analyzer to keep file size within health thresholds.
 */

export interface FollowUpParams {
  nearTarget: boolean;
  strategyLabel: string;
  modelNote: string;
  successLikelihood: 'easy' | 'medium' | 'hard';
  skipCurrentCode: boolean;
  focusLines: string | undefined;
  changeScope: 'function' | 'class' | 'file';
  iterationBudget: number;
  outputMode: 'diff' | 'full';
}

interface FollowUpNotes {
  scopeNote: string;
  focusNote: string;
  hardSmellNote: string;
  diffNote: string;
  typicalNote: string;
  deltaNote: string;
  preserveNote: string;
  craneNote: string;
  securityNote: string;
}

/**
 * Builds the score-adaptive follow-up instruction string.
 * ≥ 9.0 (nearTarget) → stabilisation phase → minimal-diff mode to prevent over-refactoring.
 * < 9.0              → restructuring phase → standard instructions apply.
 * Citations are kept in JSDoc above, not in the output, to reduce inference-time token waste.
 */
export function buildFollowUpInstruction(p: FollowUpParams): string {
  const notes = assembleFollowUpNotes(p);
  if (p.nearTarget) {
    return buildNearTargetInstruction(p, notes);
  }
  return buildStandardInstruction(p, notes);
}

/** Assembles the reusable note fragments for follow-up instructions. */
function assembleFollowUpNotes(p: FollowUpParams): FollowUpNotes {
  return {
    scopeNote: `Edit only within changeScope: ${p.changeScope}. `,
    focusNote: buildFocusNote(p),
    // Hard smells have <50% LLM success rate — flag so the operator plans carefully.
    hardSmellNote: p.successLikelihood === 'hard'
      ? 'HARD SMELL (<50% success rate): use exampleSkeleton as a step-by-step plan before touching any code. '
      : '',
    // Diff output: when outputMode is 'diff', request only changed lines (focusLines excerpt).
    diffNote: p.outputMode === 'diff'
      ? 'OUTPUT: write only the refactored version of focusLines (not the full function) — apply as search-replace on the focus excerpt to preserve untouched lines and save output tokens. '
      : '',
    // Typical iteration count by difficulty (arXiv 2604.10508).
    typicalNote: computeTypicalNote(p.successLikelihood),
    // Convergence noise floor (CodeScene empirical calibration): stop if score delta < 0.1.
    // Research: arXiv 2602.21833 — structural metrics stabilise after iteration 2; gains < 0.1
    // are statistical noise. Prevents wasted iterations on files that have already converged.
    deltaNote: 'Also stop if score Δ < 0.1 between iterations — convergence noise floor. ',
    // Constraint re-injection per turn prevents "constraint decay" in long agentic loops.
    // Research: arXiv 2605.06445 — constraints weaken as context grows; re-stating each call prevents drift.
    // arXiv 2605.17304 (Context Codec, May 2026): "existing methods rarely specify which semantic
    // commitments must survive compression"; re-injecting explicit constraints (API signatures,
    // imports, tests) is the commitment-preservation mechanism that survives context compression.
    preserveNote: 'Preserve: public API signatures, all imports, all existing tests, inline comments. ',
    // CRANE pattern: free-form reasoning BEFORE constrained code output.
    // Research: CRANE (arXiv 2502.09061) — hard schema/code constraints during reasoning degrade
    // accuracy 10–30 %; alternating free reasoning → code output recovers +10 pp.
    // Explicitly instructing "think then apply" reproduces this benefit without model retraining.
    craneNote: 'THINK FIRST: before touching any code, write out (a) why this specific change is correct and (b) what regression risk exists. Then apply. ',
    // Security degradation hard stop.
    // Research: arXiv 2506.11022 — 37.6 % increase in critical vulnerabilities after 5+ quality-focused
    // iterations. Security regressions introduced mid-loop are not recoverable by further quality work.
    // arXiv 2605.02741 (AI-Generated Smells): LLM-generated code introduces new smells (God Class,
    // Feature Envy, DataClumps) at measurable rates; code_health_review after each iteration is the
    // primary guard against regression — stopping on new smells is evidence-backed.
    securityNote: 'SECURITY STOP: if code_health_review shows new SecuritySmells vs. session start, stop immediately — do not continue quality iterations. ',
  };
}

/** Builds the context-focus note based on skipCurrentCode and focusLines availability. */
function buildFocusNote(p: FollowUpParams): string {
  if (p.skipCurrentCode) {
    return 'CONTEXT OPTIMISATION: focusLines contains all needed context for this surgical change — do not read currentCode (saves tokens). ';
  }
  if (p.focusLines) {
    return 'focusLines is the primary context — consult currentCode only if more context is needed. ';
  }
  return '';
}

/** Returns the typical iteration count note for the given success likelihood. */
function computeTypicalNote(successLikelihood: 'easy' | 'medium' | 'hard'): string {
  if (successLikelihood === 'easy') return 'Typically 1–2. ';
  if (successLikelihood === 'hard') return 'Typically 3–5. ';
  return 'Typically 2–3. ';
}

/** Builds the near-target (score ≥ 9.0) follow-up instruction in minimal-diff mode. */
function buildNearTargetInstruction(p: FollowUpParams, n: FollowUpNotes): string {
  // Explicitly naming the strategy raises LLM success rate from 15.6 % to 86.7 %
  // (arXiv 2511.21788): telling the model which specific refactoring to apply
  // rather than "improve code quality" prevents superficial or wrong transforms.
  return 'NEAR TARGET (score ≥ 9.0) — minimal-diff mode. ' +
    n.craneNote +
    'Step 0: adapt exampleSkeleton to the actual function and write it out as your plan before touching any code. ' +
    `Apply ${p.strategyLabel} (refactoringInstructions) using model ${p.modelNote}. ` +
    n.hardSmellNote +
    n.diffNote +
    'Never rename — causes oscillation that undoes quality gains. ' +
    n.preserveNote +
    n.scopeNote +
    n.focusNote +
    'Then run code_health_review. ' +
    'Loop: code_health_auto_refactor → apply → code_health_review until loopComplete: true (score ≥ 9.5). ' +
    `Hard stop after ${p.iterationBudget} total iterations. ` +
    n.deltaNote +
    n.securityNote +
    'Stop immediately if stagnating: true — accept current score.';
}

/** Builds the standard (score < 9.0) follow-up instruction in restructuring mode. */
function buildStandardInstruction(p: FollowUpParams, n: FollowUpNotes): string {
  return n.craneNote +
    'Step 0: adapt exampleSkeleton to the actual function and write it out as your plan before touching any code. ' +
    `Apply ${p.strategyLabel} (refactoringInstructions) using model ${p.modelNote}. ` +
    n.hardSmellNote +
    'Never rename variables or functions — causes oscillation. ' +
    n.preserveNote +
    n.scopeNote +
    n.focusNote +
    'Then run code_health_review. ' +
    'Loop: code_health_auto_refactor → apply → code_health_review until loopComplete: true (score ≥ 9.5). ' +
    `Hard stop after ${p.iterationBudget} iterations. ` +
    n.typicalNote +
    n.deltaNote +
    n.securityNote +
    'Stop immediately if stagnating: true — accept the current score or switch to a different file. ' +
    'Target: ≥ 9.5.';
}
