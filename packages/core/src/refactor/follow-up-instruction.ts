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
  /**
   * Sprint 54 — when true, append the RCI self-critique checklist (generate → critique →
   * improve). Skip on trivially easy near-target fixes to avoid token overhead.
   */
  rciEnabled?: boolean;
  /**
   * Sprint 54 — names of the functions to fix in a single batch pass (all instances of the
   * heaviest smell type), in fix order. When present, a BATCH-PASS instruction is injected.
   */
  batchedSmells?: BatchedFollowUpInstance[];
  /**
   * Sprint 54 — pre-summarised git-blame context (< 400 chars) for BrainMethod / GodClass /
   * KnowledgeLoss. When set, a GIT-KONTEXT block is injected to surface original intent.
   */
  blameContext?: string;
  /**
   * Sprint 54 — comment-line count of the current code. When set, a comment-count invariant
   * instruction is injected so the model does not strip comments to game the score.
   */
  commentCountBefore?: number;
  /**
   * Sprint 54 — when true, predicted CS is structurally too low for a mechanical fix; inject
   * a MANUAL INTERVENTION REQUIRED note offering split / lighter-smell / accept alternatives.
   */
  manualInterventionRequired?: boolean;
}

/** Minimal shape consumed from a batched-smell plan instance (Sprint 54). */
export interface BatchedFollowUpInstance {
  /** Function name to fix in this batch pass. */
  fnName: string;
  /** The shared smell type being batched. */
  smellType: string;
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
  rciNote: string;
  batchNote: string;
  blameNote: string;
  commentInvariantNote: string;
  manualInterventionNote: string;
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
    // Geometric Dynamics of Agentic Loops (arXiv 2512.10350): agentic loops exhibit contractive
    // (convergence toward stable attractor), oscillatory (cycling), or exploratory (divergent) regimes.
    // The Δ < 0.1 stop condition enforces the contractive regime; without it loops drift into oscillation.
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
    // Agent Drift (arXiv 2601.04170): behavioral degradation (semantic/coordination/behavioral drift)
    // compounds over extended sessions — iterationBudget is the primary mitigation; security stop
    // is the safety valve for drift into vulnerability introduction.
    securityNote: 'SECURITY STOP: if code_health_review shows new SecuritySmells vs. session start, stop immediately — do not continue quality iterations. ',
    // RCI self-critique (arXiv 2510.26480): generate → critique → improve raises extract-method
    // pass-rate from ~0.45 to 0.829. Injected as a prompt addition, not an extra API call.
    rciNote: buildRciNote(p),
    // Batch the heaviest smell type in one pass (√count diminishing-returns curve).
    batchNote: buildBatchNote(p),
    // Git-blame provenance (HAFixAgent arXiv 2511.01047): +38.6% fix-rate for multi-hunk bugs.
    blameNote: buildBlameNote(p),
    // Comment-count invariant: LLMs without a stop rule strip inline comments to game the
    // score (arXiv 2602.21833) — a Goodhart trap. Never let comment count drop.
    commentInvariantNote: buildCommentInvariantNote(p),
    // Abstain-and-validate (arXiv 2510.03217): flag structurally low-CS targets for manual fix.
    manualInterventionNote: buildManualInterventionNote(p),
  };
}

/** Builds the RCI self-critique checklist note (Sprint 54). Empty when rciEnabled is not set. */
function buildRciNote(p: FollowUpParams): string {
  if (!p.rciEnabled) return '';
  return 'RCI-VERIFY (after writing your proposal, before applying): ' +
    '1. CRITIQUE: list every free variable in the extracted block — is each one passed as a parameter in the new signature? ' +
    '2. CRITIQUE: are return values propagated correctly to all call-sites within changeScope? ' +
    '3. CRITIQUE: does the call-site compile/type-check against the new signature? ' +
    '4. IMPROVE: if any check fails, write a revised version before applying. ';
}

/** Builds the BATCH-PASS note listing every function to fix in one pass (Sprint 54). */
function buildBatchNote(p: FollowUpParams): string {
  if (!p.batchedSmells || p.batchedSmells.length === 0) return '';
  const smellType = p.batchedSmells[0].smellType;
  const names = p.batchedSmells.map(i => i.fnName).join(', ');
  return `BATCH-PASS: fix all ${p.batchedSmells.length} instances of ${smellType} in one pass, ` +
    `in order: ${names}. Fixing in this order maximises score delta (the √count curve). `;
}

/** Builds the git-blame context note (Sprint 54). Empty when no blame context is present. */
function buildBlameNote(p: FollowUpParams): string {
  if (!p.blameContext) return '';
  return `GIT-KONTEXT: ${p.blameContext} ` +
    'Use this provenance to understand the original intent and avoid repeating the mistake during extraction. ';
}

/** Builds the comment-count invariant note (Sprint 54). Empty when no baseline count is set. */
function buildCommentInvariantNote(p: FollowUpParams): string {
  if (p.commentCountBefore === undefined) return '';
  return `COMMENT-COUNT INVARIANT: the code currently has ${p.commentCountBefore} comment lines — ` +
    'never strip inline comments to lower SATD hits; a transformation that drops comment count is rejected as non-progress. ';
}

/** Builds the manual-intervention note (Sprint 54). Empty unless flagged. */
function buildManualInterventionNote(p: FollowUpParams): string {
  if (!p.manualInterventionRequired) return '';
  return 'MANUAL INTERVENTION REQUIRED: predicted CS is too low for a mechanical fix. ' +
    'Alternatives: (a) split the file manually, (b) pick a lighter co-located smell, (c) accept the current score. ';
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
    n.manualInterventionNote +
    n.blameNote +
    n.batchNote +
    n.craneNote +
    'Step 0: adapt exampleSkeleton to the actual function and write it out as your plan before touching any code. ' +
    `Apply ${p.strategyLabel} (refactoringInstructions) using model ${p.modelNote}. ` +
    n.hardSmellNote +
    n.diffNote +
    'Never rename — causes oscillation (arXiv 2512.10350) and requires multi-file coordination beyond single-file scope (arXiv 2601.00482). ' +
    n.preserveNote +
    n.commentInvariantNote +
    n.scopeNote +
    n.focusNote +
    n.rciNote +
    'Then run code_health_review. ' +
    'Loop: code_health_auto_refactor → apply → code_health_review until loopComplete: true (score ≥ 9.5). ' +
    `Hard stop after ${p.iterationBudget} total iterations. ` +
    n.deltaNote +
    n.securityNote +
    'Stop immediately if stagnating: true — accept current score.';
}

/** Builds the standard (score < 9.0) follow-up instruction in restructuring mode. */
function buildStandardInstruction(p: FollowUpParams, n: FollowUpNotes): string {
  return n.manualInterventionNote +
    n.blameNote +
    n.batchNote +
    n.craneNote +
    'Step 0: adapt exampleSkeleton to the actual function and write it out as your plan before touching any code. ' +
    `Apply ${p.strategyLabel} (refactoringInstructions) using model ${p.modelNote}. ` +
    n.hardSmellNote +
    'Never rename variables or functions — causes oscillation (arXiv 2512.10350) and requires cross-file coordination out of scope here (arXiv 2601.00482). ' +
    n.preserveNote +
    n.commentInvariantNote +
    n.scopeNote +
    n.focusNote +
    n.rciNote +
    'Then run code_health_review. ' +
    'Loop: code_health_auto_refactor → apply → code_health_review until loopComplete: true (score ≥ 9.5). ' +
    `Hard stop after ${p.iterationBudget} iterations. ` +
    n.typicalNote +
    n.deltaNote +
    n.securityNote +
    'Stop immediately if stagnating: true — accept the current score or switch to a different file. ' +
    'Target: ≥ 9.5.';
}
