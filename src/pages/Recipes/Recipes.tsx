import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import {
  NotebookText,
  Plus,
  Pencil,
  Trash2,
  Play,
  ArrowLeft,
  X,
  Thermometer,
  Droplet,
  Bean,
} from "lucide-react";
import type {
  BrewMethod,
  EspressoSpec,
  GrindSize,
  RecipeStep,
  SavedRecipe,
} from "../../types";
import { BREW_PRESETS } from "../../utils/presets";
import { buildRecipeFromSaved } from "../../utils/recipe";
import { isDefaultRecipeId } from "../../utils/defaultRecipes";
import type { BrewFinishPayload } from "../../utils/brewTelemetry";
import {
  BASKET_SIZES,
  ESPRESSO_DEFAULTS,
  brewRatio,
  buildEspressoRunFromSaved,
  espressoSpecFor,
  shotFlow,
  type EspressoFinishPayload,
} from "../../utils/espresso";
import PageHeader from "../../components/PageHeader/PageHeader";
import { useRecipes, useBrewLogs, useBeans } from "../../store/useStore";
import GuidedPour from "../Brew/GuidedPour";
import EspressoShot from "../Brew/EspressoShot";
import styles from "./Recipes.module.scss";

const GRINDS: GrindSize[] = [
  "extra-fine",
  "fine",
  "medium-fine",
  "medium",
  "medium-coarse",
  "coarse",
];

function newStep(index: number): RecipeStep {
  return {
    id: crypto.randomUUID(),
    label: index === 0 ? "Bloom" : `Pour ${index + 1}`,
    water: index === 0 ? 45 : 60,
    restSeconds: index === 0 ? 45 : 30,
  };
}

function emptyRecipe(): SavedRecipe {
  return {
    id: crypto.randomUUID(),
    name: "",
    method: "pour-over",
    dose: 15,
    temperature: 94,
    grindSize: "medium",
    steps: [newStep(0), newStep(1)],
    createdAt: new Date().toISOString(),
  };
}

export default function Recipes() {
  const { recipes, addRecipe, updateRecipe, deleteRecipe } = useRecipes();
  const { addLog } = useBrewLogs();
  const { beans } = useBeans();
  const [draft, setDraft] = useState<SavedRecipe | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [brewing, setBrewing] = useState<SavedRecipe | null>(null);
  /** Bean picked on this screen, applied to the next brew. */
  const [brewBeanId, setBrewBeanId] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const totalWater = draft
    ? draft.steps.reduce((sum, s) => sum + s.water, 0)
    : 0;
  const isEspressoDraft = draft?.method === "espresso";
  const draftSpec = draft ? espressoSpecFor(draft) : null;
  // Guard against a bean being deleted while it is selected here.
  const selectedBeanId = beans.some((b) => b.id === brewBeanId)
    ? brewBeanId
    : "";

  // Two-phase shared-element transition: once the tapped card's name carries the
  // view-transition-name, capture it and morph it into the brew header title.
  useLayoutEffect(() => {
    if (!pendingId) {
      return;
    }
    const recipe = recipes.find((r) => r.id === pendingId);
    if (!recipe) {
      setPendingId(null);
      return;
    }
    document.startViewTransition(() => {
      flushSync(() => {
        setBrewing(recipe);
        setPendingId(null);
      });
    });
  }, [pendingId, recipes]);

  function brewRecipe(recipe: SavedRecipe) {
    if (typeof document.startViewTransition !== "function") {
      setBrewing(recipe);
      return;
    }
    setPendingId(recipe.id);
  }

  function startAdd() {
    setDraft(emptyRecipe());
    setIsNew(true);
  }

  function startEdit(recipe: SavedRecipe) {
    setDraft({ ...recipe, steps: recipe.steps.map((s) => ({ ...s })) });
    setIsNew(false);
  }

  function cancel() {
    setDraft(null);
  }

  function save() {
    if (!draft || !draft.name.trim()) {
      return;
    }
    // Espresso recipes carry a spec instead of pour steps.
    if (draft.method !== "espresso" && draft.steps.length === 0) {
      return;
    }
    if (isNew) {
      addRecipe(draft);
    } else {
      updateRecipe(draft);
    }
    setDraft(null);
  }

  function patch(fields: Partial<SavedRecipe>) {
    setDraft((d) => (d ? { ...d, ...fields } : d));
  }

  /** Switching to espresso seeds a spec; steps are kept but unused. */
  function selectMethod(method: BrewMethod) {
    setDraft((d) => {
      if (!d) {
        return d;
      }
      if (method !== "espresso") {
        return { ...d, method };
      }
      return {
        ...d,
        method,
        steps: [],
        espresso: d.espresso ?? {
          ...ESPRESSO_DEFAULTS,
          yieldG: Math.round(d.dose * 2),
          basketG: Math.round(d.dose),
        },
      };
    });
  }

  function patchEspresso(fields: Partial<EspressoSpec>) {
    setDraft((d) =>
      d
        ? { ...d, espresso: { ...espressoSpecFor(d), ...fields } }
        : d,
    );
  }

  function patchStep(id: string, fields: Partial<RecipeStep>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            steps: d.steps.map((s) => (s.id === id ? { ...s, ...fields } : s)),
          }
        : d,
    );
  }

  function addStep() {
    setDraft((d) =>
      d ? { ...d, steps: [...d.steps, newStep(d.steps.length)] } : d,
    );
  }

  function removeStep(id: string) {
    setDraft((d) =>
      d ? { ...d, steps: d.steps.filter((s) => s.id !== id) } : d,
    );
  }

  function finishBrew(payload: BrewFinishPayload) {
    if (!brewing) {
      return;
    }
    const built = buildRecipeFromSaved(brewing);
    const waterWeight =
      payload.finalWeight > 0 ? payload.finalWeight : built.totalWater;
    const bean = beans.find((b) => b.id === selectedBeanId);
    addLog({
      id: crypto.randomUUID(),
      beanId: bean?.id,
      beanName: bean?.name,
      method: brewing.method,
      dose: brewing.dose,
      waterWeight,
      ratio:
        brewing.dose > 0
          ? Math.round((waterWeight / brewing.dose) * 10) / 10
          : Math.round((built.totalWater / brewing.dose) * 10) / 10,
      brewTimeSeconds: payload.elapsed,
      rating: 0,
      notes: "",
      brewedAt: new Date().toISOString(),
      recipeName: brewing.name,
      temperature: brewing.temperature,
      grindSize: brewing.grindSize,
      grindSetting: brewing.grindSetting,
      trace: payload.trace,
      stepActuals: payload.stepActuals,
      consistencyScore: payload.consistencyScore,
    });
    setBrewing(null);
  }

  function finishShot(payload: EspressoFinishPayload) {
    if (!brewing) {
      return;
    }
    const spec = espressoSpecFor(brewing);
    const yieldG = payload.finalWeight > 0 ? payload.finalWeight : spec.yieldG;
    const bean = beans.find((b) => b.id === selectedBeanId);
    addLog({
      id: crypto.randomUUID(),
      beanId: bean?.id,
      beanName: bean?.name,
      method: brewing.method,
      dose: brewing.dose,
      waterWeight: yieldG,
      ratio: brewRatio(brewing.dose, yieldG),
      brewTimeSeconds: payload.elapsed,
      rating: 0,
      notes: "",
      brewedAt: new Date().toISOString(),
      recipeName: brewing.name,
      temperature: brewing.temperature,
      grindSize: brewing.grindSize,
      grindSetting: brewing.grindSetting,
      trace: payload.trace,
      espressoShot: payload.shot,
    });
    setBrewing(null);
  }

  if (brewing && brewing.method === "espresso") {
    return (
      <EspressoShot
        run={buildEspressoRunFromSaved(brewing)}
        onFinish={finishShot}
        onExit={() => setBrewing(null)}
      />
    );
  }

  if (brewing) {
    return (
      <GuidedPour
        recipe={buildRecipeFromSaved(brewing)}
        onFinish={finishBrew}
        onExit={() => setBrewing(null)}
      />
    );
  }

  return (
    <div className={styles.page}>
      <PageHeader
        icon={NotebookText}
        title={draft ? (isNew ? "New recipe" : "Edit recipe") : "Recipes"}
        subtitle={
          draft
            ? "Recipes"
            : recipes.length
              ? `${recipes.length} recipe${recipes.length === 1 ? "" : "s"}`
              : "Saved brews"
        }
        action={
          draft ? (
            <button
              className={styles.addBtn}
              onClick={cancel}
            >
              <ArrowLeft size={16} /> Recipes
            </button>
          ) : (
            <button
              className={styles.addBtn}
              onClick={startAdd}
            >
              <Plus size={16} /> New
            </button>
          )
        }
      />

      {draft ? (
        <div className={styles.form}>
          <input
            className={styles.input}
            placeholder="Recipe name (e.g. Morning V60)"
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />

          <div className={styles.field}>
            <span className={styles.fieldLabel}>METHOD</span>
            <div className={styles.chips}>
              {BREW_PRESETS.map((p) => (
                <button
                  key={p.method}
                  className={`${styles.chip} ${draft.method === p.method ? styles.chipActive : ""}`}
                  onClick={() => selectMethod(p.method as BrewMethod)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>COFFEE</span>
              <div className={styles.stepper}>
                <button
                  onClick={() => patch({ dose: Math.max(1, draft.dose - 1) })}
                >
                  −
                </button>
                <span>{draft.dose} g</span>
                <button onClick={() => patch({ dose: draft.dose + 1 })}>
                  +
                </button>
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                <Thermometer size={12} /> TEMP
              </span>
              <div className={styles.stepper}>
                <button
                  onClick={() =>
                    patch({ temperature: Math.max(60, draft.temperature - 1) })
                  }
                >
                  −
                </button>
                <span>{draft.temperature}°C</span>
                <button
                  onClick={() =>
                    patch({ temperature: Math.min(100, draft.temperature + 1) })
                  }
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>GRIND SIZE</span>
            <div className={styles.chips}>
              {GRINDS.map((g) => (
                <button
                  key={g}
                  className={`${styles.chip} ${draft.grindSize === g ? styles.chipActive : ""}`}
                  onClick={() => patch({ grindSize: g })}
                >
                  {g.replace("-", " ")}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>GRIND SETTING</span>
            <input
              className={styles.input}
              placeholder="e.g. 22 clicks · Niche 1.8"
              value={draft.grindSetting ?? ""}
              onChange={(e) =>
                patch({
                  grindSetting: e.target.value.trim()
                    ? e.target.value
                    : undefined,
                })
              }
            />
          </div>

          {isEspressoDraft && draftSpec ? (
            <>
              <div className={styles.field}>
                <div className={styles.stepsHead}>
                  <span className={styles.fieldLabel}>SHOT</span>
                  <span className={styles.totalWater}>
                    <Droplet size={13} /> 1:
                    {brewRatio(draft.dose, draftSpec.yieldG)} ·{" "}
                    {shotFlow(draftSpec.yieldG, draftSpec.shotSeconds)} g/s
                  </span>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>YIELD OUT</span>
                    <div className={styles.stepper}>
                      <button
                        onClick={() =>
                          patchEspresso({
                            yieldG: Math.max(1, draftSpec.yieldG - 1),
                          })
                        }
                      >
                        −
                      </button>
                      <span>{draftSpec.yieldG} g</span>
                      <button
                        onClick={() =>
                          patchEspresso({ yieldG: draftSpec.yieldG + 1 })
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>SHOT TIME</span>
                    <div className={styles.stepper}>
                      <button
                        onClick={() =>
                          patchEspresso({
                            shotSeconds: Math.max(
                              5,
                              draftSpec.shotSeconds - 1,
                            ),
                          })
                        }
                      >
                        −
                      </button>
                      <span>{draftSpec.shotSeconds}s</span>
                      <button
                        onClick={() =>
                          patchEspresso({
                            shotSeconds: draftSpec.shotSeconds + 1,
                          })
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.row}>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>PRE-INFUSION</span>
                  <div className={styles.stepper}>
                    <button
                      onClick={() =>
                        patchEspresso({
                          preInfusionSeconds: Math.max(
                            0,
                            draftSpec.preInfusionSeconds - 1,
                          ),
                        })
                      }
                    >
                      −
                    </button>
                    <span>{draftSpec.preInfusionSeconds}s</span>
                    <button
                      onClick={() =>
                        patchEspresso({
                          preInfusionSeconds:
                            draftSpec.preInfusionSeconds + 1,
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>PRESSURE</span>
                  <div className={styles.stepper}>
                    <button
                      onClick={() =>
                        patchEspresso({
                          pressureBar: Math.max(
                            1,
                            Math.round(
                              ((draftSpec.pressureBar ?? 9) - 0.5) * 10,
                            ) / 10,
                          ),
                        })
                      }
                    >
                      −
                    </button>
                    <span>{draftSpec.pressureBar ?? 9} bar</span>
                    <button
                      onClick={() =>
                        patchEspresso({
                          pressureBar:
                            Math.round(
                              ((draftSpec.pressureBar ?? 9) + 0.5) * 10,
                            ) / 10,
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>BASKET</span>
                <div className={styles.chips}>
                  {BASKET_SIZES.map((g) => (
                    <button
                      key={g}
                      className={`${styles.chip} ${draftSpec.basketG === g ? styles.chipActive : ""}`}
                      onClick={() => patchEspresso({ basketG: g })}
                    >
                      {g} g
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
          <div className={styles.field}>
            <div className={styles.stepsHead}>
              <span className={styles.fieldLabel}>POUR STEPS</span>
              <span className={styles.totalWater}>
                <Droplet size={13} /> {totalWater} g total
              </span>
            </div>

            <div className={styles.steps}>
              {draft.steps.map((s, i) => (
                <div
                  key={s.id}
                  className={styles.step}
                >
                  <span className={styles.stepNum}>{i + 1}</span>
                  <div className={styles.stepFields}>
                    <input
                      className={styles.stepName}
                      placeholder="Step name"
                      value={s.label}
                      onChange={(e) =>
                        patchStep(s.id, { label: e.target.value })
                      }
                    />
                    <div className={styles.stepNums}>
                      <label className={styles.stepNumField}>
                        <span>Water</span>
                        <div className={styles.miniStepper}>
                          <button
                            onClick={() =>
                              patchStep(s.id, {
                                water: Math.max(1, s.water - 5),
                              })
                            }
                          >
                            −
                          </button>
                          <span>{s.water} g</span>
                          <button
                            onClick={() =>
                              patchStep(s.id, { water: s.water + 5 })
                            }
                          >
                            +
                          </button>
                        </div>
                      </label>
                      <label className={styles.stepNumField}>
                        <span>Rest</span>
                        <div className={styles.miniStepper}>
                          <button
                            onClick={() =>
                              patchStep(s.id, {
                                restSeconds: Math.max(0, s.restSeconds - 5),
                              })
                            }
                          >
                            −
                          </button>
                          <span>{s.restSeconds}s</span>
                          <button
                            onClick={() =>
                              patchStep(s.id, {
                                restSeconds: s.restSeconds + 5,
                              })
                            }
                          >
                            +
                          </button>
                        </div>
                      </label>
                    </div>
                  </div>
                  <button
                    className={styles.stepDel}
                    onClick={() => removeStep(s.id)}
                    disabled={draft.steps.length <= 1}
                    aria-label="Remove step"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button
              className={styles.addStep}
              onClick={addStep}
            >
              <Plus size={16} /> Add step
            </button>
          </div>
          )}

          <div className={styles.formActions}>
            <button
              className={styles.cancel}
              onClick={cancel}
            >
              Cancel
            </button>
            <button
              className={styles.save}
              onClick={save}
              disabled={!draft.name.trim()}
            >
              {isNew ? "Create recipe" : "Save changes"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.beanBar}>
            <span className={styles.fieldLabel}>
              <Bean size={13} /> COFFEE BEAN
            </span>
            {beans.length === 0 ? (
              <p className={styles.beanHint}>
                No beans yet — add one in Beans to link it to your brews.
              </p>
            ) : (
              <div className={styles.chips}>
                <button
                  className={`${styles.chip} ${selectedBeanId === "" ? styles.chipActive : ""}`}
                  onClick={() => setBrewBeanId("")}
                >
                  Unspecified
                </button>
                {beans.map((b) => (
                  <button
                    key={b.id}
                    className={`${styles.chip} ${selectedBeanId === b.id ? styles.chipActive : ""}`}
                    onClick={() => setBrewBeanId(b.id)}
                  >
                    {b.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {recipes.length === 0 && (
            <p className={styles.empty}>
              No recipes yet. Create one to brew it with a single tap.
            </p>
          )}

          <div className={styles.list}>
            {recipes.map((r) => {
              const water = r.steps.reduce((sum, s) => sum + s.water, 0);
              const isEspresso = r.method === "espresso";
              const spec = isEspresso ? espressoSpecFor(r) : null;
              return (
                <div
                  key={r.id}
                  className={styles.card}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.cardInfo}>
                      <span
                        className={styles.cardName}
                        style={
                          pendingId === r.id
                            ? { viewTransitionName: "brew-title" }
                            : undefined
                        }
                      >
                        {r.name}
                      </span>
                      <span className={styles.cardMethod}>
                        {r.method.replace("-", " ")}
                      </span>
                    </div>
                    <div className={styles.cardActions}>
                      <button
                        onClick={() => startEdit(r)}
                        aria-label="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      {!isDefaultRecipeId(r.id) && (
                        <button
                          onClick={() => deleteRecipe(r.id)}
                          aria-label="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className={styles.cardStats}>
                    <span>{r.dose} g coffee</span>
                    {spec ? (
                      <>
                        <span>{spec.yieldG} g out</span>
                        <span>1:{brewRatio(r.dose, spec.yieldG)}</span>
                        <span>{spec.shotSeconds}s</span>
                        <span>{r.grindSize.replace("-", " ")}</span>
                        {spec.preInfusionSeconds > 0 && (
                          <span>{spec.preInfusionSeconds}s pre</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span>{water} g water</span>
                        <span>{r.temperature}°C</span>
                        <span>{r.grindSize.replace("-", " ")}</span>
                        <span>{r.steps.length} steps</span>
                      </>
                    )}
                  </div>
                  <button
                    className={styles.brew}
                    onClick={() => brewRecipe(r)}
                  >
                    <Play size={16} /> Brew
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
