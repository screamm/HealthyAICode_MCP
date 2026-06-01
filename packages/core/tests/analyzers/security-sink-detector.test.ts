import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { detectSecuritySinks } from '../../src/analyzers/security-sink-detector';

const FIXTURES_HEALTHY = path.join(__dirname, '../fixtures/healthy');
const FIXTURES_UNHEALTHY = path.join(__dirname, '../fixtures/unhealthy');

// ─── UnsafeDeserialization ────────────────────────────────────────────────────

describe('detectSecuritySinks — UnsafeDeserialization', () => {
  it('detects pickle.load in Python', () => {
    const code = `import pickle\nwith open('f','rb') as f:\n    data = pickle.load(f)`;
    const smells = detectSecuritySinks(code, 'python');
    const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
    expect(deser.length).toBeGreaterThanOrEqual(1);
    expect(deser[0].severity).toBe('critical');
    expect(deser[0].line).toBeGreaterThan(0);
  });

  it('detects pickle.loads in Python', () => {
    const code = `import pickle\nresult = pickle.loads(data)`;
    const smells = detectSecuritySinks(code, 'python');
    const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
    expect(deser.length).toBeGreaterThanOrEqual(1);
  });

  it('detects yaml.load without SafeLoader in Python', () => {
    const code = `import yaml\nconfig = yaml.load(data)`;
    const smells = detectSecuritySinks(code, 'python');
    const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
    expect(deser.length).toBeGreaterThanOrEqual(1);
    expect(deser[0].severity).toBe('critical');
  });

  it('does NOT flag yaml.safe_load (false-positive control)', () => {
    const code = `import yaml\nconfig = yaml.safe_load(data)`;
    const smells = detectSecuritySinks(code, 'python');
    const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
    expect(deser).toHaveLength(0);
  });

  it('does NOT flag yaml.load with SafeLoader on same line', () => {
    const code = `import yaml\nconfig = yaml.load(data, Loader=yaml.SafeLoader)`;
    const smells = detectSecuritySinks(code, 'python');
    const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
    expect(deser).toHaveLength(0);
  });

  it('detects ObjectInputStream in Java', () => {
    const code = `ObjectInputStream ois = new ObjectInputStream(inputStream);`;
    const smells = detectSecuritySinks(code, 'java');
    const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
    expect(deser.length).toBeGreaterThanOrEqual(1);
    expect(deser[0].severity).toBe('critical');
  });

  it('detects unserialize in PHP', () => {
    const code = `$data = unserialize($_POST['data']);`;
    const smells = detectSecuritySinks(code, 'php');
    const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
    expect(deser.length).toBeGreaterThanOrEqual(1);
  });

  it('detects Marshal.load in Ruby', () => {
    const code = `data = Marshal.load(raw_bytes)`;
    const smells = detectSecuritySinks(code, 'ruby');
    const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
    expect(deser.length).toBeGreaterThanOrEqual(1);
  });

  it('detects vm.runInNewContext in TypeScript', () => {
    const code = `const result = vm.runInNewContext(userCode, sandbox);`;
    const smells = detectSecuritySinks(code, 'typescript');
    const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
    expect(deser.length).toBeGreaterThanOrEqual(1);
  });

  it('detects eval with non-literal argument in TypeScript', () => {
    const code = `const result = eval(userInput);`;
    const smells = detectSecuritySinks(code, 'typescript');
    const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
    expect(deser.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag eval with string literal', () => {
    const code = `const result = eval("1 + 1");`;
    const smells = detectSecuritySinks(code, 'typescript');
    const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
    expect(deser).toHaveLength(0);
  });

  describe('insecure-deserialization.py fixture', () => {
    const code = fs.readFileSync(
      path.join(FIXTURES_UNHEALTHY, 'insecure-deserialization.py'),
      'utf-8',
    );

    it('detects at least 2 UnsafeDeserialization smells', () => {
      const smells = detectSecuritySinks(code, 'python');
      const deser = smells.filter(s => s.type === 'UnsafeDeserialization');
      expect(deser.length).toBeGreaterThanOrEqual(2);
    });

    it('all deserialization smells have severity critical', () => {
      const smells = detectSecuritySinks(code, 'python');
      for (const s of smells.filter(s => s.type === 'UnsafeDeserialization')) {
        expect(s.severity).toBe('critical');
      }
    });
  });
});

// ─── SsrfRisk ─────────────────────────────────────────────────────────────────

describe('detectSecuritySinks — SsrfRisk', () => {
  it('detects fetch() with URL from req.query', () => {
    const code = [
      'async function handler(req: Request) {',
      '  const url = req.query.url as string;',
      '  const response = await fetch(url);',
      '  return response.text();',
      '}',
    ].join('\n');
    const smells = detectSecuritySinks(code, 'typescript');
    const ssrf = smells.filter(s => s.type === 'SsrfRisk');
    expect(ssrf.length).toBeGreaterThanOrEqual(1);
    expect(ssrf[0].severity).toBe('high');
  });

  it('detects axios.get() with URL from req.params', () => {
    const code = [
      'app.get("/fetch/:target", async (req, res) => {',
      '  const result = await axios.get(req.params.target);',
      '  res.json(result.data);',
      '});',
    ].join('\n');
    const smells = detectSecuritySinks(code, 'typescript');
    const ssrf = smells.filter(s => s.type === 'SsrfRisk');
    expect(ssrf.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag fetch() with a literal URL (false-positive control)', () => {
    const code = `const response = await fetch('https://api.example.com/data');`;
    const smells = detectSecuritySinks(code, 'typescript');
    const ssrf = smells.filter(s => s.type === 'SsrfRisk');
    expect(ssrf).toHaveLength(0);
  });

  it('detects requests.get() with URL from request.GET in Python', () => {
    const code = [
      'def proxy(request):',
      '    url = request.GET["url"]',
      '    resp = requests.get(url)',
      '    return resp.text',
    ].join('\n');
    const smells = detectSecuritySinks(code, 'python');
    const ssrf = smells.filter(s => s.type === 'SsrfRisk');
    expect(ssrf.length).toBeGreaterThanOrEqual(1);
  });

  describe('ssrf-risk.ts fixture', () => {
    const code = fs.readFileSync(
      path.join(FIXTURES_UNHEALTHY, 'ssrf-risk.ts'),
      'utf-8',
    );

    it('detects at least 1 SsrfRisk smell', () => {
      const smells = detectSecuritySinks(code, 'typescript');
      const ssrf = smells.filter(s => s.type === 'SsrfRisk');
      expect(ssrf.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ─── CryptographicMisuseRisk ──────────────────────────────────────────────────

describe('detectSecuritySinks — CryptographicMisuseRisk', () => {
  it('detects createHash("md5") in TypeScript', () => {
    const code = `const hash = createHash('md5').update(data).digest('hex');`;
    const smells = detectSecuritySinks(code, 'typescript');
    const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
    expect(crypto.length).toBeGreaterThanOrEqual(1);
    expect(crypto[0].severity).toBe('critical');
  });

  it('detects createHash("sha1") in TypeScript', () => {
    const code = `const sig = createHash('sha1').update(payload).digest('hex');`;
    const smells = detectSecuritySinks(code, 'typescript');
    const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
    expect(crypto.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag createHash("sha256") (false-positive control)', () => {
    const code = `const hash = createHash('sha256').update(data).digest('hex');`;
    const smells = detectSecuritySinks(code, 'typescript');
    const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
    expect(crypto).toHaveLength(0);
  });

  it('detects Math.random() near "token" variable', () => {
    const code = [
      'function generateToken(): string {',
      '  const token = Math.random().toString(36).slice(2);',
      '  return token;',
      '}',
    ].join('\n');
    const smells = detectSecuritySinks(code, 'typescript');
    const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
    expect(crypto.length).toBeGreaterThanOrEqual(1);
    expect(crypto[0].severity).toBe('high');
  });

  it('does NOT flag Math.random() without security-sensitive context', () => {
    const code = [
      'function rollDice(): number {',
      '  return Math.floor(Math.random() * 6) + 1;',
      '}',
    ].join('\n');
    const smells = detectSecuritySinks(code, 'typescript');
    const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
    expect(crypto).toHaveLength(0);
  });

  it('does NOT flag crypto.getRandomValues() (false-positive control)', () => {
    const code = [
      'const buf = new Uint8Array(32);',
      'crypto.getRandomValues(buf);',
      'const token = Array.from(buf).map(b => b.toString(16)).join("");',
    ].join('\n');
    const smells = detectSecuritySinks(code, 'typescript');
    const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
    expect(crypto).toHaveLength(0);
  });

  it('detects hashlib.md5() in Python', () => {
    const code = `digest = hashlib.md5(password.encode()).hexdigest()`;
    const smells = detectSecuritySinks(code, 'python');
    const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
    expect(crypto.length).toBeGreaterThanOrEqual(1);
    expect(crypto[0].severity).toBe('critical');
  });

  it('detects random.random() near nonce in Python', () => {
    const code = [
      'def generate_nonce():',
      '    nonce = random.random()',
      '    return nonce',
    ].join('\n');
    const smells = detectSecuritySinks(code, 'python');
    const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
    expect(crypto.length).toBeGreaterThanOrEqual(1);
  });

  it('detects MessageDigest.getInstance("MD5") in Java', () => {
    const code = `MessageDigest md = MessageDigest.getInstance("MD5");`;
    const smells = detectSecuritySinks(code, 'java');
    const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
    expect(crypto.length).toBeGreaterThanOrEqual(1);
    expect(crypto[0].severity).toBe('critical');
  });

  describe('crypto-misuse.ts fixture', () => {
    const code = fs.readFileSync(
      path.join(FIXTURES_UNHEALTHY, 'crypto-misuse.ts'),
      'utf-8',
    );

    it('detects at least 2 CryptographicMisuseRisk smells', () => {
      const smells = detectSecuritySinks(code, 'typescript');
      const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
      expect(crypto.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('crypto-misuse.py fixture', () => {
    const code = fs.readFileSync(
      path.join(FIXTURES_UNHEALTHY, 'crypto-misuse.py'),
      'utf-8',
    );

    it('detects at least 2 CryptographicMisuseRisk smells', () => {
      const smells = detectSecuritySinks(code, 'python');
      const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
      expect(crypto.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('no-crypto-misuse.ts healthy fixture', () => {
    const code = fs.readFileSync(
      path.join(FIXTURES_HEALTHY, 'no-crypto-misuse.ts'),
      'utf-8',
    );

    it('produces 0 CryptographicMisuseRisk smells', () => {
      const smells = detectSecuritySinks(code, 'typescript');
      const crypto = smells.filter(s => s.type === 'CryptographicMisuseRisk');
      expect(crypto).toHaveLength(0);
    });
  });
});

// ─── Tier C language filtering ────────────────────────────────────────────────

describe('detectSecuritySinks — Tier C languages return empty', () => {
  it('returns [] for yaml', () => {
    const smells = detectSecuritySinks('key: value', 'yaml');
    expect(smells).toHaveLength(0);
  });

  it('returns [] for json', () => {
    const smells = detectSecuritySinks('{"key": "value"}', 'json');
    expect(smells).toHaveLength(0);
  });
});
