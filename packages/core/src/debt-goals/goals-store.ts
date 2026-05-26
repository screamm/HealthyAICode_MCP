import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export type GoalType = 'planned_refactoring' | 'supervise' | 'no_problem' | 'accepted';
export type GoalStatus = 'active' | 'warning' | 'failed' | 'expired';

export interface DebtGoal {
  filePath: string;
  goalType: GoalType;
  targetScore?: number;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  note?: string;
  currentScore?: number;
  previousScore?: number;
  setBy: string;
}

export interface DebtGoalsStore {
  version: number;
  goals: Record<string, DebtGoal>;
}

const GOALS_DIR = join(homedir(), '.healthy-ai-code');
const GOALS_FILE = join(GOALS_DIR, 'debt-goals.json');

function ensureDir(): void {
  if (!existsSync(GOALS_DIR)) {
    mkdirSync(GOALS_DIR, { recursive: true });
  }
}

export function loadGoals(): DebtGoalsStore {
  if (!existsSync(GOALS_FILE)) {
    return { version: 1, goals: {} };
  }
  try {
    const raw = readFileSync(GOALS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DebtGoalsStore;
    return parsed;
  } catch {
    return { version: 1, goals: {} };
  }
}

export function saveGoals(store: DebtGoalsStore): void {
  ensureDir();
  writeFileSync(GOALS_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

export function getGoal(filePath: string): DebtGoal | undefined {
  const store = loadGoals();
  return store.goals[filePath];
}

export function setGoal(
  filePath: string,
  goal: Omit<DebtGoal, 'filePath' | 'createdAt' | 'updatedAt' | 'status'>
): DebtGoal {
  const store = loadGoals();
  const now = new Date().toISOString();
  const existing = store.goals[filePath];

  const newGoal: DebtGoal = {
    filePath,
    status: 'active',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...goal,
  };

  store.goals[filePath] = newGoal;
  saveGoals(store);
  return newGoal;
}

export function removeGoal(filePath: string): boolean {
  const store = loadGoals();
  if (!store.goals[filePath]) {
    return false;
  }
  delete store.goals[filePath];
  saveGoals(store);
  return true;
}

export function listGoals(projectDir?: string): DebtGoal[] {
  const store = loadGoals();
  const all = Object.values(store.goals);
  if (!projectDir) {
    return all;
  }
  const normalized = projectDir.replace(/\\/g, '/').toLowerCase();
  return all.filter((g) => g.filePath.toLowerCase().startsWith(normalized));
}

export function updateGoalStatus(filePath: string, currentScore: number): DebtGoal | undefined {
  const store = loadGoals();
  const goal = store.goals[filePath];
  if (!goal) return undefined;

  const previousScore = goal.currentScore;
  goal.previousScore = previousScore;
  goal.currentScore = currentScore;
  goal.updatedAt = new Date().toISOString();

  switch (goal.goalType) {
    case 'planned_refactoring': {
      if (previousScore !== undefined && currentScore > previousScore) {
        goal.status = 'active';
      } else if (previousScore !== undefined && currentScore < previousScore) {
        goal.status = 'failed';
      } else {
        const created = new Date(goal.createdAt).getTime();
        const now = Date.now();
        const daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation > 30) {
          goal.status = 'warning';
        } else {
          goal.status = 'active';
        }
      }
      break;
    }
    case 'supervise': {
      if (previousScore !== undefined && currentScore < previousScore) {
        goal.status = 'failed';
      } else {
        goal.status = 'active';
      }
      break;
    }
    case 'no_problem': {
      if (previousScore !== undefined && (previousScore - currentScore) > 2.0) {
        goal.status = 'failed';
      } else {
        goal.status = 'active';
      }
      break;
    }
    case 'accepted': {
      if (goal.expiresAt) {
        const expires = new Date(goal.expiresAt).getTime();
        const now = Date.now();
        if (now > expires) {
          goal.status = 'expired';
        } else {
          goal.status = 'active';
        }
      } else {
        goal.status = 'active';
      }
      break;
    }
  }

  saveGoals(store);
  return goal;
}
