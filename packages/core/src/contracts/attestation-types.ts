/**
 * Type-only contract for `code_health_attest` (90-day plan — EU AI Act Art. 12
 * controls evidence). Additive and optional: nothing in the existing pipeline
 * depends on these. Build agents that implement attestation import from this
 * module via a relative path until Integrate re-exports it from
 * `packages/core/src/index.ts`.
 *
 * An attestation is a signed, reproducible record framing a health-analysis
 * result as *controls evidence* (a logged check that ran), NOT a risk
 * prediction. It is designed to be embedded in an AI-BOM fragment and exported
 * to SARIF / CycloneDX.
 */
import type { HealthCategory, Language, Smell } from '../types';

/**
 * A single signed attestation that a health check ran against a file at a point
 * in time. Field set is deliberately minimal and content-free beyond the path,
 * so it can be published as compliance evidence without leaking source.
 */
export interface AttestationRecord {
  /** ISO-8601 UTC timestamp of when the attestation was produced. */
  timestamp: string;
  filePath: string;
  language: Language;
  /** Version of @healthy-ai-code that produced the score (for reproducibility). */
  toolVersion: string;
  /** Version of the OCHS scoring spec the score conforms to (Sats 3). */
  ochsSpecVersion?: string;
  score: number;
  category: HealthCategory;
  /** Smells present at attestation time. */
  smells: Smell[];
  /** True when score >= the configured AI-ready threshold at attestation time. */
  thresholdPassed: boolean;
  /** The threshold value used for `thresholdPassed`. */
  threshold: number;
  /** Signature over the canonical serialisation of this record (see `signature`). */
  signature?: AttestationSignature;
}

/** Detached signature describing how an AttestationRecord was signed. */
export interface AttestationSignature {
  /** Signature algorithm identifier, e.g. "sha256" (hash-only) or "ed25519". */
  algorithm: string;
  /**
   * Hash or signature value over the canonical JSON of the record with this
   * `signature` field omitted (hex or base64, per algorithm).
   */
  value: string;
  /** Optional key identifier / fingerprint of the signing key, when applicable. */
  keyId?: string;
}

/** Export envelope formats supported for an attestation. */
export type AttestationExportFormat = 'json' | 'sarif' | 'cyclonedx';
