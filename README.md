# ☕ Grano

Gram-precise, guided pour-over brewing — a mobile-first web app for dialing in and repeating great coffee.

Grano walks you through each pour in real time with a live water gauge, lets you build and save your own recipes, keeps a library of your beans, and logs every brew so you can taste the difference between shots.

## Features

- **Guided pour** — a live radial gauge scaled to the whole batch, with tick marks at every pour's stop point, a real-time flow readout, per-step targets, tolerance feedback, haptics, and a step beep so you can keep your eyes on the kettle.
- **Accumulation chart** — a smooth cumulative water-vs-time curve comparing your actual extraction against the ideal recipe.
- **Recipes** — create, edit, and remove your own recipes: number of pour steps, water per step, rest times, coffee dose, temperature, and grind size. Brew any recipe with a single tap.
- **Famous presets** — ships with well-known pour-over recipes (Hoffmann V60, Tetsu Kasuya 4:6, Scott Rao V60, Kalita Wave, Hoffmann Chemex), seeded on first run and fully editable.
- **Bean library** — save your coffees with origin, roaster, roast level, tasting notes, and a photo.
- **Brew log** — every brew is recorded with dose, water, ratio, time, and rating.
- **Light & dark mode** — follows your system theme.

## Tech stack

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) for dev/build
- [React Router](https://reactrouter.com/) for navigation
- [Sass (CSS Modules)](https://sass-lang.com/) for styling, driven by CSS custom properties for theming
- [lucide-react](https://lucide.dev/) for icons
- [Oxlint](https://oxc.rs/) for linting
- State is kept in simple React hooks and persisted to `localStorage` (no backend)

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173).

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the dev server with HMR        |
| `npm run build`   | Type-check and build for production  |
| `npm run preview` | Preview the production build locally |
| `npm run lint`    | Run Oxlint                           |

## Project structure

```
src/
  components/        Reusable UI (BottomNav, WaterGauge, AccumulationChart, icons)
  pages/
    Brew/            Brew setup + guided pour screen
    Recipes/         Recipe list and add/edit form
    Beans/           Bean library
    Log/             Brew history
  store/             localStorage-backed hooks (useBeans, useRecipes, useBrewLogs)
  utils/             Recipe building, presets, default recipes, haptics, sound
  types/             Shared TypeScript types
  index.css          Global theme variables (light + dark)
```

## Data & privacy

All data — recipes, beans, and logs — lives in your browser's `localStorage`. Nothing is sent to a server. Clearing site data resets the app (and re-seeds the default recipes).
