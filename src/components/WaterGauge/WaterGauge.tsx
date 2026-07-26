import { IconDroplet } from "../icons/Icon";
import styles from "./WaterGauge.module.scss";

type Tone = "active" | "ok" | "over";

interface Props {
  current: number;
  target: number;
  total: number;
  marks: number[];
  flow: number;
  tone: Tone;
}

const R = 96;
const STROKE = 11.2;
const CIRC = 2 * Math.PI * R;
const ARC = 0.75; // 270° arc
const SIZE = (R + STROKE) * 2;
const CENTER = SIZE / 2;

// The 270° arc starts at screen angle 135° and sweeps clockwise to 405° (=45°).
function polar(radius: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(a), y: CENTER + radius * Math.sin(a) };
}

export default function WaterGauge({
  current,
  target,
  total,
  marks,
  flow,
  tone,
}: Props) {
  const pct = total > 0 ? Math.min(current / total, 1) : 0;
  const trackLen = CIRC * ARC;
  const progressLen = trackLen * pct;

  return (
    <div className={`${styles.wrap} ${styles[tone]}`}>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={styles.svg}
      >
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R}
          fill="none"
          className={styles.track}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${trackLen} ${CIRC}`}
          transform={`rotate(135 ${CENTER} ${CENTER})`}
        />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R}
          fill="none"
          className={styles.progress}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${progressLen} ${CIRC}`}
          transform={`rotate(135 ${CENTER} ${CENTER})`}
        />
        <g>
          {marks
            .filter((m) => total > 0 && m < total)
            .map((m) => {
              const A = 135 + 270 * (m / total);
              const inner = polar(R - STROKE / 2 - 3, A);
              const outer = polar(R + STROKE / 2 + 3, A);
              const isActive = m === target;
              return (
                <line
                  key={m}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  className={`${styles.tick} ${isActive ? styles.tickActive : ""}`}
                />
              );
            })}
        </g>
      </svg>

      <div className={styles.center}>
        <span className={styles.label}>CURRENT WATER</span>
        <div className={styles.value}>
          <span className={styles.number}>{Math.round(current)}</span>
          <span className={styles.unit}>g</span>
        </div>
        <span className={styles.target}>/ {total} g</span>
        <div className={styles.flow}>
          <IconDroplet
            size={16}
            className={styles.flowIcon}
          />
          <span className={styles.flowValue}>{flow.toFixed(1)} g/s</span>
        </div>
        <span className={styles.flowLabel}>current flow</span>
      </div>
    </div>
  );
}
