import type { Smell } from '@healthy-ai-code/core';

/** Discriminator for the next recommended action after a health review. */
export interface NextAction {
  action: 'refactor' | 'commit_safe' | 'review_pr' | 'none';
  instruction: string;
  priority: Smell | null;
  toolToCallAfter: string | null;
}

/** Standard MCP tool response payload returned to the AI assistant. */
export interface ToolResponse {
  score: number;
  category: 'green' | 'yellow' | 'red';
  loopComplete: boolean;
  issues: Smell[];
  summary: string;
  nextAction: NextAction;
}
