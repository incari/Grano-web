import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useBrewLogs } from "../../store/useStore";
import { formatTime } from "../../utils/recipe";
import type { BrewLog, BrewTracePoint } from "../../types";
import styles from "./CompareBrews.module.scss";

function label(log: BrewLog) {
  const d = new Date(log.brewedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
  return `${log.beanName || log.method} · ${d}`;
}

function pickTrace(log: BrewLog | undefined): BrewTracePoint[] {
  return log?.trace?.length ? log.trace : [];
}

export default function CompareBrews() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { logs } = useBrewLogs();
  const withTrace = useMemo(
    () => logs.filter((l) => (l.trace?.length ?? 0) >= 2),
    [logs],
  );

  const [aId, setAId] = useState(params.get("a") ?? withTrace[0]?.id ?? "");
  const [bId, setBId] = useState(
    params.get("b") ?? withTrace[1]?.id ?? withTrace[0]?.id ?? "",
  );

  const a = logs.find((l) => l.id === aId);
  const b = logs.find((l) => l.id === bId);
  const ta = pickTrace(a);
  const tb = pickTrace(b);

  const W = 320;
  const H = 160;
  const PAD = { t: 10, r: 10, b: 22, l: 28 };
  const xMax = Math.max(
    ta[ta.length - 1]?.t ?? 1,
    tb[tb.length - 1]?.t ?? 1,
    1,
  );
  const yMax = Math.max(
    a?.waterWeight ?? 1,
    b?.waterWeight ?? 1,
    ...ta.map((p) => p.g),
    ...tb.map((p) => p.g),
    1,
  );
  const px = (t: number) => PAD.l + (t / xMax) * (W - PAD.l - PAD.r);
  const py = (g: number) => H - PAD.b - (g / yMax) * (H - PAD.t - PAD.b);

  function path(pts: BrewTracePoint[]) {
    if (pts.length < 2) return "";
    return pts
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${px(p.t).toFixed(1)} ${py(p.g).toFixed(1)}`,
      )
      .join(" ");
  }

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
          <h1>Compare brews</h1>
          <p>Weight over time</p>
        </div>
      </header>

      {withTrace.length < 2 ? (
        <p className={styles.empty}>
          Need at least two logged brews with weight traces. Finish a couple of
          guided pours first.
        </p>
      ) : (
        <>
          <div className={styles.pickers}>
            <label className={styles.picker}>
              <span className={styles.swatchA} />
              <select value={aId} onChange={(e) => setAId(e.target.value)}>
                {withTrace.map((l) => (
                  <option key={l.id} value={l.id}>
                    {label(l)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.picker}>
              <span className={styles.swatchB} />
              <select value={bId} onChange={(e) => setBId(e.target.value)}>
                {withTrace.map((l) => (
                  <option key={l.id} value={l.id}>
                    {label(l)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.chartCard}>
            <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg}>
              <path d={path(ta)} className={styles.lineA} fill="none" />
              <path d={path(tb)} className={styles.lineB} fill="none" />
              <text x={PAD.l} y={H - 6} className={styles.axis}>
                0
              </text>
              <text x={W - PAD.r - 24} y={H - 6} className={styles.axis}>
                {formatTime(Math.round(xMax))}
              </text>
              <text x={4} y={PAD.t + 4} className={styles.axis}>
                {Math.round(yMax)}g
              </text>
            </svg>
          </div>

          <div className={styles.meta}>
            <MetaCol log={a} tone="a" />
            <MetaCol log={b} tone="b" />
          </div>
        </>
      )}
    </div>
  );
}

function MetaCol({ log, tone }: { log?: BrewLog; tone: "a" | "b" }) {
  if (!log) return <div className={styles.metaCol} />;
  return (
    <div className={`${styles.metaCol} ${styles[`meta_${tone}`]}`}>
      <strong>{log.beanName || log.method}</strong>
      <span>
        {log.dose}g · 1:{log.ratio} · {formatTime(log.brewTimeSeconds)}
      </span>
      {log.grindSetting && <span>Grind {log.grindSetting}</span>}
      {log.consistencyScore != null && (
        <span>Consistency {log.consistencyScore}</span>
      )}
      {log.rating > 0 && <span>★ {log.rating}/5</span>}
    </div>
  );
}
