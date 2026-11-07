// Low-waste meal groups: picks several of YOUR recipes that use up what you buy.
//
// Shared names alone aren't enough: a recipe needing ¼ cup of cilantro still leaves most of the
// bunch to rot unless another meal uses it. So ingredients are compared by amount against typical
// store sizes (1 lb of ground beef, a bunch of cilantro, a 16 oz tub of sour cream...), and
// leftovers are weighted by how fast they spoil. Pure functions, unit tested.

import { recipeItems, isStaple } from './planner.js';
import { keysMatch, findPantry } from './sync.js';
import { amountIn, guessAisle, formatAmount } from './ingredients.js';

// Typical store sizes. Each size list holds equivalent ways to measure one package.
const PACKS = [
  [['ground beef', 'ground turkey', 'ground pork', 'ground chicken', 'ground lamb', 'ground sausage'], [{ qty: 1, unit: 'lb' }], '1 lb pack'],
  [['bacon'], [{ qty: 12, unit: 'oz' }, { qty: 12, unit: 'slice' }], '12 oz pack'],
  [['chicken thigh', 'chicken breast', 'chicken tender', 'chicken drumstick', 'chicken wing'], [{ qty: 1.5, unit: 'lb' }], '1½ lb pack'],
  [['sausage', 'italian sausage', 'chorizo'], [{ qty: 1, unit: 'lb' }], '1 lb pack'],
  [['sour cream'], [{ qty: 2, unit: 'cup' }, { qty: 16, unit: 'oz' }], '16 oz tub'],
  [['heavy cream', 'heavy whipping cream', 'whipping cream'], [{ qty: 2, unit: 'cup' }], '1 pint'],
  [['half-and-half', 'half and half'], [{ qty: 2, unit: 'cup' }], '1 pint'],
  [['buttermilk'], [{ qty: 4, unit: 'cup' }], '1 quart'],
  [['milk', 'whole milk'], [{ qty: 8, unit: 'cup' }], '½ gallon'],
  [['cream cheese'], [{ qty: 8, unit: 'oz' }, { qty: 1, unit: 'cup' }], '8 oz block'],
  [['ricotta'], [{ qty: 15, unit: 'oz' }, { qty: 2, unit: 'cup' }], '15 oz tub'],
  [['mozzarella', 'cheddar', 'monterey jack', 'pepper jack', 'mexican cheese', 'colby jack', 'mexican blend cheese'], [{ qty: 2, unit: 'cup' }, { qty: 8, unit: 'oz' }], '8 oz bag'],
  [['feta'], [{ qty: 6, unit: 'oz' }, { qty: 1, unit: 'cup' }], '6 oz tub'],
  [['yogurt', 'greek yogurt'], [{ qty: 4, unit: 'cup' }], '32 oz tub'],
  [['cilantro', 'parsley'], [{ qty: 1, unit: 'bunch' }, { qty: 1, unit: 'cup' }], '1 bunch'],
  [['basil', 'basil leaf', 'mint', 'dill', 'mint leaf'], [{ qty: 1, unit: 'cup' }, { qty: 1, unit: 'bunch' }], '1 bunch'],
  [['green onion', 'scallion'], [{ qty: 6, unit: null }, { qty: 1, unit: 'bunch' }], '1 bunch (6)'],
  [['celery'], [{ qty: 8, unit: 'stalk' }, { qty: 1, unit: 'bunch' }], '1 bunch'],
  [['spinach', 'baby spinach', 'arugula', 'spring mix', 'kale', 'mixed green'], [{ qty: 6, unit: 'cup' }, { qty: 5, unit: 'oz' }], '5 oz bag'],
  [['mushroom', 'cremini mushroom', 'baby bella mushroom'], [{ qty: 8, unit: 'oz' }], '8 oz pack'],
  [['tortilla', 'flour tortilla', 'corn tortilla'], [{ qty: 10, unit: null }], '10-pack'],
  [['hamburger bun', 'hot dog bun', 'bun', 'slider bun', 'brioche bun'], [{ qty: 8, unit: null }], '8-pack'],
  [['egg'], [{ qty: 12, unit: null }], 'dozen'],
  [['butter', 'unsalted butter', 'salted butter'], [{ qty: 4, unit: 'stick' }, { qty: 2, unit: 'cup' }, { qty: 1, unit: 'lb' }], '1 lb (4 sticks)'],
  [['chicken broth', 'beef broth', 'vegetable broth', 'chicken stock', 'beef stock', 'vegetable stock', 'broth', 'stock'], [{ qty: 4, unit: 'cup' }], '32 oz carton'],
  [['coconut milk'], [{ qty: 1.75, unit: 'cup' }, { qty: 1, unit: 'can' }], '13.5 oz can'],
  [['tomato paste'], [{ qty: 10, unit: 'tbsp' }, { qty: 1, unit: 'can' }], '6 oz can'],
  [['bread', 'sandwich bread'], [{ qty: 20, unit: 'slice' }], 'loaf'],
  [['salsa'], [{ qty: 2, unit: 'cup' }], '16 oz jar'],
  [['pesto'], [{ qty: 0.75, unit: 'cup' }], 'jar'],
];
// Opened shelf-stable packages that spoil within days.
const OPENED = /\b(broth|stock|coconut milk|tomato paste|salsa|pesto|marinara|tomato sauce|enchilada sauce)\b/;
// Fresh foods that keep for weeks.
const KEEPS = /\b(onion|garlic|shallot|potato|sweet potato|yam|carrot|cabbage|squash|lemon|lime|orange|apple|egg|parmesan|butter|ginger)\b/;
const PERISHABLE_AISLES = new Set(['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery & Bread']);

function packFor(key) {
  let best = null;
  for (const [words, sizes, label] of PACKS) {
    for (const w of words) {
      if (key === w || key.endsWith(` ${w}`) || keysMatch(key, w)) {
        if (!best || w.length > best.word.length) best = { word: w, sizes, label };
      }
    }
  }
  return best;
}

// How much a leftover matters: 1 = spoils fast (meat, herbs, dairy), 0 = keeps (flour, rice).
export function spoilWeight(key) {
  if (isStaple(key)) return 0;
  if (OPENED.test(key)) return 0.7;
  if (!PERISHABLE_AISLES.has(guessAisle(key))) return 0;
  if (KEEPS.test(key)) return 0.3;
  return 1;
}

// One package size that every amount converts to, or null.
function commonSize(sizes, amounts) {
  for (const s of sizes) {
    if (amounts.every(a => amountIn(a.qty, a.unit || null, s.unit) !== null)) return s;
  }
  return null;
}

const fmt = (qty, unit) => formatAmount(qty, null, unit);

// Everything a group of recipes needs, compared with the pantry and store sizes.
// Returns [{ key, name, recipes, weight, status: 'have' | 'buy', fromPantry, need, buy, pack, leftover, waste }]
export function groupItems(state, recipes, itemsOf = recipeItems) {
  const byKey = [];
  for (const r of recipes) {
    for (const i of itemsOf(r)) {
      if (isStaple(i.key)) continue;
      let hit = byKey.find(x => keysMatch(x.key, i.key));
      if (!hit) byKey.push(hit = { key: i.key, name: i.name, recipes: [], amounts: [] });
      if (!hit.recipes.includes(r.name)) hit.recipes.push(r.name);
      hit.amounts.push(i.need && i.need.qty !== null && i.need.qty !== undefined ? i.need : null);
    }
  }
  return byKey.map(item => {
    const weight = spoilWeight(item.key);
    const known = item.amounts.every(Boolean);
    const pantry = findPantry(state, item.key);
    const out = { key: item.key, name: item.name, recipes: item.recipes, weight, status: 'buy', fromPantry: false, need: null, buy: null, pack: null, leftover: null, waste: 0 };
    if (pantry && (pantry.qty === null || pantry.qty === undefined)) {
      // In the pantry with no amount: you have it, and using it up is a plus.
      return { ...out, status: 'have', fromPantry: true };
    }
    const packInfo = packFor(item.key);
    // Count items without a store size ("1 onion", "½ avocado") come one at a time.
    const sizes = packInfo ? packInfo.sizes : [{ qty: 1, unit: null }];
    const size = known ? commonSize(sizes, item.amounts) : null;
    if (!size) {
      if (pantry) return { ...out, status: 'have', fromPantry: true };
      // Unknown amounts: a fresh item used by one meal is the likeliest to go to waste.
      return { ...out, waste: weight * (item.recipes.length > 1 ? 0.15 : 0.4) };
    }
    const need = item.amounts.reduce((sum, a) => sum + amountIn(a.qty, a.unit || null, size.unit), 0);
    const have = pantry ? amountIn(pantry.qty, pantry.unit || null, size.unit) || 0 : 0;
    const buy = Math.max(0, need - have);
    out.need = { qty: need, unit: size.unit };
    if (pantry && have > 0) out.fromPantry = true;
    if (buy <= need * 0.02) return { ...out, status: 'have' };
    const packs = Math.max(1, Math.ceil(buy / size.qty - 0.02));
    const left = packs * size.qty - buy;
    out.buy = { qty: buy, unit: size.unit };
    out.pack = { label: packInfo ? packInfo.label : '', count: packs, qty: size.qty, unit: size.unit };
    out.leftover = left > size.qty * 0.05 ? { qty: left, unit: size.unit } : null;
    out.waste = out.leftover ? weight * (left / size.qty) : 0;
    return out;
  });
}

// Lower is better: leftovers that spoil, minus fresh pantry items used up, plus a little per purchase.
export function wasteScore(items) {
  let s = 0;
  for (const i of items) {
    s += i.waste;
    if (i.fromPantry) s -= 0.5 * i.weight;
    if (i.status === 'buy') s += 0.05;
  }
  return s;
}

function sharedCount(items) {
  return items.filter(i => i.recipes.length > 1).length;
}

// Picks up to `size` recipes that leave the least to waste.
//   startId:  begin with this recipe
//   ingredient: only recipes using this ingredient key (e.g. "ground beef")
//   include / exclude: recipe ids to force in or leave out
export function lowWastePlan(state, { startId = '', ingredient = '', size = 3, include = [], exclude = [] } = {}) {
  const cache = new Map();
  const itemsOf = r => { if (!cache.has(r.id)) cache.set(r.id, recipeItems(r)); return cache.get(r.id); };
  const usable = state.recipes.filter(r => !exclude.includes(r.id) && itemsOf(r).length);
  const pool = ingredient ? usable.filter(r => itemsOf(r).some(i => keysMatch(i.key, ingredient))) : usable;
  if (!pool.length) return null;
  const forced = include.map(id => usable.find(r => r.id === id)).filter(Boolean);
  const score = group => wasteScore(groupItems(state, group, itemsOf)) - 0.3 * sharedCount(groupItems(state, group, itemsOf));
  const keysOf = r => itemsOf(r).filter(i => !isStaple(i.key)).map(i => i.key);
  const shares = (r, group) => keysOf(r).some(k => group.some(g => keysOf(g).some(x => keysMatch(x, k))));

  const grow = seed => {
    const group = [...new Set([...forced, ...seed])];
    while (group.length < size) {
      let best = null;
      for (const c of pool) {
        if (group.includes(c) || !shares(c, group)) continue; // unrelated meals don't reduce waste
        const s = score([...group, c]);
        if (!best || s < best.s - 1e-9 || (Math.abs(s - best.s) < 1e-9 && c.name.localeCompare(best.c.name) < 0)) best = { c, s };
      }
      if (!best) break;
      group.push(best.c);
    }
    return { group, s: score(group) };
  };

  let seeds;
  const start = usable.find(r => r.id === startId);
  if (start) seeds = [[start]];
  else if (forced.length) seeds = [[]];
  else {
    // Try the most connected recipes as starting points and keep the best group.
    const degree = r => pool.filter(o => o !== r && shares(o, [r])).length;
    seeds = [...pool].sort((a, b) => degree(b) - degree(a) || a.name.localeCompare(b.name)).slice(0, 15).map(r => [r]);
  }
  let best = null;
  for (const seed of seeds) {
    const g = grow(seed);
    // Prefer full groups, then the least waste per meal.
    const rank = [-g.group.length, g.s / g.group.length];
    if (!best || rank[0] < best.rank[0] || (rank[0] === best.rank[0] && rank[1] < best.rank[1])) best = { ...g, rank };
  }
  const group = best.group;
  const items = groupItems(state, group, itemsOf);

  // For leftovers that spoil, your other recipes that would use them up.
  const useUp = [];
  for (const it of items) {
    if (it.waste < 0.15 || it.weight < 0.7) continue;
    const others = usable
      .filter(r => !group.includes(r) && itemsOf(r).some(i => keysMatch(i.key, it.key)))
      .map(r => ({ recipe: r, saves: score(group) - score([...group, r]) }))
      .filter(x => x.saves > 0)
      .sort((a, b) => b.saves - a.saves)
      .slice(0, 3)
      .map(x => x.recipe);
    if (others.length) useUp.push({ key: it.key, name: it.name, leftover: it.leftover, recipes: others });
  }
  // Waste if each meal were shopped for on its own, to show what cooking together saves.
  const alone = group.reduce((s, r) => s + groupItems(state, [r], itemsOf).reduce((t, i) => t + i.waste, 0), 0);
  const together = items.reduce((t, i) => t + i.waste, 0);
  return { recipes: group, items, useUp, waste: together, wasteAlone: alone };
}

// Ingredients worth building meals around: fresh ones used by two or more of your recipes.
export function anchorIngredients(state) {
  const counts = [];
  for (const r of state.recipes) {
    for (const i of recipeItems(r)) {
      if (isStaple(i.key) || spoilWeight(i.key) < 0.7) continue;
      let hit = counts.find(c => keysMatch(c.key, i.key));
      if (!hit) counts.push(hit = { key: i.key, name: i.name, count: 0 });
      hit.count++;
    }
  }
  return counts.filter(c => c.count >= 2).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// Your recipes that pair best with one recipe, by waste saved and ingredients shared.
export function goesWellWith(state, recipe, limit = 3) {
  const cache = new Map();
  const itemsOf = r => { if (!cache.has(r.id)) cache.set(r.id, recipeItems(r)); return cache.get(r.id); };
  const mine = itemsOf(recipe).filter(i => !isStaple(i.key));
  if (!mine.length) return [];
  const base = wasteScore(groupItems(state, [recipe], itemsOf));
  const out = [];
  for (const r of state.recipes) {
    if (r.id === recipe.id) continue;
    const shared = itemsOf(r).filter(i => !isStaple(i.key) && mine.some(m => keysMatch(m.key, i.key)));
    if (!shared.length) continue;
    const pairItems = groupItems(state, [recipe, r], itemsOf);
    const saved = base + wasteScore(groupItems(state, [r], itemsOf)) - wasteScore(pairItems);
    const usesUp = pairItems.filter(i => i.recipes.length > 1 && i.weight >= 0.7).map(i => i.name);
    out.push({ recipe: r, shared: shared.map(i => i.name), usesUp, score: saved + 0.3 * shared.length + 0.5 * usesUp.length });
  }
  return out.sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name)).slice(0, limit);
}

// "½ lb left over" style text.
export function leftoverText(item) {
  return item.leftover ? `${fmt(item.leftover.qty, item.leftover.unit)}` : '';
}
