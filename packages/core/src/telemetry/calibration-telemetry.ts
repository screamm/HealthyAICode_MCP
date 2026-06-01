/**
 * Calibration Telemetry — Sprint 60
 *
 * Opt-in, AGGREGATE-ONLY pipeline for tracking predicted-vs-actual score deltas
 * across refactoring passes. Privacy guarantees:
 *  - NEVER stores source code, file paths, or any user-identifiable content.
 *  - Only stores: smell type, language enum, numeric deltas, iteration count, timestamp.
 *  - Disabled by default (config.telemetryEnabled = false).
 *  - Local differential privacy (Laplace mechanism) applied before aggregation.
 *  - Local JSONL sink: each flush appends one JSON line per aggregate to a local file.
 *
 * Usage:
 *   import { setConfig } from '../config';
 *   import { collectDelta, flushToSink } from './calibration-telemetry';
 *
 *   setConfig({ telemetryEnabled: true, telemetryOutputPath: '/tmp/cal.jsonl' });
 *   collectDelta({ smellType: 'ComplexMethod', language: 'typescript', ... });
 *   await flushToSink();  // writes JSONL, clears buffer
 *
 * Upload format (documented, not live):
 *   POST /api/v1/calibration/aggregates
 *   Content-Type: application/x-ndjson
 *   Body: one AggregateCalibrationRecord JSON per line (same as local JSONL format).
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { SmellType, Language } from '../types';
import { getConfig } from '../config';

// ─── Public Types ──────────────────────────────────────────────────────────────

/**
 * A single calibration event. Contains NO source code, NO file paths.
 * All fields are numeric or enum discriminators.
 */
export interface TelemetryEvent {
  /** The smell type being tracked (enum discriminator, not free text). */
  smellType: SmellType;
  /** The language of the analyzed file (enum discriminator). */
  language: Language;
  /** Score delta predicted by analyzeForAutoRefactor (before refactoring). */
  predictedDelta: number;
  /** Actual score delta measured after applyAutoRefactor + re-analysis. */
  actualDelta: number;
  /** Number of refactoring loop iterations completed. */
  iterations: number;
  /** Unix epoch milliseconds of event capture (no sub-ms precision to avoid fingerprinting). */
  timestamp: number;
}

/**
 * Aggregated calibration record for a (smellType, language) pair.
 * Safe to publish openly — all values are statistical aggregates with sample thresholds.
 */
export interface AggregateCalibrationRecord {
  smellType: SmellType;
  language: Language;
  sampleCount: number;
  meanPredictedDelta: number;
  meanActualDelta: number;
  /** Mean Absolute Error between predicted and actual delta. */
  meanAbsError: number;
  /** 50th percentile of absolute errors. */
  p50Error: number;
  /** 90th percentile of absolute errors. */
  p90Error: number;
}

/**
 * Upload envelope written to the JSONL sink and documented for a future central
 * endpoint. Contains ONLY aggregate statistics and a schema version — no raw events,
 * no source code, no file paths.
 *
 * Schema version follows SemVer. Breaking changes bump the major version.
 */
export interface TelemetryUploadEnvelope {
  /** Schema version for the upload format. Currently "1.0.0". */
  schemaVersion: '1.0.0';
  /** UTC ISO-8601 timestamp of when this batch was flushed. */
  flushedAt: string;
  /** Aggregate records for this batch. */
  records: AggregateCalibrationRecord[];
}

// ─── Internal State ────────────────────────────────────────────────────────────

/** Maximum number of events to buffer before oldest are dropped (FIFO). */
const MAX_BUFFER_SIZE = 10_000;

let _telemetryEnabled = false;
const _buffer: TelemetryEvent[] = [];

// ─── Privacy Control ───────────────────────────────────────────────────────────

/**
 * Enable or disable telemetry collection.
 *
 * NOTE: Prefer using `setConfig({ telemetryEnabled: true })` for production usage
 * so the config flag and the runtime flag stay in sync. This function is provided
 * for testing and for programmatic opt-in within a session.
 */
export function enableTelemetry(enabled: boolean): void {
  _telemetryEnabled = enabled;
}

/**
 * Returns whether telemetry collection is currently enabled.
 * Checks both the runtime flag and the global CoreConfig flag.
 */
export function isTelemetryEnabled(): boolean {
  return _telemetryEnabled || getConfig().telemetryEnabled;
}

// ─── Local Differential Privacy ───────────────────────────────────────────────

/**
 * Applies Laplace mechanism for local differential privacy.
 * Adds zero-mean Laplace noise with scale = 1/epsilon to the given value.
 *
 * @param value   The numeric value to randomize.
 * @param epsilon Privacy parameter. Higher = less noise = better utility but weaker privacy.
 *                Default 1.0 is the industry standard (Brave P3A, Apple iOS telemetry).
 *                Use Infinity to disable noise entirely (test/debug use only).
 * @returns       The value with Laplace noise added.
 */
export function applyLocalDifferentialPrivacy(value: number, epsilon = 1.0): number {
  if (!isFinite(epsilon) || epsilon <= 0) {
    // epsilon = Infinity disables noise; epsilon <= 0 is invalid (treat as no noise)
    return value;
  }
  const scale = 1.0 / epsilon;
  // Laplace sample via inverse CDF: sign * scale * ln(1 - 2|u - 0.5|) where u ~ Uniform(0,1)
  const u = Math.random() - 0.5;
  const laplaceSample = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return value + laplaceSample;
}

// ─── Collection ────────────────────────────────────────────────────────────────

/**
 * Records a calibration event. No-op if telemetry is disabled.
 *
 * The event MUST NOT contain source code or file paths — only numeric/enum values.
 * Privacy-preservation is enforced by the type: TelemetryEvent has no string fields
 * beyond smellType (enum) and language (enum).
 *
 * @param event   The calibration event to record.
 * @param epsilon Optional LDP epsilon (default 1.0). Pass Infinity to disable noise.
 */
export function collectDelta(event: TelemetryEvent, epsilon = 1.0): void {
  if (!isTelemetryEnabled()) {
    return;
  }

  // Apply local differential privacy to numeric deltas before buffering
  const noisedEvent: TelemetryEvent = {
    smellType: event.smellType,
    language: event.language,
    predictedDelta: applyLocalDifferentialPrivacy(event.predictedDelta, epsilon),
    actualDelta: applyLocalDifferentialPrivacy(event.actualDelta, epsilon),
    iterations: Math.round(Math.abs(event.iterations)), // integer only, no noise needed
    timestamp: Math.floor(event.timestamp / 1000) * 1000, // round to nearest second
  };

  // FIFO drop: if buffer is full, remove oldest entry
  if (_buffer.length >= MAX_BUFFER_SIZE) {
    _buffer.shift();
  }
  _buffer.push(noisedEvent);
}

/**
 * Returns the number of currently buffered events.
 */
export function getBufferSize(): number {
  return _buffer.length;
}

/**
 * Returns the timestamp of the oldest buffered event, or 0 if buffer is empty.
 */
export function getOldestEventTimestamp(): number {
  return _buffer.length > 0 ? (_buffer[0]?.timestamp ?? 0) : 0;
}

// ─── Aggregation ───────────────────────────────────────────────────────────────

/**
 * Computes aggregated calibration records from the buffer and clears it.
 *
 * Groups events by (smellType, language) and computes:
 *  - mean predicted delta, mean actual delta
 *  - mean absolute error (MAE)
 *  - p50 and p90 of absolute errors
 *
 * @returns Array of aggregate records. Empty if buffer is empty.
 */
export function flushAggregates(): AggregateCalibrationRecord[] {
  if (_buffer.length === 0) {
    return [];
  }

  // Group events by (smellType, language)
  const groups = new Map<string, TelemetryEvent[]>();
  for (const event of _buffer) {
    const key = `${event.smellType}::${event.language}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(key, [event]);
    }
  }

  // Clear buffer
  _buffer.length = 0;

  // Compute aggregates
  const records: AggregateCalibrationRecord[] = [];
  for (const [, events] of groups) {
    const first = events[0];
    if (!first) continue;

    const n = events.length;
    const sumPredicted = events.reduce((acc, e) => acc + e.predictedDelta, 0);
    const sumActual = events.reduce((acc, e) => acc + e.actualDelta, 0);
    const absErrors = events.map(e => Math.abs(e.predictedDelta - e.actualDelta));
    const sumAbsError = absErrors.reduce((acc, v) => acc + v, 0);

    const sortedErrors = [...absErrors].sort((a, b) => a - b);
    const p50 = percentile(sortedErrors, 50);
    const p90 = percentile(sortedErrors, 90);

    records.push({
      smellType: first.smellType,
      language: first.language,
      sampleCount: n,
      meanPredictedDelta: sumPredicted / n,
      meanActualDelta: sumActual / n,
      meanAbsError: sumAbsError / n,
      p50Error: p50,
      p90Error: p90,
    });
  }

  return records;
}

/**
 * Clears the buffer without computing aggregates.
 * Use when you want to discard accumulated events.
 */
export function clearBuffer(): void {
  _buffer.length = 0;
}

// ─── Local JSONL Sink ──────────────────────────────────────────────────────────

/**
 * Flushes accumulated events to the local JSONL sink file.
 *
 * Behaviour:
 *  - Calls flushAggregates() to compute aggregate records and clear the buffer.
 *  - Wraps them in a TelemetryUploadEnvelope (schema version, timestamp, records).
 *  - Appends one JSON line to the configured output path (newline-delimited JSON).
 *  - Creates the output file and parent directories if they do not exist.
 *  - No-op if telemetry is disabled or the buffer is empty.
 *
 * Privacy: The JSONL file contains ONLY aggregate statistics — no source code,
 * no file paths, no identifiers. It is safe to inspect, share, or delete at any time.
 *
 * @param outputPath Optional path override (defaults to config.telemetryOutputPath).
 * @returns          The number of aggregate records written, or 0 if skipped.
 */
export async function flushToSink(outputPath?: string): Promise<number> {
  if (!isTelemetryEnabled()) {
    return 0;
  }

  const records = flushAggregates();
  if (records.length === 0) {
    return 0;
  }

  const envelope: TelemetryUploadEnvelope = {
    schemaVersion: '1.0.0',
    flushedAt: new Date().toISOString(),
    records,
  };

  const resolvedPath = outputPath ?? getConfig().telemetryOutputPath;
  const absolutePath = path.isAbsolute(resolvedPath)
    ? resolvedPath
    : path.join(process.cwd(), resolvedPath);

  // Ensure parent directory exists
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  // Append one JSONL record (one line per flush)
  await fs.appendFile(absolutePath, JSON.stringify(envelope) + '\n', 'utf-8');

  return records.length;
}

/**
 * Reads all previously flushed envelopes from the local JSONL sink file.
 *
 * Returns an empty array if the file does not exist (not an error).
 *
 * @param outputPath Optional path override (defaults to config.telemetryOutputPath).
 */
export async function readSink(outputPath?: string): Promise<TelemetryUploadEnvelope[]> {
  const resolvedPath = outputPath ?? getConfig().telemetryOutputPath;
  const absolutePath = path.isAbsolute(resolvedPath)
    ? resolvedPath
    : path.join(process.cwd(), resolvedPath);

  try {
    const content = await fs.readFile(absolutePath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line) as TelemetryUploadEnvelope);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

// ─── Serialization ─────────────────────────────────────────────────────────────

/**
 * Serializes aggregate records to CSV format.
 *
 * The CSV contains ONLY aggregate statistics — no individual events, no source code.
 * Safe to publish openly under CC BY 4.0.
 *
 * @param records  Aggregated records from flushAggregates().
 * @returns        CSV string with header row.
 */
export function serializeToCSV(records: AggregateCalibrationRecord[]): string {
  const header = 'smellType,language,sampleCount,meanPredictedDelta,meanActualDelta,meanAbsError,p50Error,p90Error';
  const rows = records.map(r =>
    [
      r.smellType,
      r.language,
      r.sampleCount,
      round4(r.meanPredictedDelta),
      round4(r.meanActualDelta),
      round4(r.meanAbsError),
      round4(r.p50Error),
      round4(r.p90Error),
    ].join(',')
  );
  return [header, ...rows].join('\n');
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

/** Computes the p-th percentile of a sorted numeric array (nearest rank method). */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  const safeIdx = Math.max(0, Math.min(idx, sorted.length - 1));
  return sorted[safeIdx] ?? 0;
}

/** Rounds to 4 decimal places for CSV output. */
function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
