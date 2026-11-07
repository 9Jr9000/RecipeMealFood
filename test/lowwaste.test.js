import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, saveRecipe, addToPantry } from '../js/sync.js';
import { lowWastePlan, groupItems, spoilWeight, anchorIngredients, goesWellWith } from '../js/lowwaste.js';

function kitchen() {
  const s = emptyState();
  const r = (name, ingredients) => saveRecipe(s, { name, ingredients });
  const tacos = r('Beef Tacos', '1 lb ground beef\n8 corn tortillas\n1/2 cup sour cream\n1/4 cup cilantro\n1 cup shredded cheddar\n1 onion');
  const chili = r('Beef Chili', '1 lb ground beef\n1 can kidney beans\n1 onion\n1/2 cup sour cream\n1 cup shredded cheddar\n2 cups beef broth');
  const burgers = r('Smash Burgers', '1 lb ground beef\n4 hamburger buns\n4 slices cheddar\n1/2 onion');
  const rice = r('Cilantro Lime Rice', '2 cups rice\n3/4 cup cilantro\n1 lime');
  const cookies = r('Sugar Cookies', '2 cups flour\n1 cup sugar\n1 cup butter\n2 eggs');
  const stroganoff = r('Beef Stroganoff', '1 lb ground beef\n8 oz mushrooms\n1 cup sour cream\n2 cups beef broth\n12 oz egg noodles');
  return { s, tacos, chili, burgers, rice, cookies, stroganoff };
}

test('how fast things spoil', () => {
  assert.equal(spoilWeight('ground beef'), 1);
  assert.equal(spoilWeight('cilantro'), 1);
  assert.equal(spoilWeight('onion'), 0.3); // keeps for weeks
  assert.equal(spoilWeight('flour'), 0);
  assert.equal(spoilWeight('beef broth'), 0.7); // spoils once opened
  assert.equal(spoilWeight('salt'), 0);
});

test('leftovers are worked out from store sizes', () => {
  const { s, tacos, rice } = kitchen();
  const alone = groupItems(s, [tacos]);
  const cil = alone.find(i => i.key === 'cilantro');
  assert.equal(cil.pack.label, '1 bunch');
  assert.equal(cil.leftover.qty, 0.75);
  const sour = alone.find(i => i.key === 'sour cream');
  assert.equal(sour.leftover.qty, 1.5); // ½ cup of a 2-cup tub
  // Cooked together, the bunch of cilantro is used up.
  const both = groupItems(s, [tacos, rice]);
  assert.equal(both.find(i => i.key === 'cilantro').leftover, null);
  assert.deepEqual(both.find(i => i.key === 'cilantro').recipes, ['Beef Tacos', 'Cilantro Lime Rice']);
});

test('pantry items are used first', () => {
  const { s, tacos } = kitchen();
  addToPantry(s, 'sour cream', null, { qty: 1, unit: 'cup' });
  addToPantry(s, 'cilantro');
  const items = groupItems(s, [tacos]);
  assert.equal(items.find(i => i.key === 'sour cream').status, 'have');
  assert.ok(items.find(i => i.key === 'cilantro').fromPantry);
});

test('groups meals around an ingredient so nothing is left over', () => {
  const { s } = kitchen();
  const p = lowWastePlan(s, { ingredient: 'ground beef', size: 3 });
  assert.deepEqual(p.recipes.map(r => r.name).sort(), ['Beef Chili', 'Beef Stroganoff', 'Beef Tacos']);
  const get = k => p.items.find(i => i.key === k);
  assert.equal(get('ground beef').pack.count, 3);
  assert.equal(get('ground beef').leftover, null);
  assert.equal(get('sour cream').leftover, null); // ½ + ½ + 1 cup = one 2-cup tub
  assert.equal(get('beef broth').leftover, null); // 2 + 2 cups = one carton
  assert.ok(p.waste < p.wasteAlone / 2);
  // The leftover cilantro points at another recipe of yours that uses it.
  assert.deepEqual(p.useUp.map(u => [u.key, u.recipes.map(r => r.name)]), [['cilantro', ['Cilantro Lime Rice']]]);
});

test('starting from a recipe, forcing and excluding', () => {
  const { s, tacos, chili, rice, cookies } = kitchen();
  const p = lowWastePlan(s, { startId: tacos.id, size: 3 });
  assert.equal(p.recipes[0], tacos);
  assert.ok(!p.recipes.includes(cookies)); // shares nothing fresh
  const q = lowWastePlan(s, { startId: tacos.id, size: 3, exclude: [chili.id] });
  assert.ok(!q.recipes.includes(chili));
  const f = lowWastePlan(s, { include: [tacos.id, rice.id], size: 2 });
  assert.deepEqual(f.recipes.map(r => r.name), ['Beef Tacos', 'Cilantro Lime Rice']);
});

test('suggestions from your own recipes only', () => {
  const { s, tacos } = kitchen();
  assert.deepEqual(anchorIngredients(s).slice(0, 3).map(a => a.key), ['ground beef', 'cheddar', 'sour cream']);
  const g = goesWellWith(s, tacos);
  assert.equal(g[0].recipe.name, 'Beef Chili');
  assert.ok(g[0].usesUp.includes('Sour cream'));
  assert.ok(g.every(x => s.recipes.includes(x.recipe)));
  assert.equal(lowWastePlan(emptyState()), null);
});
