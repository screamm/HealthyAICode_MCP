/** Global runtime configuration for @healthy-ai-code/core. */
export interface CoreConfig {
  /** When true, uses empirically calibrated thresholds from calibration/*.json (default: false) */
  useCalibratedThresholds: boolean;
  /**
   * When true, the opt-in aggregate-only calibration telemetry pipeline collects
   * predicted-vs-actual score deltas (Sprint 60). Default: false (no collection).
   * Never stores source code, file paths, or user-identifiable content.
   */
  telemetryEnabled: boolean;
  /**
   * Local JSONL sink path for flushed telemetry aggregates. Relative paths resolve
   * against process.cwd(). Default: 'calibration-telemetry.jsonl'.
   */
  telemetryOutputPath: string;
}

let _config: CoreConfig = {
  useCalibratedThresholds: false,
  telemetryEnabled: false,
  telemetryOutputPath: 'calibration-telemetry.jsonl',
};

export function setConfig(partial: Partial<CoreConfig>): void {
  _config = { ..._config, ...partial };
}

export function getConfig(): Readonly<CoreConfig> {
  return _config;
}
