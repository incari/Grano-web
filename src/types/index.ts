export type BrewMethod = 'espresso' | 'pour-over' | 'french-press' | 'aeropress' | 'chemex' | 'custom';

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
  roastLevel: 'light' | 'medium' | 'medium-dark' | 'dark';
  notes: string;
  photoUrl?: string; // base64 or object URL
  addedAt: string; // ISO date
}

export type GrindSize =
  | 'extra-fine'
  | 'fine'
  | 'medium-fine'
  | 'medium'
  | 'medium-coarse'
  | 'coarse';

export interface RecipeStep {
  id: string;
  label: string; // e.g. "Bloom", "Pour 1"
  water: number; // grams added in THIS step (incremental)
  restSeconds: number; // steep/wait after the pour completes
}

export interface SavedRecipe {
  id: string;
  name: string;
  method: BrewMethod;
  dose: number; // grams of coffee
  temperature: number; // °C
  grindSize: GrindSize;
  steps: RecipeStep[];
  createdAt: string; // ISO date
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
  rating: number; // 1-5
  notes: string;
  brewedAt: string; // ISO date
}
