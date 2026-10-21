import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  bmr, tdeeAndMacros, bodyFatNavy, bodyFatCategory, waterIntake, loadFoods, searchFoods, matchFood,
  foodByName, toGrams, nutrientsFor, sumNutrients, rowsFromRecipe, SWAPS, swapsForRecipe, unitOptions,
} from '../js/health.js';

const foods = loadFoods(JSON.parse(fs.readFileSync(new URL('../data/nutrition.json', import.meta.url))));
const close = (a, b, tol = 0.6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

test('Mifflin–St Jeor and TDEE', () => {
  // 30-year-old man, 80 kg, 180 cm: 10*80 + 6.25*180 - 5*30 + 5 = 1780
  assert.equal(bmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 }), 1780);
  assert.equal(bmr({ sex: 'female', weightKg: 60, heightCm: 165, age: 30 }), 1320.25);
  const r = tdeeAndMacros({ sex: 'male', age: 30, weightKg: 80, heightCm: 180, activity: 'moderate', goal: 'lose1' });
  assert.equal(r.tdee, Math.round(1780 * 1.55));
  assert.equal(r.target, Math.round(1780 * 1.55 - 500));
  assert.equal(r.macros.protein, 160); // 2.0 g/kg while losing
  close(r.macros.protein * 4 + r.macros.fat * 9 + r.macros.carbs * 4, r.target, 8);
  // Never below the safe minimum
  const low = tdeeAndMacros({ sex: 'female', age: 60, weightKg: 45, heightCm: 150, activity: 'sedentary', goal: 'lose1' });
  assert.equal(low.target, 1200);
  assert.ok(low.clamped);
});

test('Navy body fat', () => {
  close(bodyFatNavy({ sex: 'male', heightIn: 70, neckIn: 15, waistIn: 34 }), 17.5);
  // 163.205·log10(30+38−13) − 97.684·log10(65) − 78.387 = 28.6
  close(bodyFatNavy({ sex: 'female', heightIn: 65, neckIn: 13, waistIn: 30, hipIn: 38 }), 28.6, 0.1);
  assert.equal(bodyFatNavy({ sex: 'male', heightIn: 70, neckIn: 16, waistIn: 15 }), null);
  assert.equal(bodyFatCategory('male', 17.5), 'Fitness');
  assert.equal(bodyFatCategory('female', 28.6), 'Average');
});

test('water intake', () => {
  assert.deepEqual(waterIntake({ weightLb: 160 }), { oz: 80, liters: 2.4, cups: 10 });
  assert.equal(waterIntake({ weightLb: 160, exerciseMin: 60, climate: 'hot' }).oz, 80 + 24 + 24);
});

test('USDA values match published numbers', () => {
  const egg = foodByName(foods, 'Egg, whole, raw, fresh');
  assert.equal(egg.n.kcal, 143);
  assert.equal(egg.n.protein, 12.56);
  assert.deepEqual(egg.portions[0], [50, '1 large']);
});

test('every swap and shortcut points to a real USDA food', () => {
  for (const s of SWAPS) {
    for (const name of [s.fromFood, s.toFood].filter(Boolean)) assert.ok(foodByName(foods, name), `missing: ${name}`);
  }
  assert.equal(matchFood(foods, 'buttermilk').name, 'Milk, buttermilk, fluid, whole');
  assert.match(searchFoods(foods, 'buttermilk')[0].name, /fluid/);
  for (const name of ['black beans', 'chickpeas', 'kidney beans', 'egg', 'flour', 'sugar', 'butter', 'milk', 'olive oil', 'garlic', 'onion', 'chicken breast', 'ground beef', 'salt', 'rice', 'cilantro', 'black pepper', 'shrimp', 'tofu', 'avocado', 'bacon', 'unsalted butter', 'vegetable oil', 'chicken stock']) {
    assert.ok(matchFood(foods, name), `no match for ${name}`);
  }
});

test('search ranks the everyday food first', () => {
  assert.equal(searchFoods(foods, 'egg')[0].name, 'Egg, whole, raw, fresh');
  assert.match(searchFoods(foods, 'ground beef')[0].name, /^Beef, ground/);
  assert.match(searchFoods(foods, 'banana')[0].name, /^Bananas, raw/);
  assert.match(searchFoods(foods, 'cheddar')[0].name, /^Cheese, cheddar/);
  assert.match(searchFoods(foods, 'broccoli')[0].name, /^Broccoli/);
});

test('amounts convert to grams with the food’s own measures', () => {
  const flour = foodByName(foods, 'Wheat flour, white, all-purpose, enriched, bleached');
  close(toGrams(flour, 1, 'cup').grams, 125);
  close(toGrams(flour, 2, 'tbsp').grams, 125 / 8);
  const egg = foodByName(foods, 'Egg, whole, raw, fresh');
  assert.equal(toGrams(egg, 2, null).grams, 100); // "2 eggs" = 2 large
  close(toGrams(egg, 4, 'oz').grams, 113.4);
  assert.ok(unitOptions(egg).some(u => u.label === 'large'));
  const n = sumNutrients([nutrientsFor(egg, 100), nutrientsFor(flour, 125)]);
  close(n.kcal, 143 + 364 * 1.25, 1);
});

test('recipe ingredients become calculator rows', () => {
  const rows = rowsFromRecipe(foods, { ingredients: 'Sauce:\n2 cups all-purpose flour\n3 large eggs\n1 tbsp olive oil\nSalt to taste' });
  assert.equal(rows.length, 4);
  assert.equal(foods.find(f => f.id === rows[0].foodId).name, 'Wheat flour, white, all-purpose, enriched, bleached');
  assert.equal(rows[0].unit, 'cup');
  assert.equal(foods.find(f => f.id === rows[1].foodId).name, 'Egg, whole, raw, fresh');
});

test('swaps found for a recipe', () => {
  const s = swapsForRecipe({ ingredients: '1 cup buttermilk\n½ cup pine nuts\n2 cups flour' }).map(x => x.from);
  assert.deepEqual(s, ['Pine nuts', 'Buttermilk']);
});

test('auto-match review (common recipe ingredients)', () => {
  const names = ['2 lbs chicken thighs', '1 lb spaghetti', '4 tbsp unsalted butter', '6 cloves garlic, minced', '1/2 cup grated parmesan', '1 tsp kosher salt', '2 cups jasmine rice', '1/2 cup soy sauce', '2 tbsp honey', '1 lb ground turkey', '1 can black beans', '8 corn tortillas', '1 cup shredded cheddar', '2 cups chicken broth', '1 cup heavy cream', '1 tbsp smoked paprika', '1 red onion', '2 carrots', '1 cup frozen peas', '1 lb shrimp', '1 cup milk', '2 cups all-purpose flour', '1 cup sugar', '1 cup brown sugar', '1 tsp baking soda', '1 tbsp sesame oil', '1 cup salsa', '1 avocado', '1 lime', '1 cup greek yogurt'];
  const lines = names.map(n => {
    const f = matchFood(foods, n.replace(/^[\d/ .]+(lbs?|tbsp|tsp|cups?|cloves|can)?\s*/, ''));
    return `${n.padEnd(28)} → ${f ? f.name : '(none)'}`;
  });
  console.log(lines.join('\n'));
});
