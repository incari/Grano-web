import { Link } from "react-router-dom";
import {
  Coffee,
  Bean,
  NotebookText,
  ClipboardList,
  Scale,
  Timer,
  ChartLine,
  ArrowRight,
} from "lucide-react";
import { useBeans, useBrewLogs, useRecipes } from "../../store/useStore";
import hero from "../../assets/hero.png";
import styles from "./Landing.module.scss";

const FEATURES = [
  {
    Icon: Timer,
    title: "Guided pours",
    text: "Step-by-step bloom, pour and rest timings with live targets.",
  },
  {
    Icon: Scale,
    title: "Live scale",
    text: "Connect a smart scale for real-time weight and flow rate.",
  },
  {
    Icon: NotebookText,
    title: "Recipes",
    text: "Classic V60, Kasuya 4:6, Chemex — or build your own.",
  },
  {
    Icon: Bean,
    title: "Bean pantry",
    text: "Track origin, roast and every brew you pulled from the bag.",
  },
  {
    Icon: ClipboardList,
    title: "Tasting log",
    text: "Rate aroma, acidity, body and sweetness after each cup.",
  },
  {
    Icon: ChartLine,
    title: "Dial in",
    text: "Compare traces and get suggestions for your next brew.",
  },
];

export default function Landing() {
  const { recipes } = useRecipes();
  const { beans } = useBeans();
  const { logs } = useBrewLogs();

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <span className={styles.badge}>
          <Coffee
            size={18}
            strokeWidth={2.25}
          />
          Grano
        </span>
        <h1 className={styles.title}>
          Brew better coffee, <em>every</em> morning.
        </h1>
        <p className={styles.lede}>
          A pocket barista for pour-over, Chemex, AeroPress and French press.
          Guided timings, live weight, and a memory that improves the next cup.
        </p>

        <div className={styles.actions}>
          <Link
            className={styles.cta}
            to="/brew"
          >
            Start brewing <ArrowRight size={17} />
          </Link>
          <Link
            className={styles.ghost}
            to="/recipes"
          >
            Browse recipes
          </Link>
        </div>

        <div
          className={styles.shot}
          role="presentation"
        >
          <img
            src={hero}
            alt=""
            loading="lazy"
          />
        </div>
      </header>

      <section className={styles.stats}>
        <div>
          <strong>{recipes.length}</strong>
          <span>recipes</span>
        </div>
        <div>
          <strong>{beans.length}</strong>
          <span>beans</span>
        </div>
        <div>
          <strong>{logs.length}</strong>
          <span>brews logged</span>
        </div>
      </section>

      <section className={styles.features}>
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className={styles.feature}
          >
            <span className={styles.featureIcon}>
              <f.Icon
                size={18}
                strokeWidth={2.25}
              />
            </span>
            <div>
              <h2>{f.title}</h2>
              <p>{f.text}</p>
            </div>
          </div>
        ))}
      </section>

      <section className={styles.closing}>
        <h2>Ready when you are.</h2>
        <p>Pick a recipe, put the cup on the scale, and follow along.</p>
        <Link
          className={styles.cta}
          to="/brew"
        >
          Start brewing <ArrowRight size={17} />
        </Link>
      </section>
    </div>
  );
}
