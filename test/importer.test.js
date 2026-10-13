import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractUrls, isTikTok, isoDuration, decodeEntities, recipeFromHtml, captionDraft,
  recipeFromTikTokOEmbed, draftFromLink,
} from '../js/importer.js';

// Typical WordPress recipe-plugin page: the recipe sits inside an @graph next to other nodes.
const WORDPRESS_PAGE = `<!doctype html><html><head>
<title>Best Chicken Tacos | My Food Blog</title>
<meta property="og:image" content="https://example.com/og.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"WebSite","name":"My Food Blog"},
 {"@type":"Article","headline":"Best Chicken Tacos"},
 {"@type":"Recipe","name":"Best Chicken Tacos","image":["https://example.com/tacos-1x1.jpg","https://example.com/tacos-16x9.jpg"],
  "description":"Smoky, juicy chicken tacos ready in 30 minutes.",
  "recipeYield":["4","4 servings"],"prepTime":"PT10M","cookTime":"PT20M","totalTime":"PT30M",
  "recipeIngredient":["1 &frac12; lbs chicken thighs","8 corn tortillas","1 tsp ground cumin","Juice of 1 lime"],
  "recipeInstructions":[{"@type":"HowToStep","text":"Season the chicken with cumin."},{"@type":"HowToStep","text":"Grill 6&ndash;8 minutes per side."},{"@type":"HowToStep","text":"Serve in warm tortillas with lime."}]}
]}</script></head><body><p>My life story...</p></body></html>`;

// Recipe with sections and a single image object.
const SECTION_PAGE = `<script type='application/ld+json'>
[{"@context":"https://schema.org/","@type":["Recipe"],"name":"Lemon Cake &amp; Glaze","image":{"@type":"ImageObject","url":"https://example.com/cake.jpg"},
"recipeYield":8,"totalTime":"PT1H15M",
"recipeIngredient":["2 cups flour","1 cup sugar","1 cup powdered sugar","2 tbsp lemon juice"],
"recipeInstructions":[{"@type":"HowToSection","name":"Cake","itemListElement":[{"@type":"HowToStep","text":"Mix flour and sugar."},{"@type":"HowToStep","text":"Bake 40 minutes."}]},
{"@type":"HowToSection","name":"Glaze","itemListElement":[{"@type":"HowToStep","text":"Whisk sugar and lemon."}]}]}]
</script>`;

const TIKTOK_CAPTION = `Easy garlic butter pasta 🍝 ready in 15 min!! Ingredients: 1 lb spaghetti, 4 tbsp butter, 6 cloves garlic, 1/2 cup parmesan, salt to taste Instructions: 1. Boil pasta 2. Melt butter with garlic 3. Toss with pasta and cheese #pasta #easyrecipe #dinner @chefjoe`;

const TIKTOK_LINES = `Crispy smash burgers 🍔
Serves 4
Ingredients:
🥩 1 lb ground beef
🧀 4 slices cheddar
• 4 brioche buns
Steps:
1. Smash the beef on a hot pan
2. Add cheese and stack
#burger #foodtok`;

test('finds links in pasted text', () => {
  assert.deepEqual(
    extractUrls('Try this https://www.tiktok.com/@chef/video/123?is_from_webapp=1. and https://example.com/tacos/'),
    ['https://www.tiktok.com/@chef/video/123?is_from_webapp=1', 'https://example.com/tacos/'],
  );
  assert.ok(isTikTok('https://vm.tiktok.com/ZMabc/'));
  assert.ok(!isTikTok('https://example.com/tiktok.com'));
});

test('reads times and entities', () => {
  assert.equal(isoDuration('PT1H30M'), '1 hr 30 min');
  assert.equal(isoDuration('PT90M'), '1 hr 30 min');
  assert.equal(isoDuration('PT0S'), '');
  assert.equal(decodeEntities('Mac &amp; cheese &#8211; 1&frac12;'), 'Mac & cheese – 1½');
});

test('reads a recipe website (schema.org in @graph)', () => {
  const d = recipeFromHtml(WORDPRESS_PAGE, 'https://example.com/tacos');
  assert.equal(d.name, 'Best Chicken Tacos');
  assert.equal(d.imageUrl, 'https://example.com/tacos-1x1.jpg');
  assert.equal(d.ingredients, '1 ½ lbs chicken thighs\n8 corn tortillas\n1 tsp ground cumin\nJuice of 1 lime');
  assert.equal(d.directions, 'Season the chicken with cumin.\nGrill 6–8 minutes per side.\nServe in warm tortillas with lime.');
  assert.equal(d.servings, '4 servings');
  assert.equal(d.prepTime, '10 min');
  assert.equal(d.cookTime, '20 min');
  assert.equal(d.source, 'https://example.com/tacos');
  assert.match(d.notes, /Smoky/);
});

test('reads recipes with step sections', () => {
  const d = recipeFromHtml(SECTION_PAGE);
  assert.equal(d.name, 'Lemon Cake & Glaze');
  assert.equal(d.imageUrl, 'https://example.com/cake.jpg');
  assert.equal(d.directions.split('\n').length, 3);
  assert.equal(d.servings, '8');
  assert.equal(d.cookTime, '1 hr 15 min');
});

test('reads a one-line TikTok caption', () => {
  const d = captionDraft(TIKTOK_CAPTION);
  assert.equal(d.name, 'Easy garlic butter pasta 🍝 ready in 15 min');
  assert.deepEqual(d.ingredients.split('\n'), ['1 lb spaghetti', '4 tbsp butter', '6 cloves garlic', '1/2 cup parmesan', 'salt to taste']);
  assert.deepEqual(d.directions.split('\n'), ['Boil pasta', 'Melt butter with garlic', 'Toss with pasta and cheese']);
  assert.ok(!/#|@chef/.test(d.ingredients + d.directions));
});

test('reads a multi-line TikTok caption with emoji bullets', () => {
  const d = captionDraft(TIKTOK_LINES);
  assert.equal(d.name, 'Crispy smash burgers 🍔');
  assert.equal(d.servings, '4');
  assert.deepEqual(d.ingredients.split('\n'), ['1 lb ground beef', '4 slices cheddar', '4 brioche buns']);
  assert.deepEqual(d.directions.split('\n'), ['Smash the beef on a hot pan', 'Add cheese and stack']);
});

test('keeps captions without a recipe as notes', () => {
  const d = recipeFromTikTokOEmbed({ title: 'Best soup ever 😍 recipe in the video! #soup', author_name: 'chef', thumbnail_url: 'https://p16.tiktokcdn.com/x.jpg' }, 'https://www.tiktok.com/@chef/video/1');
  assert.equal(d.name, 'Best soup ever 😍 recipe in the video');
  assert.equal(d.ingredients, '');
  assert.equal(d.imageUrl, 'https://p16.tiktokcdn.com/x.jpg');
  assert.equal(d.source, 'https://www.tiktok.com/@chef/video/1');
});

test('pages without structured data fall back to their description', () => {
  const html = `<meta property="og:title" content="Chili | TikTok"><meta content="Chili night! Ingredients: 1 lb beef, 1 can beans" property="og:description"><meta property="og:image" content="https://x/y.jpg">`;
  const d = recipeFromHtml(html, 'https://www.tiktok.com/@a/video/2');
  assert.equal(d.name, 'Chili night');
  assert.deepEqual(d.ingredients.split('\n'), ['1 lb beef', '1 can beans']);
  assert.equal(d.imageUrl, 'https://x/y.jpg');
  assert.equal(recipeFromHtml('<html><body>nothing</body></html>'), null);
});

test('tries relays in order until one works', async () => {
  const calls = [];
  const fakeFetch = async url => {
    calls.push(url);
    if (url.includes('codetabs')) return { ok: true, text: async () => WORDPRESS_PAGE };
    return { ok: false, status: 403 };
  };
  const d = await draftFromLink('https://example.com/tacos', fakeFetch);
  assert.equal(d.name, 'Best Chicken Tacos');
  assert.equal(calls.length, 3); // direct, allorigins, codetabs
});

test('TikTok links use the caption from oEmbed', async () => {
  const fakeFetch = async url => {
    if (url.includes('oembed')) return { ok: true, text: async () => JSON.stringify({ title: TIKTOK_CAPTION, thumbnail_url: 'https://t/x.jpg' }) };
    return { ok: false, status: 500 };
  };
  const d = await draftFromLink('https://www.tiktok.com/@chef/video/123', fakeFetch);
  assert.equal(d.ingredients.split('\n').length, 5);
  assert.equal(d.imageUrl, 'https://t/x.jpg');
});
