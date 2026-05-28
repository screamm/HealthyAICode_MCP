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

/**
 * Fan-in / fan-out metrics for a single graph node.
 * - fanIn:       number of other modules that import this module.
 * - fanOut:      number of modules this module imports.
 * - instability: fanOut / (fanIn + fanOut); 0 = maximally stable, 1 = maximally unstable.
 */
export interface FanMetrics {
  fanIn: number;
  fanOut: number;
  instability: number;
}

/**
 * Computes fan-in, fan-out, and instability for every node in the dependency graph.
 *
 * @param graph - The directed dependency graph to analyse.
 * @returns A map from node identifier to its {@link FanMetrics}.
 */
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
 * BFS from a single start node on the transposed graph.
 * Returns the set of all nodes reachable from startNode (including startNode itself).
 */
function bfsReachable(startNode: string, transposed: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>([startNode]);
  const queue: string[] = [startNode];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbour of transposed.get(current) ?? []) {
      if (!visited.has(neighbour)) {
        visited.add(neighbour);
        queue.push(neighbour);
      }
    }
  }

  return visited;
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
    const visited = bfsReachable(startNode, transposed);
    // Exclude the node itself from the count
    const affected = visited.size - 1;
    result.set(startNode, affected / Math.max(total, 1));
  }

  return result;
}

// ---------------------------------------------------------------------------
// Batched change frequency fetching
// ---------------------------------------------------------------------------

/** Options controlling batched git log queries for change frequency. */
interface ChangeFrequencyOptions {
  repoPath: string;
  windowMonths: number;
  batchSize: number;
}

async function fetchChangeFrequenciesBatched(
  options: ChangeFrequencyOptions,
  filePaths: string[],
): Promise<Map<string, number>> {
  const { repoPath, windowMonths, batchSize } = options;
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
// Internal pipeline helpers
// ---------------------------------------------------------------------------

/** Validates inputs and throws on invalid arguments. */
function validateAnalysisInputs(
  repoPath: string,
  files: Record<string, { content: string; language: string }>,
): void {
  if (typeof repoPath !== 'string' || repoPath.trim() === '') {
    throw new Error('repoPath must be a non-empty string');
  }
  if (typeof files !== 'object' || files === null) {
    throw new Error('files must be an object');
  }
}

/** Returns the empty result shape when no files are provided. */
function buildEmptyResult(repoPath: string): ArchitectureDebtResult {
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

/** Computed metrics derived from graph analysis, grouped to eliminate DataClumps. */
interface GraphMetrics {
  fanMetrics: Map<string, FanMetrics>;
  propCosts: Map<string, number>;
  changeFreqMap: Map<string, number>;
  inCycleNodes: Set<string>;
  /** Maximum fan-in value for normalisation, computed once per analysis pass. */
  maxFanIn: number;
  /** Maximum change frequency value for normalisation, computed once per analysis pass. */
  maxChangeFreq: number;
}

/** Computes normalisation denominators and returns an enriched GraphMetrics object. */
function enrichMetricsWithDenominators(metrics: Omit<GraphMetrics, 'maxFanIn' | 'maxChangeFreq'>): GraphMetrics {
  let maxFanIn = 1;
  let maxChangeFreq = 1;
  for (const m of metrics.fanMetrics.values()) {
    if (m.fanIn > maxFanIn) maxFanIn = m.fanIn;
  }
  for (const v of metrics.changeFreqMap.values()) {
    if (v > maxChangeFreq) maxChangeFreq = v;
  }
  return { ...metrics, maxFanIn, maxChangeFreq };
}

/** Builds a ModuleDebtProfile for a single graph node. */
function buildModuleProfile(node: string, metrics: GraphMetrics): ModuleDebtProfile {
  const fan = metrics.fanMetrics.get(node) ?? { fanIn: 0, fanOut: 0, instability: 0 };
  const propCost = metrics.propCosts.get(node) ?? 0;
  const churn = metrics.changeFreqMap.get(node) ?? 0;
  const inCycle = metrics.inCycleNodes.has(node);

  const fanInNorm = fan.fanIn / metrics.maxFanIn;
  const churnNorm = churn / metrics.maxChangeFreq;
  const cyclePenalty = inCycle ? 1.0 : 0.0;

  const rawScore =
    fanInNorm * WEIGHT_FAN_IN +
    propCost * WEIGHT_PROPAGATION +
    cyclePenalty * WEIGHT_CYCLE +
    churnNorm * WEIGHT_CHURN;

  const costOfChange = Math.min(1, Math.max(0, rawScore));

  return {
    filePath: node,
    fanIn: fan.fanIn,
    fanOut: fan.fanOut,
    instability: fan.instability,
    propagationCost: propCost,
    inCycle,
    changeFrequency: churn,
    costOfChange,
    costOfChangeSeverity: classifySeverity(costOfChange),
  };
}

/** Builds all ModuleDebtProfiles for the graph, sorted by costOfChange descending. */
function buildSortedModuleProfiles(
  graph: DependencyGraph,
  rawMetrics: Omit<GraphMetrics, 'maxFanIn' | 'maxChangeFreq'>,
): ModuleDebtProfile[] {
  const metrics = enrichMetricsWithDenominators(rawMetrics);

  const modules: ModuleDebtProfile[] = [];
  for (const node of graph.nodes) {
    modules.push(buildModuleProfile(node, metrics));
  }

  modules.sort((a, b) => b.costOfChange - a.costOfChange);
  return modules;
}

/** Converts raw cycle SCCs into typed DependencyCycle records, sorted by size descending. */
function buildCycleList(cycleSccs: string[][]): DependencyCycle[] {
  return cycleSccs
    .map(scc => ({
      members: scc,
      size: scc.length,
      severity: (scc.length > 5 ? 'high' : 'medium') as 'high' | 'medium',
    }))
    .sort((a, b) => b.size - a.size);
}

/** Computes aggregate summary statistics across all module profiles. */
function computeSummaryStats(
  modules: ModuleDebtProfile[],
  cycles: DependencyCycle[],
  inCycleNodes: Set<string>,
): ArchitectureDebtResult['summary'] {
  const n = modules.length || 1;
  return {
    avgFanIn: modules.reduce((s, m) => s + m.fanIn, 0) / n,
    avgFanOut: modules.reduce((s, m) => s + m.fanOut, 0) / n,
    avgPropagationCost: modules.reduce((s, m) => s + m.propagationCost, 0) / n,
    avgCostOfChange: modules.reduce((s, m) => s + m.costOfChange, 0) / n,
    cycleCount: cycles.length,
    modulesInCycles: inCycleNodes.size,
    highSeverityModules: modules.filter(m => m.costOfChangeSeverity === 'high').length,
  };
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
  validateAnalysisInputs(repoPath, files);

  if (Object.keys(files).length === 0) {
    return buildEmptyResult(repoPath);
  }

  const graph = buildDependencyGraph(files);
  const fanMetrics = computeFanInFanOut(graph);
  const propCosts = computePropagationCost(graph);

  const allSccs = findStronglyConnectedComponents(graph.edges);
  const cycleSccs = allSccs.filter(scc => scc.length > 1);
  const inCycleNodes = new Set(cycleSccs.flat());

  const changeFreqMap = await fetchChangeFrequenciesBatched(
    { repoPath, windowMonths: 12, batchSize: BATCH_SIZE },
    [...graph.nodes],
  );

  const maxFanIn = Math.max(0, ...[...fanMetrics.values()].map(m => m.fanIn));
  const maxChangeFreq = Math.max(0, ...changeFreqMap.values());
  const metrics: GraphMetrics = { fanMetrics, propCosts, changeFreqMap, inCycleNodes, maxFanIn, maxChangeFreq };
  const modules = buildSortedModuleProfiles(graph, metrics);
  const cycles = buildCycleList(cycleSccs);
  const summary = computeSummaryStats(modules, cycles, inCycleNodes);

  return {
    directory: repoPath,
    depth: 'file',
    totalModules: modules.length,
    modules,
    cycles,
    topCostlyModules: modules.slice(0, 10),
    summary,
  };
}
