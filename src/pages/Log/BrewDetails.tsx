import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bean,
  Lightbulb,
  NotebookPen,
  Star,
} from "lucide-react";
import { useBrewLogs, useRecipes } from "../../store/useStore";
import { formatTime } from "../../utils/recipe";
import type { Recipe } from "../../utils/recipe";
import { buildDialInTips } from "../../utils/dialIn";
import {
  brewRatio,
  buildEspressoTips,
  recipeFromActualShot,
  shotFlow,
} from "../../utils/espresso";
import { recipeFromActualBrew } from "../../utils/brewTelemetry";
import type { BrewReview } from "../../types";
import styles from "./BrewDetails.module.scss";

// The five practical home-cupping attributes, with a short prompt each.
const CRITERIA: { key: keyof BrewReview; label: string; hint: string }[] = [
  {
    key: "aroma",
    label: "Aroma",
    hint: "How it smells — inviting, faint, off?",
  },
  {
    key: "acidity",
    label: "Acidity",
    hint: "Brightness & liveliness (not sourness)",
  },
  { key: "body", label: "Body", hint: "Weight & texture — light to syrupy" },
  {
    key: "sweetness",
    label: "Sweetness",
    hint: "Roundness — caramel, fruit, honey",
  },
  {
    key: "aftertaste",
    label: "Aftertaste",
    hint: "How long & how pleasant it lingers",
  },
];

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className={styles.stars}>
      {Array.from({ length: 5 }, (_, i) => (
        <button
          key={i}
          type="button"
          className={styles.starBtn}
          aria-label={`${i + 1} of 5`}
          onClick={() => onChange(i + 1 === value ? 0 : i + 1)}
        >
          <Star
            size={26}
            fill={i < value ? "currentColor" : "none"}
          />
        </button>
      ))}
    </div>
  );
}

export default function BrewDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { logs, updateLog } = useBrewLogs();
  const { addRecipe } = useRecipes();
  const log = logs.find((l) => l.id === id);

  const [rating, setRating] = useState(log?.rating ?? 0);
  const [review, setReview] = useState<BrewReview>(log?.review ?? {});
  const [grindSetting, setGrindSetting] = useState(log?.grindSetting ?? "");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const shot = log?.espressoShot;
  const tips = useMemo(
    () => buildDialInTips(review, rating),
    [review, rating],
  );
  // Espresso adds mechanical coaching (grind/time/yield) on top of taste tips.
  const shotTips = useMemo(
    () => (shot ? buildEspressoTips(shot, log!.dose) : []),
    [shot, log],
  );

  if (!log) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>This brew no longer exists.</p>
        <button
          className={styles.back}
          onClick={() => navigate("/log")}
        >
          <ArrowLeft size={18} /> Back to history
        </button>
      </div>
    );
  }

  function setScore(key: keyof BrewReview, value: number) {
    setReview((r) => ({ ...r, [key]: value || undefined }));
  }

  function save() {
    updateLog(log!.id, {
      rating,
      review,
      grindSetting: grindSetting.trim() || undefined,
    });
    navigate("/log");
  }

  function saveAsRecipe() {
    if (!log) return;
    const name = `${log.beanName || log.method} actual · ${new Date(
      log.brewedAt,
    ).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
    if (shot) {
      const saved = recipeFromActualShot(shot, log.dose, name, {
        temperature: log.temperature,
        grindSize: log.grindSize,
        grindSetting: grindSetting.trim() || log.grindSetting,
      });
      addRecipe(saved);
      setSavedMsg(`Saved “${saved.name}” to Recipes`);
      window.setTimeout(() => setSavedMsg(null), 3500);
      return;
    }
    if (!log.stepActuals?.length) return;
    const liveSteps = log.stepActuals.map((s, i) => ({
      index: i,
      kind: "pour" as const,
      label: s.label,
      target: s.actualG,
      pourStart: 0,
      waitUntil: 0,
      restSeconds: i === 0 ? 45 : 30,
      actionSeconds: 0,
      isBloom: i === 0,
    }));
    const recipeStub: Recipe = {
      method: log.method,
      label: log.recipeName || log.method,
      dose: log.dose,
      totalWater: log.waterWeight,
      temperature: log.temperature,
      grindSize: log.grindSize,
      steps: liveSteps,
    };
    const saved = recipeFromActualBrew(
      recipeStub,
      liveSteps,
      log.stepActuals,
      name,
    );
    saved.grindSetting = grindSetting.trim() || log.grindSetting;
    addRecipe(saved);
    setSavedMsg(`Saved “${saved.name}” to Recipes`);
    window.setTimeout(() => setSavedMsg(null), 3500);
  }

  const canSaveRecipe = !!shot || (log.stepActuals?.length ?? 0) > 0;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <button
          className={styles.iconBtn}
          onClick={() => navigate("/log")}
          aria-label="Back"
        >
          <ArrowLeft size={22} />
        </button>
        <div className={styles.title}>
          <h1>Brew details</h1>
          <p>
            <span
              className={styles.method}
              style={{ viewTransitionName: "brew-detail-title" }}
            >
              {log.method}
            </span>{" "}
            · {log.dose} g · 1:{log.ratio} · {formatTime(log.brewTimeSeconds)}
          </p>
        </div>
      </header>

      {log.beanName && (
        <div className={styles.bean}>
          <Bean size={15} /> {log.beanName}
        </div>
      )}

      {shot && (
        <section className={styles.block}>
          <span className={styles.blockLabel}>SHOT</span>
          <ul className={styles.stepList}>
            <li>
              <span>Yield</span>
              <span>
                {Math.round(shot.yieldG)} g
                <small>
                  {" "}
                  / {shot.targetYieldG} g · 1:
                  {brewRatio(log.dose, shot.yieldG)}
                </small>
              </span>
            </li>
            <li>
              <span>Extraction</span>
              <span>
                {Math.round(shot.shotSeconds)}s
                <small> / {shot.targetShotSeconds}s</small>
              </span>
            </li>
            <li>
              <span>Average flow</span>
              <span>{shotFlow(shot.yieldG, shot.shotSeconds)} g/s</span>
            </li>
            {shot.peakFlow != null && shot.peakFlow > 0 && (
              <li>
                <span>Peak flow</span>
                <span>{Math.round(shot.peakFlow * 100) / 100} g/s</span>
              </li>
            )}
            {shot.preInfusionSeconds > 0 && (
              <li>
                <span>Pre-infusion</span>
                <span>{Math.round(shot.preInfusionSeconds)}s</span>
              </li>
            )}
            {shot.firstDropSeconds != null && (
              <li>
                <span>First drop</span>
                <span>{Math.round(shot.firstDropSeconds)}s</span>
              </li>
            )}
            {shot.pressureBar != null && (
              <li>
                <span>Pressure</span>
                <span>{shot.pressureBar} bar</span>
              </li>
            )}
            {shot.channeling && (
              <li>
                <span>Channeling</span>
                <span>flagged</span>
              </li>
            )}
          </ul>
        </section>
      )}

      {shotTips.length > 0 && (
        <section className={`${styles.block} ${styles.tipsBlock}`}>
          <span className={styles.blockLabel}>
            <Lightbulb size={13} /> DIAL IN
          </span>
          <ul className={styles.tipList}>
            {shotTips.map((tip) => (
              <li
                key={tip.id}
                className={styles.tip}
              >
                <span className={styles.tipTitle}>{tip.title}</span>
                <span className={styles.tipDetail}>{tip.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(log.consistencyScore != null ||
        (log.trace?.length ?? 0) > 0 ||
        (log.stepActuals?.length ?? 0) > 0) && (
        <section className={styles.block}>
          <span className={styles.blockLabel}>
            {shot ? "SHOT TRACE" : "BREW TRACE"}
          </span>
          <div className={styles.traceMeta}>
            {log.consistencyScore != null && (
              <span>Consistency {log.consistencyScore}/100</span>
            )}
            {(log.trace?.length ?? 0) > 0 && (
              <span>{log.trace!.length} samples</span>
            )}
            {log.waterWeight > 0 && (
              <span>
                {log.waterWeight} g {shot ? "in the cup" : "final"}
              </span>
            )}
          </div>
          {log.stepActuals && log.stepActuals.length > 0 && (
            <ul className={styles.stepList}>
              {log.stepActuals.map((s) => (
                <li key={s.label}>
                  <span>{s.label}</span>
                  <span>
                    {s.actualG} g
                    <small>
                      {" "}
                      / {s.targetG} g
                      {s.actualG !== s.targetG &&
                        ` (${s.actualG > s.targetG ? "+" : ""}${s.actualG - s.targetG})`}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className={styles.block}>
        <span className={styles.blockLabel}>GRIND SETTING</span>
        <input
          className={styles.grindInput}
          type="text"
          placeholder="e.g. 22 clicks · Niche 1.8"
          value={grindSetting}
          onChange={(e) => setGrindSetting(e.target.value)}
        />
        {log.grindSize && (
          <p className={styles.grindHint}>
            Size band: {log.grindSize.replace("-", " ")}
          </p>
        )}
      </section>

      <section className={styles.block}>
        <span className={styles.blockLabel}>OVERALL</span>
        <Stars
          value={rating}
          onChange={setRating}
        />
      </section>

      <section className={styles.block}>
        <span className={styles.blockLabel}>TASTING</span>
        {CRITERIA.map((c) => (
          <div
            key={c.key}
            className={styles.criterion}
          >
            <div className={styles.criterionText}>
              <span className={styles.criterionLabel}>{c.label}</span>
              <span className={styles.criterionHint}>{c.hint}</span>
            </div>
            <Stars
              value={(review[c.key] as number) ?? 0}
              onChange={(v) => setScore(c.key, v)}
            />
          </div>
        ))}
      </section>

      <section className={styles.block}>
        <span className={styles.blockLabel}>WHAT YOU LIKED</span>
        <textarea
          className={styles.textarea}
          placeholder="What stood out? Anything you'd change next time?"
          value={review.liked ?? ""}
          onChange={(e) => setReview((r) => ({ ...r, liked: e.target.value }))}
        />
      </section>

      {tips.length > 0 && (
        <section className={`${styles.block} ${styles.tipsBlock}`}>
          <span className={styles.blockLabel}>
            <Lightbulb size={13} /> NEXT BREW
          </span>
          <ul className={styles.tipList}>
            {tips.map((tip) => (
              <li key={tip.id} className={styles.tip}>
                <span className={styles.tipTitle}>{tip.title}</span>
                <span className={styles.tipDetail}>{tip.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canSaveRecipe && (
        <button
          type="button"
          className={styles.secondary}
          onClick={saveAsRecipe}
        >
          <NotebookPen size={16} />
          {shot ? "Save actual shot as recipe" : "Save actual pour as recipe"}
        </button>
      )}
      {savedMsg && <p className={styles.savedMsg}>{savedMsg}</p>}

      <button
        className={styles.save}
        onClick={save}
      >
        Save details
      </button>
    </div>
  );
}
