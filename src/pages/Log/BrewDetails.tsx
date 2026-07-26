import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bean, Star } from "lucide-react";
import { useBrewLogs } from "../../store/useStore";
import { formatTime } from "../../utils/recipe";
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
  const log = logs.find((l) => l.id === id);

  const [rating, setRating] = useState(log?.rating ?? 0);
  const [review, setReview] = useState<BrewReview>(log?.review ?? {});

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
    updateLog(log!.id, { rating, review });
    navigate("/log");
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

      <button
        className={styles.save}
        onClick={save}
      >
        Save details
      </button>
    </div>
  );
}
