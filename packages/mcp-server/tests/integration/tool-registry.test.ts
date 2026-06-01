/**
 * Integration test for the tool registry.
 *
 * Verifies:
 *  1. LOOP_TOOLS and DEFERRED_TOOLS are disjoint sets.
 *  2. The union of LOOP_TOOLS + DEFERRED_TOOLS equals the total number of
 *     tool registrations in server.ts (so the registry stays in sync with
 *     the actual server).
 *  3. None of the 5 loop-critical tools appear in the deferred list.
 */
import { describe, it, expect } from 'vitest';
import {
  LOOP_TOOLS,
  DEFERRED_TOOLS,
  getDeferredToolNames,
  getLoopToolNames,
  isDeferred,
  isLoopTool,
} from '../../src/tool-registry';

/**
 * The complete set of tool names registered by server.ts.
 * Update this list when new register* calls are added to server.ts.
 *
 * Current count: 29 tools (5 loop + 24 deferred).
 */
const ALL_REGISTERED_TOOL_NAMES = new Set<string>([
  // ── Loop-critical tools (5) ──────────────────────────────────────────
  'code_health_score',
  'code_health_review',
  'code_health_auto_refactor',
  'code_health_auto_refactor_apply',
  'pre_commit_code_health_safeguard',

  // ── Deferred / exploration tools (23) ────────────────────────────────
  // Change-set & repo analytics
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

  // Calibration and validation
  'code_health_calibration_status',
  'code_health_validate_against_dataset',
  'code_health_model_benchmark',

  // Debt goal tracking (4 tools from registerDebtGoalsTools)
  'code_health_debt_goals_list',
  'code_health_debt_goal_set',
  'code_health_debt_goal_remove',
  'code_health_debt_goals_report',

  // Configuration
  'get_config',
  'set_config',

  // Export formatters (Sprint 59)
  'code_health_format_output',
]);

describe('tool-registry: LOOP_TOOLS and DEFERRED_TOOLS are disjoint', () => {
  it('no tool appears in both LOOP_TOOLS and DEFERRED_TOOLS', () => {
    const loopSet = new Set(LOOP_TOOLS);
    const overlap = DEFERRED_TOOLS.filter(name => loopSet.has(name));
    expect(overlap).toHaveLength(0);
  });

  it('getDeferredToolNames() returns no loop-critical tools', () => {
    const loopSet = new Set(LOOP_TOOLS);
    const deferred = getDeferredToolNames();
    const violations = deferred.filter(name => loopSet.has(name));
    expect(violations).toHaveLength(0);
  });

  it('LOOP_TOOLS contains none of the deferred tool names', () => {
    const deferredSet = new Set(DEFERRED_TOOLS);
    const violations = LOOP_TOOLS.filter(name => deferredSet.has(name));
    expect(violations).toHaveLength(0);
  });
});

describe('tool-registry: union matches server.ts registrations', () => {
  it('every registered tool is present in either LOOP_TOOLS or DEFERRED_TOOLS', () => {
    const registryUnion = new Set([...LOOP_TOOLS, ...DEFERRED_TOOLS]);
    const missing = [...ALL_REGISTERED_TOOL_NAMES].filter(name => !registryUnion.has(name));
    expect(missing).toHaveLength(0);
  });

  it('LOOP_TOOLS + DEFERRED_TOOLS covers all registered tools without extras', () => {
    const registryUnion = new Set([...LOOP_TOOLS, ...DEFERRED_TOOLS]);
    const extra = [...registryUnion].filter(name => !ALL_REGISTERED_TOOL_NAMES.has(name));
    expect(extra).toHaveLength(0);
  });

  it('total tool count equals sum of LOOP_TOOLS + DEFERRED_TOOLS', () => {
    const totalInRegistry = LOOP_TOOLS.length + DEFERRED_TOOLS.length;
    expect(totalInRegistry).toBe(ALL_REGISTERED_TOOL_NAMES.size);
  });
});

describe('tool-registry: LOOP_TOOLS contains exactly the 5 loop-critical tools', () => {
  const EXPECTED_LOOP_TOOLS = [
    'code_health_score',
    'code_health_review',
    'code_health_auto_refactor',
    'code_health_auto_refactor_apply',
    'pre_commit_code_health_safeguard',
  ];

  it('has exactly 5 loop tools', () => {
    expect(LOOP_TOOLS).toHaveLength(5);
  });

  it('contains all expected loop-critical tool names', () => {
    for (const name of EXPECTED_LOOP_TOOLS) {
      expect(LOOP_TOOLS).toContain(name);
    }
  });
});

describe('tool-registry: helper functions', () => {
  it('isDeferred returns true for a deferred tool', () => {
    expect(isDeferred('analyze_change_set')).toBe(true);
    expect(isDeferred('code_health_knowledge_map')).toBe(true);
  });

  it('isDeferred returns false for a loop tool', () => {
    expect(isDeferred('code_health_review')).toBe(false);
    expect(isDeferred('code_health_auto_refactor')).toBe(false);
  });

  it('isLoopTool returns true for loop tools', () => {
    expect(isLoopTool('code_health_review')).toBe(true);
    expect(isLoopTool('pre_commit_code_health_safeguard')).toBe(true);
  });

  it('isLoopTool returns false for deferred tools', () => {
    expect(isLoopTool('analyze_change_set')).toBe(false);
    expect(isLoopTool('code_health_bus_factor')).toBe(false);
  });

  it('getLoopToolNames returns the same array as LOOP_TOOLS', () => {
    expect(getLoopToolNames()).toEqual(LOOP_TOOLS);
  });

  it('getDeferredToolNames returns the same array as DEFERRED_TOOLS', () => {
    expect(getDeferredToolNames()).toEqual(DEFERRED_TOOLS);
  });
});
