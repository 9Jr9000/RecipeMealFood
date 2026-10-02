import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIngredient, normalizeName, guessAisle, combineAmounts, describeAmounts,
  formatQty, parseRecipeText, scaleIngredientText, readQuantity, buildLine, totalAmount,
} from '../js/ingredients.js';

test('parses quantities, units and names', () => {
  const cases = [
    ['2 cups all-purpose flour', 2, 'cup', 'all-purpose flour'],
    ['1 1/2 tsp kosher salt', 1.5, 'tsp', 'kosher salt'],
    ['1½ Tbsp olive oil', 1.5, 'tbsp', 'olive oil'],
    ['½ cup sugar', 0.5, 'cup', 'sugar'],
    ['3 large eggs', 3, null, 'large eggs'],
    ['2 cloves garlic, minced', 2, 'clove', 'garlic, minced'],
    ['1 lb. ground beef', 1, 'lb', 'ground beef'],
    ['1 c. milk', 1, 'cup', 'milk'],
    ['2 T butter', 2, 'tbsp', 'butter'],
    ['2 t vanilla extract', 2, 'tsp', 'vanilla extract'],
    ['1 (14 oz) can diced tomatoes', 1, 'can', 'diced tomatoes (14 oz)'],
    ['Pinch of salt', null, 'pinch', 'salt'],
    ['Salt and pepper to taste', null, null, 'Salt and pepper to taste'],
    ['- 4 cups chicken stock', 4, 'cup', 'chicken stock'],
  ];
  for (const [line, qty, unit, name] of cases) {
    const p = parseIngredient(line);
    assert.equal(p.qty, qty, line);
    assert.equal(p.unit, unit, line);
    assert.equal(p.name, name, line);
  }
});

test('parses ranges', () => {
  assert.deepEqual(readQuantity('2-3 carrots'), { qty: 2, qtyMax: 3, rest: 'carrots' });
  assert.deepEqual(readQuantity('2 to 3 carrots'), { qty: 2, qtyMax: 3, rest: 'carrots' });
});

test('section headers are not ingredients', () => {
  assert.equal(parseIngredient('For the sauce:').header, 'For the sauce');
});

test('normalizes names to a shared key', () => {
  assert.equal(normalizeName('Tomatoes, chopped'), 'tomato');
  assert.equal(normalizeName('large eggs'), 'egg');
  assert.equal(normalizeName('extra-virgin olive oil'), 'olive oil');
  assert.equal(normalizeName('fresh basil leaves'), 'basil leaf');
  assert.equal(normalizeName('butter or margarine'), 'butter');
  assert.equal(normalizeName('diced tomatoes (14 oz)'), 'tomato');
  assert.equal(normalizeName('fresh berries'), 'berry');
  assert.equal(normalizeName('hot sauce'), 'hot sauce');
  assert.equal(normalizeName('oranges'), 'orange');
});

test('guesses aisles', () => {
  assert.equal(guessAisle('tomato'), 'Produce');
  assert.equal(guessAisle('unsalted butter'), 'Dairy & Eggs');
  assert.equal(guessAisle('kosher salt'), 'Spices & Seasonings');
  assert.equal(guessAisle('chicken thigh'), 'Meat & Seafood');
  assert.equal(guessAisle('chicken stock'), 'Canned & Jarred');
  assert.equal(guessAisle('all-purpose flour'), 'Baking');
  assert.equal(guessAisle('butternut squash'), 'Produce');
  assert.equal(guessAisle('eggplant'), 'Produce');
  assert.equal(guessAisle('olive oil'), 'Oils, Sauces & Condiments');
  assert.equal(guessAisle('spaghetti'), 'Pantry & Dry Goods');
  assert.equal(guessAisle('something unusual'), 'Other');
});

test('combines compatible amounts', () => {
  assert.deepEqual(combineAmounts([{ qty: 1, unit: 'cup' }, { qty: 1, unit: 'cup' }]), [{ qty: 2, unit: 'cup' }]);
  const mixed = combineAmounts([{ qty: 1, unit: 'tbsp' }, { qty: 3, unit: 'tsp' }]);
  assert.equal(mixed.length, 1);
  assert.equal(mixed[0].unit, 'tbsp');
  assert.equal(Math.round(mixed[0].qty * 100) / 100, 2);
  assert.equal(describeAmounts([{ qty: 2, unit: null }, { qty: 1, unit: null }]), '3');
  assert.equal(describeAmounts([{ qty: 2, unit: 'clove' }, { qty: 1, unit: 'cup' }]), '2 cloves + 1 cup');
  assert.equal(describeAmounts([{ qty: null, unit: null }]), '');
  assert.equal(describeAmounts([{ qty: 2, unit: 'cup' }]), '2 cups');
  assert.equal(describeAmounts([{ qty: 3, unit: 'tbsp' }]), '3 tbsp');
});

test('formats fractions', () => {
  assert.equal(formatQty(1.5), '1½');
  assert.equal(formatQty(0.333), '⅓');
  assert.equal(formatQty(2), '2');
});

test('scales ingredient lines', () => {
  assert.equal(scaleIngredientText(parseIngredient('1 1/2 cups flour'), 2), '3 cups flour');
  assert.equal(scaleIngredientText(parseIngredient('Salt to taste'), 2), 'Salt to taste');
});

test('splits pasted recipe text into fields', () => {
  const r = parseRecipeText(`Weeknight Pasta
Serves 4
Ingredients
1 lb spaghetti
2 tbsp olive oil
Instructions
1. Boil the pasta.
2. Toss with oil.
Notes
Use good oil.`);
  assert.equal(r.name, 'Weeknight Pasta');
  assert.equal(r.servings, '4');
  assert.equal(r.ingredients, '1 lb spaghetti\n2 tbsp olive oil');
  assert.equal(r.directions, 'Boil the pasta.\n\nToss with oil.');
  assert.equal(r.notes, 'Use good oil.');
});

test('parses extra amounts joined with + or plus', () => {
  const a = parseIngredient('2/3 cup + 1/4 tbsp sugar');
  assert.equal(a.unit, 'cup');
  assert.deepEqual(a.extras, [{ qty: 0.25, unit: 'tbsp' }]);
  assert.equal(a.name, 'sugar');
  const b = parseIngredient('1 cup plus 2 tbsp flour');
  assert.deepEqual(b.extras, [{ qty: 2, unit: 'tbsp' }]);
  assert.equal(b.key, 'flour');
  assert.equal(buildLine(a), '⅔ cup + ¼ tbsp sugar');
  assert.equal(scaleIngredientText(b, 2), '2 cups + 4 tbsp flour');
  assert.deepEqual(parseIngredient('3 eggs + 1 yolk').extras, []);
});

test('describes mixed amounts cleanly', () => {
  assert.equal(describeAmounts([{ qty: 2 / 3, unit: 'cup' }, { qty: 0.25, unit: 'tbsp' }]), '⅔ cup + ¼ tbsp');
  assert.equal(describeAmounts([{ qty: 1, unit: 'cup' }, { qty: 2, unit: 'tbsp' }]), '1⅛ cups');
  assert.deepEqual(totalAmount([{ qty: 1, unit: 'cup' }, { qty: 2, unit: 'tbsp' }]), { qty: 1.125, unit: 'cup' });
});
