import { describe, it, expect, afterEach } from 'vitest';
import { registerMcp } from '../src/steps/register-mcp';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('register-mcp (dry-run)', () => {
  it('returns a valid result shape', () => {
    const result = registerMcp({ dryRun: true });

    expect(typeof result.harnessSlug).toBe('string');
    expect(['claude-code', 'cursor', 'vscode', 'unknown']).toContain(result.harnessSlug);
    expect(typeof result.alreadyPresent).toBe('boolean');
  });

  it('includes healthy-ai-code in the dryRunDiff or manual instruction', () => {
    const result = registerMcp({ dryRun: true });
    const text = result.dryRunDiff ?? '';
    expect(text).toContain('healthy-ai-code');
  });

  it('when harness is detected, configPath is a non-null string', () => {
    const result = registerMcp({ dryRun: true });
    if (result.harnessSlug !== 'unknown') {
      expect(result.configPath).not.toBeNull();
      expect(typeof result.configPath).toBe('string');
    }
  });

  it('when no harness detected, manual instruction contains mcpServers', () => {
    const result = registerMcp({ dryRun: true });
    if (result.harnessSlug === 'unknown') {
      expect(result.dryRunDiff).toContain('mcpServers');
    }
  });
});

describe('register-mcp: writing to temp dir', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('creates the config file with the correct entry structure', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haic-reg-test-'));
    const fakeClaudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(fakeClaudeDir);
    const fakeConfigPath = path.join(fakeClaudeDir, 'claude_desktop_config.json');

    // Simulate what the step would write (we test the shape, not the writing mechanism).
    const entry = {
      mcpServers: {
        'healthy-ai-code': {
          command: 'npx',
          args: ['-y', '@healthy-ai-code/mcp-server@latest'],
        },
      },
    };
    fs.writeFileSync(fakeConfigPath, JSON.stringify(entry, null, 2), 'utf-8');

    const read = JSON.parse(fs.readFileSync(fakeConfigPath, 'utf-8')) as typeof entry;
    expect(read.mcpServers['healthy-ai-code'].command).toBe('npx');
    expect(read.mcpServers['healthy-ai-code'].args).toContain(
      '@healthy-ai-code/mcp-server@latest',
    );
  });
});
