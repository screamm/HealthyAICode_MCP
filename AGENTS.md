# AGENTS.md — AI Assistant Guide for Healthy AI Code MCP

This file instructs AI coding assistants (Claude Code, GitHub Copilot, Cursor, Windsurf,
and others) on how to use the **Healthy AI Code MCP** tools correctly and when each tool
must be invoked.

---

## Core Principle: Code Health is Authoritative

**AI-generated code must never introduce code health regressions.**

The MCP tools in this server produce objective, deterministic scores. These scores are the
ground truth for code quality decisions — not subjective judgments, not style preferences.
If a tool reports a score below threshold, the code is not ready to ship, regardless of
whether it passes tests or looks correct on first reading.

Target thresholds:
- **New AI-generated code**: score >= 9.5 (AI-ready)
- **Minimum to commit**: score >= 7.0 for every changed file
- **Block merge if**: any file in the change set drops below 7.0 from its baseline

---

## Mandatory Workflow

Follow this sequence for every non-trivial AI-assisted coding session:

### 1. After every meaningful code change — `code_health_review`

Run `code_health_review` on every file you have modified before moving on.
"Meaningful" means anything beyond fixing a typo or renaming a variable.

- Call the tool with the file content (or file path if the tool supports it).
- The tool may return `loopComplete: false` — **keep calling it in a loop** until it
  returns `loopComplete: true`. Each iteration surfaces deeper issues; early termination
  will miss smells.
- Read `nextAction.instruction` in each response — it tells you exactly what to fix next.
- Apply the fix, then call the tool again. Repeat until `loopComplete: true`.

```
while loopComplete != true:
    result = code_health_review(file_content)
    if result.nextAction: apply fix described in nextAction.instruction
```

### 2. Before every commit — `pre_commit_code_health_safeguard`

Run `pre_commit_code_health_safeguard` on the full set of files staged for commit.

- If the tool returns a block signal (score < 7.0 for any file), **do not suggest or
  perform the commit**. Refactor first.
- If the tool returns a warning (7.0 <= score < 8.0), surface the warning to the user
  and ask whether to proceed.
- Only suggest `git commit` when the safeguard passes cleanly.

### 3. Before PR / merge — `analyze_change_set`

Run `analyze_change_set` comparing the feature branch to the base branch before opening
or merging a pull request.

- This gives a branch-level view: which files degraded, which improved, net health delta.
- Surface the full report to the user. If any file regressed below 7.0, block the merge
  suggestion and request remediation.

---

## Tool Reference

| Tool | When to use |
|------|-------------|
| `code_health_score` | Quick health check on a single file or snippet; fast screening when you want a number without full diagnosis |
| `code_health_review` | After every meaningful code change; run in loop until `loopComplete: true` |
| `pre_commit_code_health_safeguard` | Immediately before any `git commit`; blocks commit if score < 7.0 |
| `analyze_change_set` | Before opening a PR or merging; branch-level diff analysis against base |
| `code_health_refactoring_business_case` | When you need to justify refactoring work to a stakeholder; provides ROI framing |
| `explain_code_health` | When a user asks what the health scale means or how scoring works |
| `explain_code_health_productivity` | When a user asks how code health affects team velocity or developer productivity |
| `code_health_knowledge_map` | When assessing bus factor, knowledge silos, or onboarding risk across the codebase |

### `code_health_score`
Fast 1–10 screening score. Use when you need a quick read before deciding whether to do a
full review. Does not replace `code_health_review` for changed files.

### `code_health_review`
Deep inspection: returns code smells, hotspots, coupling issues, complexity violations,
and actionable refactoring suggestions. **Always loop until `loopComplete: true`.**

### `pre_commit_code_health_safeguard`
Pre-commit gate. Returns pass/warn/block per file. AI assistants must not suggest a
commit when this tool returns a block.

### `analyze_change_set`
Branch-level analysis. Compares each changed file's health before and after the branch.
Returns net delta, regressions, and improvements.

### `code_health_refactoring_business_case`
Generates a business-case document (time saved, defect risk reduction, estimated ROI)
for a proposed refactoring. Use when the user needs to convince their team or manager.

### `explain_code_health`
Plain-language explanation of the 1–10 health scale, what each band means, and why it
matters. Use when onboarding new users or when a user expresses confusion about a score.

### `explain_code_health_productivity`
Explains the research-backed relationship between code health and developer productivity,
cycle time, and defect rates. Use when a user questions whether health scores matter.

### `code_health_knowledge_map`
Analyses contribution patterns and ownership to identify knowledge silos and bus-factor
risk. Use when a team is planning staffing changes, onboarding, or codebase handovers.

---

## Commit Gate Rules (Non-Negotiable)

1. **Never suggest or execute `git commit` when `pre_commit_code_health_safeguard` blocks.**
2. **Never bypass the loop in `code_health_review`.** If `loopComplete` is `false`, call
   the tool again. Exiting early is equivalent to not running the review.
3. **Never suppress or ignore tool output.** Always surface scores, smells, and
   recommendations to the user.
4. **Never accept a score below 7.0 for a file you have generated or modified.** If you
   receive such a score, refactor before moving on.

---

## Handling Regressions

When a file's score drops after your changes:

1. Run `code_health_review` on the file (loop to completion).
2. Read every smell and suggestion returned.
3. Refactor in **3–5 small, targeted steps** — one smell at a time.
4. After each step, re-run `code_health_score` to confirm the score is trending upward.
5. After all steps, re-run `code_health_review` to completion to confirm no new smells
   were introduced.
6. Only proceed to the next file when the score meets or exceeds the pre-change baseline
   (minimum 7.0, target 9.5 for AI-generated code).

Small steps matter: large refactors introduce their own smells. Measure after every step.

---

## AI-Ready Code Target

All code generated by an AI assistant in this project should aim for a `code_health_score`
of **>= 9.5**. This is the "AI-ready" threshold — code clean enough to serve as a reliable
foundation for further AI-assisted development.

Code below 9.5 is acceptable for delivery only when the user explicitly acknowledges the
gap and accepts the technical debt. Always document this acknowledgement in a comment or
commit message.

---

## Quick Reference Card

```
Change code
  → code_health_review (loop until loopComplete: true)
  → fix any score < 9.5

Ready to commit?
  → pre_commit_code_health_safeguard
  → STOP if any file blocked (score < 7.0)

Ready for PR?
  → analyze_change_set vs base branch
  → STOP if any file regressed below 7.0

Need to justify refactoring?
  → code_health_refactoring_business_case

User asks "what does the score mean?"
  → explain_code_health

User asks "why does this matter?"
  → explain_code_health_productivity

Planning team changes or onboarding?
  → code_health_knowledge_map
```
