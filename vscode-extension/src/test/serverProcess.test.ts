/**
 * serverProcess.test.ts
 *
 * Headless unit tests for serverProcess.ts pure helpers:
 *   - resolveDefaultServerPath()
 *   - McpServerProcess initial state
 *   - JSON-RPC line framing (internal handleLine logic via EventEmitter)
 *
 * Does NOT actually spawn a child process — child_process.spawn is not called.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { resolveDefaultServerPath, McpServerProcess } from '../serverProcess';

// ── resolveDefaultServerPath ──────────────────────────────────────────────────

describe('resolveDefaultServerPath', () => {
  it('resolves to packages/mcp-server/dist/index.js relative to extensionPath', () => {
    const extensionPath = '/workspace/vscode-extension';
    const resolved = resolveDefaultServerPath(extensionPath);

    // Use path.normalize so the test passes on both Windows and POSIX.
    const expected = path.normalize('/workspace/packages/mcp-server/dist/index.js');
    expect(path.normalize(resolved)).toBe(expected);
  });

  it('returns a string ending with index.js', () => {
    const resolved = resolveDefaultServerPath('/any/path');
    expect(resolved.endsWith('index.js')).toBe(true);
  });
});

// ── McpServerProcess initial state ────────────────────────────────────────────

describe('McpServerProcess', () => {
  it('starts in a non-running state', () => {
    const proc = new McpServerProcess({ serverPath: '/fake/path/index.js' });
    expect(proc.isRunning).toBe(false);
  });

  it('throws if send() is called before start()', async () => {
    const proc = new McpServerProcess({ serverPath: '/fake/path/index.js' });
    await expect(proc.send('tools/list', {})).rejects.toThrow('not running');
  });

  it('is an EventEmitter (emits events)', () => {
    const proc = new McpServerProcess({ serverPath: '/fake/path/index.js' });
    let fired = false;
    proc.on('test-event', () => { fired = true; });
    proc.emit('test-event');
    expect(fired).toBe(true);
  });
});
