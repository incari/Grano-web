import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import WaterGauge from "../../components/WaterGauge/WaterGauge";
import AccumulationChart from "../../components/AccumulationChart/AccumulationChart";
import type { ChartPoint } from "../../components/AccumulationChart/AccumulationChart";
import type { Recipe } from "../../utils/recipe";
import { formatTime } from "../../utils/recipe";
import { haptic } from "../../utils/haptics";
import { beep } from "../../utils/sound";
import {
  IconChevronLeft,
  IconDots,
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
const SIM_FLOW = 9; // g/s simulated pour rate

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
  const [history, setHistory] = useState<ChartPoint[]>([{ t: 0, g: 0 }]);

  const finished = useRef(false);
  const started = useRef(false);

  const step = recipe.steps[stepIndex];
  const isLastStep = stepIndex >= recipe.steps.length - 1;
  const kind = step.kind ?? "pour";
  const isPour = kind === "pour";
  const nextStep = recipe.steps[stepIndex + 1];
  const target = step.target;
  const prevTarget = stepIndex > 0 ? recipe.steps[stepIndex - 1].target : 0;
  const remaining = Math.max(0, target - current);
  const over = Math.max(0, current - target);
  const withinRange = Math.abs(current - target) <= TOLERANCE;
  // Live countdown to this pour's planned completion, synced to the clock.
  const pourRemaining = Math.max(0, Math.ceil(step.waitUntil - elapsed));
  const tone =
    current > target + TOLERANCE
      ? "over"
      : withinRange && current > 0
        ? "ok"
        : "active";

  // ── Simulation / timing loop ─────────────────────────────────────────────
  useEffect(() => {
    if (!running || phase === "done") {
      setFlow(0);
      return;
    }
    const id = window.setInterval(() => {
      const dt = 0.1;
      setElapsed((e) => e + dt);

      if (phase === "pouring") {
        setCurrent((prev) => {
          if (prev >= target) {
            return prev;
          }
          const jitter = 0.85 + Math.random() * 0.3;
          const next = Math.min(target, prev + SIM_FLOW * jitter * dt);
          setFlow((next - prev) / dt);
          return next;
        });
      } else if (phase === "resting") {
        setFlow(0);
        setRest((r) => Math.max(0, r - dt));
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [running, phase, target]);

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
  useEffect(() => {
    if (phase !== "pouring" || target <= 0 || current < target) {
      return;
    }
    setFlow(0);
    haptic("success");
    if (isLastStep) {
      setPhase("done");
    } else {
      setRest(step.restSeconds);
      setPhase("resting");
    }
  }, [current, target, phase, isLastStep, step.restSeconds]);

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
    const next = recipe.steps[stepIndex + 1];
    setStepIndex((i) => i + 1);
    setFlow(0);
    if ((next.kind ?? "pour") === "pour") {
      setPhase("pouring");
    } else {
      // Stir/serve steps have no pour — jump straight into their countdown.
      setCurrent(next.target);
      setRest(next.actionSeconds);
      setPhase("resting");
    }
  }

  function toggleRun() {
    if (!started.current) {
      started.current = true;
      beep("step");
    }
    setRunning((r) => !r);
  }

  function handleReset() {
    setCurrent(prevTarget);
    setFlow(0);
    setPhase("pouring");
  }

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
          className={styles.iconBtn}
          aria-label="Options"
        >
          <IconDots size={22} />
        </button>
      </header>

      <nav
        className={styles.steps}
        aria-label="Pour steps"
      >
        {recipe.steps.map((s, i) => {
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
              {i < recipe.steps.length - 1 && (
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
                        ? `Up to ${step.target} g • Pour by ${formatTime(step.waitUntil)}`
                        : kind === "serve"
                          ? "No pour — wait before serving"
                          : "No pour — agitate the brew"}
                    </p>
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
                      marks={[...new Set(recipe.steps.map((s) => s.target))]}
                      flow={flow}
                      tone={tone}
                    />

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
                          className={`${styles.badge} ${withinRange ? styles.badgeOk : styles.badgeOut}`}
                        >
                          <span className={styles.badgeMain}>
                            {withinRange ? (
                              <IconCheck size={14} />
                            ) : (
                              <IconAlert size={14} />
                            )}
                            {over > 0
                              ? `+${Math.round(over)} g`
                              : withinRange
                                ? "In range"
                                : "Out"}
                          </span>
                          <span className={styles.badgeSub}>
                            ±{TOLERANCE} g
                          </span>
                        </div>
                      </div>
                    </section>

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

                        <div className={styles.adjust}>
                          <button
                            className={styles.stepBtn}
                            onClick={() =>
                              setCurrent((c) => Math.max(0, c - 5))
                            }
                            aria-label="Lower actual poured amount by 5 grams"
                          >
                            − 5
                          </button>
                          <button
                            className={styles.stepBtn}
                            onClick={() => setCurrent((c) => c + 5)}
                            aria-label="Raise actual poured amount by 5 grams"
                          >
                            + 5
                          </button>
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
                    recipe={recipe}
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
