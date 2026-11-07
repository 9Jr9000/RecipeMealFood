import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscript, spokenIngredients, spokenTitle, looksLikeTranscript } from '../js/transcript.js';
import { draftsFromText, captionDraft, recipeFromTikTokOEmbed, recipeFromHtml, creatorFromUrl } from '../js/importer.js';

const TRANSCRIPT = `Hey guys today we're making garlic butter chicken. So first you're gonna season two pounds of chicken thighs with a teaspoon of salt and half a teaspoon of pepper, then heat two tablespoons of olive oil in a pan and sear the chicken for five minutes on each side. Now add four tablespoons of butter and six cloves of garlic and a cup and a half of chicken broth. Let it simmer for ten minutes. Serve with rice. Follow for more recipes!`;

test('reads spoken amounts', () => {
  assert.deepEqual(spokenIngredients('crack three eggs into a bowl and add a pinch of salt, 1 1/2 cups milk, a can of black beans'), [
    { qty: 3, unit: null, name: 'eggs' },
    { qty: 1, unit: 'pinch', name: 'salt' },
    { qty: 1.5, unit: 'cup', name: 'milk' },
    { qty: 1, unit: 'can', name: 'black beans' },
  ]);
  // Times, temperatures and pans aren't ingredients.
  assert.deepEqual(spokenIngredients('bake for 20 minutes at 400 degrees in a pan, then cut it into 2 pieces'), []);
  assert.deepEqual(spokenIngredients('one and a half cups of sugar and half a cup of milk'), [
    { qty: 1.5, unit: 'cup', name: 'sugar' }, { qty: 0.5, unit: 'cup', name: 'milk' },
  ]);
});

test('turns a transcript into ingredients and steps', () => {
  const r = parseTranscript(TRANSCRIPT);
  assert.equal(r.name, 'Garlic Butter Chicken');
  assert.deepEqual(r.ingredients.split('\n'), [
    '2 lb chicken thighs', '1 tsp salt', '½ tsp pepper', '2 tbsp olive oil', '4 tbsp butter', '6 cloves garlic', '1½ cups chicken broth',
  ]);
  const steps = r.directions.split('\n');
  assert.equal(steps[0], 'Season two pounds of chicken thighs with a teaspoon of salt and half a teaspoon of pepper.');
  assert.equal(steps.at(-1), 'Serve with rice.');
  assert.ok(!/follow|hey guys/i.test(r.directions));
  // Saying the same thing twice adds up.
  assert.equal(parseTranscript('Add two tablespoons of butter. Then add another tablespoon of butter.').ingredients, '3 tbsp butter');
});

test('pasted transcripts and chatty captions are read', () => {
  assert.ok(looksLikeTranscript(TRANSCRIPT));
  assert.ok(!looksLikeTranscript('Pasta\n1 lb spaghetti\n2 tbsp oil'));
  const [d] = draftsFromText(TRANSCRIPT);
  assert.equal(d.name, 'Garlic Butter Chicken');
  assert.equal(d.ingredients.split('\n').length, 7);
  assert.equal(d.notes, TRANSCRIPT); // the original words are kept
  const c = captionDraft('Easiest pancakes ever 🥞 just mix two cups of flour with a cup and a half of milk and two eggs then cook on a hot pan #breakfast');
  assert.deepEqual(c.ingredients.split('\n'), ['2 cups flour', '1½ cups milk', '2 eggs']);
  assert.equal(spokenTitle('this is my famous chili, so start by browning the beef'), 'Chili');
});

test('creator credit comes from TikTok and recipe sites', () => {
  assert.equal(creatorFromUrl('https://www.tiktok.com/@chef.jane/video/123'), '@chef.jane');
  assert.equal(creatorFromUrl('https://example.com/recipe'), '');
  const t = recipeFromTikTokOEmbed({ title: 'Pasta. Ingredients: 1 lb pasta, 2 tbsp oil', author_name: 'Chef Jane', author_url: 'https://www.tiktok.com/@chefjane' }, 'https://vm.tiktok.com/xyz');
  assert.equal(t.creator, '@chefjane');
  assert.equal(recipeFromTikTokOEmbed({ title: 'x', author_name: 'Chef Jane' }).creator, 'Chef Jane');
  const html = `<script type="application/ld+json">{"@type":"Recipe","name":"Soup","author":{"@type":"Person","name":"Sam Cook"},"recipeIngredient":["1 onion"]}</script>`;
  assert.equal(recipeFromHtml(html, 'https://example.com/soup').creator, 'Sam Cook');
});
