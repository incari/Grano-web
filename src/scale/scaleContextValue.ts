import { createContext, useContext } from "react";
import type { ScaleTransport } from "./types";
import type { useScale } from "./useScale";

export type ScaleContextValue = ReturnType<typeof useScale> & {
  /** Current scale address (WebSocket URL). */
  url: string;
  /** Persist a new address; recreates the driver and reconnects. */
  setUrl: (url: string) => void;
  /** Active transport: Wi-Fi WebSocket or Web Bluetooth. */
  transport: ScaleTransport;
  /** Switch transports; recreates the driver (BLE waits for a connect click). */
  setTransport: (transport: ScaleTransport) => void;
  /** Whether this browser can talk BLE (Chrome/Edge in a secure context). */
  bleSupported: boolean;
};

export const ScaleContext = createContext<ScaleContextValue | null>(null);

export function useScaleContext(): ScaleContextValue {
  const ctx = useContext(ScaleContext);
  if (!ctx) {
    throw new Error("useScaleContext must be used within a ScaleProvider");
  }
  return ctx;
}
