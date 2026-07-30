import { useEffect, useState } from "react";
import {
  Scale as ScaleIcon,
  Power,
  RotateCcw,
  Target,
  Minus,
  Plus,
  Check,
  AlertTriangle,
  Wifi,
  Bluetooth,
} from "lucide-react";
import PageHeader from "../../components/PageHeader/PageHeader";

import { useScaleContext } from "../../scale/scaleContextValue";
import styles from "./Scale.module.scss";

export default function ScalePage() {
  const scale = useScaleContext();
  const { live, connection, transport, setTransport, bleSupported } = scale;

  const [known, setKnown] = useState(100);
  const [busy, setBusy] = useState<null | "tare" | "cal" | "reset">(null);
  const [error, setError] = useState<string | null>(null);

  // Clear the pending spinner once the firmware acknowledges the command.
  useEffect(() => {
    if (scale.status) setBusy(null);
  }, [scale.status]);

  async function connectScale() {
    setError(null);
    try {
      await scale.connect();
    } catch {
      setError(
        transport === "ble"
          ? "Bluetooth pairing failed or was cancelled — try again and pick your Grano scale."
          : "Can't reach the scale — check it's powered on and on Wi-Fi.",
      );
    }
  }

  async function handleTare() {
    setBusy("tare");
    await scale.tare();
    window.setTimeout(() => setBusy((b) => (b === "tare" ? null : b)), 1500);
  }

  async function handleCalibrate() {
    if (known <= 0) return;
    setBusy("cal");
    await scale.calibrate(known);
    window.setTimeout(() => setBusy((b) => (b === "cal" ? null : b)), 2500);
  }

  async function handleReset() {
    setBusy("reset");
    await scale.resetCalibration();
    window.setTimeout(() => setBusy((b) => (b === "reset" ? null : b)), 1500);
  }

  const statusLabel =
    connection === "connected"
      ? "Connected"
      : connection === "connecting"
        ? "Connecting…"
        : connection === "error"
          ? "Error"
          : "Disconnected";

  return (
    <div className={styles.page}>
      <PageHeader
        icon={ScaleIcon}
        title="Scale"
        subtitle="ESP32 smart scale"
        action={
          <span
            className={`${styles.chip} ${live ? styles.chipLive : ""} ${
              connection === "error" ? styles.chipError : ""
            }`}
            role="status"
          >
            <Power size={14} />
            <span>{statusLabel}</span>
          </span>
        }
      />

      {error && (
        <div
          className={styles.banner}
          role="status"
        >
          {error}
        </div>
      )}

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <Power size={16} />
          <span>CONNECTION</span>
        </div>

        <div className={styles.transportRow}>
          <button
            type="button"
            className={`${styles.transportBtn} ${
              transport === "wifi" ? styles.transportActive : ""
            }`}
            onClick={() => setTransport("wifi")}
          >
            <Wifi size={16} />
            Wi-Fi
          </button>
          <button
            type="button"
            className={`${styles.transportBtn} ${
              transport === "ble" ? styles.transportActive : ""
            }`}
            onClick={() => setTransport("ble")}
            disabled={!bleSupported}
          >
            <Bluetooth size={16} />
            Bluetooth
          </button>
        </div>

        {transport === "ble" ? (
          <>
            <p className={styles.hint}>
              {bleSupported
                ? "Connect directly over Bluetooth — no Wi-Fi setup needed. Click connect and pick your Grano scale."
                : "Web Bluetooth isn't available in this browser. Use Chrome or Edge over https/localhost."}
            </p>
            <button
              type="button"
              className={styles.connectBtn}
              onClick={() => void connectScale()}
              disabled={!bleSupported || connection === "connecting"}
            >
              <Bluetooth size={18} />
              {live
                ? "Reconnect via Bluetooth"
                : connection === "connecting"
                  ? "Connecting…"
                  : "Connect via Bluetooth"}
            </button>
          </>
        ) : (
          <>
            {!live && connection !== "connecting" && (
              <div
                className={styles.warning}
                role="status"
              >
                <AlertTriangle size={16} />
                <span>
                  Can't reach the scale — check it's powered on and on Wi-Fi.
                </span>
                <button
                  type="button"
                  className={styles.retryBtn}
                  onClick={() => void connectScale()}
                >
                  Retry
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className={styles.readout}>
        <div className={styles.weight}>
          <span className={styles.weightValue}>
            {live ? scale.weight.toFixed(1) : "—"}
          </span>
          <span className={styles.weightUnit}>g</span>
        </div>
        <div className={styles.flow}>
          {live
            ? `${scale.flow > 0 ? scale.flow.toFixed(1) : "0.0"} g/s`
            : "not live"}
        </div>
      </section>

      <button
        type="button"
        className={styles.tare}
        onClick={() => void handleTare()}
        disabled={!live || busy === "tare"}
      >
        <RotateCcw size={18} />
        {busy === "tare" ? "Taring…" : "Tare"}
      </button>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <Target size={16} />
          <span>CALIBRATE</span>
        </div>
        <p className={styles.hint}>
          Place a known weight on the scale, enter its exact grams, then
          calibrate.
        </p>

        <div className={styles.stepper}>
          <button
            onClick={() => setKnown((k) => Math.max(1, k - 1))}
            aria-label="Decrease known weight"
          >
            <Minus size={18} />
          </button>
          <input
            className={styles.knownInput}
            type="number"
            inputMode="decimal"
            min={1}
            value={known}
            onChange={(e) => setKnown(Math.max(0, Number(e.target.value)))}
          />
          <span className={styles.knownUnit}>g</span>
          <button
            onClick={() => setKnown((k) => k + 1)}
            aria-label="Increase known weight"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className={styles.presets}>
          {[10, 50, 100, 200, 500].map((v) => (
            <button
              key={v}
              className={`${styles.preset} ${known === v ? styles.presetActive : ""}`}
              onClick={() => setKnown(v)}
            >
              {v} g
            </button>
          ))}
        </div>

        <div className={styles.calActions}>
          <button
            className={styles.calBtn}
            onClick={() => void handleCalibrate()}
            disabled={!live || busy === "cal" || known <= 0}
          >
            <Target size={16} />
            {busy === "cal" ? "Calibrating…" : `Calibrate to ${known} g`}
          </button>
          <button
            className={styles.resetBtn}
            onClick={() => void handleReset()}
            disabled={!live || busy === "reset"}
          >
            Reset
          </button>
        </div>

        {scale.status && (
          <div
            className={`${styles.result} ${
              scale.status.ok ? styles.resultOk : styles.resultErr
            }`}
            role="status"
          >
            {scale.status.ok ? (
              <Check size={15} />
            ) : (
              <AlertTriangle size={15} />
            )}
            <span>{resultText(scale.status)}</span>
          </div>
        )}
      </section>
    </div>
  );
}

function resultText(s: {
  cmd: string;
  ok: boolean;
  factor?: number;
  message?: string;
}): string {
  if (s.message) return s.message;
  if (!s.ok) return "Command failed";
  if (s.cmd === "tare") return "Tared — scale zeroed";
  if (s.cmd === "cal_reset") return "Calibration reset to default";
  if (s.cmd === "cal")
    return s.factor != null
      ? `Calibrated · ${s.factor.toFixed(1)} counts/g`
      : "Calibrated";
  return "Done";
}
