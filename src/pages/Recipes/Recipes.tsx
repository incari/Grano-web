import { useState } from 'react';
import { NotebookText, Plus, Pencil, Trash2, Play, X, Thermometer, Droplet } from 'lucide-react';
import type { BrewMethod, GrindSize, RecipeStep, SavedRecipe } from '../../types';
import { BREW_PRESETS } from '../../utils/presets';
import { buildRecipeFromSaved } from '../../utils/recipe';
import { useRecipes, useBrewLogs } from '../../store/useStore';
import GuidedPour from '../Brew/GuidedPour';
import styles from './Recipes.module.scss';

const GRINDS: GrindSize[] = ['extra-fine', 'fine', 'medium-fine', 'medium', 'medium-coarse', 'coarse'];

function newStep(index: number): RecipeStep {
  return {
    id: crypto.randomUUID(),
    label: index === 0 ? 'Bloom' : `Pour ${index + 1}`,
    water: index === 0 ? 45 : 60,
    restSeconds: index === 0 ? 45 : 30,
  };
}

function emptyRecipe(): SavedRecipe {
  return {
    id: crypto.randomUUID(),
    name: '',
    method: 'pour-over',
    dose: 15,
    temperature: 94,
    grindSize: 'medium',
    steps: [newStep(0), newStep(1)],
    createdAt: new Date().toISOString(),
  };
}

export default function Recipes() {
  const { recipes, addRecipe, updateRecipe, deleteRecipe } = useRecipes();
  const { addLog } = useBrewLogs();
  const [draft, setDraft] = useState<SavedRecipe | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [brewing, setBrewing] = useState<SavedRecipe | null>(null);

  const totalWater = draft ? draft.steps.reduce((sum, s) => sum + s.water, 0) : 0;

  function startAdd() {
    setDraft(emptyRecipe());
    setIsNew(true);
  }

  function startEdit(recipe: SavedRecipe) {
    setDraft({ ...recipe, steps: recipe.steps.map(s => ({ ...s })) });
    setIsNew(false);
  }

  function cancel() {
    setDraft(null);
  }

  function save() {
    if (!draft || !draft.name.trim() || draft.steps.length === 0) {
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
    setDraft(d => (d ? { ...d, ...fields } : d));
  }

  function patchStep(id: string, fields: Partial<RecipeStep>) {
    setDraft(d =>
      d ? { ...d, steps: d.steps.map(s => (s.id === id ? { ...s, ...fields } : s)) } : d,
    );
  }

  function addStep() {
    setDraft(d => (d ? { ...d, steps: [...d.steps, newStep(d.steps.length)] } : d));
  }

  function removeStep(id: string) {
    setDraft(d => (d ? { ...d, steps: d.steps.filter(s => s.id !== id) } : d));
  }

  function finishBrew(elapsed: number) {
    if (!brewing) {
      return;
    }
    const built = buildRecipeFromSaved(brewing);
    addLog({
      id: crypto.randomUUID(),
      method: brewing.method,
      dose: brewing.dose,
      waterWeight: built.totalWater,
      ratio: Math.round((built.totalWater / brewing.dose) * 10) / 10,
      brewTimeSeconds: elapsed,
      rating: 0,
      notes: '',
      brewedAt: new Date().toISOString(),
    });
    setBrewing(null);
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
      <header className={styles.head}>
        <h1><NotebookText size={26} strokeWidth={2.25} /> Recipes</h1>
        {!draft && (
          <button className={styles.addBtn} onClick={startAdd}>
            <Plus size={16} /> New
          </button>
        )}
      </header>

      {draft ? (
        <div className={styles.form}>
          <input
            className={styles.input}
            placeholder="Recipe name (e.g. Morning V60)"
            value={draft.name}
            onChange={e => patch({ name: e.target.value })}
          />

          <div className={styles.field}>
            <span className={styles.fieldLabel}>METHOD</span>
            <div className={styles.chips}>
              {BREW_PRESETS.map(p => (
                <button
                  key={p.method}
                  className={`${styles.chip} ${draft.method === p.method ? styles.chipActive : ''}`}
                  onClick={() => patch({ method: p.method as BrewMethod })}
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
                <button onClick={() => patch({ dose: Math.max(1, draft.dose - 1) })}>−</button>
                <span>{draft.dose} g</span>
                <button onClick={() => patch({ dose: draft.dose + 1 })}>+</button>
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>
                <Thermometer size={12} /> TEMP
              </span>
              <div className={styles.stepper}>
                <button onClick={() => patch({ temperature: Math.max(60, draft.temperature - 1) })}>−</button>
                <span>{draft.temperature}°C</span>
                <button onClick={() => patch({ temperature: Math.min(100, draft.temperature + 1) })}>+</button>
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>GRIND SIZE</span>
            <div className={styles.chips}>
              {GRINDS.map(g => (
                <button
                  key={g}
                  className={`${styles.chip} ${draft.grindSize === g ? styles.chipActive : ''}`}
                  onClick={() => patch({ grindSize: g })}
                >
                  {g.replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <div className={styles.stepsHead}>
              <span className={styles.fieldLabel}>POUR STEPS</span>
              <span className={styles.totalWater}>
                <Droplet size={13} /> {totalWater} g total
              </span>
            </div>

            <div className={styles.steps}>
              {draft.steps.map((s, i) => (
                <div key={s.id} className={styles.step}>
                  <span className={styles.stepNum}>{i + 1}</span>
                  <div className={styles.stepFields}>
                    <input
                      className={styles.stepName}
                      placeholder="Step name"
                      value={s.label}
                      onChange={e => patchStep(s.id, { label: e.target.value })}
                    />
                    <div className={styles.stepNums}>
                      <label className={styles.stepNumField}>
                        <span>Water</span>
                        <div className={styles.miniStepper}>
                          <button onClick={() => patchStep(s.id, { water: Math.max(1, s.water - 5) })}>−</button>
                          <span>{s.water} g</span>
                          <button onClick={() => patchStep(s.id, { water: s.water + 5 })}>+</button>
                        </div>
                      </label>
                      <label className={styles.stepNumField}>
                        <span>Rest</span>
                        <div className={styles.miniStepper}>
                          <button onClick={() => patchStep(s.id, { restSeconds: Math.max(0, s.restSeconds - 5) })}>−</button>
                          <span>{s.restSeconds}s</span>
                          <button onClick={() => patchStep(s.id, { restSeconds: s.restSeconds + 5 })}>+</button>
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

            <button className={styles.addStep} onClick={addStep}>
              <Plus size={16} /> Add step
            </button>
          </div>

          <div className={styles.formActions}>
            <button className={styles.cancel} onClick={cancel}>Cancel</button>
            <button className={styles.save} onClick={save} disabled={!draft.name.trim()}>
              {isNew ? 'Create recipe' : 'Save changes'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {recipes.length === 0 && (
            <p className={styles.empty}>No recipes yet. Create one to brew it with a single tap.</p>
          )}

          <div className={styles.list}>
            {recipes.map(r => {
              const water = r.steps.reduce((sum, s) => sum + s.water, 0);
              return (
                <div key={r.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <div className={styles.cardInfo}>
                      <span className={styles.cardName}>{r.name}</span>
                      <span className={styles.cardMethod}>{r.method.replace('-', ' ')}</span>
                    </div>
                    <div className={styles.cardActions}>
                      <button onClick={() => startEdit(r)} aria-label="Edit"><Pencil size={16} /></button>
                      <button onClick={() => deleteRecipe(r.id)} aria-label="Delete"><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <div className={styles.cardStats}>
                    <span>{r.dose} g coffee</span>
                    <span>{water} g water</span>
                    <span>{r.temperature}°C</span>
                    <span>{r.grindSize.replace('-', ' ')}</span>
                    <span>{r.steps.length} steps</span>
                  </div>
                  <button className={styles.brew} onClick={() => setBrewing(r)}>
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
