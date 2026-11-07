// "What can I make?" — matches YOUR saved recipes against your pantry. Meals that share
// ingredients are grouped in js/lowwaste.js. Pure functions, unit tested.

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
