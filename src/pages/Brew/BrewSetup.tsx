import { useMemo, useState } from 'react';
import type { BrewMethod } from '../../types';
import { BREW_PRESETS, getPreset } from '../../utils/presets';
import { buildRecipe } from '../../utils/recipe';
import { useBeans, useBrewLogs } from '../../store/useStore';
import { Coffee } from 'lucide-react';
import GuidedPour from './GuidedPour';
import styles from './BrewSetup.module.scss';

export default function BrewSetup() {
  const { beans } = useBeans();
  const { addLog } = useBrewLogs();
  const [method, setMethod] = useState<BrewMethod>('pour-over');
  const [dose, setDose] = useState(15);
  const [ratio, setRatio] = useState(getPreset('pour-over').ratio);
  const [beanId, setBeanId] = useState<string>('');
  const [brewing, setBrewing] = useState(false);

  const water = Math.round(dose * ratio);
  const recipe = useMemo(() => buildRecipe(method, dose, ratio), [method, dose, ratio]);

  function selectMethod(m: BrewMethod) {
    setMethod(m);
    const preset = getPreset(m);
    setDose(preset.defaultDose);
    setRatio(preset.ratio);
  }

  function finishBrew(elapsed: number) {
    const bean = beans.find(b => b.id === beanId);
    addLog({
      id: crypto.randomUUID(),
      beanId: beanId || undefined,
      beanName: bean?.name,
      method,
      dose,
      waterWeight: water,
      ratio,
      brewTimeSeconds: elapsed,
      rating: 0,
      notes: '',
      brewedAt: new Date().toISOString(),
    });
    setBrewing(false);
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
      <header className={styles.head}>
        <h1><Coffee size={26} strokeWidth={2.25} /> Grano</h1>
        <p>Gram-precise controlled brewing</p>
      </header>

      <section className={styles.block}>
        <span className={styles.blockLabel}>METHOD</span>
        <div className={styles.methods}>
          {BREW_PRESETS.map(p => (
            <button
              key={p.method}
              className={`${styles.method} ${method === p.method ? styles.methodActive : ''}`}
              onClick={() => selectMethod(p.method)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.block}>
        <span className={styles.blockLabel}>COFFEE (DOSE)</span>
        <div className={styles.stepper}>
          <button onClick={() => setDose(d => Math.max(1, d - 1))}>−</button>
          <div className={styles.stepperValue}>{dose} <small>g</small></div>
          <button onClick={() => setDose(d => d + 1)}>+</button>
        </div>
      </section>

      <section className={styles.block}>
        <span className={styles.blockLabel}>RATIO — 1:{ratio}</span>
        <input
          type="range"
          min={method === 'espresso' ? 1.5 : 10}
          max={method === 'espresso' ? 3 : 18}
          step={method === 'espresso' ? 0.1 : 0.5}
          value={ratio}
          onChange={e => setRatio(Number(e.target.value))}
          className={styles.slider}
        />
      </section>

      {beans.length > 0 && (
        <section className={styles.block}>
          <span className={styles.blockLabel}>BEAN</span>
          <select
            className={styles.select}
            value={beanId}
            onChange={e => setBeanId(e.target.value)}
          >
            <option value="">Unspecified</option>
            {beans.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </section>
      )}

      <div className={styles.summary}>
        <div>
          <span className={styles.sumLabel}>Total water</span>
          <span className={styles.sumValue}>{water} g</span>
        </div>
        <div>
          <span className={styles.sumLabel}>Steps</span>
          <span className={styles.sumValue}>{recipe.steps.length}</span>
        </div>
      </div>

      <button className={styles.start} onClick={() => setBrewing(true)}>
        Start brewing
      </button>
    </div>
  );
}
