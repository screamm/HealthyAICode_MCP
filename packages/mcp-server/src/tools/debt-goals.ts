import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  getGoal,
  setGoal,
  removeGoal,
  listGoals,
  updateGoalStatus,
  analyzeFile,
} from '@healthy-ai-code/core';
import type { GoalType, DebtGoal } from '@healthy-ai-code/core';
import { resolveSafePath } from './path-safety';

type ToolResponse = { content: { type: string; text: string }[]; isError?: boolean };

async function handleList({ filePath, status }: Record<string, unknown>): Promise<ToolResponse> {
  try {
    let goals: DebtGoal[];
    if (filePath) {
      const goal = getGoal(filePath as string);
      goals = goal ? [goal] : [];
    } else {
      goals = listGoals();
    }
    if (status) {
      goals = goals.filter((g) => g.status === status);
    }
    return {
      content: [{ type: 'text', text: JSON.stringify({ goals }, null, 2) }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
  }
}

async function handleSet({ filePath, goalType, targetScore, expiresAt, note }: Record<string, unknown>): Promise<ToolResponse> {
  try {
    const goal = setGoal(resolveSafePath(filePath as string), {
      goalType: goalType as GoalType,
      targetScore: targetScore !== undefined ? Number(targetScore) : undefined,
      expiresAt: (expiresAt as string) ?? undefined,
      note: (note as string) ?? undefined,
      setBy: 'ai-assistant',
    });
    return {
      content: [{ type: 'text', text: JSON.stringify({ goal }, null, 2) }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
  }
}

async function handleRemove({ filePath }: Record<string, unknown>): Promise<ToolResponse> {
  try {
    const removed = removeGoal(resolveSafePath(filePath as string));
    return {
      content: [
        { type: 'text', text: JSON.stringify({ removed, filePath: filePath as string }, null, 2) },
      ],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
  }
}

async function refreshGoalScore(goal: DebtGoal): Promise<DebtGoal> {
  try {
    const result = await analyzeFile(goal.filePath);
    return updateGoalStatus(goal.filePath, result.score) ?? goal;
  } catch {
    return goal;
  }
}

function buildReportSummary(updated: DebtGoal[]) {
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  for (const g of updated) {
    byStatus[g.status] = (byStatus[g.status] ?? 0) + 1;
    byType[g.goalType] = (byType[g.goalType] ?? 0) + 1;
  }
  return { byStatus, byType };
}

async function handleReport({ projectDir }: Record<string, unknown>): Promise<ToolResponse> {
  try {
    const goals = listGoals((projectDir as string) ?? undefined);
    const updated = await Promise.all(goals.map(refreshGoalScore));

    const { byStatus, byType } = buildReportSummary(updated);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { totalGoals: updated.length, byStatus, byType, goals: updated },
            null,
            2
          ),
        },
      ],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: 'text', text: JSON.stringify({ error: message }) }], isError: true };
  }
}

const LIST_SCHEMA = {
  filePath: z.string().optional().describe('Filter to a single file path'),
  status: z.enum(['active', 'warning', 'failed', 'expired']).optional().describe('Filter by goal status'),
};

const targetScoreNum = z.number().min(0).max(10);
const targetScoreSchema = targetScoreNum.optional().describe('Target health score (default 9.5 for planned_refactoring)');

const SET_SCHEMA = {
  filePath: z.string().describe('Absolute path to the file'),
  goalType: z.enum(['planned_refactoring', 'supervise', 'no_problem', 'accepted']).describe('Type of debt goal'),
  targetScore: targetScoreSchema,
  expiresAt: z.string().optional().describe('ISO timestamp for expiry (max 30 days for accepted)'),
  note: z.string().optional().describe('Optional human-readable note'),
};

const REMOVE_SCHEMA = {
  filePath: z.string().describe('Absolute path to the file'),
};

const REPORT_SCHEMA = {
  projectDir: z.string().optional().describe('Project directory to filter goals'),
};

export function registerDebtGoalsTools(server: McpServer): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const register = server.registerTool.bind(server) as any;
  register(
    'code_health_debt_goals_list',
    {
      title: 'List Debt Goals',
      description: 'Lists tracked debt goals. Optionally filter by filePath or status.',
      inputSchema: LIST_SCHEMA,
      annotations: { title: 'List Debt Goals', readOnlyHint: true, openWorldHint: false },
    },
    handleList
  );
  register(
    'code_health_debt_goal_set',
    {
      title: 'Set Debt Goal',
      description: 'Creates or updates a debt goal for a file.',
      inputSchema: SET_SCHEMA,
      annotations: {
        title: 'Set Debt Goal',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    handleSet
  );
  register(
    'code_health_debt_goal_remove',
    {
      title: 'Remove Debt Goal',
      description: 'Removes a debt goal for a file.',
      inputSchema: REMOVE_SCHEMA,
      annotations: {
        title: 'Remove Debt Goal',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    handleRemove
  );
  register(
    'code_health_debt_goals_report',
    {
      title: 'Debt Goals Report',
      description: 'Generates a report of all tracked debt goals with current health scores.',
      inputSchema: REPORT_SCHEMA,
      annotations: { title: 'Debt Goals Report', readOnlyHint: true, openWorldHint: false },
    },
    handleReport
  );
}
