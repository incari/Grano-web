export type ScaleConnection =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

/** How the app is talking to the scale. */
export type ScaleTransport = "wifi" | "ble";

export interface ScaleSample {
  grams: number;
  ts: number;
}

/** Acknowledgement / result for a command the scale ran (tare, calibrate…). */
export interface ScaleStatus {
  cmd: "tare" | "cal" | "cal_reset" | "wifi_reset" | string;
  ok: boolean;
  /** Calibration factor in counts per gram, when reported. */
  factor?: number;
  message?: string;
}

export interface ScaleDriver {
  readonly transport: ScaleTransport;
  /** Human-readable target: the WebSocket URL, or the BLE device name. */
  readonly label: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  tare(): Promise<void>;
  /**
   * Calibrate against a known weight that is currently sitting on the cell.
   * The scale computes and persists a new counts-per-gram factor.
   */
  calibrate?(knownGrams: number): Promise<void>;
  /** Restore the firmware's default calibration factor. */
  resetCalibration?(): Promise<void>;
  /** Forget the scale's saved Wi-Fi and reboot into its setup hotspot. */
  resetWifi?(): Promise<void>;
  /** Hint the simulator to pour (no-op on real hardware). */
  setPourRate?(rateGPerS: number): void;
  onSample(cb: (s: ScaleSample) => void): () => void;
  onConnection(cb: (c: ScaleConnection) => void): () => void;
  /** Command acknowledgements (tare / calibrate results). */
  onStatus?(cb: (s: ScaleStatus) => void): () => void;
}
