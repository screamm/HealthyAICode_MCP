/**
 * auto-refactor-applier-async.ts — Sprint 51-60
 *
 * Language-aware, transformer-backed entry point for the mechanical refactor pipeline.
 *
 * Routing:
 *   - Python  extract_method / extract_chunks / split_at_seam → rope ExtractMethod
 *   - Go      extract_method / extract_chunks / split_at_seam → gopls ExtractFunction
 *   - any Tier A early_return                                 → ast-grep guard-clause rule
 *   - TypeScript / JavaScript (all strategies)               → synchronous template applier
 *   - everything else                                        → deferred to LLM/manual
 *
 * Every transform output (whether from a real AST transformer or the sync templates) is
 * passed through {@link validateTransform}: a result that does not re-parse cleanly in its
 * own language is rejected and the smell is flagged `requiresManualIntervention`. This is
 * the guarantee that the applier NEVER returns invalid source (the invalid-Java fix).
 */

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { AutoRefactorResult } from './auto-refactor-analyzer';
import type { Language } from '../types';
import { applyAutoRefactor, type ApplyResult } from './auto-refactor-applier';
import { templatesMatchLanguage, validateTransform } from './transform-validation';
import { applyUnifiedDiff } from './unified-diff-applier';
import { applyRopeExtractMethod, canUseRope } from './python-rope-transformer';
import { applyGoplsExtractFunction, canUseGopls } from './go-gopls-transformer';
import { applyAstGrepEarlyReturn } from './ast-grep-runner';

/** Strategies that map onto an "extract a region into a new function" transformer. */
const EXTRACT_STRATEGIES = new Set([
  'extract_method',
  'extract_chunks',
  'split_at_seam',
]);

/** File extensions for temp files so the transformer sees the correct grammar. */
const LANGUAGE_EXT: Partial<Record<Language, string>> = {
  python: '.py',
  go: '.go',
};

/**
 * Applies a mechanical refactor with full language-aware transformer routing.
 *
 * @param code            Full source to transform.
 * @param refactorResult  Analyzer plan (strategy, smell, line range).
 * @param language        Source language.
 */
export async function applyAutoRefactorAsync(
  code: string,
  refactorResult: AutoRefactorResult,
  language: Language
): Promise<ApplyResult> {
  const strategy = refactorResult.refactoringStrategy;

  // 1. early_return for any Tier A language → ast-grep guard-clause rule.
  if (strategy === 'early_return') {
    const viaAstGrep = await tryAstGrepEarlyReturn(code, language, refactorResult);
    if (viaAstGrep) return viaAstGrep;
    // Fall through: TS/JS can still use the sync template; others defer below.
  }

  // 2. Python → rope, Go → gopls for extract-style strategies.
  if (EXTRACT_STRATEGIES.has(strategy)) {
    if (language === 'python') {
      const viaRope = await tryExtractViaTransformer(code, refactorResult, language, 'rope');
      if (viaRope) return viaRope;
    } else if (language === 'go') {
      const viaGopls = await tryExtractViaTransformer(code, refactorResult, language, 'gopls');
      if (viaGopls) return viaGopls;
    }
  }

  // 3. TypeScript / JavaScript: the synchronous template applier is valid + validated.
  if (templatesMatchLanguage(language)) {
    return applyAutoRefactor(code, refactorResult, language);
  }

  // 4. No safe deterministic transform for this language/strategy: let the sync applier
  //    produce the language-guard deferral (no dead TODO, requiresManualIntervention set).
  return applyAutoRefactor(code, refactorResult, language);
}

// ─── ast-grep early-return ────────────────────────────────────────────────────

/** Attempts an ast-grep early-return rewrite; returns null when not applicable/available. */
async function tryAstGrepEarlyReturn(
  code: string,
  language: Language,
  refactorResult: AutoRefactorResult
): Promise<ApplyResult | null> {
  const res = await applyAstGrepEarlyReturn(code, language);
  if (res.error || res.matchCount === 0 || res.transformedCode === code) {
    return null;
  }
  return finalizeTransformerResult(code, res.transformedCode, language, refactorResult, `ast-grep early-return (${res.matchCount} guard clause(s))`);
}

// ─── rope / gopls extract ──────────────────────────────────────────────────────

type TransformerKind = 'rope' | 'gopls';

/**
 * Runs an extract-function transformer (rope or gopls) over the target function's body
 * region, applies the returned unified diff in-memory, validates, and finalizes.
 * Returns null when the tool is unavailable or produced nothing usable.
 */
async function tryExtractViaTransformer(
  code: string,
  refactorResult: AutoRefactorResult,
  language: Language,
  kind: TransformerKind
): Promise<ApplyResult | null> {
  const available = kind === 'rope' ? await canUseRope() : await canUseGopls();
  if (!available) return null;

  const region = computeExtractRegion(code, refactorResult);
  if (!region) return null;

  const ext = LANGUAGE_EXT[language] ?? '.txt';
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'healthy-ai-xform-'));
  const tmpFile = path.join(tmpDir, `subject${ext}`);
  try {
    await fs.writeFile(tmpFile, code, 'utf8');

    const diffResult = kind === 'rope'
      ? await applyRopeExtractMethod(tmpFile, region.start, region.end, region.name)
      : await applyGoplsExtractFunction(tmpFile, region.start, region.end);

    if (!diffResult.success || diffResult.diff.trim().length === 0) return null;

    const transformed = applyUnifiedDiff(code, diffResult.diff);
    if (transformed === null || transformed === code) return null;

    return finalizeTransformerResult(code, transformed, language, refactorResult, `${kind} extract-function`);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** The byte region [start, end) to extract, plus a name for the new function. */
interface ExtractRegion {
  start: number;
  end: number;
  name: string;
}

/**
 * Computes the byte offsets of the inner body of the target function (excluding the
 * signature line and the closing line) so the transformer extracts a self-contained
 * statement region rather than the whole function header.
 */
function computeExtractRegion(code: string, refactorResult: AutoRefactorResult): ExtractRegion | null {
  const lines = code.split('\n');
  const startLine = refactorResult.startLine; // 1-based
  const endLine = refactorResult.endLine;     // 1-based
  if (endLine - startLine < 3) return null;   // too small to extract a region

  // Extract the inner statements: from the line AFTER the signature up to (not including)
  // the final line. This keeps the function header and closing brace/dedent intact.
  const bodyStartLine = startLine + 1; // 1-based, first body line
  const bodyEndLine = endLine - 1;     // 1-based, last body line (inclusive)
  if (bodyEndLine < bodyStartLine) return null;

  const start = lineColToOffset(lines, bodyStartLine, 0);
  // End offset is the start of the line AFTER the last body line (exclusive end).
  const end = lineColToOffset(lines, bodyEndLine + 1, 0);
  if (end <= start) return null;

  const name = sanitizeName(`extracted_${refactorResult.targetFunction || 'helper'}`);
  return { start, end, name };
}

/** Converts a 1-based line and 0-based column into a 0-based byte offset into the source. */
function lineColToOffset(lines: string[], line1: number, col0: number): number {
  let offset = 0;
  const limit = Math.min(line1 - 1, lines.length);
  for (let i = 0; i < limit; i++) {
    offset += Buffer.byteLength(lines[i], 'utf8') + 1; // +1 for the '\n'
  }
  return offset + col0;
}

/** Produces a syntactically safe identifier for a generated function name. */
function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z_]+/, '');
  return cleaned.length > 0 ? cleaned : 'extracted_helper';
}

// ─── shared finalize + validate ─────────────────────────────────────────────────

/**
 * Validates a transformer-produced result and packages it as an {@link ApplyResult}.
 * A transform that does not re-parse in its own language is rejected (original returned,
 * `requiresManualIntervention` set) — guaranteeing no invalid output ever escapes.
 */
function finalizeTransformerResult(
  originalCode: string,
  transformedCode: string,
  language: Language,
  refactorResult: AutoRefactorResult,
  label: string
): ApplyResult {
  const validation = validateTransform(originalCode, transformedCode, language);
  if (!validation.valid) {
    return {
      transformedCode: originalCode,
      changes: [`Rejected ${label}: ${validation.reason}`],
      strategy: refactorResult.refactoringStrategy,
      requiresManualIntervention: true,
    };
  }
  return {
    transformedCode,
    changes: [`Applied ${label} to '${refactorResult.targetFunction}' (${language})`],
    strategy: refactorResult.refactoringStrategy,
  };
}
