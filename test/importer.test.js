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
  "recipeCategory":"Main Course","recipeCuisine":["Mexican"],"keywords":"tacos, chicken","recipeYield":["4","4 servings"],"prepTime":"PT10M","cookTime":"PT20M","totalTime":"PT30M",
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
  assert.equal(d.hints, 'Main Course, Mexican, tacos, chicken');
});

test('reads recipes with step sections', () => {
  const d = recipeFromHtml(SECTION_PAGE);
  assert.equal(d.name, 'Lemon Cake & Glaze');
  assert.equal(d.imageUrl, 'https://example.com/cake.jpg');
  assert.deepEqual(d.directions.split('\n'), ['Cake:', 'Mix flour and sugar.', 'Bake 40 minutes.', 'Glaze:', 'Whisk sugar and lemon.']);
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

// ---------- Mass import ----------
import zlib from 'node:zlib';
import { splitRecipeTexts, draftsFromText, draftsFromFile, readZip, setCustomRelay, fetchViaRelays } from '../js/importer.js';

const NOTES = `Garlic Pasta
Serves 4
Ingredients
1 lb spaghetti
4 tbsp butter
Directions
1. Boil pasta.
2. Toss with butter.

Chicken Tacos
Ingredients:
1 lb chicken thighs
8 tortillas
Instructions
Grill chicken.
Fill tortillas.

Banana Bread
Prep time: 15 min
Ingredients
3 bananas
2 cups flour
Steps
Mash bananas.
Bake 1 hour.`;

test('splits a paste holding several recipes', () => {
  const chunks = splitRecipeTexts(NOTES);
  assert.equal(chunks.length, 3);
  const drafts = draftsFromText(NOTES);
  assert.deepEqual(drafts.map(d => d.name), ['Garlic Pasta', 'Chicken Tacos', 'Banana Bread']);
  assert.equal(drafts[0].servings, '4');
  assert.equal(drafts[1].ingredients, '1 lb chicken thighs\n8 tortillas');
  assert.equal(drafts[2].prepTime, '15 min');
  assert.equal(drafts[2].directions, 'Mash bananas.\nBake 1 hour.');
});

test('a line of --- separates recipes', () => {
  const d = draftsFromText('Soup\nIngredients\n1 onion\n---\nSalad\nIngredients\n1 lettuce\n---\n');
  assert.deepEqual(d.map(x => x.name), ['Soup', 'Salad']);
  assert.equal(draftsFromText('Just one\nIngredients\n1 egg').length, 1);
});

// Builds a .paprikarecipes file the way Paprika does: a zip of gzipped JSON recipes.
function makeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name);
    const data = zlib.deflateRawSync(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(content.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(data.length, 20); c.writeUInt32LE(content.length, 24); c.writeUInt16LE(nameBuf.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}

test('reads a Paprika export (.paprikarecipes)', async () => {
  const recipe = (name, extra = {}) => zlib.gzipSync(Buffer.from(JSON.stringify({
    name, ingredients: '2 cups flour\r\n1 tsp salt', directions: 'Mix.\r\n\r\nBake.', servings: '8', prep_time: '10 min',
    cook_time: '30 min', source_url: 'https://example.com/x', categories: ['Baking'], rating: 4, notes: 'Yum', ...extra,
  })));
  const zip = makeZip([['Bread.paprikarecipe', recipe('Bread', { photo_data: 'AAAA' })], ['Cake.paprikarecipe', recipe('Cake')]]);
  assert.equal((await readZip(zip)).length, 2);
  const drafts = await draftsFromFile('My Recipes.paprikarecipes', zip);
  assert.deepEqual(drafts.map(d => d.name), ['Bread', 'Cake']);
  assert.equal(drafts[0].ingredients, '2 cups flour\n1 tsp salt');
  assert.equal(drafts[0].directions, 'Mix.\nBake.');
  assert.deepEqual(drafts[0].categories, ['Baking']);
  assert.equal(drafts[0].rating, 4);
  assert.equal(drafts[0].photoDataUrl, 'data:image/jpeg;base64,AAAA');
  assert.equal(drafts[0].source, 'https://example.com/x');
});

test('reads saved web pages and text files', async () => {
  const html = `<link rel="canonical" href="https://site.com/tacos"><script type="application/ld+json">{"@type":"Recipe","name":"Tacos","recipeIngredient":["1 lb beef"],"recipeInstructions":"Cook."}</script>`;
  const [d] = await draftsFromFile('Tacos - Site.html', new TextEncoder().encode(html));
  assert.equal(d.name, 'Tacos');
  assert.equal(d.source, 'https://site.com/tacos');
  const t = await draftsFromFile('notes.txt', new TextEncoder().encode(NOTES));
  assert.equal(t.length, 3);
});

test('your own relay is tried first', async () => {
  const calls = [];
  setCustomRelay('https://relay.example.workers.dev/');
  await fetchViaRelays('https://site.com/a', 'text', async u => { calls.push(u); return { ok: true, text: async () => 'ok' }; });
  setCustomRelay('');
  assert.equal(calls[0], 'https://relay.example.workers.dev/?url=https%3A%2F%2Fsite.com%2Fa');
});
