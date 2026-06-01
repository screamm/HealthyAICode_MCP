/**
 * diagnostics.ts
 *
 * Maps HealthResult smells to VS Code Diagnostic objects.
 * This module contains no references to the VS Code extension host APIs
 * that require an active extension process — it only imports types from
 * 'vscode', which the test suite mocks.  All pure mapping logic lives here
 * so it can be exercised in a headless unit-test environment.
 */

import type { Diagnostic, DiagnosticCollection, Uri } from 'vscode';
import type { HealthResult, Smell } from '@healthy-ai-code/core';

// ── Types re-exported from vscode so callers can pass real or mocked values ──

export type VscodeDiagnosticSeverity = 0 | 1 | 2 | 3; // Error=0, Warning=1, Information=2, Hint=3

/** Minimal VS Code Range interface — matches the real vscode.Range shape. */
export interface VscodeRange {
  readonly start: { readonly line: number; readonly character: number };
  readonly end: { readonly line: number; readonly character: number };
}

/** Minimal Diagnostic interface used internally; real vscode.Diagnostic satisfies this. */
export interface DiagnosticLike {
  range: VscodeRange;
  message: string;
  severity: VscodeDiagnosticSeverity;
  source: string;
  code: string;
}

// ── Smell → severity mapping ──────────────────────────────────────────────────

const SEVERITY_MAP: Record<string, VscodeDiagnosticSeverity> = {
  critical: 0, // DiagnosticSeverity.Error
  high: 0,     // DiagnosticSeverity.Error
  medium: 1,   // DiagnosticSeverity.Warning
  low: 2,      // DiagnosticSeverity.Information
};

function smellSeverity(smell: Smell): VscodeDiagnosticSeverity {
  return SEVERITY_MAP[smell.severity] ?? 2;
}

// ── Range helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a zero-indexed VS Code range from a 1-indexed smell line number.
 * The range spans the full line (character 0 → 9999) so the squiggle covers
 * the whole line without needing to know the actual line length.
 */
export function makeRange(oneBased: number): VscodeRange {
  const line = Math.max(0, oneBased - 1);
  return {
    start: { line, character: 0 },
    end: { line, character: 9999 },
  };
}

// ── Core mapper ───────────────────────────────────────────────────────────────

/**
 * Converts a HealthResult's smells into a flat list of DiagnosticLike objects.
 *
 * The returned objects are plain data — they satisfy the vscode.Diagnostic
 * interface structurally, so the extension can cast them when running inside
 * a real VS Code host.
 */
export function smellsToDiagnostics(result: HealthResult): DiagnosticLike[] {
  return result.smells.map((smell) => ({
    range: makeRange(smell.line),
    message: `[${smell.type}] ${smell.description} — ${smell.suggestion}`,
    severity: smellSeverity(smell),
    source: 'Healthy AI Code',
    code: smell.type,
  }));
}

/**
 * Builds a human-readable status bar label from a HealthResult score.
 *
 * Examples:
 *   "$(pass) 9.8 Health"   for a green score
 *   "$(warning) 7.2 Health" for a yellow score
 *   "$(error) 3.1 Health"   for a red score
 */
export function buildStatusBarLabel(score: number, category: 'green' | 'yellow' | 'red'): string {
  const icon = category === 'green' ? '$(pass)' : category === 'yellow' ? '$(warning)' : '$(error)';
  return `${icon} ${score.toFixed(1)} Health`;
}

/**
 * Refreshes a DiagnosticCollection for a given file URI.
 * Accepts the VS Code DiagnosticCollection and Uri by interface so callers
 * in tests can pass mocks without importing the real vscode module.
 */
export function refreshDiagnostics(
  collection: Pick<DiagnosticCollection, 'set' | 'delete'>,
  uri: Uri,
  diagnostics: Diagnostic[],
): void {
  if (diagnostics.length === 0) {
    collection.delete(uri);
  } else {
    collection.set(uri, diagnostics);
  }
}
