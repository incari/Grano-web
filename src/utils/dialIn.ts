import type { BrewReview } from "../types";

export interface DialInTip {
  id: string;
  title: string;
  detail: string;
}

const LOW = 2;
const HIGH = 4;

/** Rule-based next-brew coaching from cupping scores (1–5, higher = better). */
export function buildDialInTips(
  review: BrewReview,
  overallRating = 0,
): DialInTip[] {
  const { acidity, body, sweetness, aftertaste, aroma } = review;
  const tips: DialInTip[] = [];
  const add = (id: string, title: string, detail: string) => {
    if (!tips.some((t) => t.id === id)) tips.push({ id, title, detail });
  };

  const sourUnder =
    acidity != null &&
    acidity >= HIGH &&
    sweetness != null &&
    sweetness <= LOW;
  const flatUnder =
    (sweetness != null && sweetness <= LOW) ||
    (body != null && body <= LOW) ||
    (acidity != null && acidity <= LOW);
  const harshOver =
    aftertaste != null &&
    aftertaste <= LOW &&
    body != null &&
    body >= HIGH;
  const hollow =
    body != null &&
    body <= LOW &&
    sweetness != null &&
    sweetness <= LOW;

  if (sourUnder) {
    add(
      "sour-under",
      "Tastes sharp / under-developed",
      "Grind one notch finer, raise water ~2 °C, or lengthen the bloom by 10–15 s.",
    );
  } else if (hollow) {
    add(
      "hollow-under",
      "Thin body, low sweetness",
      "Grind finer or slow your pours (aim ~6–8 g/s) to raise contact time and extraction.",
    );
  } else if (flatUnder && !harshOver) {
    add(
      "flat-under",
      "Under-extracted",
      "Try a finer grind, hotter water, or a slightly longer total brew time.",
    );
  }

  if (harshOver) {
    add(
      "harsh-over",
      "Heavy body, rough finish",
      "Grind coarser, drop water ~2 °C, or pour a bit faster to shorten extraction.",
    );
  } else if (
    aftertaste != null &&
    aftertaste <= LOW &&
    sweetness != null &&
    sweetness >= 3
  ) {
    add(
      "rough-finish",
      "Finish falls off or turns harsh",
      "Coarsen slightly or reduce agitation on later pours; keep the bed flat.",
    );
  }

  if (aroma != null && aroma <= LOW && !sourUnder) {
    add(
      "aroma",
      "Quiet aroma",
      "Fresh beans help most. Also try a full bloom (~2× dose) and a gentle swirl.",
    );
  }

  if (
    overallRating > 0 &&
    overallRating <= LOW &&
    tips.length === 0
  ) {
    add(
      "low-overall",
      "Room to improve",
      "Change one variable next time — usually grind size first — and keep dose, ratio, and recipe fixed.",
    );
  }

  if (
    overallRating >= HIGH &&
    tips.length === 0 &&
    (sweetness ?? 0) >= HIGH
  ) {
    add(
      "keep",
      "Dialed in — lock it in",
      "Log grind clicks, dose, and temp so you can repeat this cup with the same bean.",
    );
  }

  return tips.slice(0, 3);
}
