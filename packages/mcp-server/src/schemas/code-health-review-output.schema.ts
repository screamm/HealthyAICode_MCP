/**
 * Output schema for the `code_health_review` MCP tool.
 *
 * Defined as both a Zod shape (for use with `server.registerTool`) and a
 * plain JSON Schema object (for documentation and direct validation).
 *
 * Per MCP 2025-11-25 spec: when `outputSchema` is declared, the server MUST
 * return `structuredContent` and SHOULD also return a `TextContent` JSON
 * serialisation for backward-compatible clients.
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────────────
// Zod schema (used with server.registerTool)
// ──────────────────────────────────────────────────────────────────────────────

export const smellZodSchema = z.object({
  type: z.string().describe('SmellType identifier, e.g. ComplexMethod, DeepNesting'),
  severity: z
    .enum(['critical', 'high', 'medium', 'low'])
    .describe('Severity level of the smell'),
  description: z.string().describe('Human-readable explanation of the smell'),
  suggestion: z.string().describe('Actionable refactoring suggestion'),
  line: z.number().optional().describe('Source line where the smell was detected'),
  functionName: z.string().optional().describe('Function or method containing the smell'),
});

export const nextActionZodSchema = z.object({
  action: z
    .enum(['refactor', 'commit_safe', 'review_pr', 'none'])
    .describe('Recommended next step for the AI agent'),
  instruction: z.string().describe('Detailed instruction for the next step'),
  priority: smellZodSchema.nullable().describe('The highest-priority smell to address, or null'),
  toolToCallAfter: z
    .string()
    .nullable()
    .describe('MCP tool name to invoke after completing this action, or null'),
});

/**
 * Zod shape for the full `code_health_review` response.
 * Pass this as `outputSchema` in `server.registerTool(...)`.
 */
export const reviewOutputZodShape = {
  score: z.number().min(1).max(10).describe('Health score from 1.0 (worst) to 10.0 (best)'),
  category: z
    .enum(['green', 'yellow', 'red'])
    .describe('Health category: green ≥ 9.0, red < 6.0, yellow otherwise'),
  loopComplete: z
    .boolean()
    .describe('True when score ≥ 9.5 (AI-ready threshold) — stop the refactoring loop'),
  issues: z
    .array(smellZodSchema)
    .describe('List of detected code smells ordered by severity'),
  summary: z.string().describe('Human-readable review summary for display'),
  nextAction: nextActionZodSchema.describe('Recommended next action for the AI agent'),
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// Plain JSON Schema (for documentation, validation, Anthropic structured-output)
// ──────────────────────────────────────────────────────────────────────────────

/** JSON Schema representation of a single Smell object. */
const smellJsonSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', description: 'SmellType identifier' },
    severity: {
      type: 'string',
      enum: ['critical', 'high', 'medium', 'low'],
      description: 'Severity level',
    },
    description: { type: 'string', description: 'Explanation of the smell' },
    suggestion: { type: 'string', description: 'Refactoring suggestion' },
    line: { type: 'number', description: 'Source line number (optional)' },
    functionName: {
      type: 'string',
      description: 'Containing function/method name (optional)',
    },
  },
  required: ['type', 'severity', 'description', 'suggestion'],
  additionalProperties: false,
} as const;

/** JSON Schema for the NextAction object. */
const nextActionJsonSchema = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: ['refactor', 'commit_safe', 'review_pr', 'none'],
    },
    instruction: { type: 'string' },
    priority: { oneOf: [smellJsonSchema, { type: 'null' }] },
    toolToCallAfter: { oneOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['action', 'instruction', 'priority', 'toolToCallAfter'],
  additionalProperties: false,
} as const;

/**
 * Plain JSON Schema object for the `code_health_review` tool output.
 * Compatible with Anthropic's `structured-outputs-2025-11-13` beta for
 * constrained decoding and 24-hour schema caching.
 */
export const reviewOutputSchema = {
  type: 'object',
  properties: {
    score: {
      type: 'number',
      minimum: 1,
      maximum: 10,
      description: 'Health score 1.0–10.0',
    },
    category: {
      type: 'string',
      enum: ['green', 'yellow', 'red'],
      description: 'Health category',
    },
    loopComplete: {
      type: 'boolean',
      description: 'True when score ≥ 9.5',
    },
    issues: {
      type: 'array',
      items: smellJsonSchema,
      description: 'Detected code smells',
    },
    summary: {
      type: 'string',
      description: 'Human-readable review summary',
    },
    nextAction: nextActionJsonSchema,
  },
  required: ['score', 'category', 'loopComplete', 'issues', 'summary', 'nextAction'],
  additionalProperties: false,
} as const;
