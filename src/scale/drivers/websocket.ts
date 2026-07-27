import type { ScaleConnection, ScaleDriver, ScaleSample } from "../types";

const DEFAULT_URL = "ws://127.0.0.1:8787";

/** WebSocket driver for the ESP32 scale sim (and a future Wi-Fi ESP32). */
export function createWsScaleDriver(url = DEFAULT_URL): ScaleDriver {
  let ws: WebSocket | null = null;
  let intentionalClose = false;
  const sampleCbs = new Set<(s: ScaleSample) => void>();
  const connCbs = new Set<(c: ScaleConnection) => void>();

  const emitC = (c: ScaleConnection) => {
    connCbs.forEach((cb) => cb(c));
  };
  const emitS = (s: ScaleSample) => {
    sampleCbs.forEach((cb) => cb(s));
  };

  function send(obj: Record<string, unknown>) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  }

  return {
    async connect() {
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }
      intentionalClose = false;
      emitC("connecting");

      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(url);
        ws = socket;
        let settled = false;

        socket.onopen = () => {
          settled = true;
          emitC("connected");
          resolve();
        };
        socket.onerror = () => {
          if (!settled) {
            settled = true;
            emitC("error");
            reject(new Error(`Scale WebSocket failed: ${url}`));
          }
        };
        socket.onclose = () => {
          ws = null;
          if (!intentionalClose) emitC("disconnected");
          if (!settled) {
            settled = true;
            emitC("error");
            reject(new Error(`Scale WebSocket closed: ${url}`));
          }
        };
        socket.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as {
              t?: string;
              g?: number;
            };
            if (msg.t === "w" && typeof msg.g === "number") {
              emitS({ grams: msg.g, ts: performance.now() });
            }
          } catch {
            // ignore malformed frames
          }
        };
      });
    },

    async disconnect() {
      intentionalClose = true;
      ws?.close();
      ws = null;
      emitC("disconnected");
    },

    async tare() {
      send({ t: "tare" });
    },

    setPourRate(rateGPerS: number) {
      send({ t: "pour", rate: rateGPerS });
    },

    onSample(cb) {
      sampleCbs.add(cb);
      return () => {
        sampleCbs.delete(cb);
      };
    },

    onConnection(cb) {
      connCbs.add(cb);
      return () => {
        connCbs.delete(cb);
      };
    },
  };
}

export const SCALE_WS_DEFAULT_URL = DEFAULT_URL;
