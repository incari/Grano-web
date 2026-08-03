import { createEmitter, parseScaleFrame } from "../protocol";
import type {
  ScaleConnection,
  ScaleDriver,
  ScaleSample,
  ScaleStatus,
} from "../types";

// The flashed ESP32 advertises itself over mDNS, so the app can reach it by
// name regardless of the DHCP-assigned IP.
const DEFAULT_URL = "ws://grano-scale.local:81";

/** WebSocket driver for the Wi-Fi ESP32 scale. */
export function createWsScaleDriver(url = DEFAULT_URL): ScaleDriver {
  let ws: WebSocket | null = null;
  let intentionalClose = false;
  const samples = createEmitter<ScaleSample>();
  const conns = createEmitter<ScaleConnection>();
  const statuses = createEmitter<ScaleStatus>();
  const temps = createEmitter<number>();
  const buttons = createEmitter<string>();

  function send(obj: Record<string, unknown>) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  return {
    transport: "wifi",
    label: url,

    async connect() {
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      intentionalClose = false;
      conns.emit("connecting");

      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url);
        ws = socket;
        let settled = false;

        // StrictMode mounts effects twice (connect → disconnect → connect), so
        // a superseded socket's late open/close must not touch shared state.
        const isCurrent = () => ws === socket;

        socket.onopen = () => {
          if (!isCurrent()) return;
          settled = true;
          conns.emit("connected");
          resolve();
        };
        socket.onerror = () => {
          if (!isCurrent() || settled) return;
          settled = true;
          conns.emit("error");
          reject(new Error(`Scale WebSocket failed: ${url}`));
        };
        socket.onclose = () => {
          if (!isCurrent()) return;
          ws = null;
          if (!intentionalClose) conns.emit("disconnected");
          if (!settled) {
            settled = true;
            conns.emit("error");
            reject(new Error(`Scale WebSocket closed: ${url}`));
          }
        };
        socket.onmessage = (ev) => {
          if (!isCurrent()) return;
          const frame = parseScaleFrame(String(ev.data));
          if (frame?.kind === "sample") samples.emit(frame.sample);
          else if (frame?.kind === "status") statuses.emit(frame.status);
          else if (frame?.kind === "temp") temps.emit(frame.celsius);
          else if (frame?.kind === "button") buttons.emit(frame.id);
        };
      });
    },

    async disconnect() {
      intentionalClose = true;
      const socket = ws;
      ws = null;
      if (socket) {
        // Drop handlers first so this socket's async close can't emit state
        // after we've moved on (e.g. the StrictMode remount above).
        socket.onopen =
          socket.onerror =
          socket.onclose =
          socket.onmessage =
            null;
        socket.close();
      }
      conns.emit("disconnected");
    },

    async tare() {
      send({ t: "tare" });
    },

    async calibrate(knownGrams: number) {
      send({ t: "cal", g: knownGrams });
    },

    async resetCalibration() {
      send({ t: "cal_reset" });
    },

    async resetWifi() {
      send({ t: "wifi_reset" });
    },

    async beep() {
      send({ t: "beep" });
    },

    onSample: samples.on,
    onConnection: conns.on,
    onStatus: statuses.on,
    onTemp: temps.on,
    onButton: buttons.on,
  };
}

/**
 * Opens the socket just long enough to see whether anything answers. Used by the
 * transport auto-detect so the app can fall back to BLE when the scale isn't on
 * the network (or the phone is on mobile data).
 */
export function probeWsScale(url: string, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      socket.onopen = socket.onerror = socket.onclose = null;
      // Closing a still-connecting socket is a no-op the browser handles.
      socket.close();
      resolve(reachable);
    };
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    socket.onopen = () => finish(true);
    socket.onerror = () => finish(false);
    socket.onclose = () => finish(false);
  });
}

export const SCALE_WS_DEFAULT_URL = DEFAULT_URL;
