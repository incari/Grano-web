import { useState, useEffect } from "react";
import type { CoffeeBean, BrewLog, SavedRecipe } from "../types";
import {
  DEFAULT_RECIPES,
  ensureDefaultRecipes,
  isDefaultRecipeId,
} from "../utils/defaultRecipes";

const BEANS_KEY = "grano_beans";
const LOGS_KEY = "grano_logs";
const RECIPES_KEY = "grano_recipes";
const RECIPES_SEED_FLAG = "grano_recipes_seeded";

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useBeans() {
  const [beans, setBeans] = useState<CoffeeBean[]>(() =>
    loadFromStorage(BEANS_KEY, []),
  );

  useEffect(() => {
    localStorage.setItem(BEANS_KEY, JSON.stringify(beans));
  }, [beans]);

  function addBean(bean: CoffeeBean) {
    setBeans((prev) => [bean, ...prev]);
  }

  function updateBean(updated: CoffeeBean) {
    setBeans((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  }

  function deleteBean(id: string) {
    setBeans((prev) => prev.filter((b) => b.id !== id));
  }

  return { beans, addBean, updateBean, deleteBean };
}

export function useBrewLogs() {
  const [logs, setLogs] = useState<BrewLog[]>(() =>
    loadFromStorage(LOGS_KEY, []),
  );

  useEffect(() => {
    localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
  }, [logs]);

  function addLog(log: BrewLog) {
    setLogs((prev) => [log, ...prev]);
  }

  function updateLog(id: string, patch: Partial<BrewLog>) {
    setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function deleteLog(id: string) {
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }

  return { logs, addLog, updateLog, deleteLog };
}

export function useRecipes() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>(() => {
    const stored = loadFromStorage<SavedRecipe[]>(RECIPES_KEY, []);
    // Always re-insert any missing factory recipes (e.g. after a past delete).
    // Keep user copies/edits; only fill gaps by seed id.
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(RECIPES_SEED_FLAG, "1");
    }
    return ensureDefaultRecipes(stored.length ? stored : [...DEFAULT_RECIPES]);
  });

  useEffect(() => {
    localStorage.setItem(RECIPES_KEY, JSON.stringify(recipes));
  }, [recipes]);

  function addRecipe(recipe: SavedRecipe) {
    setRecipes((prev) => [recipe, ...prev]);
  }

  function updateRecipe(updated: SavedRecipe) {
    setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function deleteRecipe(id: string) {
    if (isDefaultRecipeId(id)) return;
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  return { recipes, addRecipe, updateRecipe, deleteRecipe };
}
