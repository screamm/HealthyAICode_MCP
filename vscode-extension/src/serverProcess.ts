/**
 * serverProcess.ts
 *
 * Manages the lifecycle of the Healthy AI Code MCP server as a stdio child
 * process.  This module is intentionally free of VS Code extension-host APIs
 * (no imports from 'vscode') so it can be unit-tested in a headless Node
 * environment.
 *
 * The MCP server communicates over stdin/stdout using the JSON-RPC framing
 * defined by the Model Context Protocol.  VS Code extension code wraps the
 * child process and proxies messages through it.
 */

import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ServerProcessOptions {
  /** Absolute path to the MCP server entry point (dist/index.js). */
  serverPath: string;
  /** Extra environment variables passed to the child process. */
  env?: Record<string, string>;
  /** Timeout in ms before a request is considered failed. Defaults to 30 000. */
  requestTimeoutMs?: number;
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

type PendingRequest = {
  resolve: (response: JsonRpcResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

// ── McpServerProcess ──────────────────────────────────────────────────────────

/**
 * Spawns and manages a single MCP server child process.
 *
 * Lifecycle:
 *   const proc = new McpServerProcess(options);
 *   await proc.start();
 *   const result = await proc.send('tools/call', { name: 'code_health_review', arguments: { filePath: '/…' } });
 *   proc.stop();
 */
export class McpServerProcess extends EventEmitter {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private lineBuffer = '';
  private readonly options: Required<ServerProcessOptions>;

  constructor(options: ServerProcessOptions) {
    super();
    this.options = {
      requestTimeoutMs: 30_000,
      env: {},
      ...options,
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Start the MCP server child process. Resolves once the process is ready. */
  async start(): Promise<void> {
    if (this.child) {
      throw new Error('McpServerProcess is already running');
    }

    const child = spawn('node', [this.options.serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.options.env },
    });

    this.child = child;

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.handleStdout(chunk));

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => this.emit('stderr', chunk));

    child.on('error', (err) => {
      this.emit('error', err);
      this.rejectAll(err);
    });

    child.on('exit', (code, signal) => {
      this.emit('exit', code, signal);
      const err = new Error(`MCP server exited (code=${code}, signal=${signal})`);
      this.rejectAll(err);
      this.child = null;
    });
  }

  /** Send a JSON-RPC request and return the response. */
  async send(method: string, params: unknown): Promise<JsonRpcResponse> {
    if (!this.child?.stdin) {
      throw new Error('MCP server process is not running');
    }

    const id = this.nextId++;
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request ${id} (${method}) timed out after ${this.options.requestTimeoutMs} ms`));
      }, this.options.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin!.write(JSON.stringify(request) + '\n');
    });
  }

  /** Terminate the child process gracefully. */
  stop(): void {
    if (this.child) {
      this.child.kill('SIGTERM');
      this.child = null;
    }
    this.rejectAll(new Error('McpServerProcess stopped'));
  }

  /** Returns true when a child process is currently running. */
  get isRunning(): boolean {
    return this.child !== null && !this.child.killed;
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private handleStdout(chunk: string): void {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.handleLine(trimmed);
    }
  }

  private handleLine(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.emit('raw', line);
      return;
    }

    if (isJsonRpcResponse(message)) {
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        pending.resolve(message);
      }
    } else {
      this.emit('notification', message);
    }
  }

  private rejectAll(err: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.pending.delete(id);
    }
  }
}

// ── Type guard ────────────────────────────────────────────────────────────────

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'jsonrpc' in value &&
    'id' in value &&
    (value as Record<string, unknown>)['jsonrpc'] === '2.0'
  );
}

// ── Path helpers ──────────────────────────────────────────────────────────────

/**
 * Resolves the path to the bundled MCP server entry point relative to
 * the extension's installation directory.
 *
 * When running inside the extension host, `extensionPath` is provided by
 * the VS Code API via `context.extensionPath`.  In tests, any directory works.
 */
export function resolveDefaultServerPath(extensionPath: string): string {
  return path.join(
    extensionPath,
    '..',
    'packages',
    'mcp-server',
    'dist',
    'index.js',
  );
}
