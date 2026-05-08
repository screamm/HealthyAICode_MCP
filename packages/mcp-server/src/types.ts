import type { Smell } from '@healthy-ai-code/core';

export interface NextAction {
  action: 'refactor' | 'commit_safe' | 'review_pr' | 'none';
  instruction: string;
  priority: Smell | null;
  toolToCallAfter: string | null;
}

export interface ToolResponse {
  score: number;
  category: 'green' | 'yellow' | 'red';
  loopComplete: boolean;
  issues: Smell[];
  summary: string;
  nextAction: NextAction;
}
