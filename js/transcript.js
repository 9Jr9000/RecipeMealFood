// Reads a recipe out of spoken, run-on text — a video transcript or a chatty caption like
// "today we're making garlic pasta so first add two cups of flour then a pinch of salt...".
// It picks out the amounts that are said out loud ("two cups of flour") as ingredients and
// the sentences that tell you to do something ("stir until thick") as steps.
// Pure functions (no DOM) so they can be unit tested.

import { buildLine, normalizeName } from './ingredients.js';

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, dozen: 12,
};
const FRACTION_WORDS = { half: 0.5, quarter: 0.25, third: 1 / 3, 'three quarters': 0.75, 'two thirds': 2 / 3 };
const UNICODE = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

// Spoken units -> canonical units used by the rest of the app.
const UNITS = {
  cup: 'cup', cups: 'cup',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbs: 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  gram: 'g', grams: 'g', g: 'g', kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  milliliter: 'ml', milliliters: 'ml', ml: 'ml', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  pint: 'pt', pints: 'pt', quart: 'qt', quarts: 'qt',
  pinch: 'pinch', pinches: 'pinch', dash: 'dash', dashes: 'dash',
  clove: 'clove', cloves: 'clove', can: 'can', cans: 'can', jar: 'jar', jars: 'jar',
  package: 'package', packages: 'package', packet: 'package', packets: 'package', bag: 'bag', bags: 'bag',
  box: 'box', boxes: 'box', bunch: 'bunch', bunches: 'bunch', head: 'head', heads: 'head',
  stalk: 'stalk', stalks: 'stalk', sprig: 'sprig', sprigs: 'sprig', slice: 'slice', slices: 'slice',
  stick: 'stick', sticks: 'stick', handful: 'handful', handfuls: 'handful', bottle: 'bottle', bottles: 'bottle',
};

// Words that end an ingredient name ("flour and a pinch...", "butter into the pan").
const STOP = new Set(['and', 'then', 'to', 'into', 'in', 'with', 'until', 'for', 'on', 'onto', 'over', 'at', 'from', 'along',
  'plus', 'together', 'so', 'but', 'or', 'about', 'because', 'if', 'when', 'while', 'that', 'which', 'you', 'we', 'i',
  'it', 'let', 'just', 'now', 'right', 'like', 'okay', 'ok', 'also', 'after', 'before', 'as', 'by', 'is', 'are', 'will',
  'some', 'this', 'these', 'those', 'all', 'each', 'per', 'cook', 'mix', 'stir', 'bake', 'add', 'whisk', 'pour']);
// Amounts of these are not ingredients: "for ten minutes", "at four hundred degrees", "two inches".
const NOT_FOOD = /^(minutes?|mins?|hours?|hrs?|seconds?|secs?|degrees?|inch(es)?|times?|more|of them|ways?|days?|weeks?|people|servings?|portions?|sides?|layers?|batch(es)?|pieces?|bites?|steps?|things?|ingredients?|pans?|bowls?|cups? of it|tops?|parts?|halves|minute|second|hour|years?|followers?|likes?|percent|%)$/;
const FILLER_START = /^(the|your|my|our|some|of|of the|a|an|fresh|more|extra|another)\s+/;

// "two and a half" / "1 1/2" / "a half" -> number; returns { value, length } or null.
function readSpokenNumber(words, i) {
  const w = words[i];
  if (w === undefined) return null;
  let value = null;
  let used = 0;
  if (/^\d+(\.\d+)?$/.test(w)) { value = Number(w); used = 1; }
  else if (/^\d+\/\d+$/.test(w)) { const [a, b] = w.split('/').map(Number); value = b ? a / b : null; used = 1; }
  else if (/^\d+[¼½¾⅓⅔⅛]$/.test(w)) { value = Number(w.slice(0, -1)) + UNICODE[w.slice(-1)]; used = 1; }
  else if (UNICODE[w] !== undefined) { value = UNICODE[w]; used = 1; }
  else if (NUMBER_WORDS[w] !== undefined) { value = NUMBER_WORDS[w]; used = 1; }
  else if ((w === 'a' || w === 'an' || w === 'one') && words[i + 1] === 'half') { value = 0.5; used = 2; }
  else if ((w === 'a' || w === 'one') && words[i + 1] === 'quarter') { value = 0.25; used = 2; }
  else if ((w === 'a' || w === 'one') && words[i + 1] === 'third') { value = 1 / 3; used = 2; }
  else if (w === 'three' && words[i + 1] === 'quarters') { value = 0.75; used = 2; }
  else if (w === 'two' && words[i + 1] === 'thirds') { value = 2 / 3; used = 2; }
  else if (w === 'half') { value = 0.5; used = 1; }
  if (value === null) return null;
  // "one and a half", "2 and a half"
  if (words[i + used] === 'and' && (words[i + used + 1] === 'a' || words[i + used + 1] === 'one')) {
    const f = FRACTION_WORDS[words[i + used + 2]];
    if (f !== undefined && Number.isInteger(value)) { value += f; used += 3; }
  }
  // "1 1/2"
  if (Number.isInteger(value) && /^\d+\/\d+$/.test(words[i + used] || '')) {
    const [a, b] = words[i + used].split('/').map(Number);
    if (b && a < b) { value += a / b; used += 1; }
  }
  return { value, used };
}

function singularIsh(name) {
  return normalizeName(name);
}

// Finds spoken amounts in one sentence: "add two cups of flour and a teaspoon of salt".
export function spokenIngredients(sentence) {
  const words = String(sentence).toLowerCase()
    .replace(/[“”"()]/g, ' ')
    .replace(/(\d)\s*-\s*(\d)/g, '$1 to $2')
    .replace(/[,;:!?.](?=\s|$)/g, ' , ')
    .split(/\s+/).filter(Boolean);
  const found = [];
  for (let i = 0; i < words.length; i++) {
    const n = readSpokenNumber(words, i);
    // "a cup of", "an ounce of" — a lone "a" only counts when a unit follows.
    const isArticle = !n && (words[i] === 'a' || words[i] === 'an' || words[i] === 'another');
    if (!n && !isArticle) continue;
    let j = i + (n ? n.used : 1);
    let qty = n ? n.value : 1;
    // "half a cup", "half of a cup"
    if (n && words[i] === 'half' && (words[j] === 'a' || words[j] === 'an')) j++;
    let unit = UNITS[words[j]] || null;
    if (unit) j++;
    // "a cup and a half"
    if (unit && words[j] === 'and' && words[j + 1] === 'a' && FRACTION_WORDS[words[j + 2]] !== undefined) {
      qty += FRACTION_WORDS[words[j + 2]];
      j += 3;
    }
    if (isArticle && !unit) continue;
    if (words[j] === 'of') j++;
    // The name runs until a stop word or punctuation, at most four words.
    const name = [];
    while (j < words.length && name.length < 4 && words[j] !== ',' && !STOP.has(words[j])) {
      if (readSpokenNumber(words, j) && name.length) break;
      name.push(words[j]);
      j++;
    }
    let text = name.join(' ');
    while (FILLER_START.test(text)) text = text.replace(FILLER_START, '');
    text = text.replace(/[^a-z0-9'\s-]/g, '').trim();
    if (!text || NOT_FOOD.test(text) || NOT_FOOD.test(text.split(' ')[0])) continue;
    // A bare number with no unit needs a real food after it ("two eggs", not "two of those").
    if (!unit && /^(of|it|them|those|these|that|this|more|or|and)\b/.test(text)) continue;
    found.push({ qty, unit, name: text });
    i = j - 1;
  }
  return found;
}

const VERBS = /\b(add|adding|mix|stir|whisk|combine|pour|bake|cook|fry|boil|simmer|chop|dice|slice|mince|season|sprinkle|heat|preheat|place|put|toss|blend|fold|melt|saute|sauté|sear|roast|grill|serve|top|let|cover|drain|spread|roll|cut|marinate|transfer|remove|flip|garnish|layer|knead|beat|microwave|air fry|rest|reduce|squeeze|coat|dip|brush|shred|grate|peel|mash|bring|throw|toast|chill|refrigerate|freeze|pat|rinse|wash|cream|form|shape|press|scoop|stuff|wrap|crack|soak|broil|steam|zest|juice|thicken|stuffed)\b/i;
const CHATTER = /\b(follow|subscribe|like this video|link in (my )?bio|comment|let me know|smash that|hit the|part \d|don'?t forget to|check out|my channel|hey guys|what'?s up)\b/i;
const LEAD_IN = /^(so|okay|ok|alright|all right|now|next|then|and then|and|first|first up|after that|once that'?s done|once done|um|uh|guys|you guys|basically|finally|lastly|last)\b[,\s]*/i;

// Splits a transcript into sentences, also breaking on "then" / "next" / "after that".
export function transcriptSentences(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+|\s*\n\s*|,?\s+(?=(?:and then|then|next|after that|once that'?s done|now)\s)/i)
    .map(s => s.trim()).filter(Boolean);
}

function tidyStep(s) {
  let t = s.trim();
  let prev;
  do { prev = t; t = t.replace(LEAD_IN, '').trim(); } while (t !== prev);
  t = t.replace(/^(you('re| are)? (gonna|going to) |we('re| are)? (gonna|going to) |i('m| am)? (gonna|going to) |you want to |we want to |i like to |you('ll| will) |we('ll| will) |go ahead and )/i, '');
  t = t.replace(/[,\s]+$/, '');
  if (!t) return '';
  t = t[0].toUpperCase() + t.slice(1);
  if (!/[.!?]$/.test(t)) t += '.';
  return t;
}

// A dish name said out loud: "today we're making garlic butter chicken", "this is my famous chili".
export function spokenTitle(text) {
  const m = String(text || '').match(/\b(?:making|make|recipe for|how to make|this is(?: my| our)?(?: famous| favorite| favourite| easy| quick)?|here'?s(?: my| how to make)?)\s+(?:a |an |some |my |our |the |this |these |homemade |the best |easy |quick )*([a-z][a-z' -]{2,50}?)(?=[.,!?]| and | with | that | for | today| tonight| so |$)/i);
  if (!m) return '';
  const words = m[1].trim().split(/\s+/).slice(0, 6);
  if (!words.length || /^(it|this|that|sure|them)$/i.test(words[0])) return '';
  return words.map(w => (/^(and|with|of|or|in|the|a)$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1))).join(' ');
}

// Does this look like run-on spoken text rather than a written recipe?
export function looksLikeTranscript(text) {
  const t = String(text || '');
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return false;
  const avg = t.replace(/\s+/g, ' ').length / lines.length;
  return avg > 90 && spokenIngredients(t).length >= 2;
}

// Spoken text -> { name, ingredients, directions } (ingredients one per line, steps one per line).
export function parseTranscript(text) {
  const sentences = transcriptSentences(text);
  const items = [];
  const steps = [];
  for (const s of sentences) {
    if (CHATTER.test(s)) continue;
    for (const ing of spokenIngredients(s)) {
      const key = singularIsh(ing.name);
      const same = items.find(x => x.key === key && x.unit === ing.unit);
      if (same) same.qty += ing.qty; // "add another tablespoon of butter"
      else items.push({ ...ing, key });
    }
    if (VERBS.test(s)) {
      const step = tidyStep(s);
      if (step.split(/\s+/).length >= 2) steps.push(step);
    }
  }
  return {
    name: spokenTitle(text),
    ingredients: items.map(x => buildLine({ qty: x.qty, unit: x.unit, name: x.name })).join('\n'),
    directions: steps.join('\n'),
  };
}
