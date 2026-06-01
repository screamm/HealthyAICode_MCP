# Field-Reliability Report — Healthy AI Code MCP

*Generated: 2026-05-31T21:49:51.535Z*

## Executive Summary

| Metric | Value |
|--------|-------|
| Total files analyzed | 36 |
| Crashes (analyzer errors) | 0 (0.0%) |
| Parse failures | 0 (0.0%) |
| Throughput | 3.1 files/sec |
| p50 latency | 245 ms/file |
| p95 latency | 1607 ms/file |
| Mean score | 6.43 |
| Files below 9.0 | 27 (75.0%) |
| Files below 9.5 | 28 (77.8%) |
| Files below 9.6 | 28 (77.8%) |
| Loop: files tested | 3 |
| Loop: improved | 0 / 3 (0.0%) |
| Loop: converged (>=9.5) | 0 |
| Comment-invariant violations | 0 |

## Score Distribution

| Bucket | Count | % of analyzed |
|--------|-------|---------------|
| 1.0-3.0 | 6 | 16.7% |
| 3.0-5.0 | 4 | 11.1% |
| 5.0-7.0 | 6 | 16.7% |
| 7.0-9.0 | 11 | 30.6% |
| 9.0-9.5 | 1 | 2.8% |
| 9.5-10.0 | 8 | 22.2% |

## Per-Repo Summary

| Repo | Lang | Files | Crashes | ParseFails | Mean score | <9.0 | <9.5 | p50ms | p95ms | files/sec |
|------|------|-------|---------|------------|------------|------|------|-------|-------|-----------|
| cobra-go | go | 36 | 0 | 0 | 6.43 | 27 | 28 | 245 | 1607 | 3.1 |

## Loop Convergence Results

| File | Lang | Score before | Score after | Steps | Converged | Comment invariant OK |
|------|------|-------------|-------------|-------|-----------|---------------------|
| field-repos/cobra-go/active_help_test.go | go | 1.00 | 1.00 | 0 | no | yes |
| field-repos/cobra-go/args_test.go | go | 1.00 | 1.00 | 0 | no | yes |
| field-repos/cobra-go/command.go | go | 1.00 | 1.00 | 0 | no | yes |

### Loop Aggregate Stats

| Metric | Value |
|--------|-------|
| Files tested | 3 |
| Loop errors | 0 |
| Files improved | 0 |
| Files converged (>=9.5) | 0 |
| Comment-invariant violations | 0 |
| Avg score before | 1.00 |
| Avg score after | 1.00 |
| Avg steps per file | 0.00 |

## Robustness Issues Found

None detected.

## Methodology

- **Corpus**: 13 OSS repos across 10 languages (Python, TypeScript, JavaScript, Go, Java, Ruby, Rust, PHP, C#, Kotlin)
- **Analysis**: `analyzeFile()` per file; `analyzeFileWithHistory()` where git depth-50 history available
- **Loop sample**: top-3 lowest-scoring files (score < 9.0) run through `runRefactoringLoop(maxIterations=15)`
- **Timeout**: 30000ms per file, 5× for loop
- **Comment invariant**: loop edit rejected if comments drop below 90% of original count
