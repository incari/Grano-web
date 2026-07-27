export type ScaleConnection =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface ScaleSample {
  grams: number;
  ts: number;
}

export interface ScaleDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  tare(): Promise<void>;
  /** Hint the simulator to pour (no-op on real hardware). */
  setPourRate?(rateGPerS: number): void;
  onSample(cb: (s: ScaleSample) => void): () => void;
  onConnection(cb: (c: ScaleConnection) => void): () => void;
}
