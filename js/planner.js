// "What can I make?" — matches YOUR saved recipes against your pantry, and finds recipes that
// share ingredients so a few meals can be shopped for together. Pure functions, unit tested.

import { parseIngredients, ingredientAmounts, totalAmount } from './ingredients.js';
import { ingredientStatus, keysMatch } from './sync.js';

// Basics most kitchens have; optionally not counted as "missing".
export const STAPLES = ['salt', 'kosher salt', 'sea salt', 'black pepper', 'pepper', 'water', 'ice', 'cooking spray', 'vegetable oil', 'olive oil', 'canola oil', 'oil'];
export function isStaple(key) {
  return STAPLES.some(s => keysMatch(s, key));
}

// The distinct ingredients of a recipe: [{ key, name, need }]
export function recipeItems(recipe) {
  const out = [];
  for (const p of parseIngredients(recipe.ingredients || '')) {
    if (p.header || !p.key) continue;
    if (out.some(x => keysMatch(x.key, p.key))) continue;
    const amounts = ingredientAmounts(p);
    out.push({ key: p.key, name: p.key.charAt(0).toUpperCase() + p.key.slice(1), need: totalAmount(amounts) || amounts[0] || null });
  }
  return out;
}

// How much of a recipe you can make from what you have.
export function pantryMatch(state, recipe, { assumeStaples = true } = {}) {
  const have = [];
  const low = [];
  const onList = [];
  const missing = [];
  const staples = [];
  for (const item of recipeItems(recipe)) {
    const status = ingredientStatus(state, item.key, item.need);
    if (status === 'pantry' || status === 'bought') have.push(item.name);
    else if (assumeStaples && isStaple(item.key)) staples.push(item.name);
    else if (status === 'low') low.push(item.name);
    else if (status === 'list') onList.push(item.name);
    else missing.push(item.name);
  }
  const total = have.length + low.length + onList.length + missing.length;
  const toBuy = low.length + onList.length + missing.length;
  return { recipe, have, low, onList, missing, staples, total, toBuy, coverage: total ? have.length / total : 0 };
}

// Your recipes, best match first: fewest things to buy, then most of it on hand.
export function rankByPantry(state, opts = {}) {
  return state.recipes
    .map(r => pantryMatch(state, r, opts))
    .filter(m => m.total > 0)
    .sort((a, b) => a.toBuy - b.toBuy || b.coverage - a.coverage || b.have.length - a.have.length || a.recipe.name.localeCompare(b.recipe.name));
}

// Ingredients two recipes have in common (basics like salt and oil don't count).
export function sharedIngredients(a, b) {
  const itemsB = recipeItems(b).filter(i => !isStaple(i.key));
  return recipeItems(a).filter(i => !isStaple(i.key) && itemsB.some(j => keysMatch(i.key, j.key))).map(i => i.name);
}

// Recipe pairs that share the most ingredients.
export function bestPairs(state, { min = 2, limit = 12 } = {}) {
  const pairs = [];
  const rs = state.recipes;
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const shared = sharedIngredients(rs[i], rs[j]);
      if (shared.length >= min) pairs.push({ a: rs[i], b: rs[j], shared });
    }
  }
  pairs.sort((x, y) => y.shared.length - x.shared.length || x.a.name.localeCompare(y.a.name));
  return pairs.slice(0, limit);
}

// Picks `size` recipes that reuse each other's ingredients and what's in the pantry, so there's
// less to buy. Starts from `startId` (or the recipe you can most nearly make) and adds, one at a
// time, the recipe that shares the most and needs the fewest new purchases.
export function buildPlan(state, { startId = '', size = 3, assumeStaples = true } = {}) {
  const ranked = rankByPantry(state, { assumeStaples });
  if (!ranked.length) return null;
  const byId = new Map(ranked.map(m => [m.recipe.id, m]));
  const first = byId.get(startId) || ranked[0];
  const plan = [first];
  const keysIn = m => recipeItems(m.recipe).filter(i => !(assumeStaples && isStaple(i.key))).map(i => i.key);
  let pool = keysIn(first);
  while (plan.length < size) {
    let best = null;
    for (const m of ranked) {
      if (plan.includes(m)) continue;
      const keys = keysIn(m);
      const shared = keys.filter(k => pool.some(p => keysMatch(p, k))).length;
      const newBuys = [...m.missing, ...m.low, ...m.onList].filter(n => !pool.some(p => keysMatch(p, n.toLowerCase()))).length;
      const score = shared * 3 + m.have.length - newBuys * 2;
      if (!best || score > best.score) best = { m, score };
    }
    if (!best) break;
    plan.push(best.m);
    pool = [...pool, ...keysIn(best.m)];
  }

  // Combined shopping list and the ingredients used by more than one meal.
  const toBuy = [];
  const usage = [];
  for (const m of plan) {
    for (const name of [...m.missing, ...m.low, ...m.onList]) {
      const hit = toBuy.find(t => keysMatch(t.name.toLowerCase(), name.toLowerCase()));
      if (hit) { if (!hit.recipes.includes(m.recipe.name)) hit.recipes.push(m.recipe.name); } else toBuy.push({ name, recipes: [m.recipe.name], onList: m.onList.includes(name) });
    }
    for (const i of recipeItems(m.recipe)) {
      if (assumeStaples && isStaple(i.key)) continue;
      const hit = usage.find(u => keysMatch(u.key, i.key));
      if (hit) { if (!hit.recipes.includes(m.recipe.name)) hit.recipes.push(m.recipe.name); } else usage.push({ key: i.key, name: i.name, recipes: [m.recipe.name] });
    }
  }
  const shared = usage.filter(u => u.recipes.length > 1).sort((a, b) => b.recipes.length - a.recipes.length);
  return { plan, toBuy, shared };
}
