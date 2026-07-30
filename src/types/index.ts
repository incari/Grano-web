export type BrewMethod =
  | "espresso"
  | "pour-over"
  | "french-press"
  | "aeropress"
  | "chemex"
  | "custom";

export interface BrewPreset {
  method: BrewMethod;
  label: string;
  ratio: number; // coffee:water (e.g. 1:15 = 15)
  defaultDose: number; // grams
  brewTimeSeconds: number;
}

export interface CoffeeBean {
  id: string;
  name: string;
  origin: string;
  roaster: string;
  roastLevel: "light" | "medium" | "medium-dark" | "dark";
  notes: string;
  photoUrl?: string; // base64 or object URL
  addedAt: string; // ISO date
}

export type GrindSize =
  | "extra-fine"
  | "fine"
  | "medium-fine"
  | "medium"
  | "medium-coarse"
  | "coarse";

export interface RecipeStep {
  id: string;
  label: string; // e.g. "Bloom", "Pour 1"
  water: number; // grams added in THIS step (incremental)
  restSeconds: number; // steep/wait after the pour completes
}

/** Espresso machine parameters — replaces pour steps for `method: "espresso"`. */
export interface EspressoSpec {
  yieldG: number; // target beverage weight out
  shotSeconds: number; // target extraction time (from first drop)
  preInfusionSeconds: number; // low-pressure pre-infusion / soak
  pressureBar?: number; // brew pressure at the group
  basketG?: number; // basket capacity in grams
}

export interface SavedRecipe {
  id: string;
  name: string;
  method: BrewMethod;
  dose: number; // grams of coffee
  temperature: number; // °C
  grindSize: GrindSize;
  /** Numeric grinder setting (e.g. Comandante clicks, Niche dial). */
  grindSetting?: string;
  steps: RecipeStep[];
  /** Set on espresso recipes; `steps` stays empty for those. */
  espresso?: EspressoSpec;
  createdAt: string; // ISO date
}

// Detailed tasting review — the five practical home-cupping attributes,
// each scored 1-5. All optional; only set once the user adds details.
export interface BrewReview {
  aroma?: number; // 1-5
  acidity?: number; // 1-5
  body?: number; // 1-5
  sweetness?: number; // 1-5
  aftertaste?: number; // 1-5
  liked?: string; // free text: what stood out / what to change
}

/** One sample of the live weight/flow stream during a brew. */
export interface BrewTracePoint {
  t: number; // seconds from brew start
  g: number; // cumulative grams
  flow?: number; // g/s at this sample
}

/** Per-step planned vs actual at the end of the brew. */
export interface BrewStepActual {
  label: string;
  targetG: number; // planned cumulative target
  actualG: number; // actual cumulative at step end
}

/** What actually happened on an espresso shot. */
export interface EspressoShot {
  targetYieldG: number;
  yieldG: number; // actual beverage weight out
  targetShotSeconds: number;
  shotSeconds: number; // actual extraction time (first drop → stop)
  preInfusionSeconds: number;
  firstDropSeconds?: number; // clock time the first drop landed
  pressureBar?: number;
  peakFlow?: number; // g/s
  channeling?: boolean; // user-flagged uneven extraction
}

export interface BrewLog {
  id: string;
  beanId?: string;
  beanName?: string;
  method: BrewMethod;
  dose: number;
  waterWeight: number;
  ratio: number;
  brewTimeSeconds: number;
  rating: number; // 1-5 overall
  notes: string;
  brewedAt: string; // ISO date
  review?: BrewReview;
  recipeName?: string;
  temperature?: number;
  grindSize?: GrindSize;
  grindSetting?: string;
  /** Downsampled weight/flow trace for charts & compare. */
  trace?: BrewTracePoint[];
  stepActuals?: BrewStepActual[];
  /** 0–100 how closely pours tracked the recipe (when telemetry exists). */
  consistencyScore?: number;
  /** Set on espresso brews. */
  espressoShot?: EspressoShot;
}
