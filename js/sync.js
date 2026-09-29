// State operations that keep recipes, the grocery list and the pantry in sync.
// Pure functions over a plain state object so they can be unit tested in Node.
//
// state = {
//   recipes: [{ id, name, ingredients, directions, notes, servings, prepTime, cookTime,
//               source, categories: [], rating, photo, created, updated }],
//   grocery: [{ id, key, name, aisle, checked, note, parts: [{ recipeId, recipeName, qty, unit }] }],
//   pantry:  [{ id, key, name, aisle, added }],
//   aisleOverrides: { [key]: aisle },   // aisles the user picked, remembered per item
// }

import { parseIngredient, parseIngredients, normalizeName, guessAisle, describeAmounts } from './ingredients.js';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyState() {
  return { recipes: [], grocery: [], pantry: [], aisleOverrides: {} };
}

// Descriptors that don't change what you'd buy: "kosher salt" is covered by "salt".
const SOFT_MODIFIERS = new Set([
  'kosher', 'sea', 'table', 'fine', 'coarse', 'flaky', 'unsalted', 'salted', 'low-sodium',
  'reduced-sodium', 'all-purpose', 'granulated', 'organic', 'plain', 'boneless', 'skinless',
  'yellow', 'white', 'pure', 'raw', 'good', 'quality', 'good-quality', 'store-bought',
  'homemade', 'ripe', 'block', 'pure', 'natural',
]);

function stripSoft(key) {
  return key.split(' ').filter(w => !SOFT_MODIFIERS.has(w)).join(' ');
}

// True when two normalized names refer to the same thing to buy.
export function keysMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const sa = stripSoft(a);
  const sb = stripSoft(b);
  return !!sa && sa === sb;
}

export function aisleFor(state, key, name) {
  if (state.aisleOverrides && state.aisleOverrides[key]) return state.aisleOverrides[key];
  const match = Object.keys(state.aisleOverrides || {}).find(k => keysMatch(k, key));
  if (match) return state.aisleOverrides[match];
  return guessAisle(name || key);
}

function displayName(key) {
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
}

export function findPantry(state, key) {
  return state.pantry.find(p => keysMatch(p.key, key)) || null;
}

export function findGrocery(state, key, { includeChecked = false } = {}) {
  return state.grocery.find(g => keysMatch(g.key, key) && (includeChecked || !g.checked)) || null;
}

// What the app knows about an ingredient: already have it, already on the list, or need it.
export function ingredientStatus(state, key) {
  if (!key) return 'need';
  if (findPantry(state, key)) return 'pantry';
  const g = findGrocery(state, key, { includeChecked: true });
  if (g) return g.checked ? 'bought' : 'list';
  return 'need';
}

export function amountText(item) {
  return describeAmounts(item.parts || []);
}

// Adds one amount of an ingredient to the list, merging with an existing unchecked item.
export function addToGrocery(state, { key, name, qty = null, unit = null, recipeId = null, recipeName = null }) {
  if (!key) return null;
  let item = findGrocery(state, key);
  if (!item) {
    item = {
      id: uid(),
      key,
      name: displayName(key) || name,
      aisle: aisleFor(state, key, name),
      checked: false,
      note: '',
      parts: [],
    };
    state.grocery.push(item);
  }
  item.parts.push({ recipeId, recipeName, qty, unit });
  return item;
}

// Adds a typed-in item ("2 lbs chicken thighs", "milk").
export function addManualItem(state, text) {
  const parsed = parseIngredient(text);
  if (!parsed || parsed.header || !parsed.key) return null;
  return addToGrocery(state, { key: parsed.key, name: parsed.name, qty: parsed.qty, unit: parsed.unit });
}

// Ingredients of a recipe, with what the app knows about each one.
// Items in the pantry, and items this recipe already put on the list, are unselected by default.
export function recipeListPlan(state, recipe, factor = 1) {
  return parseIngredients(recipe.ingredients)
    .map((p, index) => {
      if (p.header) return { index, parsed: p, header: true };
      const status = ingredientStatus(state, p.key);
      // On the list only for other recipes -> you still need this recipe's amount too.
      const listed = status === 'list' ? findGrocery(state, p.key) : null;
      const alreadyAdded = !!listed && listed.parts.some(part => part.recipeId === recipe.id);
      return {
        index,
        parsed: p,
        status,
        alreadyAdded,
        qty: p.qty !== null ? p.qty * factor : null,
        selected: status === 'need' || (status === 'list' && !alreadyAdded),
      };
    });
}

export function addRecipeToGrocery(state, recipe, plan) {
  let added = 0;
  for (const row of plan) {
    if (row.header || !row.selected) continue;
    addToGrocery(state, {
      key: row.parsed.key,
      name: row.parsed.name,
      qty: row.qty,
      unit: row.parsed.unit,
      recipeId: recipe.id,
      recipeName: recipe.name,
    });
    added++;
  }
  return added;
}

// Recipes that currently have items on the list.
export function recipesOnList(state) {
  const seen = new Map();
  for (const g of state.grocery) {
    for (const p of g.parts) {
      if (p.recipeId && !seen.has(p.recipeId)) seen.set(p.recipeId, p.recipeName);
    }
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}

export function removeRecipeFromGrocery(state, recipeId) {
  for (const g of state.grocery) {
    if (g.checked) continue;
    g.parts = g.parts.filter(p => p.recipeId !== recipeId);
  }
  state.grocery = state.grocery.filter(g => g.checked || g.parts.length);
}

export function setChecked(state, itemId, checked) {
  const item = state.grocery.find(g => g.id === itemId);
  if (item) item.checked = checked;
  return item;
}

export function addToPantry(state, name, aisle) {
  const key = normalizeName(name);
  if (!key) return null;
  const existing = findPantry(state, key);
  if (existing) return existing;
  const item = { id: uid(), key, name: displayName(key), aisle: aisle || aisleFor(state, key, name), added: Date.now() };
  state.pantry.push(item);
  return item;
}

// Checked-off groceries were bought, so they move into the pantry.
export function clearChecked(state) {
  const bought = state.grocery.filter(g => g.checked);
  for (const g of bought) addToPantry(state, g.name, g.aisle);
  state.grocery = state.grocery.filter(g => !g.checked);
  return bought.length;
}

export function removeFromPantry(state, id) {
  const item = state.pantry.find(p => p.id === id);
  state.pantry = state.pantry.filter(p => p.id !== id);
  return item;
}

// Grocery items that are also in the pantry (e.g. added to the pantry after the list was made).
export function groceryInPantry(state) {
  return state.grocery.filter(g => !g.checked && findPantry(state, g.key));
}

export function setAisle(state, key, aisle) {
  state.aisleOverrides[key] = aisle;
  for (const g of state.grocery) if (keysMatch(g.key, key)) g.aisle = aisle;
  for (const p of state.pantry) if (keysMatch(p.key, key)) p.aisle = aisle;
}

export function renameGroceryItem(state, itemId, newName) {
  const item = state.grocery.find(g => g.id === itemId);
  const key = normalizeName(newName);
  if (!item || !key) return item;
  item.key = key;
  item.name = newName.trim();
  item.aisle = aisleFor(state, key, newName);
  return item;
}

export function saveRecipe(state, recipe) {
  const now = Date.now();
  const existing = state.recipes.find(r => r.id === recipe.id);
  if (existing) {
    Object.assign(existing, recipe, { updated: now });
    // Keep the recipe name shown on the grocery list up to date.
    for (const g of state.grocery) {
      for (const p of g.parts) if (p.recipeId === recipe.id) p.recipeName = existing.name;
    }
    return existing;
  }
  const created = { categories: [], rating: 0, photo: null, ...recipe, id: recipe.id || uid(), created: now, updated: now };
  state.recipes.push(created);
  return created;
}

export function deleteRecipe(state, recipeId) {
  state.recipes = state.recipes.filter(r => r.id !== recipeId);
  removeRecipeFromGrocery(state, recipeId);
  // Checked items keep their amounts but no longer point at a deleted recipe.
  for (const g of state.grocery) {
    for (const p of g.parts) if (p.recipeId === recipeId) p.recipeId = null;
  }
}

export function allCategories(state) {
  const set = new Set();
  for (const r of state.recipes) for (const c of r.categories || []) if (c) set.add(c);
  return [...set].sort((a, b) => a.localeCompare(b));
}
