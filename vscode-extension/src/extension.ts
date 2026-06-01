/**
 * extension.ts
 *
 * VS Code extension entry point.  Activation wires up:
 *   - A DiagnosticCollection for code-health findings.
 *   - An on-save listener that analyses the active file via analyzeFile().
 *   - A status bar item showing the current file's health score.
 *   - Two commands: analyzeFile and showReport.
 *
 * Heavy logic (smell → diagnostic mapping, MCP child-process management) lives
 * in diagnostics.ts and serverProcess.ts respectively, so it can be unit-tested
 * without a VS Code host.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { analyzeFile } from '@healthy-ai-code/core';
import { smellsToDiagnostics, buildStatusBarLabel, refreshDiagnostics } from './diagnostics';
import { McpServerProcess, resolveDefaultServerPath } from './serverProcess';

// ── Module-level state (lifecycle managed by activate/deactivate) ─────────────

let diagnosticCollection: vscode.DiagnosticCollection | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let mcpServer: McpServerProcess | undefined;

// ── Activate ──────────────────────────────────────────────────────────────────

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  diagnosticCollection = vscode.languages.createDiagnosticCollection('healthy-ai-code');
  context.subscriptions.push(diagnosticCollection);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'healthyAiCode.showReport';
  context.subscriptions.push(statusBarItem);

  // ── Start MCP server child process ──────────────────────────────────────────
  const config = vscode.workspace.getConfiguration('healthyAiCode');
  const serverPath: string = config.get<string>('mcpServerPath') || resolveDefaultServerPath(context.extensionPath);

  mcpServer = new McpServerProcess({ serverPath });
  try {
    await mcpServer.start();
  } catch (err) {
    vscode.window.showWarningMessage(
      `Healthy AI Code: could not start MCP server — falling back to in-process analysis. ${String(err)}`,
    );
  }

  // ── Commands ────────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('healthyAiCode.analyzeFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await analyzeDocument(editor.document);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('healthyAiCode.showReport', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const diagnostics = diagnosticCollection!.get(editor.document.uri) ?? [];
      const panel = vscode.window.createWebviewPanel(
        'healthyAiCodeReport',
        'Code Health Report',
        vscode.ViewColumn.Beside,
        {},
      );
      panel.webview.html = buildReportHtml(editor.document.fileName, diagnostics);
    }),
  );

  // ── On-save listener ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const enableOnSave = vscode.workspace
        .getConfiguration('healthyAiCode')
        .get<boolean>('enableOnSave', true);
      if (enableOnSave) {
        await analyzeDocument(doc);
      }
    }),
  );

  // ── Analyse the active editor on startup ───────────────────────────────────
  if (vscode.window.activeTextEditor) {
    void analyzeDocument(vscode.window.activeTextEditor.document);
  }
}

// ── Deactivate ─────────────────────────────────────────────────────────────────

export function deactivate(): void {
  mcpServer?.stop();
  mcpServer = undefined;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function analyzeDocument(doc: vscode.TextDocument): Promise<void> {
  if (!diagnosticCollection) return;

  const fsPath = doc.uri.fsPath;
  const ext = path.extname(fsPath).toLowerCase();
  const supportedExtensions = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go',
    '.rs', '.cs', '.rb', '.php', '.kt', '.scala', '.swift',
  ]);

  if (!supportedExtensions.has(ext)) return;

  try {
    const result = await analyzeFile(fsPath);
    const rawDiagnostics = smellsToDiagnostics(result);

    // Cast plain objects to real Diagnostic instances using the VS Code API.
    const diagnostics = rawDiagnostics.map((d) => {
      const range = new vscode.Range(
        new vscode.Position(d.range.start.line, d.range.start.character),
        new vscode.Position(d.range.end.line, d.range.end.character),
      );
      const diag = new vscode.Diagnostic(range, d.message, d.severity as vscode.DiagnosticSeverity);
      diag.source = d.source;
      diag.code = d.code;
      return diag;
    });

    refreshDiagnostics(diagnosticCollection, doc.uri, diagnostics);
    updateStatusBar(result.score, result.category);
  } catch (err) {
    // Analysis errors are surfaced as a single informational diagnostic.
    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
    const diag = new vscode.Diagnostic(
      range,
      `Healthy AI Code: analysis error — ${String(err)}`,
      vscode.DiagnosticSeverity.Information,
    );
    diag.source = 'Healthy AI Code';
    refreshDiagnostics(diagnosticCollection, doc.uri, [diag]);
  }
}

function updateStatusBar(score: number, category: 'green' | 'yellow' | 'red'): void {
  if (!statusBarItem) return;
  statusBarItem.text = buildStatusBarLabel(score, category);
  statusBarItem.backgroundColor =
    category === 'red'
      ? new vscode.ThemeColor('statusBarItem.errorBackground')
      : category === 'yellow'
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
  statusBarItem.show();
}

function buildReportHtml(filePath: string, diagnostics: readonly vscode.Diagnostic[]): string {
  const rows = diagnostics.length === 0
    ? '<tr><td colspan="3">No issues found — this file is healthy!</td></tr>'
    : diagnostics
        .map(
          (d) =>
            `<tr><td>${String(d.code)}</td><td>${severityLabel(d.severity)}</td><td>${escapeHtml(d.message)}</td></tr>`,
        )
        .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Code Health Report</title>
<style>body{font-family:sans-serif;padding:16px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}th{background:#eee}</style>
</head>
<body>
<h2>Code Health Report</h2>
<p><strong>File:</strong> ${escapeHtml(filePath)}</p>
<table><thead><tr><th>Type</th><th>Severity</th><th>Message</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}

function severityLabel(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error: return 'Error';
    case vscode.DiagnosticSeverity.Warning: return 'Warning';
    case vscode.DiagnosticSeverity.Information: return 'Information';
    default: return 'Hint';
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
