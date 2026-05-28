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

type ToolResponse = { content: { type: string; text: string }[]; isError?: boolean };
type McpToolRegistrar = (
  name: string,
  desc: string,
  schema: z.ZodRawShape,
  handler: (args: Record<string, unknown>) => Promise<ToolResponse>
) => void;

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
    const goal = setGoal(filePath as string, {
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
    const removed = removeGoal(filePath as string);
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
  const tool = server.tool.bind(server) as unknown as McpToolRegistrar;
  tool('code_health_debt_goals_list', 'Lists tracked debt goals. Optionally filter by filePath or status.', LIST_SCHEMA, handleList);
  tool('code_health_debt_goal_set', 'Creates or updates a debt goal for a file.', SET_SCHEMA, handleSet);
  tool('code_health_debt_goal_remove', 'Removes a debt goal for a file.', REMOVE_SCHEMA, handleRemove);
  tool('code_health_debt_goals_report', 'Generates a report of all tracked debt goals with current health scores.', REPORT_SCHEMA, handleReport);
}
