// Unhealthy fixture: cryptographic misuse patterns
// Sprint 58 — detectSecuritySinks fixture
import { createHash, randomBytes } from 'crypto';

// CryptographicMisuseRisk: MD5 used for security-critical hashing
function hashPassword(password: string): string {
  return createHash('md5').update(password).digest('hex');
}

// CryptographicMisuseRisk: Math.random() used for security token generation
function generateToken(): string {
  const token = Math.random().toString(36).slice(2);
  return token;
}

// CryptographicMisuseRisk: SHA-1 for signing
function signData(data: string): string {
  return createHash('sha1').update(data).digest('hex');
}

// Safe usage — should NOT trigger
function secureToken(): string {
  return randomBytes(32).toString('hex');
}
