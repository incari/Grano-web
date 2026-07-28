import { useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import {
  ClipboardList,
  Bean,
  Star,
  SlidersHorizontal,
  GitCompare,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBrewLogs } from "../../store/useStore";
import { formatTime } from "../../utils/recipe";
import type { BrewLog } from "../../types";
import PageHeader from "../../components/PageHeader/PageHeader";
import styles from "./Log.module.scss";

function LogCard({
  log,
  onDelete,
}: {
  log: BrewLog;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const href = `/log/${log.id}`;

  // Two-phase morph: once this card's method carries the shared name, snapshot
  // it and animate it into the detail header. The name lives on the tapped card
  // only, so sibling cards never collide.
  useLayoutEffect(() => {
    if (!pending) {
      return;
    }
    document.startViewTransition(() => {
      flushSync(() => navigate(href));
    });
  }, [pending, href, navigate]);

  function openDetails() {
    if (typeof document.startViewTransition !== "function") {
      navigate(href);
      return;
    }
    setPending(true);
  }

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <span
          className={styles.method}
          style={
            pending ? { viewTransitionName: "brew-detail-title" } : undefined
          }
        >
          {log.method}
        </span>
        <span className={styles.date}>
          {new Date(log.brewedAt).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      {log.beanName && (
        <div className={styles.bean}>
          <Bean size={15} /> {log.beanName}
        </div>
      )}
      <div className={styles.stats}>
        <div>
          <span>{log.dose} g</span>
          <small>coffee</small>
        </div>
        <div>
          <span>{log.waterWeight} g</span>
          <small>water</small>
        </div>
        <div>
          <span>1:{log.ratio}</span>
          <small>ratio</small>
        </div>
        <div>
          <span>{formatTime(log.brewTimeSeconds)}</span>
          <small>time</small>
        </div>
      </div>
      {(log.grindSetting || log.consistencyScore != null) && (
        <div className={styles.extra}>
          {log.grindSetting && <span>Grind {log.grindSetting}</span>}
          {log.consistencyScore != null && (
            <span>Consistency {log.consistencyScore}</span>
          )}
        </div>
      )}
      <div className={styles.rating}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star
            key={i}
            size={16}
            fill={i < log.rating ? "currentColor" : "none"}
          />
        ))}
      </div>
      {log.notes && <p className={styles.notes}>{log.notes}</p>}
      {log.review?.liked && <p className={styles.notes}>{log.review.liked}</p>}
      <div className={styles.actions}>
        <button
          className={styles.details}
          onClick={openDetails}
        >
          <SlidersHorizontal size={14} />
          {log.review || log.rating > 0 ? "Edit details" : "Add details"}
        </button>
        <button
          className={styles.del}
          onClick={() => onDelete(log.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export default function Log() {
  const navigate = useNavigate();
  const { logs, deleteLog } = useBrewLogs();
  const canCompare = logs.filter((l) => (l.trace?.length ?? 0) >= 2).length >= 2;

  return (
    <div className={styles.page}>
      <PageHeader
        icon={ClipboardList}
        title="History"
        subtitle={
          logs.length
            ? `${logs.length} brew${logs.length === 1 ? "" : "s"}`
            : "Brew history"
        }
        action={
          canCompare ? (
            <button
              type="button"
              className={styles.compareBtn}
              onClick={() => navigate("/log/compare")}
            >
              <GitCompare size={15} />
              Compare
            </button>
          ) : undefined
        }
      />

      {logs.length === 0 && (
        <p className={styles.empty}>You haven't logged any brews yet.</p>
      )}

      <div className={styles.list}>
        {logs.map((log) => (
          <LogCard
            key={log.id}
            log={log}
            onDelete={deleteLog}
          />
        ))}
      </div>
    </div>
  );
}
