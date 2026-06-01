// packages/core/tests/analyzers/exception-async-antipatterns.test.ts
// Sprint 58 — T16: Unit tests for exception and async anti-pattern detectors

import { describe, it, expect } from 'vitest';
import { detectExceptionAntiPatterns } from '../../src/analyzers/exception-antipatterns';
import { detectAsyncAntiPatterns } from '../../src/analyzers/async-antipatterns';

// ============================================================================
// ExceptionHandlingAntiPattern tests
// ============================================================================

describe('detectExceptionAntiPatterns — TypeScript', () => {
  it('detects empty catch block (EmptyCatch)', () => {
    const code = `
function parse(s: string) {
  try {
    return JSON.parse(s);
  } catch (e) {}
}
`;
    const smells = detectExceptionAntiPatterns(code, 'typescript');
    expect(smells.length).toBeGreaterThan(0);
    expect(smells.some(s => s.type === 'ExceptionHandlingAntiPattern')).toBe(true);
    expect(smells.some(s => s.description.includes('EmptyCatch'))).toBe(true);
  });

  it('does NOT flag catch block with real handling', () => {
    const code = `
function parse(s: string) {
  try {
    return JSON.parse(s);
  } catch (e) {
    console.error('Parse error:', e);
  }
}
`;
    const smells = detectExceptionAntiPatterns(code, 'typescript');
    // Should not detect EmptyCatch (body has content)
    const emptyCatch = smells.filter(s => s.description.includes('EmptyCatch'));
    expect(emptyCatch.length).toBe(0);
  });

  it('detects DestructiveWrapping (re-throw with .message)', () => {
    const code = `
async function fetchUser(id: string) {
  try {
    return await fetch('/users/' + id);
  } catch (e) {
    throw new Error(e.message);
  }
}
`;
    const smells = detectExceptionAntiPatterns(code, 'typescript');
    expect(smells.some(s => s.type === 'ExceptionHandlingAntiPattern' && s.description.includes('DestructiveWrapping'))).toBe(true);
    const destructive = smells.find(s => s.description.includes('DestructiveWrapping'));
    expect(destructive?.severity).toBe('high');
  });

  it('detects CatchGeneric (catch all errors)', () => {
    const code = `
function doWork() {
  try {
    riskyOperation();
  } catch (error) {
    console.log('Something went wrong');
  }
}
function riskyOperation() {}
`;
    const smells = detectExceptionAntiPatterns(code, 'typescript');
    expect(smells.some(s => s.type === 'ExceptionHandlingAntiPattern' && s.description.includes('CatchGeneric'))).toBe(true);
  });

  it('returns smells with correct type for empty catch', () => {
    const code = `try { doSomething(); } catch (e) {}`;
    const smells = detectExceptionAntiPatterns(code, 'typescript');
    const smell = smells.find(s => s.description.includes('EmptyCatch'));
    expect(smell).toBeDefined();
    expect(smell!.type).toBe('ExceptionHandlingAntiPattern');
    expect(smell!.severity).toBe('medium');
    expect(smell!.line).toBeGreaterThanOrEqual(1);
    expect(smell!.suggestion).toBeTruthy();
  });
});

describe('detectExceptionAntiPatterns — Python', () => {
  it('detects bare except: pass (EmptyCatch)', () => {
    const code = `
def parse_config(path):
    try:
        with open(path) as f:
            return json.load(f)
    except:
        pass
`;
    const smells = detectExceptionAntiPatterns(code, 'python');
    expect(smells.length).toBeGreaterThan(0);
    expect(smells.some(s => s.type === 'ExceptionHandlingAntiPattern')).toBe(true);
    expect(smells.some(s => s.description.includes('EmptyCatch'))).toBe(true);
  });

  it('detects except Exception as e: pass (EmptyCatch)', () => {
    const code = `
def load_user(user_id):
    try:
        return db.query(user_id)
    except Exception as e:
        pass
`;
    const smells = detectExceptionAntiPatterns(code, 'python');
    expect(smells.some(s => s.type === 'ExceptionHandlingAntiPattern')).toBe(true);
  });

  it('detects DestructiveWrapping (raise without from)', () => {
    const code = `
def transform(raw):
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(str(e))
`;
    const smells = detectExceptionAntiPatterns(code, 'python');
    expect(smells.some(s => s.description.includes('DestructiveWrapping'))).toBe(true);
  });

  it('does NOT flag raise ... from e (correct Python exception chaining)', () => {
    const code = `
def transform(raw):
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(str(e)) from e
`;
    const smells = detectExceptionAntiPatterns(code, 'python');
    const destructive = smells.filter(s => s.description.includes('DestructiveWrapping'));
    expect(destructive.length).toBe(0);
  });

  it('detects bare except as CatchGeneric when body is non-empty', () => {
    const code = `
def risky():
    try:
        do_work()
    except:
        logger.warning("failed")
`;
    const smells = detectExceptionAntiPatterns(code, 'python');
    expect(smells.some(s => s.description.includes('CatchGeneric'))).toBe(true);
  });
});

describe('detectExceptionAntiPatterns — Java', () => {
  it('detects empty catch block', () => {
    const code = `
public class Foo {
  public void parse(String s) {
    try {
      Integer.parseInt(s);
    } catch (NumberFormatException e) {}
  }
}
`;
    const smells = detectExceptionAntiPatterns(code, 'java');
    expect(smells.some(s => s.description.includes('EmptyCatch'))).toBe(true);
  });

  it('detects catch(Exception e) as CatchGeneric', () => {
    const code = `
public void doWork() {
  try {
    riskyOperation();
  } catch (Exception e) {
    System.out.println("error");
  }
}
`;
    const smells = detectExceptionAntiPatterns(code, 'java');
    expect(smells.some(s => s.description.includes('CatchGeneric'))).toBe(true);
  });

  it('detects DestructiveWrapping (throw new X(e.getMessage()))', () => {
    const code = `
public void connect() {
  try {
    socket.connect();
  } catch (IOException e) {
    throw new RuntimeException(e.getMessage());
  }
}
`;
    const smells = detectExceptionAntiPatterns(code, 'java');
    expect(smells.some(s => s.description.includes('DestructiveWrapping'))).toBe(true);
    const s = smells.find(s => s.description.includes('DestructiveWrapping'));
    expect(s?.severity).toBe('high');
  });

  it('detects UnreachableHandler (broad catch before specific)', () => {
    const code = `
public void process() {
  try {
    doWork();
  } catch (Exception e) {
    handleGeneric(e);
  } catch (IOException e) {
    handleIo(e);
  }
}
`;
    const smells = detectExceptionAntiPatterns(code, 'java');
    expect(smells.some(s => s.description.includes('UnreachableHandler'))).toBe(true);
  });
});

describe('detectExceptionAntiPatterns — returns empty for unsupported language', () => {
  it('returns no smells for Go (no exception system)', () => {
    const code = `
func parseData(s string) (int, error) {
  n, err := strconv.Atoi(s)
  if err != nil {
    return 0, fmt.Errorf("parse error: %w", err)
  }
  return n, nil
}
`;
    const smells = detectExceptionAntiPatterns(code, 'go');
    expect(smells.length).toBe(0);
  });

  it('returns no smells for rust', () => {
    const code = `fn parse(s: &str) -> Result<i32, String> { s.parse().map_err(|e| e.to_string()) }`;
    const smells = detectExceptionAntiPatterns(code, 'rust');
    expect(smells.length).toBe(0);
  });
});

// ============================================================================
// AsyncAntiPattern tests
// ============================================================================

describe('detectAsyncAntiPatterns — P1 asyncFunctionNoAwait', () => {
  it('flags async function with no await', () => {
    const code = `async function f() { return 42; }`;
    const smells = detectAsyncAntiPatterns(code);
    expect(smells.length).toBeGreaterThan(0);
    expect(smells.some(s => s.type === 'AsyncAntiPattern')).toBe(true);
    expect(smells.some(s => s.description.includes('asyncFunctionNoAwait'))).toBe(true);
  });

  it('does NOT flag async function that uses await', () => {
    const code = `async function f() { const x = await g(); return x; }`;
    const smells = detectAsyncAntiPatterns(code);
    const p1 = smells.filter(s => s.description.includes('asyncFunctionNoAwait'));
    expect(p1.length).toBe(0);
  });

  it('does NOT flag async function with explicit Promise constructor (P4 exclusion)', () => {
    const code = `
async function f() {
  return new Promise((resolve, reject) => {
    setTimeout(() => resolve(42), 100);
  });
}`;
    const smells = detectAsyncAntiPatterns(code);
    const p1 = smells.filter(s => s.description.includes('asyncFunctionNoAwait'));
    expect(p1.length).toBe(0);
  });

  it('returns smell with correct shape', () => {
    const code = `async function computeHash(data) { return data.length; }`;
    const smells = detectAsyncAntiPatterns(code);
    const smell = smells.find(s => s.description.includes('asyncFunctionNoAwait'));
    expect(smell).toBeDefined();
    expect(smell!.type).toBe('AsyncAntiPattern');
    expect(smell!.severity).toBe('medium');
    expect(smell!.line).toBeGreaterThanOrEqual(1);
    expect(smell!.suggestion).toBeTruthy();
  });
});

describe('detectAsyncAntiPatterns — P3 asyncFunctionAwaitedReturn', () => {
  it('flags return await outside try/catch', () => {
    const code = `
async function getUserData(userId) {
  return await fetchUser(userId);
}
`;
    const smells = detectAsyncAntiPatterns(code);
    expect(smells.some(s => s.description.includes('asyncFunctionAwaitedReturn'))).toBe(true);
  });

  it('does NOT flag return await inside try/catch (intentional)', () => {
    const code = `
async function safeLoad(path) {
  try {
    return await readFile(path);
  } catch (e) {
    throw new Error('failed', { cause: e });
  }
}
`;
    const smells = detectAsyncAntiPatterns(code);
    const p3 = smells.filter(s => s.description.includes('asyncFunctionAwaitedReturn'));
    expect(p3.length).toBe(0);
  });

  it('does NOT flag return await Promise.all(...)', () => {
    const code = `
async function loadAll(urls) {
  return await Promise.all(urls.map(url => fetch(url)));
}
`;
    const smells = detectAsyncAntiPatterns(code);
    const p3 = smells.filter(s => s.description.includes('asyncFunctionAwaitedReturn'));
    expect(p3.length).toBe(0);
  });

  it('returns severity low for P3', () => {
    const code = `async function go(x) { return await something(x); }`;
    const smells = detectAsyncAntiPatterns(code);
    const s = smells.find(s => s.description.includes('asyncFunctionAwaitedReturn'));
    if (s) expect(s.severity).toBe('low');
  });
});

describe('detectAsyncAntiPatterns — P8 executorOneArgUsed', () => {
  it('flags new Promise((resolve) => ...) missing reject', () => {
    const code = `
const p = new Promise((resolve) => {
  setTimeout(() => resolve(42), 100);
});
`;
    const smells = detectAsyncAntiPatterns(code);
    expect(smells.some(s => s.description.includes('executorOneArgUsed'))).toBe(true);
  });

  it('does NOT flag new Promise((resolve, reject) => ...) with reject', () => {
    const code = `
const p = new Promise((resolve, reject) => {
  setTimeout(() => resolve(42), 100);
});
`;
    const smells = detectAsyncAntiPatterns(code);
    const p8 = smells.filter(s => s.description.includes('executorOneArgUsed'));
    expect(p8.length).toBe(0);
  });

  it('returns smell with correct type and severity', () => {
    const code = `const p = new Promise((resolve) => { resolve(1); });`;
    const smells = detectAsyncAntiPatterns(code);
    const s = smells.find(s => s.description.includes('executorOneArgUsed'));
    expect(s).toBeDefined();
    expect(s!.type).toBe('AsyncAntiPattern');
    expect(s!.severity).toBe('low');
  });
});

describe('detectAsyncAntiPatterns — P7 reactionReturnsPromise', () => {
  it('flags .then callback returning nested .then', () => {
    const code = `
promise.then((results) => {
  return results.map(r => r.id).then((ids) => {
    return ids;
  });
});
`;
    const smells = detectAsyncAntiPatterns(code);
    expect(smells.some(s => s.description.includes('reactionReturnsPromise'))).toBe(true);
  });
});

describe('detectAsyncAntiPatterns — healthy fixture', () => {
  it('returns 0 AsyncAntiPattern smells for correct async patterns', () => {
    const code = `
async function fetcher(url) {
  const response = await fetch(url);
  return response.json();
}

async function safeLoad(path) {
  try {
    return await readFile(path);
  } catch (e) {
    throw new Error('failed', { cause: e });
  }
}

function readFile(path) {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    fs.readFile(path, 'utf8', (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}
`;
    const smells = detectAsyncAntiPatterns(code);
    const asyncSmells = smells.filter(s => s.type === 'AsyncAntiPattern');
    expect(asyncSmells.length).toBe(0);
  });
});

describe('detectAsyncAntiPatterns — fixture file validation', () => {
  it('detects at least 2 AsyncAntiPattern smells in the unhealthy fixture', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const fixturePath = join(__dirname, '../fixtures/unhealthy/async-antipatterns.ts');
    const code = readFileSync(fixturePath, 'utf-8');
    const smells = detectAsyncAntiPatterns(code);
    const asyncSmells = smells.filter(s => s.type === 'AsyncAntiPattern');
    expect(asyncSmells.length).toBeGreaterThanOrEqual(2);
  });

  it('detects 0 AsyncAntiPattern smells in the healthy fixture', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const fixturePath = join(__dirname, '../fixtures/healthy/no-async-issues.ts');
    const code = readFileSync(fixturePath, 'utf-8');
    const smells = detectAsyncAntiPatterns(code);
    const asyncSmells = smells.filter(s => s.type === 'AsyncAntiPattern');
    expect(asyncSmells.length).toBe(0);
  });
});

describe('detectExceptionAntiPatterns — fixture file validation', () => {
  it('detects at least 2 ExceptionHandlingAntiPattern smells in the TS fixture', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const fixturePath = join(__dirname, '../fixtures/unhealthy/exception-antipatterns.ts');
    const code = readFileSync(fixturePath, 'utf-8');
    const smells = detectExceptionAntiPatterns(code, 'typescript');
    const exSmells = smells.filter(s => s.type === 'ExceptionHandlingAntiPattern');
    expect(exSmells.length).toBeGreaterThanOrEqual(2);
  });

  it('detects at least 1 ExceptionHandlingAntiPattern smell in the Python fixture', async () => {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const fixturePath = join(__dirname, '../fixtures/unhealthy/exception-antipatterns.py');
    const code = readFileSync(fixturePath, 'utf-8');
    const smells = detectExceptionAntiPatterns(code, 'python');
    const exSmells = smells.filter(s => s.type === 'ExceptionHandlingAntiPattern');
    expect(exSmells.length).toBeGreaterThanOrEqual(1);
  });
});
