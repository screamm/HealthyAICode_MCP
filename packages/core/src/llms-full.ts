// packages/core/src/llms-full.ts
// Generate the llms-full.txt Markdown string for AI client consumption.
// Sprint 59.

import { SMELL_WEIGHTS, AI_READY_THRESHOLD, HEALTHY_THRESHOLD, PROBLEMATIC_THRESHOLD } from './scoring/weights';

// ── Tool catalogue (healthy_ai_code_* prefix) ─────────────────────────────────

interface ToolEntry {
  name: string;
  description: string;
}

const TOOLS: ToolEntry[] = [
  {
    name: 'healthy_ai_code_review',
    description:
      'Returns health score (1–10), smell list, and loopComplete flag for a source file.',
  },
  {
    name: 'healthy_ai_code_auto_refactor',
    description:
      'Generates refactoring instructions for the highest-priority smell in a file.',
  },
  {
    name: 'healthy_ai_code_auto_refactor_apply',
    description: 'Applies a previously generated refactoring patch to a file.',
  },
  {
    name: 'healthy_ai_code_score',
    description: 'Returns only the numeric health score and category for a file.',
  },
  {
    name: 'healthy_ai_code_pre_commit_safeguard',
    description: 'Gate check: rejects commits if any staged file is below the score threshold.',
  },
  {
    name: 'healthy_ai_code_analyze_changeset',
    description: 'Analyzes a git diff for regressions and improvements across multiple files.',
  },
  {
    name: 'healthy_ai_code_explain',
    description: 'Explains the meaning of a smell type or health metric in plain language.',
  },
  {
    name: 'healthy_ai_code_architecture_debt',
    description: 'Computes fan-in/fan-out, propagation cost, and architectural debt for a directory.',
  },
  {
    name: 'healthy_ai_code_architecture_report',
    description: 'Generates a full Markdown architecture-debt report for a project.',
  },
  {
    name: 'healthy_ai_code_bus_factor',
    description: 'Calculates bus factor and knowledge loss index from git history.',
  },
  {
    name: 'healthy_ai_code_hotspots',
    description: 'Identifies the highest-churn, highest-complexity files in a repository.',
  },
  {
    name: 'healthy_ai_code_knowledge_map',
    description: 'Maps developer expertise across modules based on git authorship.',
  },
  {
    name: 'healthy_ai_code_method_coupling',
    description: 'Detects method-level temporal coupling within a file using git history.',
  },
  {
    name: 'healthy_ai_code_trend_analysis',
    description: 'Shows health score trends over time for a file or directory.',
  },
  {
    name: 'healthy_ai_code_security_audit',
    description: 'Runs the LLM-assisted security audit layer for injection, secrets, and deserialization risks.',
  },
  {
    name: 'healthy_ai_code_ai_readiness',
    description: 'Checks naming clarity, type coverage, and structural readiness for AI-assisted modification.',
  },
  {
    name: 'healthy_ai_code_ai_audit',
    description: 'Audits a file for AI-attribution signals, hallucinated imports, and intent-debt markers.',
  },
  {
    name: 'healthy_ai_code_debt_goals',
    description: 'Manages per-file or per-project score goals with progress tracking.',
  },
  {
    name: 'healthy_ai_code_refactoring_business_case',
    description: 'Generates a business-case report estimating refactoring ROI in developer-hours.',
  },
  {
    name: 'healthy_ai_code_model_benchmark',
    description: 'Benchmarks refactoring quality across AI models using AFTER fixtures.',
  },
  {
    name: 'healthy_ai_code_calibration_status',
    description: 'Reports the current calibration status and precision/recall metrics for each detector.',
  },
  {
    name: 'healthy_ai_code_validate_dataset',
    description: 'Validates a labelled dataset against detector output for empirical calibration.',
  },
  {
    name: 'healthy_ai_code_config',
    description: 'Reads or writes runtime configuration (score threshold, weights override, etc.).',
  },
  {
    name: 'healthy_ai_code_structural_cache',
    description: 'Manages the persistent AST/metric cache for large-scale multi-file analysis.',
  },
  {
    name: 'healthy_ai_code_toon_encoder',
    description: 'Encodes health results as compact TOON (Token-Optimised Object Notation) for diff-based loops.',
  },
  {
    name: 'healthy_ai_code_format_output',
    description: 'Converts a HealthResult to SARIF, GitLab Code Quality JSON, or ISO 5055 format.',
  },
];

// ── Generators ────────────────────────────────────────────────────────────────

function generateToolSection(): string {
  const lines = ['## Tools\n'];
  for (const tool of TOOLS) {
    lines.push(`### \`${tool.name}\`\n`);
    lines.push(`${tool.description}\n`);
  }
  return lines.join('\n');
}

function generateWeightsTable(): string {
  const lines = [
    '## Smell Weights\n',
    'These weights are used in the scoring formula: `score = 10 - Σ(weight × √count)`\n',
    '| Smell Type | Weight |',
    '|---|---|',
  ];
  for (const [type, weight] of Object.entries(SMELL_WEIGHTS)) {
    lines.push(`| \`${type}\` | ${weight} |`);
  }
  return lines.join('\n') + '\n';
}

function generateThresholdsSection(): string {
  return [
    '## Score Thresholds\n',
    `| Threshold | Value | Meaning |`,
    `|---|---|---|`,
    `| \`AI_READY_THRESHOLD\` | ${AI_READY_THRESHOLD} | \`loopComplete: true\` — file is ready for AI-assisted modification |`,
    `| \`HEALTHY_THRESHOLD\` | ${HEALTHY_THRESHOLD} | Green category floor |`,
    `| \`PROBLEMATIC_THRESHOLD\` | ${PROBLEMATIC_THRESHOLD} | Yellow/red boundary |`,
    '',
  ].join('\n');
}

function generateFormula(): string {
  return [
    '## Scoring Formula\n',
    '```',
    'score = 10 - Σ(weight × √count)   per smell type',
    'floor = 1.0',
    '```\n',
    'Each unique smell type contributes `weight × √(occurrenceCount)` to the penalty.',
    'The score is clamped to [1.0, 10.0].',
    '',
  ].join('\n');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a Markdown-formatted llms-full.txt string suitable for AI client consumption.
 *
 * The output contains:
 * 1. Project description
 * 2. All tool names (healthy_ai_code_*) with one-sentence descriptions
 * 3. Smell weight table from SMELL_WEIGHTS
 * 4. Score thresholds (AI_READY_THRESHOLD, HEALTHY_THRESHOLD, PROBLEMATIC_THRESHOLD)
 * 5. Scoring formula
 */
export function generateLlmsFullTxt(): string {
  const sections = [
    '# Healthy AI Code MCP — Full Reference\n',
    [
      '## Overview\n',
      'Healthy AI Code MCP is a local MCP server that gives AI assistants objective code health feedback.',
      'It analyses source files across 41+ languages using 28 biomarkers, returns a score from 1–10,',
      'and drives a self-correcting refactoring loop until the score reaches the AI-ready threshold.',
      '',
      '**No account required. All analysis runs locally.**',
      '',
    ].join('\n'),
    generateToolSection(),
    generateWeightsTable(),
    generateThresholdsSection(),
    generateFormula(),
    [
      '## Language Support\n',
      '**Tier A (AST):** TypeScript, JavaScript, Python, Java, C#, Go, Ruby, Rust, PHP, Kotlin, Scala,',
      'Elixir, Swift, Vue.js, Haskell, Julia, OCaml (17 languages).\n',
      '**Tier B (Regex):** Bash, Lua, R, Clojure, Dart, C, C++, COBOL, Apex, F#, VB.NET, Perl,',
      'Groovy, Objective-C, PowerShell, Erlang, Zig, Nim, Crystal (19 languages).\n',
      '**Tier C (Structural):** YAML, JSON, Dockerfile, HCL/Terraform, Makefile, SQL, HTML,',
      'CSS, Markdown, TOML (10 formats).',
      '',
    ].join('\n'),
  ];

  return sections.join('\n');
}
