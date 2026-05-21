/** Global runtime configuration for @healthy-ai-code/core. */
export interface CoreConfig {
  /** When true, uses empirically calibrated thresholds from calibration/*.json (default: false) */
  useCalibratedThresholds: boolean;
}

let _config: CoreConfig = {
  useCalibratedThresholds: false,
};

export function setConfig(partial: Partial<CoreConfig>): void {
  _config = { ..._config, ...partial };
}

export function getConfig(): Readonly<CoreConfig> {
  return _config;
}
