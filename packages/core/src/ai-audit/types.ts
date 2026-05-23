// packages/core/src/ai-audit/types.ts

export type AiSpecificSmellType =
  | 'AbstractionLeakage'
  | 'HardcodedAssumption'
  | 'MissingEdgeCase'
  | 'StyleInconsistency';

export interface AiSignal {
  name: string;   // "comment_style", "naming_pattern", "boilerplate", "structure"
  weight: number;
  score: number;  // [0, 1]
  evidence: string;
}

export interface GitSignal {
  first_commit_lines_added: number;
  total_commits_touching_file: number;
  max_single_commit_change_pct: number;
  score: number;
}

export interface AiDetectionResult {
  filePath: string;
  confidence: number;         // [0, 1]
  signals: AiSignal[];
  git_signal?: GitSignal;
}

export interface AiSpecificSmell {
  type: AiSpecificSmellType;
  severity: 'high' | 'medium' | 'low';
  line: number;
  description: string;
  suggestion: string;
}

export interface AiAuditResult {
  filePath: string;
  language: string;
  ai_detection: AiDetectionResult;
  base_health_score: number;
  enhanced_health_score: number;
  ai_specific_smells: AiSpecificSmell[];
  total_smells: number;
}

export interface BenchmarkEntry {
  timestamp: string;                  // ISO 8601
  model_name: string;                 // "claude-sonnet-4-6", "gpt-4.1", etc.
  file_path: string;
  language: string;
  health_score_ai: number;
  health_score_baseline: number;
  delta: number;                      // health_score_ai - health_score_baseline
  smells_introduced: string[];        // SmellTypes in AI but not in baseline
  smells_fixed: string[];             // SmellTypes in baseline but not in AI
  ai_specific_smells: string[];       // AiSpecificSmellType[] from enhanced checks
  confidence_ai_generated: number;   // [0, 1]
}

export interface BenchmarkHistory {
  schema_version: '1.0';
  entries: BenchmarkEntry[];
}

export interface ModelStats {
  model_name: string;
  total_scans: number;
  avg_delta: number;
  std_delta: number;
  avg_health_score: number;
  most_common_smells: Array<{ smell: string; count: number }>;
  baseline_pass_rate: number;
}
