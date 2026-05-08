#!/usr/bin/env node
/**
 * Sprint 4 Task 10 — E2E smoke test
 *
 * Spawns the MCP server via stdio and verifies the 3 manual checks:
 *   1. code_health_review on unhealthy/complex.ts → loopComplete: false, score < 7.0
 *   2. code_health_review on healthy/simple.ts   → score >= 9.0, smells: []
 *   3. code_health_score on edge-cases/empty.ts  → score 10.0, smells: []
 */
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVER_BIN = path.join(REPO_ROOT, 'packages/mcp-server/dist/index.js');
const FIXTURES = path.join(REPO_ROOT, 'packages/core/tests/fixtures');

const proc = spawn('node', [SERVER_BIN], { stdio: ['pipe', 'pipe', 'pipe'] });

let buffer = '';
const pending = new Map();
let nextId = 1;

proc.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      const cb = pending.get(msg.id);
      if (cb) {
        pending.delete(msg.id);
        cb(msg);
      }
    } catch {
      // Notification or non-JSON output — ignore
    }
  }
});

proc.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

function rpc(method, params) {
  const id = nextId++;
  const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
  return new Promise((resolve, reject) => {
    pending.set(id, (msg) => (msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)));
    proc.stdin.write(req);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout waiting for ${method} (id=${id})`));
      }
    }, 30000);
  });
}

function parseToolResult(result) {
  const text = result?.content?.[0]?.text;
  if (!text) throw new Error('No text content in tool result');
  return JSON.parse(text);
}

const checks = [];
function assert(label, cond, detail) {
  checks.push({ label, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `   (${detail})` : ''}`);
}

try {
  await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'e2e-smoke-test', version: '0.0.1' },
  });
  proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

  const tools = await rpc('tools/list', {});
  const names = tools.tools.map((t) => t.name).sort();
  console.log(`Tools registered: ${names.join(', ')}`);
  assert('All 7 tools registered', names.length === 7, `${names.length} tools`);

  // --- Check 1: code_health_review on unhealthy ---
  const unhealthyFile = path.join(FIXTURES, 'unhealthy/complex.ts');
  const r1 = parseToolResult(
    await rpc('tools/call', { name: 'code_health_review', arguments: { filePath: unhealthyFile } })
  );
  console.log(`[1] unhealthy → score=${r1.score}, smells=${r1.issues?.length}, action=${r1.nextAction?.action}`);
  assert('1a. unhealthy → loopComplete: false', r1.loopComplete === false, `loopComplete=${r1.loopComplete}`);
  assert('1b. unhealthy → score < 7.0', r1.score < 7.0, `score=${r1.score}`);
  assert('1c. unhealthy → has smells', (r1.issues?.length ?? 0) > 0, `${r1.issues?.length ?? 0} smells`);
  assert('1d. unhealthy → nextAction.instruction present', typeof r1.nextAction?.instruction === 'string' && r1.nextAction.instruction.length > 10);

  // --- Check 2: code_health_review on healthy ---
  const healthyFile = path.join(FIXTURES, 'healthy/simple.ts');
  const r2 = parseToolResult(
    await rpc('tools/call', { name: 'code_health_review', arguments: { filePath: healthyFile } })
  );
  console.log(`[2] healthy → score=${r2.score}, smells=${r2.issues?.length}, action=${r2.nextAction?.action}`);
  assert('2a. healthy → score >= 9.0', r2.score >= 9.0, `score=${r2.score}`);
  assert('2b. healthy → zero smells', (r2.issues?.length ?? 0) === 0, `${r2.issues?.length ?? 0} smells`);
  assert('2c. healthy → loopComplete: true (score >= 9.5)', r2.loopComplete === (r2.score >= 9.5));
  if (r2.score >= 9.5) {
    assert('2d. healthy → nextAction.action: commit_safe', r2.nextAction?.action === 'commit_safe', `action=${r2.nextAction?.action}`);
  }

  // --- Check 3: code_health_score on edge-case empty ---
  const emptyFile = path.join(FIXTURES, 'edge-cases/empty.ts');
  const r3 = parseToolResult(
    await rpc('tools/call', { name: 'code_health_score', arguments: { filePath: emptyFile } })
  );
  console.log(`[3] empty → score=${r3.score}, smells=${r3.issues?.length}`);
  assert('3a. empty → score 10.0', r3.score === 10.0, `score=${r3.score}`);
  assert('3b. empty → zero smells', (r3.issues?.length ?? 0) === 0);

  // --- Summary ---
  const passed = checks.filter((c) => c.pass).length;
  const total = checks.length;
  console.log(`\n=== ${passed}/${total} checks passed ===`);
  proc.kill();
  process.exit(passed === total ? 0 : 1);
} catch (err) {
  console.error('E2E test failed:', err);
  proc.kill();
  process.exit(2);
}
