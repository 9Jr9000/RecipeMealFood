// Weekly meal plan: which of your recipes you're making on which day.
// Pure functions over the app state so they can be unit tested.
//
// state.plan = [{ id, date: 'YYYY-MM-DD', recipeId, meal: 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack', updated }]

import { uid, recipeListPlan, addRecipeToGrocery, findPantry } from './sync.js';
import { amountIn, ingredientAmounts, totalAmount } from './ingredients.js';

export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

// Local calendar dates as 'YYYY-MM-DD' (no time zones involved).
export function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
// The first day of the week holding `iso` (0 = Sunday, 1 = Monday).
export function weekStart(iso, firstDay = 0) {
  const d = parseDate(iso);
  return addDays(iso, -((d.getDay() - firstDay + 7) % 7));
}
export function weekDates(start) {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
export function isValidDate(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) && isoDate(parseDate(iso)) === iso;
}

// The meal a recipe most likely is, from its categories.
export function defaultMeal(recipe) {
  const cats = (recipe && recipe.categories) || [];
  return MEALS.find(m => cats.includes(m)) || (cats.includes('Dessert') ? 'Snack' : 'Dinner');
}

export function addToPlan(state, { recipeId, date, meal }) {
  if (!state.plan) state.plan = [];
  const entry = { id: uid(), date, recipeId, meal: MEALS.includes(meal) ? meal : 'Dinner', updated: Date.now() };
  state.plan.push(entry);
  return entry;
}
export function removeFromPlan(state, id) {
  state.plan = (state.plan || []).filter(e => e.id !== id);
}
export function moveInPlan(state, id, { date, meal }) {
  const e = (state.plan || []).find(x => x.id === id);
  if (!e) return null;
  if (date) e.date = date;
  if (meal && MEALS.includes(meal)) e.meal = meal;
  e.updated = Date.now();
  return e;
}
// Entries for a week whose recipe still exists, ordered by day then meal.
export function planForWeek(state, start) {
  const days = new Set(weekDates(start));
  const ids = new Set(state.recipes.map(r => r.id));
  return (state.plan || [])
    .filter(e => days.has(e.date) && ids.has(e.recipeId))
    .sort((a, b) => a.date.localeCompare(b.date) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal));
}
export function clearWeek(state, start) {
  const days = new Set(weekDates(start));
  const before = (state.plan || []).length;
  state.plan = (state.plan || []).filter(e => !days.has(e.date));
  return before - state.plan.length;
}

// Shopping for the whole week. Each recipe is planned once per time it's on the plan (so a
// recipe made twice needs twice the amounts), and pantry amounts are used up as the week goes:
// two recipes each needing 1 cup of flour with 1½ cups on hand still puts ½ cup on the list.
export function weekShopping(state, start) {
  const entries = planForWeek(state, start);
  const counts = new Map();
  for (const e of entries) counts.set(e.recipeId, (counts.get(e.recipeId) || 0) + 1);
  // A copy of the pantry whose amounts go down as recipes use them.
  const sim = { ...state, pantry: state.pantry.map(p => ({ ...p })) };
  const recipes = [];
  for (const [id, factor] of counts) {
    const recipe = state.recipes.find(r => r.id === id);
    const rows = recipeListPlan(sim, recipe, factor);
    for (const row of rows) {
      if (row.header || (row.status !== 'pantry' && row.status !== 'low')) continue;
      const item = findPantry(sim, row.parsed.key);
      const need = totalAmount(ingredientAmounts(row.parsed, factor));
      if (!item || item.qty === null || item.qty === undefined || !need) continue;
      const used = amountIn(need.qty, need.unit || null, item.unit || null);
      if (used !== null) item.qty = Math.max(0, item.qty - used);
    }
    recipes.push({ recipe, factor, rows });
  }
  // One line per ingredient across the week, for the review list.
  const toBuy = [];
  for (const { recipe, rows } of recipes) {
    for (const row of rows) {
      if (row.header || !row.selected) continue;
      let t = toBuy.find(x => x.key === row.parsed.key);
      if (!t) toBuy.push(t = { key: row.parsed.key, name: row.parsed.name, recipes: [], low: false });
      if (!t.recipes.includes(recipe.name)) t.recipes.push(recipe.name);
      if (row.status === 'low') t.low = true;
    }
  }
  const have = new Set();
  for (const { rows } of recipes) for (const row of rows) if (!row.header && (row.status === 'pantry' || row.status === 'bought')) have.add(row.parsed.key);
  for (const t of toBuy) have.delete(t.key);
  return { entries, recipes, toBuy, have: [...have] };
}

// Adds the week's shopping to the grocery list, skipping ingredient keys in `skip`.
export function addWeekToGrocery(state, shopping, skip = new Set()) {
  let added = 0;
  for (const { recipe, rows } of shopping.recipes) {
    const picked = rows.map(r => (r.header ? r : { ...r, selected: r.selected && !skip.has(r.parsed.key) }));
    added += addRecipeToGrocery(state, recipe, picked);
  }
  return added;
}
