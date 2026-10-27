import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, saveRecipe, addToPantry, addManualItem } from '../js/sync.js';
import { pantryMatch, rankByPantry, sharedIngredients, bestPairs, buildPlan } from '../js/planner.js';

function kitchen() {
  const state = emptyState();
  const r = (name, ingredients) => saveRecipe(state, { name, ingredients });
  const tacos = r('Chicken Tacos', '1 lb chicken thighs\n8 corn tortillas\n1 lime\n1/2 cup cilantro\n1 tsp salt');
  const bowls = r('Chicken Rice Bowls', '1 lb chicken thighs\n2 cups rice\n1 lime\n1/2 cup cilantro\n1 tbsp olive oil');
  const pasta = r('Garlic Pasta', '1 lb spaghetti\n4 tbsp butter\n6 cloves garlic\n1/2 cup parmesan');
  const omelet = r('Cheese Omelet', '3 eggs\n1/4 cup cheddar\n1 tbsp butter');
  for (const x of ['chicken thighs', 'corn tortillas', 'lime', 'eggs', 'cheddar', 'butter', 'spaghetti']) addToPantry(state, x);
  return { state, tacos, bowls, pasta, omelet };
}

test('pantry match counts what you have and what to buy', () => {
  const { state, tacos, pasta } = kitchen();
  const t = pantryMatch(state, tacos);
  assert.deepEqual(t.have.sort(), ['Chicken thigh', 'Corn tortilla', 'Lime']);
  assert.deepEqual(t.missing, ['Cilantro']);
  assert.deepEqual(t.staples, ['Salt']); // assumed on hand
  assert.equal(t.toBuy, 1);
  const p = pantryMatch(state, pasta);
  assert.deepEqual(p.missing.sort(), ['Garlic', 'Parmesan']);
  // Basics count as missing when not assumed
  assert.equal(pantryMatch(state, tacos, { assumeStaples: false }).toBuy, 2);
});

test('ranking puts what you can make now first', () => {
  const { state } = kitchen();
  const names = rankByPantry(state).map(m => `${m.recipe.name}:${m.toBuy}`);
  assert.deepEqual(names, ['Cheese Omelet:0', 'Chicken Tacos:1', 'Chicken Rice Bowls:2', 'Garlic Pasta:2']);
});

test('items already on the grocery list are flagged', () => {
  const { state, tacos } = kitchen();
  addManualItem(state, 'cilantro');
  const t = pantryMatch(state, tacos);
  assert.deepEqual(t.onList, ['Cilantro']);
  assert.deepEqual(t.missing, []);
});

test('recipes that share ingredients', () => {
  const { state, tacos, bowls, pasta } = kitchen();
  assert.deepEqual(sharedIngredients(tacos, bowls).sort(), ['Chicken thigh', 'Cilantro', 'Lime']);
  assert.deepEqual(sharedIngredients(tacos, pasta), []);
  const pairs = bestPairs(state);
  assert.equal(pairs.length, 1);
  assert.deepEqual([pairs[0].a.name, pairs[0].b.name], ['Chicken Tacos', 'Chicken Rice Bowls']);
});

test('a meal plan reuses ingredients and merges the shopping list', () => {
  const { state, tacos } = kitchen();
  const plan = buildPlan(state, { startId: tacos.id, size: 2 });
  assert.deepEqual(plan.plan.map(m => m.recipe.name), ['Chicken Tacos', 'Chicken Rice Bowls']);
  // Cilantro is bought once for both meals
  const cil = plan.toBuy.find(t => t.name === 'Cilantro');
  assert.deepEqual(cil.recipes, ['Chicken Tacos', 'Chicken Rice Bowls']);
  assert.deepEqual(plan.toBuy.map(t => t.name).sort(), ['Cilantro', 'Rice']);
  assert.deepEqual(plan.shared.map(s => s.name).sort(), ['Chicken thigh', 'Cilantro', 'Lime']);
  // Without a starting recipe it begins with the one you can make now
  assert.equal(buildPlan(state, { size: 1 }).plan[0].recipe.name, 'Cheese Omelet');
  assert.equal(buildPlan(emptyState()), null);
});
