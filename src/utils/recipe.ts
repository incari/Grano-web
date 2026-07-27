import type { BrewMethod, GrindSize, SavedRecipe } from "../types";
import { getPreset } from "./presets";

export type StepKind = "pour" | "stir" | "serve";

export interface PourStep {
  index: number;
  kind: StepKind;
  label: string;
  target: number; // cumulative water target in grams
  pourStart: number; // seconds from brew start
  waitUntil: number; // seconds — end of this step's wait
  restSeconds: number; // rest/steep window after the pour completes
  actionSeconds: number; // duration of a stir/serve action (0 for pours)
  instruction?: string; // guidance shown for stir/serve steps
  isBloom: boolean;
}

export interface Recipe {
  method: BrewMethod;
  label: string;
  dose: number;
  totalWater: number;
  steps: PourStep[];
  temperature?: number; // °C
  grindSize?: GrindSize;
}

// Cumulative water fractions per pour, by method.
const SCHEDULES: Record<string, number[]> = {
  "pour-over": [0.2, 0.6, 0.8, 1.0], // Bloom + 3 pours (4:6-style)
  chemex: [0.2, 0.5, 0.75, 1.0],
  aeropress: [0.3, 1.0],
  "french-press": [0.15, 1.0],
  espresso: [1.0],
  custom: [0.2, 0.6, 1.0],
};

function stepLabel(i: number, count: number, isBloom: boolean): string {
  if (isBloom) {
    return "Bloom";
  }
  if (i === count - 1) {
    return "Final pour";
  }
  return `Pour ${i + 1}`;
}

const REF_FLOW = 9; // g/s — reference pour rate used to lay out the timeline

// Non-water actions layered onto a method: agitation and the wait before serving.
interface ActionGuide {
  label: string;
  instruction: string;
  seconds: number;
}
interface MethodGuidance {
  bloom?: ActionGuide; // swirl/stir + bloom wait, right after the bloom pour
  inlineBloom?: boolean; // keep the bloom as a single pour step, folding the
  // stir guidance into it instead of a separate action step
  finalSwirl?: ActionGuide; // swirl to settle the bed after the final pour
  serve?: ActionGuide; // steep / drawdown wait before drinking
}

const GUIDANCE: Partial<Record<BrewMethod, MethodGuidance>> = {
  "pour-over": {
    bloom: {
      label: "Swirl & bloom",
      instruction:
        "Give the brewer a gentle swirl to saturate every ground, then let the coffee bloom.",
      seconds: 45,
    },
    finalSwirl: {
      label: "Swirl",
      instruction: "Swirl the brewer to flatten the bed for an even drawdown.",
      seconds: 8,
    },
    serve: {
      label: "Drawdown",
      instruction: "Let the water draw down fully, then serve.",
      seconds: 40,
    },
  },
  chemex: {
    bloom: {
      label: "Stir & bloom",
      instruction:
        "Stir the bloom gently to wet all the grounds, then let it bloom.",
      seconds: 45,
    },
    finalSwirl: {
      label: "Swirl",
      instruction: "Swirl the Chemex to level the coffee bed.",
      seconds: 8,
    },
    serve: {
      label: "Drawdown",
      instruction: "Wait for the drawdown to finish, then serve.",
      seconds: 60,
    },
  },
  "french-press": {
    inlineBloom: true,
    bloom: {
      label: "Stir the crust",
      instruction:
        "Stir to break the crust and saturate the grounds, then let it bloom.",
      seconds: 30,
    },
    serve: {
      label: "Steep & press",
      instruction:
        "Let it steep, then slowly press the plunger down and serve.",
      seconds: 210,
    },
  },
  aeropress: {
    bloom: {
      label: "Stir",
      instruction: "Stir 3–4 times to fully saturate the grounds.",
      seconds: 10,
    },
    serve: {
      label: "Steep & press",
      instruction: "Steep briefly, then press down slowly and serve.",
      seconds: 30,
    },
  },
};

interface PourSpec {
  kind: "pour";
  target: number;
  isBloom: boolean;
  label: string;
  restSeconds: number;
  instruction?: string; // inline guidance shown on the pour step (e.g. bloom stir)
}
interface ActionSpec {
  kind: "stir" | "serve";
  label: string;
  instruction: string;
  seconds: number;
}
type StepSpec = PourSpec | ActionSpec;

// Lay a mixed list of pour/action specs onto a single coherent timeline.
function layoutSteps(specs: StepSpec[]): PourStep[] {
  let cumulative = 0;
  let clock = 0;
  return specs.map((spec, i) => {
    if (spec.kind === "pour") {
      const target = spec.target;
      const water = Math.max(0, target - cumulative);
      cumulative = target;
      const pourStart = Math.round(clock);
      const pourDuration = Math.max(3, Math.round(water / REF_FLOW));
      const waitUntil = pourStart + pourDuration;
      clock = waitUntil + spec.restSeconds;
      return {
        index: i,
        kind: "pour",
        label: spec.label,
        target,
        pourStart,
        waitUntil,
        restSeconds: spec.restSeconds,
        actionSeconds: 0,
        instruction: spec.instruction,
        isBloom: spec.isBloom,
      };
    }
    const pourStart = Math.round(clock);
    const waitUntil = pourStart + spec.seconds;
    clock = waitUntil;
    return {
      index: i,
      kind: spec.kind,
      label: spec.label,
      target: cumulative,
      pourStart,
      waitUntil,
      restSeconds: 0,
      actionSeconds: spec.seconds,
      instruction: spec.instruction,
      isBloom: false,
    };
  });
}

export function buildRecipe(
  method: BrewMethod,
  dose: number,
  ratio: number,
): Recipe {
  const preset = getPreset(method);
  const totalWater = Math.round(dose * ratio);
  const fractions = SCHEDULES[method] ?? SCHEDULES.custom;
  const guide = GUIDANCE[method];

  const specs: StepSpec[] = [];
  fractions.forEach((frac, i) => {
    const isBloom = i === 0 && fractions.length > 1;
    const isLast = i === fractions.length - 1;
    const target = Math.round((totalWater * frac) / 5) * 5;
    // Fold the bloom stir into the bloom pour so it stays a regular pour step.
    const inlineBloom = Boolean(isBloom && guide?.bloom && guide.inlineBloom);
    // With guidance, bloom/final waits move into dedicated action steps —
    // unless the bloom is inlined, which keeps its steep window on the pour.
    const restSeconds = guide
      ? inlineBloom
        ? guide.bloom!.seconds
        : isBloom || isLast
          ? 0
          : 30
      : isLast
        ? 0
        : isBloom
          ? 45
          : 30;
    specs.push({
      kind: "pour",
      target,
      isBloom,
      label: stepLabel(i, fractions.length, isBloom),
      restSeconds,
      instruction: inlineBloom ? guide!.bloom!.instruction : undefined,
    });
    if (isBloom && guide?.bloom && !guide.inlineBloom) {
      specs.push({ kind: "stir", ...guide.bloom });
    }
    if (isLast) {
      if (guide?.finalSwirl) {
        specs.push({ kind: "stir", ...guide.finalSwirl });
      }
      if (guide?.serve) {
        specs.push({ kind: "serve", ...guide.serve });
      }
    }
  });

  return {
    method,
    label: preset.label,
    dose,
    totalWater,
    steps: layoutSteps(specs),
  };
}

// Build a runnable Recipe from a user-created SavedRecipe (incremental steps).
export function buildRecipeFromSaved(saved: SavedRecipe): Recipe {
  const totalWater = saved.steps.reduce((sum, s) => sum + s.water, 0);
  let cumulative = 0;
  let clock = 0;

  const steps: PourStep[] = saved.steps.map((s, i) => {
    const isBloom = i === 0 && saved.steps.length > 1;
    cumulative += s.water;
    const pourStart = Math.round(clock);
    const pourDuration = Math.max(3, Math.round(s.water / REF_FLOW));
    const waitUntil = pourStart + pourDuration;
    clock = waitUntil + s.restSeconds;
    return {
      index: i,
      kind: "pour",
      label: s.label || (isBloom ? "Bloom" : `Pour ${i + 1}`),
      target: cumulative,
      pourStart,
      waitUntil,
      restSeconds: s.restSeconds,
      actionSeconds: 0,
      isBloom,
    };
  });

  return {
    method: saved.method,
    label: saved.name,
    dose: saved.dose,
    totalWater,
    steps,
    temperature: saved.temperature,
    grindSize: saved.grindSize,
  };
}

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
