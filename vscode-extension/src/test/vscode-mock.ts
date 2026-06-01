/**
 * vscode-mock.ts
 *
 * Minimal mock of the 'vscode' module API surface needed by the
 * headless unit tests.  Vitest's module aliasing makes this file
 * resolve whenever a test (or a module under test) imports 'vscode'.
 *
 * Only the subset of the API exercised by diagnostics.ts and
 * serverProcess.ts is implemented here.
 */

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Position {
  constructor(
    public readonly line: number,
    public readonly character: number,
  ) {}
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;
  constructor(start: Position, end: Position) {
    this.start = start;
    this.end = end;
  }
}

export class Diagnostic {
  public source?: string;
  public code?: string | number;
  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity = DiagnosticSeverity.Warning,
  ) {}
}

export class ThemeColor {
  constructor(public readonly id: string) {}
}

export const StatusBarAlignment = { Left: 1, Right: 2 };
export const ViewColumn = { Active: -1, Beside: -2 };

// Stubs — not exercised by unit tests but referenced by extension.ts imports
export const languages = {
  createDiagnosticCollection: (name: string) => ({
    name,
    set: () => {},
    delete: () => {},
    dispose: () => {},
    get: () => undefined,
    has: () => false,
    clear: () => {},
    forEach: () => {},
    [Symbol.iterator]: function* () { /* empty */ },
  }),
};

export const window = {
  createStatusBarItem: () => ({
    text: '',
    command: undefined as string | undefined,
    backgroundColor: undefined as ThemeColor | undefined,
    show: () => {},
    hide: () => {},
    dispose: () => {},
  }),
  createWebviewPanel: () => ({
    webview: { html: '' },
    dispose: () => {},
  }),
  showWarningMessage: () => Promise.resolve(undefined),
  activeTextEditor: undefined as unknown,
};

export const workspace = {
  getConfiguration: (_section?: string) => ({
    get: <T>(key: string, defaultValue?: T): T => defaultValue as T,
  }),
  onDidSaveTextDocument: () => ({ dispose: () => {} }),
};

export const commands = {
  registerCommand: (_command: string, _callback: () => unknown) => ({ dispose: () => {} }),
};
