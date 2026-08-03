import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WaterGauge from "../../components/WaterGauge/WaterGauge";
import { formatTime } from "../../utils/recipe";
import { downsampleTrace } from "../../utils/brewTelemetry";
import {
  brewRatio,
  type EspressoFinishPayload,
  type EspressoRun,
} from "../../utils/espresso";
import { haptic } from "../../utils/haptics";
import { beep } from "../../utils/sound";
import { useScaleContext } from "../../scale/scaleContextValue";
import {
  IconAlert,
  IconCheck,
  IconChevronLeft,
  IconClock,
  IconPause,
  IconPlay,
  IconScale,
  IconStop,
  IconTimer,
} from "../../components/icons/Icon";
import styles from "./EspressoShot.module.scss";

interface Props {
  run: EspressoRun;
  onFinish: (payload: EspressoFinishPayload) => void;
  onExit: () => void;
}

const YIELD_TOL = 2; // g — pace band on the yield curve
const FIRST_DROP_G = 0.4; // weight that counts as the first drop landing

type Phase = "preinfusion" | "extracting" | "done";

const PHASES: { key: Phase; label: string }[] = [
  { key: "preinfusion", label: "Pre-infusion" },
  { key: "extracting", label: "Extraction" },
  { key: "done", label: "Shot" },
];

export default function EspressoShot({ run, onFinish, onExit }: Props) {
  const navigate = useNavigate();
  const { spec } = run;
  const [yieldG, setYieldG] = useState(0);
  const [flow, setFlow] = useState(0);
  const [elapsed, setElapsed] = useState(0); // total clock from pump on
  const [shotElapsed, setShotElapsed] = useState(0); // clock since pre-infusion ended
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase>(
    spec.preInfusionSeconds > 0 ? "preinfusion" : "extracting",
  );
  const [firstDrop, setFirstDrop] = useState<number | null>(null);
  const [channeling, setChanneling] = useState(false);
  const [history, setHistory] = useState<
    { t: number; g: number; flow?: number }[]
  >([{ t: 0, g: 0 }]);
  const [scaleError, setScaleError] = useState<string | null>(null);
  const [peakFlow, setPeakFlow] = useState(0);

  const scale = useScaleContext();
  const live = scale.live;

  const finished = useRef(false);
  const started = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const tareHoldUntil = useRef(0);

  const preRemaining = Math.max(
    0,
    Math.ceil(spec.preInfusionSeconds - elapsed),
  );
  const shotRemaining = Math.max(0, Math.ceil(spec.shotSeconds - shotElapsed));
  const remaining = Math.max(0, spec.yieldG - yieldG);
  const ratio = brewRatio(run.dose, yieldG);

  // Pace: where the cup should be right now on the target extraction curve.
  const paceTarget =
    phase === "preinfusion"
      ? 0
      : Math.min(
          spec.yieldG,
          spec.yieldG * (shotElapsed / Math.max(1, spec.shotSeconds)),
        );
  const paceDelta = yieldG - paceTarget;
  const onPace = phase === "preinfusion" || Math.abs(paceDelta) <= YIELD_TOL;
  const tooFast = !onPace && paceDelta > YIELD_TOL;
  const tone =
    phase === "done"
      ? "ok"
      : onPace && yieldG > 0
        ? "ok"
        : tooFast
          ? "fast"
          : paceDelta < -YIELD_TOL
            ? "slow"
            : "active";

  // Live scale → yield readout
  useEffect(() => {
    if (!live) return;
    if (performance.now() < tareHoldUntil.current) {
      if (scale.weight > 1.5) {
        setYieldG(0);
        setFlow(0);
        return;
      }
      tareHoldUntil.current = 0;
    }
    setYieldG(scale.weight);
    setFlow(scale.flow);
  }, [live, scale.weight, scale.flow]);

  // The shared provider keeps the scale connected across navigation; just make
  // sure we're connected when this screen mounts (idempotent while connected).
  useEffect(() => {
    setScaleError(null);
    void scale.connect().catch(() => {
      setScaleError(
        "Can't reach the scale — check it's powered on and on Wi-Fi",
      );
    });
    // scale.connect is stable; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Physical TIMER button on the scale mirrors the app's Start button: first
  // press starts, later presses pause/resume. Ignored once the shot is done.
  const startFromButton = useRef<() => void>(() => {});
  useEffect(() => {
    return scale.onButton((id) => {
      if (id === "timer" && phaseRef.current !== "done") {
        void startFromButton.current();
      }
    });
    // scale.onButton is stable; re-subscribing on every render is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale.onButton]);

  useEffect(() => {
    document.body.classList.add("brewing");
    return () => document.body.classList.remove("brewing");
  }, []);

  // ── Shot clock ───────────────────────────────────────────────────────────
  // Weight/flow always come from the live scale; this only advances the clocks.
  useEffect(() => {
    if (!running || phase === "done") return;
    const id = window.setInterval(() => {
      const dt = 0.1;
      setElapsed((e) => e + dt);
      if (phaseRef.current === "extracting") {
        setShotElapsed((s) => s + dt);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [running, phase]);

  // ── Pre-infusion complete → open the pump ─────────────────────────────────
  useEffect(() => {
    if (phase !== "preinfusion" || elapsed < spec.preInfusionSeconds) {
      return;
    }
    beep("step");
    haptic("tick");
    setPhase("extracting");
  }, [phase, elapsed, spec.preInfusionSeconds]);

  // ── First drop ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (firstDrop != null || yieldG < FIRST_DROP_G || !running) {
      return;
    }
    setFirstDrop(Math.round(elapsed * 10) / 10);
  }, [yieldG, firstDrop, running, elapsed]);

  useEffect(() => {
    setPeakFlow((p) => (flow > p ? flow : p));
  }, [flow]);

  // ── Trace (throttled to ~0.25 s) ─────────────────────────────────────────
  useEffect(() => {
    if (phase === "done") {
      return;
    }
    setHistory((h) => {
      const last = h[h.length - 1];
      if (elapsed - last.t < 0.25) {
        return h;
      }
      return [...h, { t: elapsed, g: yieldG, flow }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  // ── Target yield reached → cut the shot ──────────────────────────────────
  useEffect(() => {
    if (phase !== "extracting" || !running || yieldG < spec.yieldG) {
      return;
    }
    haptic("success");
    beep("done");
    setRunning(false);
    setFlow(0);
    setPhase("done");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, running, yieldG, spec.yieldG]);

  // beepApp: play the in-app blip (skip it when the caller already beeped, to
  // avoid a double blip). scale.tare() beeps the scale buzzer on its own.
  async function tareLive(beepApp = true) {
    if (beepApp) {
      beep("step");
      haptic("tick");
    }
    tareHoldUntil.current = performance.now() + 350;
    await scale.tare();
    setYieldG(0);
    setFlow(0);
  }

  async function toggleRun() {
    const next = !running;
    beep("step");
    haptic("tick");
    if (!started.current && next) {
      started.current = true;
      // First live start tares, which already beeps the scale buzzer; skip the
      // app blip since we just played it above.
      if (live) {
        await tareLive(false);
        setRunning(next);
        return;
      }
    }
    // Every other toggle (offline start, pause, resume) still beeps the scale
    // so the buzzer mirrors the app's start/pause/resume.
    if (live) void scale.beep();
    setRunning(next);
  }
  startFromButton.current = toggleRun;

  async function handleScaleToggle() {
    setScaleError(null);
    try {
      if (live || scale.connection === "connecting") {
        await scale.disconnect();
      } else {
        await scale.connect();
        await tareLive();
      }
    } catch {
      setScaleError(
        "Can't reach the scale — check it's powered on and on Wi-Fi",
      );
    }
  }

  const scaleStatusLabel =
    scale.connection === "connected"
      ? "Live scale"
      : scale.connection === "connecting"
        ? "Connecting…"
        : scale.connection === "error"
          ? "Scale error"
          : "Offline";

  function handleFinish() {
    if (finished.current) {
      return;
    }
    finished.current = true;
    haptic("success");
    beep("done");
    const trace = downsampleTrace([
      ...history,
      { t: elapsed, g: yieldG, flow },
    ]);
    onFinish({
      elapsed: Math.round(elapsed),
      finalWeight: Math.round(yieldG),
      trace,
      shot: {
        targetYieldG: spec.yieldG,
        yieldG: Math.round(yieldG * 10) / 10,
        targetShotSeconds: spec.shotSeconds,
        shotSeconds: Math.round(shotElapsed),
        preInfusionSeconds: Math.min(
          spec.preInfusionSeconds,
          Math.round(elapsed),
        ),
        firstDropSeconds: firstDrop ?? undefined,
        pressureBar: spec.pressureBar,
        peakFlow: Math.round(peakFlow * 10) / 10,
        channeling: channeling || undefined,
      },
    });
    navigate("/log");
  }

  const phaseIndex = PHASES.findIndex((p) => p.key === phase);

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button
          className={styles.iconBtn}
          onClick={onExit}
          aria-label="Back"
        >
          <IconChevronLeft size={24} />
        </button>
        <div className={styles.title}>
          <h1 style={{ viewTransitionName: "brew-title" }}>{run.label}</h1>
          <p>
            {run.dose} g in • {spec.yieldG} g out • 1:
            {brewRatio(run.dose, spec.yieldG)}
            {run.temperature != null && ` • ${run.temperature}°C`}
          </p>
        </div>
        <button
          type="button"
          className={`${styles.scaleChip} ${
            live
              ? styles.scaleChipLive
              : scale.connection === "error"
                ? styles.scaleChipError
                : ""
          }`}
          onClick={() => void handleScaleToggle()}
          aria-label={live ? "Disconnect scale" : "Connect scale"}
        >
          <IconScale size={14} />
          <span>{scaleStatusLabel}</span>
        </button>
      </header>
      {scaleError && (
        <div
          className={styles.scaleBanner}
          role="status"
        >
          {scaleError}
        </div>
      )}

      <nav
        className={styles.phases}
        aria-label="Shot phases"
      >
        {PHASES.map((p, i) => {
          const state =
            i < phaseIndex ? "done" : i === phaseIndex ? "active" : "todo";
          return (
            <div
              key={p.key}
              className={styles.phaseItem}
            >
              <div
                className={`${styles.phaseDot} ${styles[`phaseDot_${state}`]}`}
              >
                {state === "done" ? <IconCheck size={13} /> : i + 1}
              </div>
              <span
                className={`${styles.phaseName} ${state === "active" ? styles.phaseNameActive : ""}`}
              >
                {p.label}
              </span>
              {i < PHASES.length - 1 && (
                <div
                  className={`${styles.phaseConn} ${i < phaseIndex ? styles.phaseConnDone : ""}`}
                />
              )}
            </div>
          );
        })}
      </nav>

      <div className={styles.body}>
        <div className={styles.stepHead}>
          <div>
            <h2 className={styles.stepTitle}>
              {phase === "preinfusion"
                ? "Pre-infusion"
                : phase === "extracting"
                  ? "Extracting"
                  : "Shot complete"}
            </h2>
            <p className={styles.stepSub}>
              {phase === "preinfusion"
                ? `Low pressure soak • ${preRemaining} s left`
                : phase === "extracting"
                  ? `Stop at ${spec.yieldG} g • target ${spec.shotSeconds} s`
                  : `${Math.round(yieldG)} g in ${Math.round(shotElapsed)} s • 1:${ratio}`}
            </p>
          </div>
          <div className={styles.totalTime}>
            <span className={styles.clock}>
              <IconClock size={16} />
              {formatTime(elapsed)}
            </span>
            <span className={styles.totalLabel}>
              {scale.temperature != null
                ? `${Math.round(scale.temperature)}°C water`
                : "total time"}
            </span>
          </div>
        </div>

        <WaterGauge
          current={yieldG}
          target={spec.yieldG}
          total={spec.yieldG}
          marks={[]}
          flow={flow}
          tone={tone}
          label="YIELD IN CUP"
        />

        <section className={styles.card}>
          <span className={styles.cardLabel}>SHOT TIME</span>
          <div className={styles.shotRow}>
            <div className={styles.shotClock}>
              {Math.round(shotElapsed)}
              <small>s</small>
            </div>
            <div className={styles.shotMeta}>
              <span>Target {spec.shotSeconds} s</span>
              <span>
                {phase === "extracting"
                  ? `${shotRemaining} s to go`
                  : firstDrop != null
                    ? `First drop ${firstDrop.toFixed(1)} s`
                    : "Awaiting first drop"}
              </span>
            </div>
            <div
              className={`${styles.badge} ${
                onPace
                  ? styles.badgeOk
                  : tooFast
                    ? styles.badgeFast
                    : styles.badgeSlow
              }`}
            >
              <span className={styles.badgeMain}>
                {onPace ? <IconCheck size={14} /> : <IconAlert size={14} />}
                {onPace
                  ? "On pace"
                  : tooFast
                    ? `Fast • +${Math.round(paceDelta)} g`
                    : `Slow • ${Math.round(paceDelta)} g`}
              </span>
              <span className={styles.badgeSub}>± {YIELD_TOL} g</span>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <span className={styles.cardLabel}>SHOT PARAMETERS</span>
          <div className={styles.specGrid}>
            <div>
              <span className={styles.specCap}>Dose</span>
              <span className={styles.specVal}>{run.dose} g</span>
            </div>
            <div>
              <span className={styles.specCap}>Basket</span>
              <span className={styles.specVal}>{spec.basketG ?? "—"} g</span>
            </div>
            <div>
              <span className={styles.specCap}>Pressure</span>
              <span className={styles.specVal}>
                {spec.pressureBar != null ? `${spec.pressureBar} bar` : "—"}
              </span>
            </div>
            <div>
              <span className={styles.specCap}>Pre-infusion</span>
              <span className={styles.specVal}>
                {spec.preInfusionSeconds} s
              </span>
            </div>
            <div>
              <span className={styles.specCap}>Flow</span>
              <span className={styles.specVal}>{flow.toFixed(1)} g/s</span>
            </div>
            <div>
              <span className={styles.specCap}>To go</span>
              <span className={styles.specVal}>{Math.round(remaining)} g</span>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.yieldRow}>
            <div>
              <span className={styles.cardLabel}>YIELD</span>
              <div className={styles.yieldValue}>
                {Math.round(yieldG)} <small>g</small>
              </div>
              <span className={styles.yieldDelta}>
                Target {spec.yieldG} g • now 1:{ratio}
              </span>
            </div>
            {!live && (
              <div className={styles.adjust}>
                <button
                  className={styles.stepBtn}
                  onClick={() => setYieldG((y) => Math.max(0, y - 1))}
                  aria-label="Lower yield by 1 gram"
                >
                  − 1
                </button>
                <button
                  className={styles.stepBtn}
                  onClick={() => setYieldG((y) => y + 1)}
                  aria-label="Raise yield by 1 gram"
                >
                  + 1
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className={`${styles.flagBtn} ${channeling ? styles.flagBtnOn : ""}`}
            onClick={() => setChanneling((c) => !c)}
            aria-pressed={channeling}
          >
            <IconAlert size={14} />
            {channeling ? "Channeling flagged" : "Flag channeling / spritzing"}
          </button>
        </section>

        {phase === "preinfusion" && (
          <button
            className={styles.skipBtn}
            onClick={() => setPhase("extracting")}
          >
            <IconTimer size={16} />
            Skip pre-infusion
          </button>
        )}
      </div>

      <footer className={styles.footer}>
        <button
          className={styles.footBtn}
          onClick={() => void toggleRun()}
          disabled={phase === "done"}
        >
          {running ? <IconPause size={16} /> : <IconPlay size={16} />}
          {running ? "Pause" : elapsed === 0 ? "Start" : "Resume"}
        </button>
        <button
          className={styles.footBtn}
          onClick={() => void tareLive()}
          disabled={phase === "done"}
        >
          <IconScale size={16} />
          Tare
        </button>
        <button
          className={`${styles.footBtn} ${styles.finish}`}
          onClick={handleFinish}
        >
          {phase === "done" ? <IconCheck size={16} /> : <IconStop size={16} />}
          {phase === "done" ? "Save" : "Stop shot"}
        </button>
      </footer>
    </div>
  );
}
