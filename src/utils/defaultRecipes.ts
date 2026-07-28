import type { SavedRecipe } from '../types';

// Famous, widely-referenced pour-over recipes, seeded on first run.
// Water values are INCREMENTAL per step (grams added in that pour).
// IDs always start with `seed-` so they can be restored and never deleted.
const SEED_DATE = '2024-01-01T00:00:00.000Z';

export function isDefaultRecipeId(id: string): boolean {
  return id.startsWith('seed-');
}

/** Re-add any missing factory recipes; keep user edits of existing seeds. */
export function ensureDefaultRecipes(list: SavedRecipe[]): SavedRecipe[] {
  const ids = new Set(list.map((r) => r.id));
  const missing = DEFAULT_RECIPES.filter((r) => !ids.has(r.id));
  if (missing.length === 0) return list;
  // Defaults first so they stay visible at the top of the library.
  return [...missing, ...list];
}

export const DEFAULT_RECIPES: SavedRecipe[] = [
  {
    id: 'seed-hoffmann-v60',
    name: 'Hoffmann V60',
    method: 'pour-over',
    dose: 15,
    temperature: 96,
    grindSize: 'medium-fine',
    createdAt: SEED_DATE,
    steps: [
      { id: 'seed-hoffmann-v60-1', label: 'Bloom', water: 50, restSeconds: 45 },
      { id: 'seed-hoffmann-v60-2', label: 'Pour to 60%', water: 100, restSeconds: 10 },
      { id: 'seed-hoffmann-v60-3', label: 'Final pour', water: 100, restSeconds: 0 },
    ],
  },
  {
    id: 'seed-kasuya-46',
    name: 'Tetsu Kasuya 4:6',
    method: 'pour-over',
    dose: 20,
    temperature: 92,
    grindSize: 'medium-coarse',
    createdAt: SEED_DATE,
    steps: [
      { id: 'seed-kasuya-46-1', label: 'Pour 1 (sweetness)', water: 60, restSeconds: 45 },
      { id: 'seed-kasuya-46-2', label: 'Pour 2 (acidity)', water: 60, restSeconds: 45 },
      { id: 'seed-kasuya-46-3', label: 'Pour 3 (strength)', water: 60, restSeconds: 45 },
      { id: 'seed-kasuya-46-4', label: 'Pour 4 (strength)', water: 60, restSeconds: 45 },
      { id: 'seed-kasuya-46-5', label: 'Pour 5 (strength)', water: 60, restSeconds: 0 },
    ],
  },
  {
    id: 'seed-rao-v60',
    name: 'Scott Rao V60',
    method: 'pour-over',
    dose: 20,
    temperature: 93,
    grindSize: 'medium-fine',
    createdAt: SEED_DATE,
    steps: [
      { id: 'seed-rao-v60-1', label: 'Bloom + swirl', water: 60, restSeconds: 45 },
      { id: 'seed-rao-v60-2', label: 'Continuous pour', water: 260, restSeconds: 0 },
    ],
  },
  {
    id: 'seed-kalita-wave',
    name: 'Kalita Wave 185',
    method: 'pour-over',
    dose: 22,
    temperature: 93,
    grindSize: 'medium',
    createdAt: SEED_DATE,
    steps: [
      { id: 'seed-kalita-wave-1', label: 'Bloom', water: 50, restSeconds: 30 },
      { id: 'seed-kalita-wave-2', label: 'Pulse 1', water: 100, restSeconds: 15 },
      { id: 'seed-kalita-wave-3', label: 'Pulse 2', water: 100, restSeconds: 15 },
      { id: 'seed-kalita-wave-4', label: 'Pulse 3', water: 100, restSeconds: 0 },
    ],
  },
  {
    id: 'seed-espresso-classic',
    name: 'Classic 1:2 Shot',
    method: 'espresso',
    dose: 18,
    temperature: 93,
    grindSize: 'extra-fine',
    createdAt: SEED_DATE,
    steps: [],
    espresso: {
      yieldG: 36,
      shotSeconds: 28,
      preInfusionSeconds: 5,
      pressureBar: 9,
      basketG: 18,
    },
  },
  {
    id: 'seed-espresso-ristretto',
    name: 'Ristretto 1:1.5',
    method: 'espresso',
    dose: 18,
    temperature: 94,
    grindSize: 'extra-fine',
    createdAt: SEED_DATE,
    steps: [],
    espresso: {
      yieldG: 27,
      shotSeconds: 26,
      preInfusionSeconds: 6,
      pressureBar: 9,
      basketG: 18,
    },
  },
  {
    id: 'seed-espresso-lungo',
    name: 'Lungo 1:3',
    method: 'espresso',
    dose: 18,
    temperature: 92,
    grindSize: 'fine',
    createdAt: SEED_DATE,
    steps: [],
    espresso: {
      yieldG: 54,
      shotSeconds: 35,
      preInfusionSeconds: 4,
      pressureBar: 8,
      basketG: 18,
    },
  },
  {
    id: 'seed-hoffmann-chemex',
    name: 'Hoffmann Chemex',
    method: 'chemex',
    dose: 30,
    temperature: 95,
    grindSize: 'medium-coarse',
    createdAt: SEED_DATE,
    steps: [
      { id: 'seed-hoffmann-chemex-1', label: 'Bloom', water: 100, restSeconds: 45 },
      { id: 'seed-hoffmann-chemex-2', label: 'Pour to 60%', water: 200, restSeconds: 15 },
      { id: 'seed-hoffmann-chemex-3', label: 'Final pour', water: 200, restSeconds: 0 },
    ],
  },
];
