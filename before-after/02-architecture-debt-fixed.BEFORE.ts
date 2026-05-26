/**
 * architecture-debt.ts
 * Orchestrates the full architecture debt analysis pipeline:
 *   1. Build dependency graph from file contents
 *   2. Compute FAN-IN / FAN-OUT / instability per node
 *   3. Compute Propagation Cost via BFS on the transposed graph
 *   4. Detect dependency cycles via Tarjan's SCC algorithm
 *   5. Fetch change frequency from git history (batched)
 *   6. Assemble ModuleDebtProfile with composite Cost-of-Change score
 *
 * Performance characteristics:
 *   - Graph build:        O(files x avg_imports), typically < 100 ms for 1000 files
 *   - Propagation Cost:   O(nodes x (nodes + edges)) — BFS per node
 *   - Tarjan's SCC:       O(V + E)
 *   - Change Frequency:   batches 50 git calls at a time, typically 5-10 s for 1000 files
 */

import type { ArchitectureDebtResult, DependencyCycle, ModuleDebtProfile } from '../types';
import { buildDependencyGraph, type DependencyGraph } from './dependency-graph';
import { findStronglyConnectedComponents } from './scc';
import { getChangeFrequency } from './change-frequency';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEIGHT_FAN_IN = 0.35;
const WEIGHT_PROPAGATION = 0.40;
const WEIGHT_CYCLE = 0.15;
const WEIGHT_CHURN = 0.10;
const HIGH_THRESHOLD = 0.60;
const MEDIUM_THRESHOLD = 0.35;
const BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// FAN-IN / FAN-OUT
// ---------------------------------------------------------------------------

export interface FanMetrics {
  fanIn: number;
  fanOut: number;
  instability: number;
}

export function computeFanInFanOut(graph: DependencyGraph): Map<string, FanMetrics> {
  const result = new Map<string, FanMetrics>();

  // Initialise all nodes with zero counts
  for (const node of graph.nodes) {
    const fanOut = graph.edges.get(node)?.size ?? 0;
    result.set(node, { fanIn: 0, fanOut, instability: 0 });
  }

  // Count fan-in by scanning all edges
  for (const [_from, tos] of graph.edges) {
    for (const to of tos) {
      const entry = result.get(to);
      if (entry) {
        entry.fanIn++;
      } else {
        // Target node not in original node set — add it
        result.set(to, { fanIn: 1, fanOut: 0, instability: 0 });
      }
    }
  }

  // Compute instability
  for (const [, metrics] of result) {
    const total = metrics.fanIn + metrics.fanOut;
    metrics.instability = total === 0 ? 0 : metrics.fanOut / total;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Propagation Cost (BFS on transposed graph)
// ---------------------------------------------------------------------------

/**
 * Builds the transposed (reversed) graph: if A -> B in original, B -> A in transposed.
 * Used for BFS to find all files that transitively depend on a given module.
 */
function buildTransposedEdges(graph: DependencyGraph): Map<string, Set<string>> {
  const transposed = new Map<string, Set<string>>();
  for (const node of graph.nodes) {
    transposed.set(node, new Set());
  }
  for (const [from, tos] of graph.edges) {
    for (const to of tos) {
      if (!transposed.has(to)) transposed.set(to, new Set());
      transposed.get(to)!.add(from);
    }
  }
  return transposed;
}

/**
 * For each node M, computes the fraction of the codebase that transitively depends on M.
 * Uses BFS on the transposed graph starting from M.
 */
export function computePropagationCost(graph: DependencyGraph): Map<string, number> {
  const result = new Map<string, number>();
  const total = graph.nodes.size;
  if (total === 0) return result;

  const transposed = buildTransposedEdges(graph);

  for (const startNode of graph.nodes) {
    const visited = new Set<string>();
    const queue: string[] = [startNode];
    visited.add(startNode);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbour of transposed.get(current) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    // Exclude the node itself from the count
    const affected = visited.size - 1;
    result.set(startNode, affected / Math.max(total, 1));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Batched change frequency fetching
// ---------------------------------------------------------------------------

async function fetchChangeFrequenciesBatched(
  repoPath: string,
  filePaths: string[],
  windowMonths: number,
  batchSize: number,
): Promise<Map<string, number>> {
  const resultMap = new Map<string, number>();

  for (let i = 0; i < filePaths.length; i += batchSize) {
    const batch = filePaths.slice(i, i + batchSize);
    const counts = await Promise.all(
      batch.map(fp => getChangeFrequency(repoPath, fp, windowMonths)),
    );
    for (let j = 0; j < batch.length; j++) {
      resultMap.set(batch[j], counts[j]);
    }
  }

  return resultMap;
}

// ---------------------------------------------------------------------------
// Severity classifier
// ---------------------------------------------------------------------------

function classifySeverity(score: number): 'high' | 'medium' | 'low' {
  if (score >= HIGH_THRESHOLD) return 'high';
  if (score >= MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Analyses the architecture debt of a set of source files.
 *
 * @param repoPath - Absolute path to the git repository root (used for git log calls).
 * @param files    - Map of file path -> { content, language } (path keys used as node IDs).
 * @returns A fully populated ArchitectureDebtResult.
 */
export async function analyzeArchitectureDebt(
  repoPath: string,
  files: Record<string, { content: string; language: string }>,
): Promise<ArchitectureDebtResult> {
  // Runtime input validation
  if (typeof repoPath !== 'string' || repoPath.trim() === '') {
    throw new Error('repoPath must be a non-empty string');
  }
  if (typeof files !== 'object' || files === null) {
    throw new Error('files must be an object');
  }

  const fileKeys = Object.keys(files);

  // Handle empty input
  if (fileKeys.length === 0) {
    return {
      directory: repoPath,
      depth: 'file',
      totalModules: 0,
      modules: [],
      cycles: [],
      topCostlyModules: [],
      summary: {
        avgFanIn: 0, avgFanOut: 0, avgPropagationCost: 0, avgCostOfChange: 0,
        cycleCount: 0, modulesInCycles: 0, highSeverityModules: 0,
      },
    };
  }

  // Step 1: Build dependency graph
  const graph = buildDependencyGraph(files);

  // Step 2: Structural metrics (synchronous)
  const fanMetrics = computeFanInFanOut(graph);
  const propCosts = computePropagationCost(graph);

  // Step 3: Detect cycles via Tarjan's SCC
  const allSccs = findStronglyConnectedComponents(graph.edges);
  const cycleSccs = allSccs.filter(scc => scc.length > 1);
  const inCycleNodes = new Set(cycleSccs.flat());

  // Step 4: Fetch change frequencies (batched git calls)
  const changeFreqMap = await fetchChangeFrequenciesBatched(
    repoPath,
    [...graph.nodes],
    12,
    BATCH_SIZE,
  );

  // Step 5: Compute normalisation denominators
  let maxFanIn = 1;
  let maxChangeFreq = 1;
  for (const m of fanMetrics.values()) {
    if (m.fanIn > maxFanIn) maxFanIn = m.fanIn;
  }
  for (const v of changeFreqMap.values()) {
    if (v > maxChangeFreq) maxChangeFreq = v;
  }

  // Step 6: Build ModuleDebtProfile per node
  const modules: ModuleDebtProfile[] = [];

  for (const node of graph.nodes) {
    const fan = fanMetrics.get(node) ?? { fanIn: 0, fanOut: 0, instability: 0 };
    const propCost = propCosts.get(node) ?? 0;
    const churn = changeFreqMap.get(node) ?? 0;
    const inCycle = inCycleNodes.has(node);

    const fanInNorm = fan.fanIn / maxFanIn;
    const churnNorm = churn / maxChangeFreq;
    const cyclePenalty = inCycle ? 1.0 : 0.0;

    const rawScore =
      fanInNorm * WEIGHT_FAN_IN +
      propCost * WEIGHT_PROPAGATION +
      cyclePenalty * WEIGHT_CYCLE +
      churnNorm * WEIGHT_CHURN;

    const costOfChange = Math.min(1, Math.max(0, rawScore));

    modules.push({
      filePath: node,
      fanIn: fan.fanIn,
      fanOut: fan.fanOut,
      instability: fan.instability,
      propagationCost: propCost,
      inCycle,
      changeFrequency: churn,
      costOfChange,
      costOfChangeSeverity: classifySeverity(costOfChange),
    });
  }

  // Sort by costOfChange descending
  modules.sort((a, b) => b.costOfChange - a.costOfChange);

  // Step 7: Build DependencyCycle list
  const cycles: DependencyCycle[] = cycleSccs
    .map(scc => ({
      members: scc,
      size: scc.length,
      severity: (scc.length > 5 ? 'high' : 'medium') as 'high' | 'medium',
    }))
    .sort((a, b) => b.size - a.size);

  // Step 8: Summary statistics
  const n = modules.length || 1;
  const avgFanIn = modules.reduce((s, m) => s + m.fanIn, 0) / n;
  const avgFanOut = modules.reduce((s, m) => s + m.fanOut, 0) / n;
  const avgPropagationCost = modules.reduce((s, m) => s + m.propagationCost, 0) / n;
  const avgCostOfChange = modules.reduce((s, m) => s + m.costOfChange, 0) / n;
  const modulesInCycles = inCycleNodes.size;
  const highSeverityModules = modules.filter(m => m.costOfChangeSeverity === 'high').length;

  return {
    directory: repoPath,
    depth: 'file',
    totalModules: modules.length,
    modules,
    cycles,
    topCostlyModules: modules.slice(0, 10),
    summary: {
      avgFanIn,
      avgFanOut,
      avgPropagationCost,
      avgCostOfChange,
      cycleCount: cycles.length,
      modulesInCycles,
      highSeverityModules,
    },
  };
}
