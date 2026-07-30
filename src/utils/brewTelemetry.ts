import type {
  BrewStepActual,
  BrewTracePoint,
  RecipeStep,
  SavedRecipe,
} from "../types";
import type { PourStep, Recipe } from "./recipe";

export interface BrewFinishPayload {
  elapsed: number;
  finalWeight: number;
  trace: BrewTracePoint[];
  stepActuals: BrewStepActual[];
  consistencyScore?: number;
  liveSteps: PourStep[];
}

/** Thin the in-brew history so logs stay small in localStorage. */
export function downsampleTrace(
  points: { t: number; g: number; flow?: number }[],
  maxPoints = 80,
): BrewTracePoint[] {
  if (points.length <= maxPoints) {
    return points.map((p) => ({
      t: Math.round(p.t * 10) / 10,
      g: Math.round(p.g * 10) / 10,
      flow:
        p.flow != null ? Math.round(p.flow * 10) / 10 : undefined,
    }));
  }
  const out: BrewTracePoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const p = points[Math.round(i * step)];
    out.push({
      t: Math.round(p.t * 10) / 10,
      g: Math.round(p.g * 10) / 10,
      flow:
        p.flow != null ? Math.round(p.flow * 10) / 10 : undefined,
    });
  }
  return out;
}

/** Build per-step actuals by sampling the trace near each pour target time. */
export function buildStepActuals(
  steps: PourStep[],
  trace: BrewTracePoint[],
  finalWeight: number,
): BrewStepActual[] {
  return steps
    .filter((s) => (s.kind ?? "pour") === "pour")
    .map((s) => {
      const near = [...trace]
        .reverse()
        .find((p) => p.g >= s.target - 0.5 || p.t >= s.waitUntil);
      const actualG = near
        ? Math.round(near.g)
        : Math.round(Math.min(finalWeight, s.target));
      return {
        label: s.label,
        targetG: s.target,
        actualG,
      };
    });
}

/** Mean absolute error of pour targets vs actual, mapped to 0–100. */
export function scoreConsistency(actuals: BrewStepActual[]): number {
  if (actuals.length === 0) return 100;
  const mae =
    actuals.reduce((s, a) => s + Math.abs(a.actualG - a.targetG), 0) /
    actuals.length;
  return Math.max(0, Math.min(100, Math.round(100 - mae * 4)));
}

/**
 * Turn the actual cumulative pours into a SavedRecipe (incremental waters).
 * Rest times are estimated from gaps in the pour timeline when possible.
 */
export function recipeFromActualBrew(
  recipe: Recipe,
  liveSteps: PourStep[],
  stepActuals: BrewStepActual[],
  name: string,
): SavedRecipe {
  const pours = liveSteps.filter((s) => (s.kind ?? "pour") === "pour");
  const steps: RecipeStep[] = [];
  let prev = 0;
  pours.forEach((s, i) => {
    const actual = stepActuals.find((a) => a.label === s.label);
    const cum = actual?.actualG ?? s.target;
    const water = Math.max(0, Math.round(cum - prev));
    prev = Math.round(cum);
    steps.push({
      id: crypto.randomUUID(),
      label: s.label || (i === 0 ? "Bloom" : `Pour ${i + 1}`),
      water,
      restSeconds: s.restSeconds,
    });
  });
  if (steps.length === 0) {
    steps.push({
      id: crypto.randomUUID(),
      label: "Pour",
      water: Math.round(recipe.totalWater),
      restSeconds: 0,
    });
  }
  return {
    id: crypto.randomUUID(),
    name,
    method: recipe.method,
    dose: recipe.dose,
    temperature: recipe.temperature ?? 94,
    grindSize: recipe.grindSize ?? "medium",
    steps,
    createdAt: new Date().toISOString(),
  };
}
