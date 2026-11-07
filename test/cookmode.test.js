import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cookSteps, findTimers, stepIngredients, formatClock, formatDuration } from '../js/cookmode.js';

test('finds timers in steps', () => {
  const t = text => findTimers(text).map(x => [x.text, x.seconds, x.maxSeconds]);
  assert.deepEqual(t('Bake 25-30 minutes until golden.'), [['25-30 minutes', 1500, 1800]]);
  assert.deepEqual(t('Simmer for 1 hour 15 minutes.'), [['1 hour 15 minutes', 4500, null]]);
  assert.deepEqual(t('Let the dough rise 1½ hours'), [['1½ hours', 5400, null]]);
  assert.deepEqual(t('Cook 2 to 3 min per side'), [['2 to 3 min', 120, 180]]);
  assert.deepEqual(t('Microwave 30 seconds, then rest five minutes'), [['30 seconds', 30, null], ['five minutes', 300, null]]);
  assert.deepEqual(t('Stir every 5 minutes for 20 minutes'), [['20 minutes', 1200, null]]);
  assert.deepEqual(t('Chill overnight'), []);
});

test('steps keep their sections', () => {
  assert.deepEqual(cookSteps('For the sauce:\nMix.\n\nStir.\nCake:\nBake.'), [
    { text: 'Mix.', section: 'For the sauce', number: 1 },
    { text: 'Stir.', section: 'For the sauce', number: 2 },
    { text: 'Bake.', section: 'Cake', number: 3 },
  ]);
});

test('each step shows the ingredients it mentions', () => {
  const ings = '2 cups flour\n2 large eggs\n1 cup milk\n2 tbsp olive oil\n1 tbsp soy sauce\n1 tsp salt';
  assert.deepEqual(stepIngredients('Whisk the eggs, milk and flour.', ings), [0, 1, 2]);
  // "oil" alone isn't enough to mean olive oil vs. any oil, but "olive oil" is
  assert.deepEqual(stepIngredients('Heat the olive oil.', ings), [3]);
  assert.deepEqual(stepIngredients('Add the soy sauce and a pinch of salt.', ings), [4, 5]);
});

test('clock formats', () => {
  assert.equal(formatClock(3725), '1:02:05');
  assert.equal(formatClock(59.2), '1:00');
  assert.equal(formatDuration(1500), '25 min');
  assert.equal(formatDuration(4500), '1 hr 15 min');
  assert.equal(formatDuration(30), '30 sec');
});
