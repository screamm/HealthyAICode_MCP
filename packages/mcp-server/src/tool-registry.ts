/**
 * Tool registry — declares which tools are core-loop (eagerly loaded) vs.
 * exploration/analytics tools (deferred-loadable on demand).
 *
 * ## Deferred tool loading (Anthropic beta)
 *
 * Client prerequisite:
 *   - Send beta header: `anthropic-beta: advanced-tool-use-2025-11-20`
 *   - Include ONE of the following tool-search variants in the tools list:
 *       - `tool_search_tool_regex_20251119`  — fast regex search over name + description
 *       - `tool_search_tool_bm25_20251119`   — BM25 ranking over name, description, and argument names/descriptions
 *
 * The MCP server itself is client-agnostic: existing clients that do NOT send the
 * beta header receive all 27 tools as before (no breaking change).
 *
 * The registry simply declares *intent* — the server uses DEFERRED_TOOLS to annotate
 * tools with `defer_loading: true` when the SDK / transport layer supports it.
 */

/**
 * The 5 loop-critical tools that must always be immediately available to the AI.
 * These are the tight refactoring loop: score → review → auto-refactor → apply → safeguard.
 * They are NEVER marked `defer_loading`.
 */
export const LOOP_TOOLS: readonly string[] = [
  'code_health_score',
  'code_health_review',
  'code_health_auto_refactor',
  'code_health_auto_refactor_apply',
  'pre_commit_code_health_safeguard',
] as const;

/**
 * The ~22 exploration / analytics / configuration tools that are safe to defer-load.
 * These are only needed when the user wants to explore the codebase, configure the
 * server, or run one-off analyses — not during the hot refactoring loop.
 *
 * Marking these as `defer_loading: true` eliminates ~85 % of schema-token overhead
 * per request during the refactoring loop (analogous to Anthropic's measurement of
 * 55 K → 8.7 K tokens for 58-tool suites).
 */
export const DEFERRED_TOOLS: readonly string[] = [
  // Change-set / repo analytics
  'analyze_change_set',
  'code_health_method_coupling',
  'code_health_hotspots',
  'code_health_trend_analysis',
  'code_health_bus_factor',
  'code_health_knowledge_map',
  'code_health_architecture_debt',
  'code_health_architecture_report',

  // AI-specific and security audits
  'code_health_ai_audit',
  'code_health_ai_readiness',
  'code_health_security_audit',

  // Business / productivity explanations
  'code_health_refactoring_business_case',
  'explain_code_health',
  'explain_code_health_productivity',

  // Calibration and validation (research / ops)
  'code_health_calibration_status',
  'code_health_validate_against_dataset',
  'code_health_model_benchmark',

  // Debt goal tracking (4 tools from registerDebtGoalsTools)
  'code_health_debt_goals_list',
  'code_health_debt_goal_set',
  'code_health_debt_goal_remove',
  'code_health_debt_goals_report',

  // Configuration (set once; rarely touched during a refactoring loop)
  'get_config',
  'set_config',

  // Export formatters (SARIF / GitLab / ISO 5055) — useful for CI/CD pipelines, not during the loop
  'code_health_format_output',

  // Behaviour-equivalence verification (Python / TS / JS dynamic, advisory elsewhere)
  'code_health_verify_refactor',
] as const;
// NOTE: total registered tools = LOOP_TOOLS.length + DEFERRED_TOOLS.length (currently 5 + 25 = 30).

/**
 * Returns the list of tool names that should be marked `defer_loading: true`.
 * Exported for testability and for the server to apply annotations post-registration.
 */
export function getDeferredToolNames(): readonly string[] {
  return DEFERRED_TOOLS;
}

/**
 * Returns the list of loop-critical tool names that must never be deferred.
 * Exported for testability.
 */
export function getLoopToolNames(): readonly string[] {
  return LOOP_TOOLS;
}

/**
 * Returns true if the given tool name is a deferred (non-loop) tool.
 */
export function isDeferred(toolName: string): boolean {
  return DEFERRED_TOOLS.includes(toolName);
}

/**
 * Returns true if the given tool name is a core loop tool (eager-loaded).
 */
export function isLoopTool(toolName: string): boolean {
  return LOOP_TOOLS.includes(toolName);
}
