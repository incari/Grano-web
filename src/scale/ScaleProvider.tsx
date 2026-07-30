import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createWsScaleDriver, SCALE_WS_DEFAULT_URL } from "./drivers/websocket";
import { bleSupported, createBleScaleDriver } from "./drivers/bluetooth";
import type { ScaleDriver, ScaleTransport } from "./types";
import { useScale } from "./useScale";
import { ScaleContext } from "./scaleContextValue";
import type { ScaleContextValue } from "./scaleContextValue";

const URL_KEY = "grano.scaleWsUrl";
const TRANSPORT_KEY = "grano.scaleTransport";

function initialUrl(): string {
  return localStorage.getItem(URL_KEY) || SCALE_WS_DEFAULT_URL;
}

function initialTransport(): ScaleTransport {
  return localStorage.getItem(TRANSPORT_KEY) === "ble" ? "ble" : "wifi";
}

/**
 * Owns the single scale connection for the whole app. Because the provider sits
 * above the router, the socket stays open while the user moves between pages
 * instead of reconnecting on every navigation.
 */
export function ScaleProvider({ children }: { children: ReactNode }) {
  const [url, setUrlState] = useState(initialUrl);
  const [transport, setTransportState] =
    useState<ScaleTransport>(initialTransport);
  const driver = useMemo(
    () =>
      transport === "ble" ? createBleScaleDriver() : createWsScaleDriver(url),
    [transport, url],
  );
  const scale = useScale(driver);

  // Keep one connection alive across navigation: only tear down the previous
  // driver when the transport/address actually changes, and never on StrictMode
  // remounts (the driver's connect() no-ops while already open/connecting).
  const prevDriver = useRef<ScaleDriver | null>(null);
  useEffect(() => {
    const previous = prevDriver.current;
    if (previous && previous !== driver) void previous.disconnect();
    prevDriver.current = driver;
    // Wi-Fi can auto-connect on mount, but BLE's requestDevice() must run inside
    // a user gesture, so it only connects when the user clicks to pair.
    if (driver.transport === "wifi") void scale.connect().catch(() => {});
    // scale.connect is stable; depend only on the driver instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver]);

  const setUrl = useCallback((next: string) => {
    localStorage.setItem(URL_KEY, next);
    setUrlState(next);
  }, []);

  const setTransport = useCallback((next: ScaleTransport) => {
    localStorage.setItem(TRANSPORT_KEY, next);
    setTransportState(next);
  }, []);

  const value = useMemo<ScaleContextValue>(
    () => ({
      ...scale,
      url,
      setUrl,
      transport,
      setTransport,
      bleSupported: bleSupported(),
    }),
    [scale, url, setUrl, transport, setTransport],
  );

  return (
    <ScaleContext.Provider value={value}>{children}</ScaleContext.Provider>
  );
}
