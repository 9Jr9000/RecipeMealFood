import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, saveRecipe, addToPantry, deleteRecipe, amountText } from '../js/sync.js';
import {
  weekStart, weekDates, addDays, isValidDate, defaultMeal, addToPlan, removeFromPlan, moveInPlan,
  planForWeek, clearWeek, weekShopping, addWeekToGrocery,
} from '../js/mealplan.js';
import { COLLECTIONS, emptyBase } from '../js/cloudsync.js';

test('week dates', () => {
  // 2026-11-07 is a Saturday.
  assert.equal(weekStart('2026-11-07'), '2026-11-01');
  assert.equal(weekStart('2026-11-07', 1), '2026-11-02');
  assert.equal(weekStart('2026-11-01', 1), '2026-10-26');
  assert.deepEqual(weekDates('2026-12-27').slice(-3), ['2026-12-31', '2027-01-01', '2027-01-02']);
  assert.equal(addDays('2026-03-07', 1), '2026-03-08'); // across the clock change
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.ok(isValidDate('2026-02-28') && !isValidDate('2026-02-30') && !isValidDate('nope'));
});

function kitchen() {
  const state = emptyState();
  const cake = saveRecipe(state, { name: 'Cake', categories: ['Dessert'], ingredients: '1 cup flour\n1 cup sugar\n2 eggs' });
  const bread = saveRecipe(state, { name: 'Bread', categories: [], ingredients: '1 cup flour\n1 tsp yeast' });
  const oats = saveRecipe(state, { name: 'Oats', categories: ['Breakfast'], ingredients: '1 cup oats\n1 cup milk' });
  return { state, cake, bread, oats };
}

test('planning, moving and removing meals', () => {
  const { state, cake, oats } = kitchen();
  assert.equal(defaultMeal(oats), 'Breakfast');
  assert.equal(defaultMeal(cake), 'Snack');
  const a = addToPlan(state, { recipeId: cake.id, date: '2026-11-03', meal: 'Dinner' });
  addToPlan(state, { recipeId: oats.id, date: '2026-11-03', meal: 'Breakfast' });
  addToPlan(state, { recipeId: oats.id, date: '2026-11-09', meal: 'Breakfast' }); // next week
  const week = planForWeek(state, '2026-11-01');
  assert.deepEqual(week.map(e => e.meal), ['Breakfast', 'Dinner']); // breakfast first
  moveInPlan(state, a.id, { date: '2026-11-05' });
  assert.equal(planForWeek(state, '2026-11-01')[1].date, '2026-11-05');
  removeFromPlan(state, a.id);
  assert.equal(planForWeek(state, '2026-11-01').length, 1);
  // Deleting a recipe takes it off the plan.
  deleteRecipe(state, oats.id);
  assert.equal(state.plan.length, 0);
  addToPlan(state, { recipeId: cake.id, date: '2026-11-02' });
  assert.equal(clearWeek(state, '2026-11-01'), 1);
});

test('shopping for the week uses up the pantry across recipes', () => {
  const { state, cake, bread } = kitchen();
  addToPantry(state, 'flour', null, { qty: 1.5, unit: 'cup' });
  addToPantry(state, 'eggs');
  for (const [r, d] of [[cake, '2026-11-02'], [bread, '2026-11-03'], [bread, '2026-11-05']]) addToPlan(state, { recipeId: r.id, date: d });
  const shop = weekShopping(state, '2026-11-01');
  assert.deepEqual(shop.toBuy.map(t => t.name).sort(), ['flour', 'sugar', 'yeast']);
  assert.ok(shop.have.includes('egg'));
  const n = addWeekToGrocery(state, shop, new Set(['sugar']));
  assert.ok(n >= 2);
  // Cake 1 cup + bread twice 2 cups = 3 cups; 1½ on hand -> 1½ cups to buy.
  assert.equal(amountText(state.grocery.find(g => g.key === 'flour')), '1½ cups');
  assert.equal(amountText(state.grocery.find(g => g.key === 'yeast')), '2 tsp'); // bread twice
  assert.equal(state.grocery.find(g => g.key === 'sugar'), undefined); // unchecked
});

test('the plan syncs between devices', () => {
  assert.ok(COLLECTIONS.includes('plan'));
  assert.deepEqual(emptyBase().plan, {});
});
