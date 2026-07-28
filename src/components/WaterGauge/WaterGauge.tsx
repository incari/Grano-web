import { IconDroplet } from "../icons/Icon";
import styles from "./WaterGauge.module.scss";

type Tone = "active" | "ok" | "over" | "fast" | "slow";

interface Props {
  current: number;
  target: number;
  total: number;
  marks: number[];
  flow: number;
  tone: Tone;
  /** Caption above the big number (defaults to the pour-over wording). */
  label?: string;
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

const MARK_DOT_R = STROKE / 2; // dot matches the bar width so the tip covers it

export default function WaterGauge({
  current,
  target,
  total,
  marks,
  flow,
  tone,
  label = "CURRENT WATER",
}: Props) {
  const pct = total > 0 ? Math.min(current / total, 1) : 0;
  const trackLen = CIRC * ARC;
  // The round tip is a disk of radius STROKE/2 at the geometric end, which sits
  // exactly on the mark's angle — so the tip covers the same-sized dot perfectly.
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
              const isActive = m === target;
              const p = polar(R, A);
              return (
                <circle
                  key={m}
                  cx={p.x}
                  cy={p.y}
                  r={MARK_DOT_R}
                  className={`${styles.tick} ${isActive ? styles.tickActive : ""}`}
                />
              );
            })}
        </g>
      </svg>

      <div className={styles.center}>
        <span className={styles.label}>{label}</span>
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
