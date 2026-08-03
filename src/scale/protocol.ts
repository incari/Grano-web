import type { ScaleSample, ScaleStatus } from "./types";

/**
 * The firmware speaks the same JSON frames over Wi-Fi (WebSocket text) and BLE
 * (newline-delimited notifications), so both drivers share this decoder.
 *
 *   scale → app  {"t":"w","g":12.3}                  weight, ~10 Hz
 *   scale → app  {"t":"ack","cmd":"tare","ok":true}  command result
 *   scale → app  {"t":"temp","c":93.5}               probe temperature, ~1 Hz
 *   scale → app  {"t":"btn","id":"timer"}            front-panel button press
 */
export type ScaleFrame =
  | { kind: "sample"; sample: ScaleSample }
  | { kind: "status"; status: ScaleStatus }
  | { kind: "temp"; celsius: number }
  | { kind: "button"; id: string };

interface RawFrame {
  t?: string;
  g?: number;
  cmd?: string;
  ok?: boolean;
  factor?: number;
  message?: string;
  c?: number;
  id?: string;
}

export function parseScaleFrame(text: string): ScaleFrame | null {
  let msg: RawFrame;
  try {
    msg = JSON.parse(text) as RawFrame;
  } catch {
    return null; // ignore malformed frames
  }

  if (msg.t === "w" && typeof msg.g === "number") {
    return { kind: "sample", sample: { grams: msg.g, ts: performance.now() } };
  }
  if (msg.t === "ack" && typeof msg.cmd === "string") {
    return {
      kind: "status",
      status: {
        cmd: msg.cmd,
        ok: msg.ok !== false,
        factor: msg.factor,
        message: msg.message,
      },
    };
  }
  if (msg.t === "temp" && typeof msg.c === "number") {
    return { kind: "temp", celsius: msg.c };
  }
  if (msg.t === "btn" && typeof msg.id === "string") {
    return { kind: "button", id: msg.id };
  }
  return null;
}

/** Fan-out helper shared by the drivers: a Set of callbacks + an unsubscriber. */
export function createEmitter<T>() {
  const cbs = new Set<(v: T) => void>();
  return {
    emit(v: T) {
      cbs.forEach((cb) => cb(v));
    },
    on(cb: (v: T) => void) {
      cbs.add(cb);
      return () => {
        cbs.delete(cb);
      };
    },
  };
}
