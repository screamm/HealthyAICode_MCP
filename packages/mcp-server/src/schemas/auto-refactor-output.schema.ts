/**
 * Output schema for the `code_health_auto_refactor` MCP tool.
 *
 * The tool can return one of two shapes:
 *   1. Healthy-file response: `{ message, filePath, score, category }` — file is already healthy.
 *   2. AutoRefactorResult: full refactoring plan with instructions, code context, etc.
 *
 * Both shapes are unified in a single schema (all fields except `score`/`category` are optional)
 * with a `refactoringNeeded` discriminator field added by the MCP layer.
 *
 * Per MCP 2025-11-25 spec: when `outputSchema` is declared, the server MUST
 * return `structuredContent` and SHOULD also return a `TextContent` JSON
 * serialisation for backward-compatible clients.
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
// Zod shape (used with server.registerTool)
// ──────────────────────────────────────────────────────────────────────────────

/** Zod shape for the embedded Smell in AutoRefactorResult. */
const smellZod = z.object({
  type: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  description: z.string(),
  suggestion: z.string(),
  line: z.number().optional(),
  functionName: z.string().optional(),
});

/**
 * Zod output schema shape for the `code_health_auto_refactor` tool.
 * All `AutoRefactorResult`-specific fields are optional so this schema also
 * validates the healthy-file short response.
 */
export const autoRefactorOutputZodShape = {
  // ── Discriminator ──────────────────────────────────────────────────────────
  /** True when the file has smells and a refactoring plan is provided. */
  refactoringNeeded: z.boolean().optional().describe('True when a refactoring plan is provided'),

  // ── Healthy-file response fields ───────────────────────────────────────────
  message: z
    .string()
    .optional()
    .describe('Present on healthy files: "No refactoring needed — file is healthy"'),
  score: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe('Current health score (healthy-file response)'),
  category: z
    .enum(['green', 'yellow', 'red'])
    .optional()
    .describe('Health category (healthy-file response)'),

  // ── AutoRefactorResult core fields ─────────────────────────────────────────
  followUpInstruction: z
    .string()
    .optional()
    .describe('Read this first — prescribes model, effort, and stop conditions'),
  smell: smellZod.optional().describe('The smell being targeted in this pass'),
  refactoringStrategy: z.string().optional().describe('Named refactoring strategy'),
  refactoringInstructions: z
    .array(z.string())
    .optional()
    .describe('Step-by-step refactoring instructions'),
  exampleSkeleton: z.string().optional().describe('Code skeleton example'),
  predictedHealthScore: z.number().optional().describe('Predicted score after fix'),
  predictedScoreDelta: z.string().optional().describe('Expected score change, e.g. +0.8'),
  stagnating: z
    .boolean()
    .optional()
    .describe('True when predicted improvement < 0.3 pts; consider switching file'),
  changeScope: z
    .enum(['function', 'class', 'file'])
    .optional()
    .describe('How widely the refactoring must reach'),
  nearTarget: z
    .boolean()
    .optional()
    .describe('True when current score ≥ 9.0 — entering stabilisation phase'),
  skipCurrentCode: z
    .boolean()
    .optional()
    .describe('True when focusLines has all context needed; reading currentCode is wasteful'),
  iterationBudget: z
    .number()
    .optional()
    .describe('Max remaining loop iterations before accepting current score'),
  outputMode: z.enum(['diff', 'full']).optional().describe('Expected output mode for the fix'),
  remainingSmellTypes: z
    .array(z.string())
    .optional()
    .describe('Top remaining smell types after this fix'),
  colocatedSmells: z
    .array(z.string())
    .optional()
    .describe('Other smells on the same function — fix in the same pass'),
  filePath: z.string().optional().describe('Absolute or relative path to the file'),
  targetFunction: z.string().optional().describe('Name of the target function to refactor'),
  currentHealthScore: z.number().optional().describe('Current health score before refactoring'),
  startLine: z.number().optional().describe('Start line of the target function'),
  endLine: z.number().optional().describe('End line of the target function'),
  functionLineCount: z.number().optional().describe('Number of lines in the target function'),
  currentCode: z.string().optional().describe('Full source of the target function'),
  focusLines: z
    .string()
    .optional()
    .describe('Lines around the smell location (± 8 lines, only for large functions)'),
  successLikelihood: z
    .enum(['easy', 'medium', 'hard'])
    .optional()
    .describe('Estimated fix difficulty'),

  // ── Sprint 52/54 extension fields ──────────────────────────────────────────
  editMode: z
    .enum(['patch', 'funcRewrite', 'fileRewrite'])
    .optional()
    .describe('Cheapest output format for this fix'),
  manualInterventionRequired: z
    .boolean()
    .optional()
    .describe('True when mechanical fix is insufficient — prefer manual action'),
  preActPlanAvailable: z
    .boolean()
    .optional()
    .describe('True when a whole-file Pre-Act plan has been computed'),
  blameContextSummary: z
    .string()
    .optional()
    .describe('Short git-blame summary for BrainMethod/GodClass/KnowledgeLoss'),
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// Plain JSON Schema (for documentation and Anthropic structured-output)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * JSON Schema object for the `code_health_auto_refactor` tool output.
 * Compatible with Anthropic's `structured-outputs-2025-11-13` beta.
 */
export const autoRefactorOutputSchema = {
  type: 'object',
  description:
    'Either a healthy-file short response (message + score + category) or a full AutoRefactorResult with refactoring plan.',
  properties: {
    refactoringNeeded: {
      type: 'boolean',
      description: 'True when a refactoring plan is provided; false/absent for healthy files',
    },
    // Healthy-file response
    message: {
      type: 'string',
      description: '"No refactoring needed — file is healthy"',
    },
    score: {
      type: 'number',
      minimum: 1,
      maximum: 10,
      description: 'Current health score',
    },
    category: {
      type: 'string',
      enum: ['green', 'yellow', 'red'],
      description: 'Health category',
    },
    // AutoRefactorResult fields
    followUpInstruction: {
      type: 'string',
      description: 'Prescribes model, effort, and stop conditions',
    },
    refactoringStrategy: { type: 'string' },
    refactoringInstructions: {
      type: 'array',
      items: { type: 'string' },
    },
    exampleSkeleton: { type: 'string' },
    predictedHealthScore: { type: 'number' },
    predictedScoreDelta: { type: 'string' },
    stagnating: { type: 'boolean' },
    changeScope: {
      type: 'string',
      enum: ['function', 'class', 'file'],
    },
    nearTarget: { type: 'boolean' },
    skipCurrentCode: { type: 'boolean' },
    iterationBudget: { type: 'number' },
    outputMode: { type: 'string', enum: ['diff', 'full'] },
    remainingSmellTypes: { type: 'array', items: { type: 'string' } },
    colocatedSmells: { type: 'array', items: { type: 'string' } },
    filePath: { type: 'string' },
    targetFunction: { type: 'string' },
    currentHealthScore: { type: 'number' },
    startLine: { type: 'number' },
    endLine: { type: 'number' },
    functionLineCount: { type: 'number' },
    currentCode: { type: 'string' },
    focusLines: { type: 'string' },
    successLikelihood: {
      type: 'string',
      enum: ['easy', 'medium', 'hard'],
    },
    editMode: {
      type: 'string',
      enum: ['patch', 'funcRewrite', 'fileRewrite'],
    },
    manualInterventionRequired: { type: 'boolean' },
    preActPlanAvailable: { type: 'boolean' },
    blameContextSummary: { type: 'string' },
  },
  additionalProperties: true,
} as const;
