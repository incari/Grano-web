import { createEmitter, parseScaleFrame } from "../protocol";
import type {
  ScaleConnection,
  ScaleDriver,
  ScaleSample,
  ScaleStatus,
} from "../types";

// Must match the firmware's NimBLE service/characteristics (ESP32/src/main.cpp).
// "Grano" + "Scale" in ASCII, with a trailing index per characteristic.
const SERVICE_UUID = "4772616e-6f53-6361-6c65-000000000001";
const TX_UUID = "4772616e-6f53-6361-6c65-000000000002"; // notify: scale → app
const RX_UUID = "4772616e-6f53-6361-6c65-000000000003"; // write:  app → scale

// The scale advertises as "Grano_XXXX" (last MAC bytes); match the prefix so the
// browser picker only lists our device.
const NAME_PREFIX = "Grano_";

/** True when this browser exposes Web Bluetooth (Chrome/Edge; not Safari/Firefox). */
export function bleSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/**
 * Web Bluetooth driver for the ESP32 scale. Speaks the same JSON frames as the
 * WebSocket driver, so it reuses parseScaleFrame. Notifications are
 * newline-delimited (a long ack can span several MTU-capped packets), so bytes
 * are buffered and split on "\n".
 */
export function createBleScaleDriver(): ScaleDriver {
  let device: BluetoothDevice | null = null;
  let rx: BluetoothRemoteGATTCharacteristic | null = null;
  let tx: BluetoothRemoteGATTCharacteristic | null = null;
  let buffer = "";

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const samples = createEmitter<ScaleSample>();
  const conns = createEmitter<ScaleConnection>();
  const statuses = createEmitter<ScaleStatus>();

  function onNotify(ev: Event) {
    const target = ev.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value) return;
    const chunk = decoder.decode(target.value);
    console.debug(
      "[ble] notify",
      target.value.byteLength,
      JSON.stringify(chunk),
    );
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const frame = parseScaleFrame(line);
      if (frame?.kind === "sample") samples.emit(frame.sample);
      else if (frame?.kind === "status") statuses.emit(frame.status);
      else console.debug("[ble] unparsed frame", JSON.stringify(line));
    }
  }

  function onDisconnected() {
    rx = null;
    tx = null;
    buffer = "";
    conns.emit("disconnected");
  }

  async function send(obj: Record<string, unknown>) {
    if (!rx) return;
    const bytes = encoder.encode(JSON.stringify(obj));
    // Firmware registers the RX characteristic as write-without-response.
    await rx.writeValueWithoutResponse(bytes);
  }

  return {
    transport: "ble",
    label: NAME_PREFIX,

    async connect() {
      if (device?.gatt?.connected) return;
      if (!bleSupported()) {
        throw new Error("Web Bluetooth is not available in this browser");
      }
      conns.emit("connecting");
      try {
        // requestDevice must run inside a user gesture (the connect click).
        device = await navigator.bluetooth.requestDevice({
          filters: [{ namePrefix: NAME_PREFIX }],
          optionalServices: [SERVICE_UUID],
        });
        device.addEventListener("gattserverdisconnected", onDisconnected);

        const server = await device.gatt!.connect();
        const service = await server.getPrimaryService(SERVICE_UUID);
        tx = await service.getCharacteristic(TX_UUID);
        rx = await service.getCharacteristic(RX_UUID);

        tx.addEventListener("characteristicvaluechanged", onNotify);
        await tx.startNotifications();
        console.debug(
          "[ble] connected; notifications started",
          device.name,
          "props:",
          JSON.stringify(tx.properties),
        );

        conns.emit("connected");
      } catch (err) {
        onDisconnected();
        conns.emit("error");
        throw err instanceof Error ? err : new Error("BLE connection failed");
      }
    },

    async disconnect() {
      const d = device;
      device = null;
      if (tx) {
        tx.removeEventListener("characteristicvaluechanged", onNotify);
        try {
          await tx.stopNotifications();
        } catch {
          // ignore: device may already be gone
        }
      }
      if (d) {
        d.removeEventListener("gattserverdisconnected", onDisconnected);
        d.gatt?.disconnect();
      }
      onDisconnected();
    },

    async tare() {
      await send({ t: "tare" });
    },

    async calibrate(knownGrams: number) {
      await send({ t: "cal", g: knownGrams });
    },

    async resetCalibration() {
      await send({ t: "cal_reset" });
    },

    async resetWifi() {
      await send({ t: "wifi_reset" });
    },

    async beep() {
      await send({ t: "beep" });
    },

    onSample: samples.on,
    onConnection: conns.on,
    onStatus: statuses.on,
  };
}
