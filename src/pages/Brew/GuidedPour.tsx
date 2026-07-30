import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WaterGauge from "../../components/WaterGauge/WaterGauge";
import AccumulationChart from "../../components/AccumulationChart/AccumulationChart";
import type { ChartPoint } from "../../components/AccumulationChart/AccumulationChart";
import type { PourStep, Recipe } from "../../utils/recipe";
import { formatTime } from "../../utils/recipe";
import { redistributeOvershoot } from "../../utils/overshoot";
import { haptic } from "../../utils/haptics";
import { beep } from "../../utils/sound";
import { useScaleContext } from "../../scale/scaleContextValue";
import {
  IconChevronLeft,
  IconClock,
  IconDroplet,
  IconTimer,
  IconCheck,
  IconAlert,
  IconFlag,
  IconChevronsRight,
  IconPause,
  IconPlay,
  IconScale,
  IconStop,
  IconStir,
  IconCoffee,
} from "../../components/icons/Icon";
import styles from "./GuidedPour.module.scss";

interface Props {
  recipe: Recipe;
  onFinish: (elapsed: number) => void;
  onExit: () => void;
}

const TOLERANCE = 5; // ±5 g band

type Phase = "pouring" | "resting" | "done";

export default function GuidedPour({ recipe, onFinish, onExit }: Props) {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [current, setCurrent] = useState(0);
  const [flow, setFlow] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<Phase>("pouring");
  const [rest, setRest] = useState(0); // seconds left in current rest
  const [pourStartAt, setPourStartAt] = useState(0); // elapsed when this pour began
  const [history, setHistory] = useState<ChartPoint[]>([{ t: 0, g: 0 }]);
  const [scaleError, setScaleError] = useState<string | null>(null);
  // Live step targets — rewritten when a pour overshoots so the batch still ends on totalWater.
  const [liveSteps, setLiveSteps] = useState<PourStep[]>(() =>
    recipe.steps.map((s) => ({ ...s })),
  );
  const [adjustBanner, setAdjustBanner] = useState<string | null>(null);

  const scale = useScaleContext();
  const live = scale.live;

  const finished = useRef(false);
  const started = useRef(false);
  const elapsedRef = useRef(0); // mirrors `elapsed` for reads inside handlers
  // Drop post-tare samples until the scale settles near zero (race with pour rate).
  const tareHoldUntil = useRef(0);
  const adjustedSteps = useRef(new Set<number>());
  const completedPourKeys = useRef(new Set<string>());

  const step = liveSteps[stepIndex] ?? recipe.steps[stepIndex];
  const isLastStep = stepIndex >= liveSteps.length - 1;
  const kind = step.kind ?? "pour";
  const isPour = kind === "pour";
  const nextStep = liveSteps[stepIndex + 1];
  const target = step.target;
  const prevTarget = stepIndex > 0 ? liveSteps[stepIndex - 1].target : 0;
  const remaining = Math.max(0, target - current);
  const withinRange = Math.abs(current - target) <= TOLERANCE;
  // Planned pour duration, anchored to when this pour actually started so the
  // deadline stays correct after skipping earlier steps.
  const pourDuration = Math.max(0, step.waitUntil - step.pourStart);
  const pourBy = pourStartAt + pourDuration;
  // Live countdown to this pour's completion, synced to the clock.
  const pourRemaining = Math.max(0, Math.ceil(pourBy - elapsed));
  // The pour amount is reached — now we wait out the rest before the next pour.
  const reached = withinRange && current > 0;
  // Absolute clock time the rest ends (i.e. the next pour begins).
  const restUntil =
    phase === "resting" ? elapsed + rest : pourBy + step.restSeconds;
  // ── Pace check ────────────────────────────────────────────────────────────
  // The "in range / out" indicator tracks the *pour*, not the total brew: at
  // any moment we compare the actual poured amount against where the pour
  // should be right now, interpolated linearly from the previous target to
  // this step's target over the planned pour duration. Ahead of pace → too
  // fast (red); behind pace → too slow (blue).
  const timeIntoPour = Math.min(
    pourDuration,
    Math.max(0, elapsed - pourStartAt),
  );
  const paceTarget =
    pourDuration > 0
      ? prevTarget + (target - prevTarget) * (timeIntoPour / pourDuration)
      : target;
  const paceDelta = current - paceTarget; // + ahead (fast), − behind (slow)
  const onPace =
    phase === "resting" || reached || Math.abs(paceDelta) <= TOLERANCE;
  const tooFast = !onPace && paceDelta > TOLERANCE;
  const tooSlow = !onPace && paceDelta < -TOLERANCE;
  const tone =
    onPace && current > 0
      ? "ok"
      : tooFast
        ? "fast"
        : tooSlow
          ? "slow"
          : "active";

  // Live scale → gauge
  useEffect(() => {
    if (!live) return;
    if (performance.now() < tareHoldUntil.current) {
      // Still settling after tare — only accept near-zero readings.
      if (scale.weight > 1.5) {
        setCurrent(0);
        setFlow(0);
        return;
      }
      tareHoldUntil.current = 0;
    }
    setCurrent(scale.weight);
    setFlow(scale.flow);
  }, [live, scale.weight, scale.flow]);

  // The shared provider keeps the scale connected across navigation; just make
  // sure we're connected when this screen opens (no-op if already live).
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

  // ── Timing loop ──────────────────────────────────────────────────────────
  // Ticks the brew clock and the rest countdown. Weight always comes from the
  // connected scale.
  useEffect(() => {
    if (!running || phase === "done") return;
    const id = window.setInterval(() => {
      const dt = 0.1;
      setElapsed((e) => e + dt);
      if (phase === "resting") {
        setRest((r) => Math.max(0, r - dt));
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [running, phase]);

  // ── Keep a ref copy of the clock for reads inside event handlers ─────────
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  // ── Record the accumulation trace (throttled to ~0.5 s) ──────────────────
  useEffect(() => {
    if (phase === "done") {
      return;
    }
    setHistory((h) => {
      const last = h[h.length - 1];
      if (elapsed - last.t < 0.25) {
        return h;
      }
      return [...h, { t: elapsed, g: current }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  // ── Beep at the start of each pour step (first cue fires on Start) ────────
  useEffect(() => {
    if (stepIndex === 0) {
      return;
    }
    beep("step");
  }, [stepIndex]);

  // ── Hide the bottom navbar while brewing ─────────────────────────────────
  useEffect(() => {
    document.body.classList.add("brewing");
    return () => document.body.classList.remove("brewing");
  }, []);

  // ── Transition: pour complete → rest (or done) ───────────────────────────
  // Only while running — leftover live-scale weight must not auto-complete
  // the step before the user hits Start.
  useEffect(() => {
    if (!running || phase !== "pouring" || target <= 0 || current < target) {
      return;
    }
    const doneKey = `${stepIndex}:${target}`;
    if (completedPourKeys.current.has(doneKey)) {
      return;
    }
    completedPourKeys.current.add(doneKey);

    setFlow(0);
    // Overshoot: keep final batch size, shrink later pours proportionally.
    if (
      isPour &&
      !isLastStep &&
      current > target + 0.5 &&
      !adjustedSteps.current.has(stepIndex)
    ) {
      adjustedSteps.current.add(stepIndex);
      const {
        steps: nextSteps,
        overshootG,
        didAdjust,
      } = redistributeOvershoot(
        liveSteps,
        stepIndex,
        current,
        recipe.totalWater,
      );
      if (didAdjust) {
        setLiveSteps(nextSteps);
        const g = Math.round(overshootG);
        setAdjustBanner(
          g > 0
            ? `+${g} g over — later pours trimmed to keep ${recipe.totalWater} g total`
            : null,
        );
      }
    }
    haptic("success");
    if (isLastStep) {
      setPhase("done");
    } else {
      setRest(step.restSeconds);
      setPhase("resting");
    }
    // liveSteps intentionally omitted — snapshot at completion is enough
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    running,
    current,
    target,
    phase,
    isLastStep,
    isPour,
    stepIndex,
    step.restSeconds,
    recipe.totalWater,
  ]);

  // Clear the overshoot toast after a moment
  useEffect(() => {
    if (!adjustBanner) return;
    const id = window.setTimeout(() => setAdjustBanner(null), 4500);
    return () => window.clearTimeout(id);
  }, [adjustBanner]);

  // ── Auto progression: rest/action elapsed → next step (or done) ──────────
  useEffect(() => {
    if (phase === "resting" && rest <= 0) {
      if (isLastStep) {
        haptic("success");
        beep("done");
        setPhase("done");
      } else {
        haptic("tick");
        advanceStep();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest, phase]);

  function advanceStep() {
    if (isLastStep) {
      handleFinish();
      return;
    }
    const next = liveSteps[stepIndex + 1];
    setStepIndex((i) => i + 1);
    setFlow(0);
    if ((next.kind ?? "pour") === "pour") {
      setPourStartAt(elapsedRef.current);
      setPhase("pouring");
    } else {
      // Stir/serve steps have no pour — jump straight into their countdown.
      setCurrent(next.target);
      setRest(next.actionSeconds);
      setPhase("resting");
    }
  }

  async function tareLive() {
    tareHoldUntil.current = performance.now() + 350;
    await scale.tare();
    setCurrent(0);
    setFlow(0);
  }

  async function toggleRun() {
    const next = !running;
    if (!started.current && next) {
      started.current = true;
      beep("step");
      // Fresh zero at brew start so leftover weight cannot immediately trip
      // the step-complete threshold.
      if (live) {
        await tareLive();
      }
    }
    setRunning(next);
  }

  async function handleReset() {
    if (live) {
      await tareLive();
    }
    setPourStartAt(elapsedRef.current);
    setPhase("pouring");
  }

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
          : "No scale";

  function handleFinish() {
    if (finished.current) {
      return;
    }
    finished.current = true;
    haptic("success");
    beep("done");
    onFinish(Math.round(elapsed));
    navigate("/log");
  }

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
          <h1 style={{ viewTransitionName: "brew-title" }}>{recipe.label}</h1>
          <p>
            {recipe.dose} g coffee • {recipe.totalWater} g water
            {recipe.temperature != null && ` • ${recipe.temperature}°C`}
            {recipe.grindSize &&
              ` • ${recipe.grindSize.replace("-", " ")} grind`}
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
          title={live ? "Disconnect scale" : "Connect to the Grano scale"}
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
      {adjustBanner && (
        <div
          className={styles.adjustBanner}
          role="status"
        >
          {adjustBanner}
        </div>
      )}

      <nav
        className={styles.steps}
        aria-label="Pour steps"
      >
        {liveSteps.map((s, i) => {
          const state =
            i < stepIndex ? "done" : i === stepIndex ? "active" : "todo";
          return (
            <div
              key={s.index}
              className={styles.stepItem}
            >
              <div
                className={`${styles.stepDot} ${styles[`stepDot_${state}`]}`}
              >
                {state === "done" ? <IconCheck size={13} /> : i + 1}
              </div>
              <span
                className={`${styles.stepName} ${state === "active" ? styles.stepNameActive : ""}`}
              >
                {s.label}
              </span>
              {i < liveSteps.length - 1 && (
                <div
                  className={`${styles.stepConn} ${i < stepIndex ? styles.stepConnDone : ""}`}
                />
              )}
            </div>
          );
        })}
        <div className={styles.stepItem}>
          <div
            className={`${styles.stepDot} ${phase === "done" ? styles.stepDot_done : styles.stepDot_todo}`}
          >
            <IconFlag size={12} />
          </div>
          <span className={styles.stepName}>Brew</span>
        </div>
      </nav>

      <div className={styles.body}>
        {(() => {
          const s = step;
          // Active step — expanded.
          return (
            <div
              key={s.index}
              className={styles.activeRow}
            >
              <div className={styles.rowBody}>
                <div className={styles.stepHead}>
                  <div>
                    <h2 className={styles.stepTitle}>{step.label}</h2>
                    <p className={styles.stepSub}>
                      {isPour
                        ? phase === "resting" || reached
                          ? `Up to ${step.target} g • wait until ${formatTime(restUntil)}`
                          : `Up to ${step.target} g • Pour by ${formatTime(pourBy)}`
                        : kind === "serve"
                          ? "No pour — wait before serving"
                          : "No pour — agitate the brew"}
                    </p>
                    {isPour &&
                      step.instruction &&
                      (phase === "resting" || reached) && (
                        <p className={styles.stepHint}>{step.instruction}</p>
                      )}
                  </div>
                  <div className={styles.totalTime}>
                    <span className={styles.clock}>
                      <IconClock size={16} />
                      {formatTime(elapsed)}
                    </span>
                    <span className={styles.totalLabel}>total time</span>
                  </div>
                </div>

                {isPour ? (
                  <>
                    <WaterGauge
                      current={current}
                      target={target}
                      total={recipe.totalWater}
                      marks={[...new Set(liveSteps.map((s) => s.target))]}
                      flow={flow}
                      tone={tone}
                    />

                    <section className={styles.card}>
                      <div className={styles.nextRow}>
                        <div>
                          <span className={styles.nextLabel}>NEXT ACTION</span>
                          <div className={styles.nextAction}>
                            <IconTimer
                              size={16}
                              className={styles.actionIcon}
                            />
                            {phase === "resting" ? (
                              <span>
                                Next: {nextStep ? nextStep.label : "Finish"} in{" "}
                                <strong>{formatTime(Math.ceil(rest))}</strong>
                              </span>
                            ) : withinRange && current > 0 ? (
                              <span>
                                Next: {nextStep ? nextStep.label : "Finish"} in{" "}
                                <strong>
                                  {formatTime(Math.ceil(step.restSeconds))}
                                </strong>
                              </span>
                            ) : (
                              <span>
                                Reach target in{" "}
                                <strong>{formatTime(pourRemaining)}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          className={styles.skipBtn}
                          onClick={advanceStep}
                        >
                          <IconChevronsRight size={16} />
                          Skip
                        </button>
                      </div>
                    </section>

                    <section className={`${styles.card} ${styles.cardCompact}`}>
                      <span className={styles.cardLabel}>
                        THIS STEP'S TARGET
                      </span>
                      <div className={styles.rangeHead}>
                        <div className={styles.rangeItem}>
                          <span className={styles.rangeCap}>Target</span>
                          <span className={styles.rangeIdeal}>{target} g</span>
                        </div>
                        <div className={styles.rangeItemRight}>
                          <span className={styles.rangeCap}>Actual</span>
                          <span className={styles.rangeReal}>
                            {Math.round(current)} g
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
                            {onPace ? (
                              <IconCheck size={14} />
                            ) : (
                              <IconAlert size={14} />
                            )}
                            {onPace
                              ? "In range"
                              : tooFast
                                ? `Out • +${Math.round(paceDelta)} g fast`
                                : `Out • ${Math.round(paceDelta)} g slow`}
                          </span>
                          <span className={styles.badgeSub}>
                            ± {TOLERANCE} g
                          </span>
                        </div>
                      </div>
                    </section>

                    <section className={styles.card}>
                      <div className={styles.pourToRow}>
                        <div className={styles.pourToMain}>
                          <span className={styles.remainLabel}>
                            <IconDroplet size={14} />
                            Actual poured
                          </span>
                          <div className={styles.pourToValue}>
                            {Math.round(current)} <small>g</small>
                          </div>
                          <span className={styles.pourToDelta}>
                            Target {target} g
                            {remaining > 0 && (
                              <span className={styles.pourToGo}>
                                {" "}
                                • {Math.round(remaining)} g to go
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    </section>
                  </>
                ) : (
                  <section className={styles.actionCard}>
                    <div
                      className={`${styles.actionCircle} ${
                        phase === "done"
                          ? styles.actionCircleDone
                          : running
                            ? styles.actionCirclePulse
                            : ""
                      }`}
                    >
                      {kind === "serve" ? (
                        <IconCoffee size={38} />
                      ) : (
                        <IconStir size={38} />
                      )}
                    </div>
                    <span className={styles.cardLabel}>
                      {kind === "serve" ? "BEFORE SERVING" : "AGITATE"}
                    </span>
                    <p className={styles.actionInstruction}>
                      {step.instruction}
                    </p>
                    <div
                      className={`${styles.actionCountdown} ${phase === "done" ? styles.actionCountdownDone : ""}`}
                    >
                      {phase === "done" ? (
                        <>
                          <IconCheck size={26} />
                          Done
                        </>
                      ) : (
                        <>
                          <IconTimer
                            size={24}
                            className={styles.actionIcon}
                          />
                          {formatTime(Math.ceil(rest))}
                        </>
                      )}
                    </div>
                    {phase !== "done" && (
                      <button
                        className={styles.actionSkip}
                        onClick={advanceStep}
                      >
                        <IconChevronsRight size={16} />
                        {isLastStep ? "Serve now" : "Skip"}
                      </button>
                    )}
                  </section>
                )}

                <section className={styles.card}>
                  <span className={styles.cardLabel}>RECIPE COMPARISON</span>
                  <AccumulationChart
                    recipe={{ ...recipe, steps: liveSteps }}
                    history={history}
                    elapsed={elapsed}
                    current={current}
                  />
                </section>
              </div>
            </div>
          );
        })()}
      </div>

      <footer className={styles.footer}>
        <button
          className={styles.footBtn}
          onClick={toggleRun}
          disabled={phase === "done"}
        >
          {running ? <IconPause size={16} /> : <IconPlay size={16} />}
          {running ? "Pause" : elapsed === 0 ? "Start" : "Resume"}
        </button>
        <button
          className={styles.footBtn}
          onClick={handleReset}
          disabled={phase === "done" || !isPour}
        >
          <IconScale size={16} />
          Tare
        </button>
        <button
          className={`${styles.footBtn} ${styles.finish}`}
          onClick={handleFinish}
        >
          {phase === "done" ? <IconCheck size={16} /> : <IconStop size={16} />}
          {phase === "done" ? "Save" : "Finish"}
        </button>
      </footer>
    </div>
  );
}
