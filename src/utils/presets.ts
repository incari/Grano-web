import type { BrewPreset } from '../types';

export const BREW_PRESETS: BrewPreset[] = [
  { method: 'espresso',     label: 'Espresso',     ratio: 2,  defaultDose: 18, brewTimeSeconds: 30  },
  { method: 'pour-over',    label: 'Pour Over',    ratio: 15, defaultDose: 20, brewTimeSeconds: 210 },
  { method: 'french-press', label: 'French Press', ratio: 15, defaultDose: 30, brewTimeSeconds: 240 },
  { method: 'aeropress',    label: 'AeroPress',    ratio: 12, defaultDose: 17, brewTimeSeconds: 120 },
  { method: 'chemex',       label: 'Chemex',       ratio: 16, defaultDose: 30, brewTimeSeconds: 300 },
  { method: 'custom',       label: 'Custom',       ratio: 15, defaultDose: 20, brewTimeSeconds: 180 },
];

export function getPreset(method: string): BrewPreset {
  return BREW_PRESETS.find(p => p.method === method) ?? BREW_PRESETS[5];
}
