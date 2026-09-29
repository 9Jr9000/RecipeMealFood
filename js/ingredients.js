// Ingredient parsing, name normalization, aisle sorting and quantity math.
// Pure functions only (no DOM, no storage) so they can be unit tested in Node.

const UNICODE_FRACTIONS = {
  '¼': 0.25, '½': 0.5, '¾': 0.75, '⅐': 1 / 7, '⅑': 1 / 9, '⅒': 0.1,
  '⅓': 1 / 3, '⅔': 2 / 3, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
  '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
};

// Canonical unit -> spellings that map to it.
const UNIT_ALIASES = {
  tsp: ['tsp', 'tsps', 't', 'teaspoon', 'teaspoons'],
  tbsp: ['tbsp', 'tbsps', 'tbs', 'tbl', 'T', 'tablespoon', 'tablespoons'],
  cup: ['cup', 'cups', 'c'],
  'fl oz': ['fl oz', 'fl. oz.', 'fl. oz', 'fluid ounce', 'fluid ounces'],
  oz: ['oz', 'ozs', 'ounce', 'ounces'],
  lb: ['lb', 'lbs', 'pound', 'pounds'],
  g: ['g', 'gs', 'gram', 'grams', 'gr'],
  kg: ['kg', 'kgs', 'kilogram', 'kilograms'],
  ml: ['ml', 'mls', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
  l: ['l', 'liter', 'liters', 'litre', 'litres'],
  pt: ['pt', 'pint', 'pints'],
  qt: ['qt', 'quart', 'quarts'],
  gal: ['gal', 'gallon', 'gallons'],
  pinch: ['pinch', 'pinches'],
  dash: ['dash', 'dashes'],
  clove: ['clove', 'cloves'],
  can: ['can', 'cans'],
  jar: ['jar', 'jars'],
  package: ['package', 'packages', 'pkg', 'pkgs', 'packet', 'packets'],
  bunch: ['bunch', 'bunches'],
  head: ['head', 'heads'],
  stalk: ['stalk', 'stalks'],
  sprig: ['sprig', 'sprigs'],
  slice: ['slice', 'slices'],
  stick: ['stick', 'sticks'],
  piece: ['piece', 'pieces'],
  bag: ['bag', 'bags'],
  bottle: ['bottle', 'bottles'],
  box: ['box', 'boxes'],
  handful: ['handful', 'handfuls'],
};

const UNIT_LOOKUP = new Map();
for (const [canon, spellings] of Object.entries(UNIT_ALIASES)) {
  for (const s of spellings) {
    // Single capital "T" means tablespoon; everything else is case-insensitive.
    UNIT_LOOKUP.set(s === 'T' ? s : s.toLowerCase(), canon);
  }
}

// Convertible units, expressed in a base unit per dimension.
const VOLUME_TSP = { tsp: 1, tbsp: 3, 'fl oz': 6, cup: 48, pt: 96, qt: 192, gal: 768, ml: 0.202884, l: 202.884 };
const WEIGHT_G = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };

const PREP_WORDS = [
  'chopped', 'finely', 'roughly', 'coarsely', 'thinly', 'minced', 'diced', 'sliced', 'grated',
  'shredded', 'crushed', 'peeled', 'seeded', 'cubed', 'halved', 'quartered', 'trimmed',
  'softened', 'melted', 'beaten', 'divided', 'packed', 'lightly', 'firmly', 'fresh', 'freshly',
  'large', 'medium', 'small', 'whole', 'optional', 'to taste', 'room temperature', 'plus more', 'for serving', 'for garnish', 'about', 'heaping', 'level',
  'rinsed', 'drained', 'ripe', 'cooked', 'uncooked', 'toasted', 'extra-virgin', 'extra virgin',
];

// Words that are safe to singularize by just dropping a trailing "s".
const IRREGULAR_PLURALS = {
  leaves: 'leaf', loaves: 'loaf', halves: 'half', knives: 'knife',
  potatoes: 'potato', tomatoes: 'tomato', mangoes: 'mango', avocados: 'avocado',
  radishes: 'radish', peaches: 'peach', squashes: 'squash', dishes: 'dish',
  anchovies: 'anchovy', berries: 'berry', cherries: 'cherry', chilies: 'chili',
  chiles: 'chile', cloves: 'clove', olives: 'olive', chives: 'chives',
  molasses: 'molasses', couscous: 'couscous', hummus: 'hummus', asparagus: 'asparagus',
  swiss: 'swiss', grass: 'grass', bass: 'bass', oats: 'oats', greens: 'greens',
  noodles: 'noodles', peas: 'peas', lentils: 'lentils', beans: 'beans', grits: 'grits',
  sprouts: 'sprouts', brussels: 'brussels', flakes: 'flakes', chips: 'chips', eggs: 'egg',
};

function singularize(word) {
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word];
  if (word.length <= 3) return word;
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y';
  if (/(ch|sh|x|ss)es$/.test(word)) return word.slice(0, -2);
  if (/[^su]s$/.test(word)) return word.slice(0, -1);
  return word;
}

function parseNumberToken(tok) {
  if (!tok) return null;
  if (UNICODE_FRACTIONS[tok] !== undefined) return UNICODE_FRACTIONS[tok];
  // "1½"
  const mixedUni = tok.match(/^(\d+)([¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/);
  if (mixedUni) return Number(mixedUni[1]) + UNICODE_FRACTIONS[mixedUni[2]];
  const frac = tok.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  if (/^\d*\.?\d+$/.test(tok)) return Number(tok);
  return null;
}

// Reads a leading quantity ("1", "1 1/2", "1½", "1-2", "2 to 3", "½") from a string.
// Returns { qty, qtyMax, rest } — qty is null when there is no leading number.
export function readQuantity(text) {
  let s = text.trim();
  const numRe = /^(\d+[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+\/\d+|\d*\.\d+|\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/;

  const readOne = () => {
    const m = s.match(numRe);
    if (!m) return null;
    let val = parseNumberToken(m[1]);
    s = s.slice(m[1].length);
    // Mixed number: "1 1/2" or "1 ½"
    const mixed = s.match(/^\s+(\d+\/\d+|[¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])(?![\d/])/);
    if (mixed && Number.isInteger(val)) {
      val += parseNumberToken(mixed[1]);
      s = s.slice(mixed[0].length);
    }
    return val;
  };

  const qty = readOne();
  if (qty === null) return { qty: null, qtyMax: null, rest: text.trim() };

  let qtyMax = null;
  const range = s.match(/^\s*(-|–|—|to|or)\s*/i);
  if (range) {
    const saved = s;
    s = s.slice(range[0].length);
    qtyMax = readOne();
    if (qtyMax === null) s = saved;
  }
  return { qty, qtyMax, rest: s.trim() };
}

function readUnit(text) {
  const s = text.trim();
  // Try longest spellings first ("fl oz" before "oz").
  const m = s.match(/^([a-zA-Z]+\.?(?:\s+[a-zA-Z]+\.?)?)/);
  if (!m) return { unit: null, rest: s };
  const words = m[1].split(/\s+/);
  const candidates = words.length > 1 ? [m[1], words[0]] : [words[0]];
  for (const cand of candidates) {
    const clean = cand.replace(/\.$/, '');
    const hit = UNIT_LOOKUP.get(clean === 'T' ? 'T' : clean.toLowerCase()) ||
      UNIT_LOOKUP.get(cand === 'T' ? 'T' : cand.toLowerCase());
    // Guard: a lone "c" or "t" only counts as a unit when followed by more text.
    if (hit) {
      const rest = s.slice(cand.length).trim();
      if ((clean === 'c' || clean === 't' || clean === 'T' || clean === 'l' || clean === 'g') && !rest) continue;
      return { unit: hit, rest: rest.replace(/^of\s+/i, '') };
    }
  }
  return { unit: null, rest: s };
}

// A line like "For the sauce:" or "SAUCE" is a section header, not an ingredient.
export function isSectionHeader(line) {
  const t = line.trim();
  if (!t) return false;
  if (/:$/.test(t)) return true;
  if (/^#+\s/.test(t)) return true;
  return false;
}

// Normalizes an ingredient name into a key used to match the grocery list and pantry.
// "2 large Tomatoes, chopped" -> "tomato"; "Extra-virgin olive oil" -> "olive oil".
export function normalizeName(name) {
  let s = String(name || '').toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' '); // drop parentheticals
  s = s.split(/[,;]/)[0]; // drop everything after the first comma
  s = s.replace(/\bor\b.*$/, ' '); // "butter or margarine" -> "butter"
  for (const w of PREP_WORDS) {
    s = s.replace(new RegExp(`(^|\\s)${w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=\\s|$)`, 'g'), ' ');
  }
  s = s.replace(/[^a-z0-9\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^(of|a|an|the)\s+/, '');
  const words = s.split(' ').filter(Boolean);
  if (words.length) words[words.length - 1] = singularize(words[words.length - 1]);
  return words.join(' ');
}

// Parses one ingredient line into structured data.
export function parseIngredient(line) {
  const raw = String(line || '').trim().replace(/^[-*•·▢□]\s*/, '');
  if (!raw) return null;
  if (isSectionHeader(raw)) return { raw, header: raw.replace(/:$/, '').replace(/^#+\s*/, '') };

  const { qty, qtyMax, rest: afterQty } = readQuantity(raw);
  let unit = null;
  let rest = afterQty;
  if (qty !== null) {
    // "1 (14 oz) can tomatoes" -> skip the parenthetical size before the unit
    const paren = rest.match(/^\(([^)]*)\)\s*/);
    const r = readUnit(paren ? rest.slice(paren[0].length) : rest);
    if (r.unit) {
      unit = r.unit;
      rest = (paren ? `${r.rest} (${paren[1]})` : r.rest);
    }
  } else {
    // "Pinch of salt", "Handful of basil"
    const r = readUnit(rest);
    if (r.unit && /^(pinch|dash|handful)$/.test(r.unit)) {
      unit = r.unit;
      rest = r.rest;
    }
  }

  const name = rest.trim() || raw;
  return { raw, qty, qtyMax, unit, name, key: normalizeName(name) };
}

export function parseIngredients(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(parseIngredient)
    .filter(Boolean);
}

// ---------- Quantity formatting & math ----------

const NICE_FRACTIONS = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

export function formatQty(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  if (frac < 0.04) return String(whole);
  if (frac > 0.96) return String(whole + 1);
  for (const [v, glyph] of NICE_FRACTIONS) {
    if (Math.abs(frac - v) < 0.04) return whole ? `${whole}${glyph}` : glyph;
  }
  return String(Math.round(n * 100) / 100);
}

const ABBREVIATED_UNITS = new Set(['tsp', 'tbsp', 'fl oz', 'oz', 'lb', 'g', 'kg', 'ml', 'l', 'pt', 'qt', 'gal']);

// "cup" -> "cups", "pinch" -> "pinches"; abbreviations like "tbsp" stay as-is.
function unitFor(qty, unit) {
  if (!unit || ABBREVIATED_UNITS.has(unit) || !(qty > 1)) return unit;
  return /(ch|sh|x)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

export function formatAmount(qty, qtyMax, unit) {
  if (qty === null || qty === undefined) return unit || '';
  let s = formatQty(qty);
  const hasMax = qtyMax !== null && qtyMax !== undefined;
  if (hasMax) s += `–${formatQty(qtyMax)}`;
  if (unit) s += ` ${unitFor(hasMax ? qtyMax : qty, unit)}`;
  return s;
}

function dimensionOf(unit) {
  if (unit in VOLUME_TSP) return 'volume';
  if (unit in WEIGHT_G) return 'weight';
  return null;
}

// Sums a list of {qty, unit} amounts into as few amounts as possible.
// Compatible units are converted and summed; incompatible ones are kept separate.
export function combineAmounts(amounts) {
  const buckets = new Map(); // key -> {qty, unit}
  let unquantified = false;
  for (const a of amounts) {
    if (a.qty === null || a.qty === undefined) {
      if (a.unit && !buckets.has(`u:${a.unit}`)) buckets.set(`u:${a.unit}`, { qty: null, unit: a.unit });
      else if (!a.unit) unquantified = true;
      continue;
    }
    const unit = a.unit || null;
    const dim = unit ? dimensionOf(unit) : null;
    const key = dim || `u:${unit || ''}`;
    const prev = buckets.get(key);
    if (!prev || prev.qty === null) {
      buckets.set(key, { qty: a.qty, unit });
    } else if (dim) {
      const table = dim === 'volume' ? VOLUME_TSP : WEIGHT_G;
      // Keep the larger of the two units for readability.
      const target = table[prev.unit] >= table[unit] ? prev.unit : unit;
      const total = prev.qty * table[prev.unit] + a.qty * table[unit];
      buckets.set(key, { qty: total / table[target], unit: target });
    } else {
      prev.qty += a.qty;
    }
  }
  const out = [...buckets.values()];
  if (!out.length && unquantified) return [];
  return out;
}

export function describeAmounts(amounts) {
  return combineAmounts(amounts)
    .map(a => formatAmount(a.qty, null, a.unit))
    .filter(Boolean)
    .join(' + ');
}

// Scales a parsed ingredient and returns display text.
export function scaleIngredientText(parsed, factor) {
  if (!parsed || parsed.header) return parsed ? parsed.raw : '';
  if (parsed.qty === null || factor === 1) return parsed.raw;
  const amount = formatAmount(
    parsed.qty * factor,
    parsed.qtyMax !== null ? parsed.qtyMax * factor : null,
    parsed.unit,
  );
  return `${amount} ${parsed.name}`.trim();
}

// ---------- Aisles ----------

export const AISLES = [
  'Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery & Bread', 'Pantry & Dry Goods',
  'Baking', 'Spices & Seasonings', 'Oils, Sauces & Condiments', 'Canned & Jarred',
  'Frozen', 'Beverages', 'Snacks', 'Household', 'Other',
];

// Ordered: first match wins, so more specific phrases come before generic words.
const AISLE_RULES = [
  // Names that would otherwise be caught by a more generic word below.
  ['Produce', ['butternut', 'bell pepper', 'green bean', 'sweet potato', 'eggplant', 'cherry tomato', 'lemon juice', 'lime juice', 'lemon zest', 'lime zest', 'fresh ginger', 'ginger root']],
  ['Pantry & Dry Goods', ['rolled oats', 'bread crumb', 'breadcrumb']],
  ['Bakery & Bread', ['hamburger bun', 'hot dog bun']],
  ['Frozen', ['frozen', 'ice cream', 'sorbet']],
  ['Canned & Jarred', ['canned', 'can of', 'tomato paste', 'tomato sauce', 'crushed tomato', 'diced tomato', 'coconut milk', 'broth', 'stock', 'chickpea', 'black bean', 'kidney bean', 'pinto bean', 'cannellini', 'salsa', 'pickle', 'jam', 'jelly', 'peanut butter', 'tuna']],
  ['Spices & Seasonings', ['salt', 'pepper flake', 'black pepper', 'peppercorn', 'paprika', 'cumin', 'coriander', 'turmeric', 'cinnamon', 'nutmeg', 'clove', 'oregano', 'thyme dried', 'dried', 'chili powder', 'cayenne', 'curry', 'garam masala', 'bay leaf', 'seasoning', 'allspice', 'cardamom', 'ginger ground', 'ground ginger', 'garlic powder', 'onion powder', 'italian seasoning', 'red pepper flake', 'smoked paprika', 'saffron', 'star anise', 'fennel seed', 'mustard seed', 'sesame seed']],
  ['Baking', ['flour', 'sugar', 'baking soda', 'baking powder', 'yeast', 'vanilla', 'cocoa', 'chocolate chip', 'cornstarch', 'corn starch', 'powdered sugar', 'brown sugar', 'honey', 'maple syrup', 'molasses', 'sprinkles', 'gelatin', 'extract']],
  ['Oils, Sauces & Condiments', ['oil', 'vinegar', 'soy sauce', 'tamari', 'fish sauce', 'worcestershire', 'hot sauce', 'sriracha', 'ketchup', 'mustard', 'mayonnaise', 'mayo', 'sauce', 'dressing', 'miso', 'tahini', 'gochujang', 'harissa', 'pesto']],
  ['Meat & Seafood', ['chicken', 'beef', 'pork', 'bacon', 'sausage', 'turkey', 'lamb', 'ham', 'steak', 'ground', 'shrimp', 'salmon', 'fish', 'cod', 'tilapia', 'prosciutto', 'pancetta', 'chorizo', 'scallop', 'crab', 'lobster', 'mussel', 'clam', 'anchovy', 'veal', 'duck']],
  ['Dairy & Eggs', ['milk', 'butter', 'cheese', 'cream', 'yogurt', 'yoghurt', 'egg', 'parmesan', 'mozzarella', 'cheddar', 'feta', 'ricotta', 'sour cream', 'half-and-half', 'half and half', 'buttermilk', 'ghee', 'creme fraiche', 'mascarpone']],
  ['Bakery & Bread', ['bread', 'baguette', 'bun', 'roll', 'tortilla', 'pita', 'naan', 'bagel', 'croissant', 'english muffin', 'brioche', 'ciabatta']],
  ['Pantry & Dry Goods', ['rice', 'pasta', 'spaghetti', 'penne', 'noodle', 'macaroni', 'oats', 'quinoa', 'lentil', 'couscous', 'cereal', 'breadcrumb', 'panko', 'cracker', 'bean', 'nut', 'almond', 'walnut', 'pecan', 'cashew', 'peanut', 'raisin', 'seed', 'barley', 'farro', 'polenta', 'cornmeal', 'grits']],
  ['Beverages', ['coffee', 'tea', 'juice', 'soda', 'water', 'wine', 'beer', 'sparkling', 'kombucha']],
  ['Snacks', ['chip', 'pretzel', 'popcorn', 'cookie', 'granola bar']],
  ['Household', ['paper towel', 'foil', 'plastic wrap', 'parchment', 'detergent', 'soap', 'sponge', 'trash bag', 'napkin', 'toilet paper', 'zip bag', 'ziploc']],
  ['Produce', ['apple', 'banana', 'orange', 'lemon', 'lime', 'grape', 'berry', 'strawberr', 'blueberr', 'raspberr', 'cherry', 'peach', 'pear', 'plum', 'mango', 'pineapple', 'melon', 'avocado', 'tomato', 'onion', 'garlic', 'shallot', 'scallion', 'green onion', 'leek', 'potato', 'carrot', 'celery', 'pepper', 'jalapeno', 'jalapeño', 'chile', 'chili', 'cucumber', 'zucchini', 'squash', 'pumpkin', 'eggplant', 'lettuce', 'spinach', 'kale', 'arugula', 'cabbage', 'broccoli', 'cauliflower', 'asparagus', 'green bean', 'pea', 'corn', 'mushroom', 'ginger', 'basil', 'cilantro', 'parsley', 'mint', 'dill', 'rosemary', 'thyme', 'sage', 'chive', 'herb', 'radish', 'beet', 'sweet potato', 'yam', 'fennel', 'bok choy', 'sprout', 'greens', 'fruit', 'vegetable', 'salad']],
];

export function guessAisle(name) {
  const s = ` ${String(name || '').toLowerCase()} `;
  for (const [aisle, words] of AISLE_RULES) {
    // Match at the start of a word so "salt" doesn't match "unsalted".
    if (words.some(w => s.includes(` ${w}`) || s.includes(`-${w}`))) return aisle;
  }
  return 'Other';
}

// ---------- Recipe text import ----------

// Splits pasted recipe text (from a website, message, notes app...) into fields.
export function parseRecipeText(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim());
  const out = { name: '', ingredients: [], directions: [], notes: [], servings: '', prepTime: '', cookTime: '' };
  let section = null;
  for (const line of lines) {
    if (!line) continue;
    const lower = line.toLowerCase().replace(/[:#*]/g, '').trim();
    if (/^(ingredients?|what you('|’)ll need|you('|’)ll need)$/.test(lower)) { section = 'ingredients'; continue; }
    if (/^(directions?|instructions?|method|steps|preparation|how to make( it)?)$/.test(lower)) { section = 'directions'; continue; }
    if (/^(notes?|tips?|cook('|’)s notes?)$/.test(lower)) { section = 'notes'; continue; }
    const meta = line.match(/^(servings?|serves|yield|makes|prep(?: time)?|cook(?: time)?)\s*:?\s*(.+)$/i);
    if (meta && section !== 'directions') {
      const k = meta[1].toLowerCase();
      if (/^(serv|yield|makes)/.test(k)) out.servings = meta[2];
      else if (k.startsWith('prep')) out.prepTime = meta[2];
      else out.cookTime = meta[2];
      continue;
    }
    if (!section) {
      if (!out.name) { out.name = line.replace(/^#+\s*/, ''); continue; }
      // Before an explicit header, lines that start with a quantity look like ingredients.
      if (readQuantity(line).qty !== null) { section = 'ingredients'; }
      else continue;
    }
    if (section === 'directions') out.directions.push(line.replace(/^(step\s*)?\d+[.)]\s*/i, ''));
    else out[section].push(line);
  }
  return {
    name: out.name,
    servings: out.servings,
    prepTime: out.prepTime,
    cookTime: out.cookTime,
    ingredients: out.ingredients.join('\n'),
    directions: out.directions.join('\n\n'),
    notes: out.notes.join('\n'),
  };
}

// Reads a leading number out of "4 servings", "Serves 4-6", etc.
export function servingsNumber(servings) {
  const m = String(servings || '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}
