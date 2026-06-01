// Healthy fixture: correct cryptographic practices
// Sprint 58 — detectSecuritySinks fixture (should produce 0 CryptographicMisuseRisk smells)
import { createHash } from 'crypto';

// Safe: SHA-256 for integrity verification
function hashData(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

// Safe: Web Crypto API for cryptographically secure random values
async function generateSecureToken(): Promise<string> {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Safe: SHA-3 (sha3-256) for signing
function signData(data: string): string {
  return createHash('sha3-256').update(data).digest('hex');
}

export { hashData, generateSecureToken, signData };
