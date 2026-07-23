import type { BrewMethod, GrindSize, SavedRecipe } from '../types';
import { getPreset } from './presets';

export interface PourStep {
  index: number;
  label: string;
  target: number;      // cumulative water target in grams
  pourStart: number;   // seconds from brew start
  waitUntil: number;   // seconds — end of this step's wait
  restSeconds: number; // rest/steep window after the pour completes
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
  'pour-over':    [0.2, 0.6, 0.8, 1.0],   // Bloom + 3 pours (4:6-style)
  'chemex':       [0.2, 0.5, 0.75, 1.0],
  'aeropress':    [0.3, 1.0],
  'french-press': [0.15, 1.0],
  'espresso':     [1.0],
  'custom':       [0.2, 0.6, 1.0],
};

function stepLabel(i: number, count: number, isBloom: boolean): string {
  if (isBloom) {
    return 'Bloom';
  }
  if (i === count - 1) {
    return 'Final pour';
  }
  return `Pour ${i + 1}`;
}

export function buildRecipe(method: BrewMethod, dose: number, ratio: number): Recipe {
  const preset = getPreset(method);
  const totalWater = Math.round(dose * ratio);
  const fractions = SCHEDULES[method] ?? SCHEDULES.custom;
  const stepSeconds = 45;

  const steps: PourStep[] = fractions.map((frac, i) => {
    const isBloom = i === 0 && fractions.length > 1;
    const isLast = i === fractions.length - 1;
    const pourStart = i * stepSeconds;
    // Rest after the pour: bloom steeps longest, final pour has no wait.
    const restSeconds = isLast ? 0 : isBloom ? 45 : 30;
    return {
      index: i,
      label: stepLabel(i, fractions.length, isBloom),
      target: Math.round((totalWater * frac) / 5) * 5,
      pourStart,
      waitUntil: pourStart + (isBloom ? 45 : 35),
      restSeconds,
      isBloom,
    };
  });

  return { method, label: preset.label, dose, totalWater, steps };
}

const REF_FLOW = 9; // g/s — reference pour rate used to lay out the timeline

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
      label: s.label || (isBloom ? 'Bloom' : `Pour ${i + 1}`),
      target: cumulative,
      pourStart,
      waitUntil,
      restSeconds: s.restSeconds,
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
  return `${m}:${s.toString().padStart(2, '0')}`;
}
