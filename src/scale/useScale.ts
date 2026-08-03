import { useCallback, useEffect, useRef, useState } from "react";
import type { ScaleConnection, ScaleDriver, ScaleStatus } from "./types";

export function useScale(driver: ScaleDriver | null) {
  const [weight, setWeight] = useState(0);
  const [flow, setFlow] = useState(0);
  const [connection, setConnection] = useState<ScaleConnection>("disconnected");
  const [status, setStatus] = useState<ScaleStatus | null>(null);
  const [temperature, setTemperature] = useState<number | null>(null);
  const prev = useRef<{ g: number; ts: number } | null>(null);
  const driverRef = useRef(driver);
  driverRef.current = driver;
  // Button presses fan out to whoever registered via the returned onButton,
  // so a screen can act on them (e.g. start the shot clock) without re-rendering.
  const buttonCbs = useRef(new Set<(id: string) => void>());

  useEffect(() => {
    if (!driver) {
      setConnection("disconnected");
      setWeight(0);
      setFlow(0);
      setStatus(null);
      setTemperature(null);
      prev.current = null;
      return;
    }

    const offC = driver.onConnection(setConnection);
    const offStatus = driver.onStatus?.(setStatus);
    const offTemp = driver.onTemp?.(setTemperature);
    const offBtn = driver.onButton?.((id) => {
      buttonCbs.current.forEach((cb) => cb(id));
    });
    const offS = driver.onSample((s) => {
      setWeight(s.grams);
      const p = prev.current;
      if (p && s.ts > p.ts) {
        const dt = (s.ts - p.ts) / 1000;
        if (dt > 0 && dt < 1) {
          const instant = (s.grams - p.g) / dt;
          setFlow((f) => f * 0.55 + instant * 0.45);
        }
      } else {
        setFlow(0);
      }
      prev.current = { g: s.grams, ts: s.ts };
    });

    return () => {
      offC();
      offStatus?.();
      offTemp?.();
      offBtn?.();
      offS();
    };
  }, [driver]);

  // Stable subscription for button presses; returns an unsubscriber.
  const onButton = useCallback((cb: (id: string) => void) => {
    buttonCbs.current.add(cb);
    return () => {
      buttonCbs.current.delete(cb);
    };
  }, []);

  const connect = useCallback(async () => {
    await driverRef.current?.connect();
  }, []);

  const disconnect = useCallback(async () => {
    await driverRef.current?.disconnect();
  }, []);

  const tare = useCallback(async () => {
    await driverRef.current?.tare();
  }, []);

  const calibrate = useCallback(async (knownGrams: number) => {
    await driverRef.current?.calibrate?.(knownGrams);
  }, []);

  const resetCalibration = useCallback(async () => {
    await driverRef.current?.resetCalibration?.();
  }, []);

  const resetWifi = useCallback(async () => {
    await driverRef.current?.resetWifi?.();
  }, []);

  const beep = useCallback(async () => {
    await driverRef.current?.beep?.();
  }, []);

  return {
    weight,
    flow,
    connection,
    status,
    temperature,
    live: connection === "connected",
    connect,
    disconnect,
    tare,
    calibrate,
    resetCalibration,
    resetWifi,
    beep,
    onButton,
  };
}
