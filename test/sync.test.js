import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyState, saveRecipe, recipeListPlan, addRecipeToGrocery, addManualItem, addToPantry,
  ingredientStatus, setChecked, clearChecked, removeRecipeFromGrocery, deleteRecipe,
  amountText, recipesOnList, groceryInPantry, setAisle, keysMatch,
} from '../js/sync.js';

function setup() {
  const state = emptyState();
  const pasta = saveRecipe(state, {
    name: 'Pasta',
    ingredients: 'Sauce:\n1 lb spaghetti\n2 tbsp olive oil\n3 cloves garlic\n1 tsp kosher salt',
  });
  const salad = saveRecipe(state, {
    name: 'Salad',
    ingredients: '1 tbsp extra-virgin olive oil\n2 tomatoes\n1 clove garlic, minced',
  });
  return { state, pasta, salad };
}

test('pantry items are not added to the list by default', () => {
  const { state, pasta } = setup();
  addToPantry(state, 'salt');
  const plan = recipeListPlan(state, pasta);
  assert.equal(plan[0].header, true);
  const salt = plan.find(r => r.parsed.key === 'kosher salt');
  assert.equal(salt.status, 'pantry');
  assert.equal(salt.selected, false);
  assert.equal(addRecipeToGrocery(state, pasta, plan), 3);
  assert.deepEqual(state.grocery.map(g => g.key).sort(), ['garlic', 'olive oil', 'spaghetti']);
});

test('shared ingredients merge into one item with combined amounts', () => {
  const { state, pasta, salad } = setup();
  addRecipeToGrocery(state, pasta, recipeListPlan(state, pasta));
  // On the list for another recipe -> still preselected, amounts combine.
  const plan = recipeListPlan(state, salad);
  const oilRow = plan.find(r => r.parsed.key === 'olive oil');
  assert.equal(oilRow.status, 'list');
  assert.equal(oilRow.selected, true);
  addRecipeToGrocery(state, salad, plan);
  const oil = state.grocery.find(g => g.key === 'olive oil');
  assert.equal(amountText(oil), '3 tbsp');
  const garlic = state.grocery.find(g => g.key === 'garlic');
  assert.equal(amountText(garlic), '4 cloves');
  assert.deepEqual(recipesOnList(state).map(r => r.name), ['Pasta', 'Salad']);
});

test('removing a recipe removes only its amounts', () => {
  const { state, pasta, salad } = setup();
  addRecipeToGrocery(state, pasta, recipeListPlan(state, pasta));
  const plan = recipeListPlan(state, salad);
  for (const row of plan) row.selected = true;
  addRecipeToGrocery(state, salad, plan);
  removeRecipeFromGrocery(state, salad.id);
  assert.equal(amountText(state.grocery.find(g => g.key === 'olive oil')), '2 tbsp');
  assert.equal(state.grocery.find(g => g.key === 'tomato'), undefined);
});

test('checking off and clearing moves items into the pantry', () => {
  const { state, pasta } = setup();
  addRecipeToGrocery(state, pasta, recipeListPlan(state, pasta));
  const spaghetti = state.grocery.find(g => g.key === 'spaghetti');
  setChecked(state, spaghetti.id, true);
  assert.equal(ingredientStatus(state, 'spaghetti'), 'bought');
  assert.equal(clearChecked(state), 1);
  assert.equal(ingredientStatus(state, 'spaghetti'), 'pantry');
  assert.equal(state.grocery.some(g => g.key === 'spaghetti'), false);
});

test('manual items merge with recipe items', () => {
  const { state, salad } = setup();
  addRecipeToGrocery(state, salad, recipeListPlan(state, salad));
  addManualItem(state, '3 tomatoes');
  const tomato = state.grocery.filter(g => g.key === 'tomato');
  assert.equal(tomato.length, 1);
  assert.equal(amountText(tomato[0]), '5');
});

test('flags list items that are already in the pantry', () => {
  const { state } = setup();
  addManualItem(state, 'milk');
  assert.equal(groceryInPantry(state).length, 0);
  addToPantry(state, 'Milk');
  assert.equal(groceryInPantry(state).length, 1);
});

test('deleting a recipe removes its unchecked list items', () => {
  const { state, pasta } = setup();
  addRecipeToGrocery(state, pasta, recipeListPlan(state, pasta));
  deleteRecipe(state, pasta.id);
  assert.equal(state.grocery.length, 0);
  assert.equal(state.recipes.length, 1);
});

test('renaming a recipe updates the list', () => {
  const { state, pasta } = setup();
  addRecipeToGrocery(state, pasta, recipeListPlan(state, pasta));
  saveRecipe(state, { ...pasta, name: 'Garlic Pasta' });
  assert.deepEqual(recipesOnList(state).map(r => r.name), ['Garlic Pasta']);
});

test('remembers aisle choices', () => {
  const { state } = setup();
  addManualItem(state, 'tofu');
  setAisle(state, 'tofu', 'Produce');
  addToPantry(state, 'tofu');
  assert.equal(state.pantry[0].aisle, 'Produce');
});

test('soft modifiers do not prevent matches', () => {
  assert.ok(keysMatch('kosher salt', 'salt'));
  assert.ok(keysMatch('unsalted butter', 'butter'));
  assert.ok(!keysMatch('bell pepper', 'black pepper'));
});

test('adding the same recipe twice does not double its items', () => {
  const { state, pasta } = setup();
  addRecipeToGrocery(state, pasta, recipeListPlan(state, pasta));
  const again = recipeListPlan(state, pasta);
  assert.equal(again.filter(r => r.selected).length, 0);
  assert.ok(again.filter(r => !r.header).every(r => r.alreadyAdded || r.status !== 'list'));
});
