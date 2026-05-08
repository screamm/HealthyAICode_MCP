import { describe, it, expect } from 'vitest';
import type { ToolResponse, NextAction } from '../../src/types';

describe('MCP-specifika typer', () => {
  it('ToolResponse har rätt struktur', () => {
    const response: ToolResponse = {
      score: 8.5,
      category: 'yellow',
      loopComplete: false,
      issues: [],
      summary: 'Test summary',
      nextAction: {
        action: 'refactor',
        instruction: 'Refaktorera X',
        priority: null,
        toolToCallAfter: 'code_health_review',
      },
    };
    expect(response.score).toBe(8.5);
    expect(response.loopComplete).toBe(false);
    expect(response.nextAction.action).toBe('refactor');
  });

  it('NextAction med commit_safe', () => {
    const action: NextAction = {
      action: 'commit_safe',
      instruction: 'Koden är AI-redo.',
      priority: null,
      toolToCallAfter: null,
    };
    expect(action.action).toBe('commit_safe');
    expect(action.toolToCallAfter).toBeNull();
  });
});
