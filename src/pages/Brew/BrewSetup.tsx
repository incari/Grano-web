import { useEffect, useMemo, useRef, useState } from "react";
import type { BrewMethod } from "../../types";
import { BREW_PRESETS, getPreset } from "../../utils/presets";
import { buildRecipe, formatTime } from "../../utils/recipe";
import type { BrewFinishPayload } from "../../utils/brewTelemetry";
import {
  buildEspressoRun,
  type EspressoFinishPayload,
} from "../../utils/espresso";
import { useBeans, useBrewLogs } from "../../store/useStore";
import {
  Coffee,
  Droplets,
  CupSoda,
  Beaker,
  FlaskConical,
  Settings2,
  Scale,
  Timer,
  ListOrdered,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import GuidedPour from "./GuidedPour";
import EspressoShot from "./EspressoShot";
import PageHeader from "../../components/PageHeader/PageHeader";
import styles from "./BrewSetup.module.scss";

const METHOD_ICONS: Record<BrewMethod, LucideIcon> = {
  espresso: Coffee,
  "pour-over": Droplets,
  "french-press": CupSoda,
  aeropress: Beaker,
  chemex: FlaskConical,
  custom: Settings2,
};

export default function BrewSetup() {
  const { beans } = useBeans();
  const { addLog } = useBrewLogs();
  const [method, setMethod] = useState<BrewMethod>("pour-over");
  const [dose, setDose] = useState(15);
  const [ratio, setRatio] = useState(getPreset("pour-over").ratio);
  const [beanId, setBeanId] = useState<string>("");
  const [grindSetting, setGrindSetting] = useState("");
  const [brewing, setBrewing] = useState(false);

  const water = Math.round(dose * ratio);
  const recipe = useMemo(
    () => buildRecipe(method, dose, ratio),
    [method, dose, ratio],
  );
  const rMin = method === "espresso" ? 1.5 : 10;
  const rMax = method === "espresso" ? 3 : 18;

  const holdRef = useRef<number | null>(null);
  function startHold(step: () => void) {
    step();
    if (holdRef.current !== null) window.clearInterval(holdRef.current);
    holdRef.current = window.setInterval(step, 110);
  }
  function stopHold() {
    if (holdRef.current !== null) {
      window.clearInterval(holdRef.current);
      holdRef.current = null;
    }
  }
  useEffect(
    () => () => {
      if (holdRef.current !== null) window.clearInterval(holdRef.current);
    },
    [],
  );

  function selectMethod(m: BrewMethod) {
    setMethod(m);
    const preset = getPreset(m);
    setDose(preset.defaultDose);
    setRatio(preset.ratio);
  }

  function finishBrew(payload: BrewFinishPayload) {
    const bean = beans.find((b) => b.id === beanId);
    const waterWeight =
      payload.finalWeight > 0 ? payload.finalWeight : water;
    addLog({
      id: crypto.randomUUID(),
      beanId: beanId || undefined,
      beanName: bean?.name,
      method,
      dose,
      waterWeight,
      ratio:
        dose > 0
          ? Math.round((waterWeight / dose) * 10) / 10
          : ratio,
      brewTimeSeconds: payload.elapsed,
      rating: 0,
      notes: "",
      brewedAt: new Date().toISOString(),
      recipeName: recipe.label,
      grindSetting: grindSetting.trim() || undefined,
      trace: payload.trace,
      stepActuals: payload.stepActuals,
      consistencyScore: payload.consistencyScore,
    });
    setBrewing(false);
  }

  function finishShot(payload: EspressoFinishPayload) {
    const bean = beans.find((b) => b.id === beanId);
    const yieldG = payload.finalWeight > 0 ? payload.finalWeight : water;
    addLog({
      id: crypto.randomUUID(),
      beanId: beanId || undefined,
      beanName: bean?.name,
      method,
      dose,
      waterWeight: yieldG,
      ratio: dose > 0 ? Math.round((yieldG / dose) * 10) / 10 : ratio,
      brewTimeSeconds: payload.elapsed,
      rating: 0,
      notes: "",
      brewedAt: new Date().toISOString(),
      recipeName: recipe.label,
      grindSetting: grindSetting.trim() || undefined,
      trace: payload.trace,
      espressoShot: payload.shot,
    });
    setBrewing(false);
  }

  if (brewing && method === "espresso") {
    return (
      <EspressoShot
        run={buildEspressoRun(recipe.label, dose, ratio)}
        onFinish={finishShot}
        onExit={() => setBrewing(false)}
      />
    );
  }

  if (brewing) {
    return (
      <GuidedPour
        recipe={recipe}
        onFinish={finishBrew}
        onExit={() => setBrewing(false)}
      />
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        icon={Coffee}
        title="Grano"
        subtitle="Gram-precise controlled brewing"
      />

      <section className={styles.block}>
        <span className={styles.blockLabel}>METHOD</span>
        <div className={styles.methods}>
          {BREW_PRESETS.map((p) => {
            const Icon = METHOD_ICONS[p.method];
            const active = method === p.method;
            return (
              <button
                key={p.method}
                className={`${styles.method} ${active ? styles.methodActive : ""}`}
                onClick={() => selectMethod(p.method)}
                aria-pressed={active}
              >
                <Icon
                  size={20}
                  strokeWidth={2}
                  className={styles.methodIcon}
                />
                <span className={styles.methodLabel}>{p.label}</span>
                <span className={styles.methodHint}>
                  1:{p.ratio} · {formatTime(p.brewTimeSeconds)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.block}>
        <span className={styles.blockLabel}>COFFEE (DOSE)</span>
        <div className={styles.stepper}>
          <button
            onPointerDown={() =>
              startHold(() => setDose((d) => Math.max(1, d - 1)))
            }
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            aria-label="Decrease dose"
          >
            −
          </button>
          <div className={styles.stepperValue}>
            {dose} <small>g</small>
          </div>
          <button
            onPointerDown={() => startHold(() => setDose((d) => d + 1))}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
            aria-label="Increase dose"
          >
            +
          </button>
        </div>
      </section>

      <section className={styles.block}>
        <div className={styles.blockHead}>
          <span className={styles.blockLabel}>RATIO</span>
          <span className={styles.ratioBadge}>1:{ratio}</span>
        </div>
        <input
          type="range"
          min={rMin}
          max={rMax}
          step={method === "espresso" ? 0.1 : 0.5}
          value={ratio}
          onChange={(e) => setRatio(Number(e.target.value))}
          className={styles.slider}
        />
        <div className={styles.sliderScale}>
          <span>Stronger · 1:{rMin}</span>
          <span>Lighter · 1:{rMax}</span>
        </div>
      </section>

      {beans.length > 0 && (
        <section className={styles.block}>
          <span className={styles.blockLabel}>BEAN</span>
          <select
            className={styles.select}
            value={beanId}
            onChange={(e) => setBeanId(e.target.value)}
          >
            <option value="">Unspecified</option>
            {beans.map((b) => (
              <option
                key={b.id}
                value={b.id}
              >
                {b.name}
              </option>
            ))}
          </select>
        </section>
      )}

      <section className={styles.block}>
        <span className={styles.blockLabel}>GRIND SETTING</span>
        <input
          className={styles.select}
          type="text"
          inputMode="decimal"
          placeholder="e.g. 22 clicks · Niche 1.8"
          value={grindSetting}
          onChange={(e) => setGrindSetting(e.target.value)}
        />
      </section>

      <div className={styles.summary}>
        <div>
          <Scale
            size={18}
            className={styles.sumIcon}
          />
          <span className={styles.sumLabel}>
            {method === "espresso" ? "Yield" : "Water"}
          </span>
          <span className={styles.sumValue}>{water} g</span>
        </div>
        <div>
          <Timer
            size={18}
            className={styles.sumIcon}
          />
          <span className={styles.sumLabel}>Time</span>
          <span className={styles.sumValue}>
            {formatTime(getPreset(method).brewTimeSeconds)}
          </span>
        </div>
        <div>
          <ListOrdered
            size={18}
            className={styles.sumIcon}
          />
          <span className={styles.sumLabel}>Steps</span>
          <span className={styles.sumValue}>{recipe.steps.length}</span>
        </div>
      </div>

      <button
        className={styles.start}
        onClick={() => setBrewing(true)}
      >
        Start brewing
      </button>
    </div>
  );
}
