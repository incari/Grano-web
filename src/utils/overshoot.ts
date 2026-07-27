import type { PourStep } from "./recipe";

export interface OvershootResult {
  steps: PourStep[];
  /** Grams over the completed step's planned target (> 0 when adjusted). */
  overshootG: number;
  /** True when later pour targets were rewritten. */
  didAdjust: boolean;
}

/**
 * When a pour overshoots its cumulative target, keep final batch size and
 * redistribute the remaining water across later pour steps (by original share).
 */
export function redistributeOvershoot(
  steps: PourStep[],
  completedIndex: number,
  actualGrams: number,
  totalWater: number,
): OvershootResult {
  const completed = steps[completedIndex];
  if (!completed || (completed.kind ?? "pour") !== "pour") {
    return { steps, overshootG: 0, didAdjust: false };
  }

  const actual = Math.max(0, actualGrams);
  const overshootG = actual - completed.target;
  if (overshootG <= 0.5) {
    return { steps, overshootG: 0, didAdjust: false };
  }

  const next = steps.map((s) => ({ ...s }));
  const base = Math.round(actual);
  next[completedIndex] = { ...next[completedIndex], target: base };

  const remainingIdx = steps
    .map((s, i) => ({ s, i }))
    .filter(
      ({ s, i }) => i > completedIndex && (s.kind ?? "pour") === "pour",
    )
    .map(({ i }) => i);

  if (remainingIdx.length === 0) {
    return { steps: next, overshootG, didAdjust: true };
  }

  const originalIncrements = remainingIdx.map((i, k) => {
    const prevIdx = k === 0 ? completedIndex : remainingIdx[k - 1];
    return Math.max(0, steps[i].target - steps[prevIdx].target);
  });
  const originalSum = originalIncrements.reduce((a, b) => a + b, 0);
  const newRemaining = Math.max(0, totalWater - base);

  let cumulative = base;
  remainingIdx.forEach((i, k) => {
    const isLast = k === remainingIdx.length - 1;
    if (isLast) {
      next[i] = { ...next[i], target: totalWater };
      cumulative = totalWater;
      return;
    }
    const share =
      originalSum > 0
        ? originalIncrements[k] / originalSum
        : 1 / remainingIdx.length;
    const inc = Math.round(newRemaining * share);
    cumulative += inc;
    // Keep monotonic and leave room for the final pour
    const capped = Math.min(cumulative, totalWater - (remainingIdx.length - 1 - k));
    next[i] = { ...next[i], target: Math.max(base, capped) };
    cumulative = next[i].target;
  });

  // Action steps (stir/serve) mirror the latest pour target behind them
  for (let i = 0; i < next.length; i++) {
    if ((next[i].kind ?? "pour") === "pour") continue;
    let prevPour = 0;
    for (let j = i - 1; j >= 0; j--) {
      if ((next[j].kind ?? "pour") === "pour") {
        prevPour = next[j].target;
        break;
      }
    }
    next[i] = { ...next[i], target: prevPour };
  }

  return { steps: next, overshootG, didAdjust: true };
}
