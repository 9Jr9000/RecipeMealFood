// Approximate calories for recipe cards, worked out in the background from the USDA data and
// remembered on this device (keyed by the ingredients and servings, so edits recalculate).

import { recipeCalories } from './health.js';
import { ensureFoods } from './health-ui.js';

const KEY = 'cal:v1';
let cache = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
})();
const matches = new Map(); // ingredient key -> food, shared across recipes
let running = null;

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
const keyFor = r => hash(`${r.ingredients || ''}\u0001${r.servings || ''}`);

// { kcal (per serving), total, protein, carbs, fat, servings, ok } or undefined when not worked out yet.
export function caloriesFor(recipe) {
  return cache[keyFor(recipe)];
}

function save(recipes) {
  // Forget recipes that were deleted or edited.
  const live = new Set(recipes.map(keyFor));
  for (const k of Object.keys(cache)) if (!live.has(k)) delete cache[k];
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* full or private mode */ }
}

// Works out calories for recipes that don't have them yet, a few at a time so the page stays
// responsive. `onUpdate` is called after each batch.
export function computeCalories(recipes, onUpdate) {
  if (running) return running;
  const todo = recipes.filter(r => !(keyFor(r) in cache) && String(r.ingredients || '').trim());
  if (!todo.length) return Promise.resolve(false);
  running = (async () => {
    const foods = await ensureFoods();
    for (let i = 0; i < todo.length; i += 12) {
      for (const r of todo.slice(i, i + 12)) {
        const c = recipeCalories(foods, r, matches);
        const round = v => Math.round(v);
        cache[keyFor(r)] = {
          kcal: round(c.perServing.kcal), total: round(c.total.kcal), protein: round(c.perServing.protein),
          carbs: round(c.perServing.carbs), fat: round(c.perServing.fat), servings: c.servings, ok: c.reliable,
          counted: c.counted, lines: c.lines,
        };
      }
      if (onUpdate) onUpdate();
      await new Promise(res => setTimeout(res, 0));
    }
    save(recipes);
    return true;
  })().catch(err => { console.warn('Calories unavailable', err); return false; }).finally(() => { running = null; });
  return running;
}

// "~575 cal" (per serving) or "~2,300 cal total" when the recipe has no servings.
export function calorieLabel(c) {
  if (!c || !c.ok || !(c.kcal > 0)) return '';
  return c.servings ? `~${c.kcal.toLocaleString()} cal` : `~${c.total.toLocaleString()} cal total`;
}
