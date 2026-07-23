import type { SavedRecipe } from '../types';

// Famous, widely-referenced pour-over recipes, seeded on first run.
// Water values are INCREMENTAL per step (grams added in that pour).
const SEED_DATE = '2024-01-01T00:00:00.000Z';

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
