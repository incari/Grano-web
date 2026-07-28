import type {
  BrewTracePoint,
  EspressoShot,
  EspressoSpec,
  GrindSize,
  SavedRecipe,
} from "../types";
import type { DialInTip } from "./dialIn";

/** What an espresso run hands back when the shot is stopped. */
export interface EspressoFinishPayload {
  elapsed: number; // total clock, pre-infusion included
  finalWeight: number; // yield in the cup
  trace: BrewTracePoint[];
  shot: EspressoShot;
}

export const ESPRESSO_DEFAULTS: EspressoSpec = {
  yieldG: 36,
  shotSeconds: 28,
  preInfusionSeconds: 5,
  pressureBar: 9,
  basketG: 18,
};

/** Common basket sizes offered in the recipe editor. */
export const BASKET_SIZES = [7, 14, 16, 18, 20, 22];

export function isEspressoRecipe(r: SavedRecipe): boolean {
  return r.method === "espresso";
}

/** Fill in any missing espresso params, deriving yield from the dose. */
export function espressoSpecFor(saved: SavedRecipe): EspressoSpec {
  const spec = saved.espresso;
  return {
    yieldG: spec?.yieldG ?? Math.round(saved.dose * 2),
    shotSeconds: spec?.shotSeconds ?? ESPRESSO_DEFAULTS.shotSeconds,
    preInfusionSeconds:
      spec?.preInfusionSeconds ?? ESPRESSO_DEFAULTS.preInfusionSeconds,
    pressureBar: spec?.pressureBar ?? ESPRESSO_DEFAULTS.pressureBar,
    basketG: spec?.basketG ?? Math.round(saved.dose),
  };
}

/** A runnable espresso shot — the espresso analogue of `Recipe`. */
export interface EspressoRun {
  label: string;
  dose: number;
  temperature?: number;
  grindSize?: GrindSize;
  spec: EspressoSpec;
}

export function buildEspressoRunFromSaved(saved: SavedRecipe): EspressoRun {
  return {
    label: saved.name,
    dose: saved.dose,
    temperature: saved.temperature,
    grindSize: saved.grindSize,
    spec: espressoSpecFor(saved),
  };
}

/** Build a run from the ad-hoc BrewSetup controls (dose + brew ratio). */
export function buildEspressoRun(
  label: string,
  dose: number,
  ratio: number,
  temperature?: number,
): EspressoRun {
  return {
    label,
    dose,
    temperature,
    spec: {
      ...ESPRESSO_DEFAULTS,
      yieldG: Math.round(dose * ratio),
      basketG: Math.round(dose),
    },
  };
}

/** Brew ratio as 1:x, one decimal. */
export function brewRatio(dose: number, yieldG: number): number {
  return dose > 0 ? Math.round((yieldG / dose) * 10) / 10 : 0;
}

/** Average flow through the puck in g/s. */
export function shotFlow(yieldG: number, shotSeconds: number): number {
  return shotSeconds > 0 ? Math.round((yieldG / shotSeconds) * 100) / 100 : 0;
}

/** Turn an actual shot into a repeatable espresso recipe. */
export function recipeFromActualShot(
  shot: EspressoShot,
  dose: number,
  name: string,
  extras?: {
    temperature?: number;
    grindSize?: GrindSize;
    grindSetting?: string;
  },
): SavedRecipe {
  return {
    id: crypto.randomUUID(),
    name,
    method: "espresso",
    dose,
    temperature: extras?.temperature ?? 93,
    grindSize: extras?.grindSize ?? "fine",
    grindSetting: extras?.grindSetting,
    steps: [],
    espresso: {
      yieldG: Math.round(shot.yieldG),
      shotSeconds: Math.round(shot.shotSeconds),
      preInfusionSeconds: Math.round(shot.preInfusionSeconds),
      pressureBar: shot.pressureBar ?? ESPRESSO_DEFAULTS.pressureBar,
      basketG: Math.round(dose),
    },
    createdAt: new Date().toISOString(),
  };
}

const TIME_TOL = 3; // s — acceptable drift on shot time
const YIELD_TOL = 2; // g — acceptable drift on yield

/**
 * Espresso dial-in coaching: grind is the primary lever, judged by how the
 * actual shot time compares to target once the yield is roughly on spec.
 */
export function buildEspressoTips(
  shot: EspressoShot,
  dose: number,
): DialInTip[] {
  const tips: DialInTip[] = [];
  const add = (id: string, title: string, detail: string) => {
    if (!tips.some((t) => t.id === id)) tips.push({ id, title, detail });
  };

  const timeDelta = shot.shotSeconds - shot.targetShotSeconds;
  const yieldDelta = shot.yieldG - shot.targetYieldG;
  const ratio = brewRatio(dose, shot.yieldG);

  if (shot.channeling) {
    add(
      "channeling",
      "Channeling flagged",
      "Redistribute the grounds (WDT) and tamp level before pressing — uneven pucks spike flow through one spot.",
    );
  }

  if (timeDelta < -TIME_TOL) {
    add(
      "fast-shot",
      `Shot ran ${Math.abs(Math.round(timeDelta))} s fast`,
      "Grind finer one step. If it's still gushing, add 0.5 g dose or extend pre-infusion by 2 s.",
    );
  } else if (timeDelta > TIME_TOL) {
    add(
      "slow-shot",
      `Shot ran ${Math.round(timeDelta)} s slow`,
      "Grind coarser one step, or drop 0.5 g of dose to open the puck up.",
    );
  }

  if (Math.abs(yieldDelta) > YIELD_TOL) {
    add(
      "yield-off",
      yieldDelta > 0 ? "Over-poured the cup" : "Stopped short of target",
      `Ended at ${Math.round(shot.yieldG)} g against ${shot.targetYieldG} g — cut the pump ~1 s ${
        yieldDelta > 0 ? "earlier" : "later"
      } to land on 1:${brewRatio(dose, shot.targetYieldG)}.`,
    );
  }

  if (shot.firstDropSeconds != null && shot.firstDropSeconds > 12) {
    add(
      "late-first-drop",
      "First drop was late",
      "Over 12 s to first drop usually means the grind is too fine or the dose too high for the basket.",
    );
  }

  if (tips.length === 0) {
    add(
      "espresso-locked",
      "On spec — lock it in",
      `1:${ratio} in ${Math.round(shot.shotSeconds)} s. Note the grind setting so you can repeat it with this bean.`,
    );
  }

  return tips.slice(0, 3);
}
