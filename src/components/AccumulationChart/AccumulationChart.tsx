import { useMemo } from 'react';
import type { Recipe } from '../../utils/recipe';
import { formatTime } from '../../utils/recipe';
import styles from './AccumulationChart.module.scss';

export interface ChartPoint {
  t: number; // seconds from brew start
  g: number; // cumulative grams
}

interface Props {
  recipe: Recipe;
  history: ChartPoint[];
  elapsed: number;
  current: number;
}

const IDEAL_FLOW = 9; // g/s reference pour rate for the ideal ramp

// Piecewise ideal curve: ramp up during each pour, plateau while resting.
function buildIdeal(recipe: Recipe): ChartPoint[] {
  const pts: ChartPoint[] = [{ t: 0, g: 0 }];
  recipe.steps.forEach((s, i) => {
    const prev = i > 0 ? recipe.steps[i - 1].target : 0;
    const ramp = (s.target - prev) / IDEAL_FLOW;
    pts.push({ t: s.pourStart, g: prev });
    pts.push({ t: s.pourStart + ramp, g: s.target });
  });
  return pts;
}

// SVG viewBox geometry.
const W = 320;
const H = 170;
const PAD = { top: 12, right: 12, bottom: 24, left: 30 };

export default function AccumulationChart({ recipe, history, elapsed, current }: Props) {
  const ideal = useMemo(() => buildIdeal(recipe), [recipe]);

  const lastStep = recipe.steps[recipe.steps.length - 1];
  const xMax = Math.max(lastStep.waitUntil, elapsed, ideal[ideal.length - 1].t) || 1;
  const yMax = recipe.totalWater || 1;

  const px = (t: number) => PAD.left + (t / xMax) * (W - PAD.left - PAD.right);
  const py = (g: number) => H - PAD.bottom - (g / yMax) * (H - PAD.top - PAD.bottom);

  // Catmull-Rom → cubic Bézier for a smooth, fluid curve through the samples.
  const toPath = (pts: ChartPoint[]) => {
    const sp = pts.map(p => ({ x: px(p.t), y: py(p.g) }));
    if (sp.length < 2) {
      return sp.length === 1 ? `M${sp[0].x.toFixed(1)} ${sp[0].y.toFixed(1)}` : '';
    }
    let d = `M${sp[0].x.toFixed(1)} ${sp[0].y.toFixed(1)}`;
    for (let i = 0; i < sp.length - 1; i++) {
      const p0 = sp[i - 1] ?? sp[i];
      const p1 = sp[i];
      const p2 = sp[i + 1];
      const p3 = sp[i + 2] ?? p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  };

  // Append the live tip so the trace reaches the current value every frame.
  const live = [...history, { t: elapsed, g: current }];
  const idealPath = toPath(ideal);
  const realPath = toPath(live);
  const head = live[live.length - 1];

  // Y gridlines at 0, 1/2, full water.
  const yTicks = [0, Math.round(yMax / 2), yMax];
  const xTicks = [0, Math.round(xMax / 2), Math.round(xMax)];

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchReal}`} /> Your brew
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles.swatchIdeal}`} /> Ideal recipe
        </span>
      </div>

      <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} role="img">
        {yTicks.map(g => (
          <g key={`y${g}`}>
            <line
              className={styles.grid}
              x1={PAD.left}
              y1={py(g)}
              x2={W - PAD.right}
              y2={py(g)}
            />
            <text className={styles.axisText} x={PAD.left - 5} y={py(g) + 3} textAnchor="end">
              {g}
            </text>
          </g>
        ))}

        {xTicks.map(t => (
          <text
            key={`x${t}`}
            className={styles.axisText}
            x={px(t)}
            y={H - 6}
            textAnchor="middle"
          >
            {formatTime(t)}
          </text>
        ))}

        <path className={styles.idealLine} d={idealPath} />
        {realPath && <path className={styles.realLine} d={realPath} />}
        {head && <circle className={styles.head} cx={px(head.t)} cy={py(head.g)} r={4} />}
      </svg>
    </div>
  );
}
