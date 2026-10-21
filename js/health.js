// Health & nutrition calculators. Pure functions (no DOM) so they can be unit tested.
// Nutrition data: USDA National Nutrient Database for Standard Reference, Release 28 (data/nutrition.json).

import { parseIngredients, ingredientAmounts, normalizeName } from './ingredients.js';

// ---------- Units ----------
export const LB_PER_KG = 2.20462;
export const CM_PER_IN = 2.54;
const G_PER = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const TSP_PER = { tsp: 1, tbsp: 3, 'fl oz': 6, cup: 48, pt: 96, qt: 192, gal: 768, ml: 0.20288, l: 202.88 };

// ---------- TDEE & macros ----------
export const ACTIVITY = [
  { id: 'sedentary', label: 'Sedentary — little or no exercise', factor: 1.2 },
  { id: 'light', label: 'Lightly active — exercise 1–3 days/week', factor: 1.375 },
  { id: 'moderate', label: 'Moderately active — exercise 3–5 days/week', factor: 1.55 },
  { id: 'very', label: 'Very active — hard exercise 6–7 days/week', factor: 1.725 },
  { id: 'extra', label: 'Extra active — physical job or training twice a day', factor: 1.9 },
];
export const GOALS = [
  { id: 'lose1', label: 'Lose 1 lb (0.45 kg) per week', delta: -500, protein: 2.0 },
  { id: 'lose05', label: 'Lose 0.5 lb (0.23 kg) per week', delta: -250, protein: 1.8 },
  { id: 'maintain', label: 'Maintain weight', delta: 0, protein: 1.6 },
  { id: 'gain05', label: 'Gain 0.5 lb (0.23 kg) per week', delta: 250, protein: 1.8 },
  { id: 'gain1', label: 'Gain 1 lb (0.45 kg) per week', delta: 500, protein: 1.8 },
];

// Mifflin–St Jeor resting metabolic rate. Weight in kg, height in cm, age in years.
export function bmr({ sex, weightKg, heightCm, age }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5);
}

// Daily calories and macro targets.
export function tdeeAndMacros({ sex, age, weightKg, heightCm, activity = 'moderate', goal = 'maintain' }) {
  const act = ACTIVITY.find(a => a.id === activity) || ACTIVITY[2];
  const g = GOALS.find(x => x.id === goal) || GOALS[2];
  const rest = bmr({ sex, weightKg, heightCm, age });
  const tdee = rest * act.factor;
  const floor = sex === 'female' ? 1200 : 1500; // common minimums without medical supervision
  let target = tdee + g.delta;
  const clamped = target < floor;
  if (clamped) target = floor;
  // Protein by body weight (capped at 35% of calories), fat 25% of calories, carbs the rest.
  const protein = Math.min(weightKg * g.protein, (target * 0.35) / 4);
  const fat = (target * 0.25) / 9;
  const carbs = Math.max(0, (target - protein * 4 - fat * 9) / 4);
  return {
    bmr: Math.round(rest),
    tdee: Math.round(tdee),
    target: Math.round(target),
    clamped,
    macros: {
      protein: Math.round(protein),
      fat: Math.round(fat),
      carbs: Math.round(carbs),
    },
    percents: {
      protein: Math.round((protein * 4 / target) * 100),
      fat: Math.round((fat * 9 / target) * 100),
      carbs: Math.round((carbs * 4 / target) * 100),
    },
  };
}

// ---------- Body fat (U.S. Navy method) ----------
// Measurements in inches.
export function bodyFatNavy({ sex, heightIn, neckIn, waistIn, hipIn = 0 }) {
  const log = Math.log10;
  if (sex === 'female') {
    const d = waistIn + hipIn - neckIn;
    if (!(d > 0) || !(heightIn > 0)) return null;
    return 163.205 * log(d) - 97.684 * log(heightIn) - 78.387;
  }
  const d = waistIn - neckIn;
  if (!(d > 0) || !(heightIn > 0)) return null;
  return 86.010 * log(d) - 70.041 * log(heightIn) + 36.76;
}

// American Council on Exercise ranges.
export function bodyFatCategory(sex, pct) {
  const ranges = sex === 'female'
    ? [[14, 'Essential fat'], [21, 'Athletic'], [25, 'Fitness'], [32, 'Average'], [Infinity, 'Above average']]
    : [[6, 'Essential fat'], [14, 'Athletic'], [18, 'Fitness'], [25, 'Average'], [Infinity, 'Above average']];
  return ranges.find(([max]) => pct < max)[1];
}

// ---------- Water intake ----------
export const CLIMATES = [
  { id: 'cool', label: 'Cool or mild', extraOz: 0 },
  { id: 'warm', label: 'Warm', extraOz: 12 },
  { id: 'hot', label: 'Hot or humid', extraOz: 24 },
];

// Roughly half an ounce per pound of body weight, plus 12 oz per 30 minutes of exercise and
// extra for heat. Returns fluid ounces and liters.
export function waterIntake({ weightLb, exerciseMin = 0, climate = 'cool' }) {
  const c = CLIMATES.find(x => x.id === climate) || CLIMATES[0];
  const oz = weightLb * 0.5 + (exerciseMin / 30) * 12 + c.extraOz;
  return { oz: Math.round(oz), liters: Math.round((oz * 29.5735) / 100) / 10, cups: Math.round(oz / 8 * 10) / 10 };
}

// ---------- Nutrition database ----------

// FDA Daily Values (2,000 kcal diet) for the % DV column.
export const DAILY_VALUES = {
  kcal: 2000, fat: 78, satFat: 20, cholesterol: 300, sodium: 2300, carbs: 275, fiber: 28, sugar: null,
  protein: 50, vitD: 20, calcium: 1300, iron: 18, potassium: 4700, vitA: 900, vitC: 90, vitE: 15, vitK: 120,
  thiamin: 1.2, riboflavin: 1.3, niacin: 16, vitB6: 1.7, folate: 400, vitB12: 2.4, magnesium: 420,
  phosphorus: 1250, zinc: 11, selenium: 55,
};

export const NUTRIENT_LABELS = {
  kcal: 'Calories', protein: 'Protein', fat: 'Total fat', satFat: 'Saturated fat', cholesterol: 'Cholesterol',
  sodium: 'Sodium', carbs: 'Carbohydrates', fiber: 'Fiber', sugar: 'Sugars', potassium: 'Potassium',
  calcium: 'Calcium', iron: 'Iron', magnesium: 'Magnesium', phosphorus: 'Phosphorus', zinc: 'Zinc',
  selenium: 'Selenium', vitA: 'Vitamin A', vitC: 'Vitamin C', vitD: 'Vitamin D', vitE: 'Vitamin E',
  vitK: 'Vitamin K', thiamin: 'Thiamin (B1)', riboflavin: 'Riboflavin (B2)', niacin: 'Niacin (B3)',
  vitB6: 'Vitamin B6', folate: 'Folate', vitB12: 'Vitamin B12',
};

// Turns data/nutrition.json into searchable food objects.
export function loadFoods(json) {
  const fields = json.fields;
  return json.foods.map(row => {
    const n = {};
    fields.forEach((f, i) => { n[f] = row[3 + i]; });
    const name = row[1];
    return {
      id: row[0],
      name,
      group: row[2],
      n,
      portions: row[3 + fields.length] || [],
      words: name.toLowerCase().split(/[^a-z0-9%]+/).filter(Boolean),
      head: name.toLowerCase().split(',')[0],
    };
  });
}

const singular = w => w.replace(/(ies)$/, 'y').replace(/(oes|ches|shes|sses)$/, m => m.slice(0, -2)).replace(/([^s])s$/, '$1');

// Everyday names for the USDA entry people usually mean.
const ALIASES = {
  egg: 'Egg, whole, raw, fresh',
  flour: 'Wheat flour, white, all-purpose, enriched, bleached',
  'all-purpose flour': 'Wheat flour, white, all-purpose, enriched, bleached',
  sugar: 'Sugars, granulated',
  'granulated sugar': 'Sugars, granulated',
  'brown sugar': 'Sugars, brown',
  'powdered sugar': 'Sugars, powdered',
  salt: 'Salt, table',
  'kosher salt': 'Salt, table',
  butter: 'Butter, salted',
  'unsalted butter': 'Butter, without salt',
  milk: 'Milk, whole, 3.25% milkfat, with added vitamin D',
  'olive oil': 'Oil, olive, salad or cooking',
  'vegetable oil': 'Oil, vegetable, soybean, refined',
  'canola oil': 'Oil, canola',
  garlic: 'Garlic, raw',
  onion: 'Onions, raw',
  'yellow onion': 'Onions, raw',
  rice: 'Rice, white, long-grain, regular, raw, enriched',
  'white rice': 'Rice, white, long-grain, regular, raw, enriched',
  spaghetti: 'Pasta, dry, enriched',
  pasta: 'Pasta, dry, enriched',
  penne: 'Pasta, dry, enriched',
  'chicken breast': 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw',
  'chicken thigh': 'Chicken, broilers or fryers, dark meat, thigh, meat only, raw',
  'ground beef': 'Beef, ground, 80% lean meat / 20% fat, raw',
  bacon: 'Pork, cured, bacon, unprepared',
  'heavy cream': 'Cream, fluid, heavy whipping',
  'sour cream': 'Cream, sour, cultured',
  'cream cheese': 'Cheese, cream',
  parmesan: 'Cheese, parmesan, grated',
  cheddar: 'Cheese, cheddar',
  'cheddar cheese': 'Cheese, cheddar',
  mozzarella: 'Cheese, mozzarella, whole milk',
  'soy sauce': 'Soy sauce made from soy and wheat (shoyu)',
  honey: 'Honey',
  'lemon juice': 'Lemon juice, raw',
  'lime juice': 'Lime juice, raw',
  lemon: 'Lemons, raw, without peel',
  lime: 'Limes, raw',
  tomato: 'Tomatoes, red, ripe, raw, year round average',
  potato: 'Potatoes, flesh and skin, raw',
  carrot: 'Carrots, raw',
  'black pepper': 'Spices, pepper, black',
  pepper: 'Spices, pepper, black',
  'baking soda': 'Leavening agents, baking soda',
  'baking powder': 'Leavening agents, baking powder, double-acting, sodium aluminum sulfate',
  'vanilla extract': 'Vanilla extract',
  'chicken broth': 'Soup, chicken broth, ready-to-serve',
  'chicken stock': 'Soup, stock, chicken, home-prepared',
  water: 'Beverages, water, tap, drinking',
  tortilla: 'Tortillas, ready-to-bake or -fry, flour, refrigerated',
  'corn tortilla': 'Tortillas, ready-to-bake or -fry, corn',
  avocado: 'Avocados, raw, all commercial varieties',
  banana: 'Bananas, raw',
  apple: 'Apples, raw, with skin',
  spinach: 'Spinach, raw',
  broccoli: 'Broccoli, raw',
  'bell pepper': 'Peppers, sweet, red, raw',
  'green onion': 'Onions, spring or scallions (includes tops and bulb), raw',
  scallion: 'Onions, spring or scallions (includes tops and bulb), raw',
  cilantro: 'Coriander (cilantro) leaves, raw',
  'peanut butter': 'Peanut butter, smooth style, without salt',
  oats: 'Cereals, oats, regular and quick, not fortified, dry',
  'rolled oats': 'Cereals, oats, regular and quick, not fortified, dry',
  'greek yogurt': 'Yogurt, Greek, plain, whole milk',
  yogurt: 'Yogurt, plain, whole milk, 8 grams protein per 8 ounce',
  bread: 'Bread, white, commercially prepared (includes soft bread crumbs)',
  cumin: 'Spices, cumin seed',
  'ground cumin': 'Spices, cumin seed',
  'chili powder': 'Spices, chili powder',
  paprika: 'Spices, paprika',
  cinnamon: 'Spices, cinnamon, ground',
  oregano: 'Spices, oregano, dried',
  'garlic powder': 'Spices, garlic powder',
  'onion powder': 'Spices, onion powder',
  ginger: 'Ginger root, raw',
  shrimp: 'Crustaceans, shrimp, raw (not previously frozen)',
  salmon: 'Fish, salmon, Atlantic, farmed, raw',
  tofu: 'Tofu, raw, firm, prepared with calcium sulfate',
  buttermilk: 'Milk, buttermilk, fluid, whole',
  'black beans': 'Beans, black turtle, mature seeds, canned',
  'black bean': 'Beans, black turtle, mature seeds, canned',
  chickpeas: 'Chickpeas (garbanzo beans, bengal gram), mature seeds, canned, drained solids',
  'kidney beans': 'Beans, kidney, red, mature seeds, canned, drained solids',
};

export function foodByName(foods, name) {
  return foods.find(f => f.name === name) || null;
}

// Ranks foods for a search like "ground beef" or "cheddar".
export function searchFoods(foods, query, limit = 30) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const words = q.split(/[^a-z0-9%]+/).filter(Boolean);
  if (!words.length) return [];
  const results = [];
  for (const f of foods) {
    let score = 0;
    let ok = true;
    for (const w of words) {
      const sw = singular(w);
      if (f.words.includes(w) || f.words.includes(sw) || f.words.some(t => singular(t) === sw)) score += 30;
      else if (f.words.some(t => t.startsWith(w))) score += 12;
      else { ok = false; break; }
    }
    if (!ok) continue;
    // Prefer entries whose main name (before the first comma) is what was searched,
    // short plain entries, and raw/whole versions over prepared products.
    if (words.every(w => f.head.includes(singular(w)))) score += 25;
    if (f.head.startsWith(singular(words[0]))) score += 15;
    if (/\b(raw|fresh)\b/.test(f.name.toLowerCase())) score += 6;
    if (/[A-Z]{3,}/.test(f.name)) score -= 25; // brand names (KRAFT, KELLOGG'S...)
    // Dried/powdered/dehydrated forms only when asked for ("buttermilk" means the liquid).
    if (/\b(dried|dehydrated|powder|powdered|freeze-dried|dry|imitation|substitute)\b/i.test(f.name) && !/\b(dried|dry|powder|powdered|dehydrated)\b/.test(q)) score -= 20;
    score -= f.name.length / 6;
    results.push([score, f]);
  }
  results.sort((a, b) => b[0] - a[0]);
  const list = results.slice(0, limit).map(r => r[1]);
  // The everyday choice for a common name ("egg" -> whole egg) goes first.
  const alias = ALIASES[normalizeName(q)] || ALIASES[q];
  const pick = alias && foods.find(f => f.name === alias);
  return pick ? [pick, ...list.filter(f => f !== pick)].slice(0, limit) : list;
}

// Best USDA entry for an ingredient name from a recipe ("2 cups all-purpose flour" -> flour).
export function matchFood(foods, ingredientName) {
  const key = normalizeName(ingredientName);
  if (!key) return null;
  const alias = ALIASES[key] || ALIASES[key.split(' ').slice(-2).join(' ')] || ALIASES[key.split(' ').pop()];
  if (alias && (ALIASES[key] || !/\b(powder|sauce|juice|oil|broth|stock|paste)\b/.test(key))) {
    const f = foodByName(foods, ALIASES[key] || alias);
    if (f) return f;
  }
  return searchFoods(foods, key, 1)[0] || null;
}

// ---------- Amounts ----------

// Units offered for a food: weights always, plus its household measures ("1 cup", "1 large").
export function unitOptions(food) {
  const opts = [{ id: 'g', label: 'g' }, { id: 'oz', label: 'oz' }, { id: 'lb', label: 'lb' }, { id: 'kg', label: 'kg' }];
  const vol = volumePortion(food);
  if (vol) for (const u of ['cup', 'tbsp', 'tsp']) opts.push({ id: u, label: u });
  (food?.portions || []).forEach(([g, desc], i) => {
    if (!portionVolumeUnit(desc)) opts.push({ id: `p${i}`, label: cleanPortion(desc), grams: g });
  });
  return opts;
}

function cleanPortion(desc) {
  return String(desc).replace(/^1\s+/, '').replace(/\s+/g, ' ').trim();
}

function portionVolumeUnit(desc) {
  const m = String(desc).toLowerCase().match(/^([\d./ ]+)?\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|fl oz)\b/);
  if (!m) return null;
  const unit = /^cup/.test(m[2]) ? 'cup' : /^(tbsp|tablespoon)/.test(m[2]) ? 'tbsp' : /^(tsp|teaspoon)/.test(m[2]) ? 'tsp' : 'fl oz';
  let qty = 1;
  if (m[1]) {
    const t = m[1].trim();
    const frac = t.match(/^(\d+)\/(\d+)$/);
    qty = frac ? Number(frac[1]) / Number(frac[2]) : Number(t) || 1;
  }
  return { unit, qty };
}

// Grams per teaspoon for a food, from its first volume measure.
function volumePortion(food) {
  for (const [g, desc] of food?.portions || []) {
    const v = portionVolumeUnit(desc);
    if (v) return g / (v.qty * TSP_PER[v.unit]);
  }
  return null;
}

// Converts an amount of a food to grams. Returns { grams, approx }; grams is null when unknown.
export function toGrams(food, qty, unit) {
  if (qty === null || qty === undefined || Number.isNaN(qty)) return { grams: null, approx: false };
  if (!unit) {
    // A count ("2 eggs"): use the first non-volume household measure ("1 large").
    const each = (food?.portions || []).find(([, d]) => !portionVolumeUnit(d));
    return each ? { grams: qty * each[0], approx: false } : { grams: null, approx: false };
  }
  if (/^p\d+$/.test(unit)) {
    const p = food?.portions?.[Number(unit.slice(1))];
    return p ? { grams: qty * p[0], approx: false } : { grams: null, approx: false };
  }
  if (G_PER[unit]) return { grams: qty * G_PER[unit], approx: false };
  if (TSP_PER[unit]) {
    const perTsp = volumePortion(food);
    // Without a measured cup/tbsp for this food, assume the density of water.
    return { grams: qty * TSP_PER[unit] * (perTsp || 4.93), approx: !perTsp };
  }
  // Other recipe units (clove, slice, can...): match a household measure with that word.
  const p = (food?.portions || []).find(([, d]) => new RegExp(`\\b${unit}`, 'i').test(d));
  return p ? { grams: qty * p[0], approx: false } : { grams: null, approx: false };
}

export function nutrientsFor(food, grams) {
  const out = {};
  for (const [k, v] of Object.entries(food.n)) out[k] = v === null || v === undefined ? null : (v * grams) / 100;
  return out;
}

export function sumNutrients(list) {
  const total = {};
  for (const n of list) {
    for (const [k, v] of Object.entries(n)) {
      if (v === null || v === undefined) continue;
      total[k] = (total[k] || 0) + v;
    }
  }
  return total;
}

// Turns a recipe's ingredients into calculator rows: { text, food, qty, unit, grams }.
export function rowsFromRecipe(foods, recipe) {
  const rows = [];
  for (const p of parseIngredients(recipe.ingredients || '')) {
    if (p.header) continue;
    const food = matchFood(foods, p.name);
    const amounts = ingredientAmounts(p);
    const qty = amounts.length && amounts[0].qty !== null ? amounts[0].qty : null;
    const unit = amounts.length ? amounts[0].unit : null;
    rows.push({ text: p.raw, foodId: food ? food.id : null, qty, unit: unit || (qty !== null ? null : 'g') });
  }
  return rows;
}

// ---------- Ingredient swaps ----------
// save: 1 = small, 2 = moderate, 3 = big savings (typical U.S. grocery prices).
export const SWAPS = [
  { from: 'Pine nuts', to: 'Sunflower seeds', ratio: 'Same amount', save: 3, match: /\bpine nut/, note: 'Toast them for pesto — nutty, similar texture.', fromFood: 'Nuts, pine nuts, dried', toFood: 'Seeds, sunflower seed kernels, dried' },
  { from: 'Fresh herbs (for cooking)', to: 'Dried herbs', ratio: '1 tbsp fresh = 1 tsp dried', save: 2, match: /\b(fresh (basil|oregano|thyme|rosemary|parsley|dill|sage))\b/, note: 'Best in soups, sauces and anything simmered. Keep fresh herbs for garnish.' },
  { from: 'Buttermilk', to: 'Milk + lemon juice or vinegar', ratio: '1 cup milk + 1 tbsp lemon juice; rest 5 min', save: 1, match: /\bbuttermilk\b/, note: 'Works in pancakes, biscuits and marinades.', fromFood: 'Milk, buttermilk, fluid, whole', toFood: 'Milk, whole, 3.25% milkfat, with added vitamin D' },
  { from: 'Heavy cream (in sauces & soups)', to: 'Whole milk + butter', ratio: '¾ cup milk + ¼ cup melted butter = 1 cup', save: 1, match: /\bheavy (whipping )?cream\b/, note: 'Won’t whip — use only for cooking.', fromFood: 'Cream, fluid, heavy whipping', toFood: 'Milk, whole, 3.25% milkfat, with added vitamin D' },
  { from: 'Sour cream', to: 'Plain Greek yogurt', ratio: 'Same amount', save: 1, match: /\bsour cream\b/, note: 'More protein and less fat. Stir into hot dishes off the heat.', fromFood: 'Cream, sour, cultured', toFood: 'Yogurt, Greek, plain, whole milk' },
  { from: 'Ricotta', to: 'Cottage cheese, blended smooth', ratio: 'Same amount', save: 2, match: /\bricotta\b/, note: 'Great in lasagna and stuffed shells.', fromFood: 'Cheese, ricotta, whole milk', toFood: 'Cheese, cottage, lowfat, 2% milkfat' },
  { from: 'Gruyère', to: 'Swiss cheese', ratio: 'Same amount', save: 2, match: /\bgruy[eè]re\b/, note: 'Melts the same way in gratins and grilled cheese.', fromFood: 'Cheese, gruyere', toFood: 'Cheese, swiss' },
  { from: 'Fresh mozzarella', to: 'Low-moisture mozzarella', ratio: 'Same amount', save: 1, match: /\bfresh mozzarella\b/, note: 'Better for pizza anyway — less watery.', fromFood: 'Cheese, mozzarella, whole milk', toFood: 'Cheese, mozzarella, whole milk, low moisture' },
  { from: 'Mascarpone', to: 'Cream cheese + a splash of cream', ratio: '8 oz cream cheese + 2 tbsp cream', save: 2, match: /\bmascarpone\b/, note: 'Beat until smooth. Slightly tangier.' },
  { from: 'Chicken breast', to: 'Boneless chicken thighs', ratio: 'Same weight', save: 2, match: /\bchicken breasts?\b/, note: 'Juicier and harder to overcook; a bit more fat.', fromFood: 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw', toFood: 'Chicken, broilers or fryers, dark meat, thigh, meat only, raw' },
  { from: 'Beef tenderloin or steak (for stews & braises)', to: 'Chuck roast', ratio: 'Same weight', save: 3, match: /\b(tenderloin|sirloin|ribeye|filet)\b/, note: 'Slow-cook or braise until tender.', fromFood: 'Beef, tenderloin, steak, separable lean only, trimmed to 1/8" fat, select, raw', toFood: 'Beef, chuck for stew, separable lean and fat, all grades, raw' },
  { from: 'Ground beef', to: 'Half ground beef, half cooked lentils', ratio: 'Replace half the beef', save: 2, match: /\bground beef\b/, note: 'Tacos, chili, sloppy joes, pasta sauce. Adds fiber.', fromFood: 'Beef, ground, 80% lean meat / 20% fat, raw', toFood: 'Lentils, mature seeds, cooked, boiled, without salt' },
  { from: 'Fresh salmon (in patties, salads, pasta)', to: 'Canned salmon', ratio: '6 oz can ≈ 6 oz cooked fillet', save: 3, match: /\bsalmon\b/, note: 'Soft bones add calcium.', fromFood: 'Fish, salmon, Atlantic, farmed, raw', toFood: 'Fish, salmon, pink, canned, drained solids' },
  { from: 'Pancetta', to: 'Bacon', ratio: 'Same amount', save: 2, match: /\bpancetta\b/, note: 'Smokier; blanch 1 minute if you want it milder.' },
  { from: 'Fresh berries (smoothies, baking, sauces)', to: 'Frozen berries', ratio: 'Same amount', save: 2, match: /\b(blueberr|raspberr|strawberr|blackberr|berries)/, note: 'Frozen at peak ripeness; don’t thaw before baking.', fromFood: 'Blueberries, raw', toFood: 'Blueberries, frozen, unsweetened' },
  { from: 'Fresh spinach (cooked dishes)', to: 'Frozen spinach', ratio: '10 oz frozen ≈ 1 lb fresh, cooked', save: 2, match: /\bspinach\b/, note: 'Squeeze out the water first.', fromFood: 'Spinach, raw', toFood: 'Spinach, frozen, chopped or leaf, unprepared' },
  { from: 'Shallots', to: 'Yellow onion + a little garlic', ratio: '1 shallot ≈ ¼ small onion', save: 2, match: /\bshallots?\b/, note: 'Use a bit less onion; it’s stronger.', fromFood: 'Shallots, raw', toFood: 'Onions, raw' },
  { from: 'Leeks', to: 'Yellow onions', ratio: '1 leek ≈ 1 medium onion', save: 1, match: /\bleeks?\b/, note: 'Cook a little longer for sweetness.' },
  { from: 'Red, yellow or orange bell peppers', to: 'Green bell peppers', ratio: 'Same amount', save: 1, match: /\b(red|yellow|orange) bell peppers?\b/, note: 'Less sweet, more grassy. Great cooked.', fromFood: 'Peppers, sweet, red, raw', toFood: 'Peppers, sweet, green, raw' },
  { from: 'Vanilla beans', to: 'Vanilla extract', ratio: '1 bean = 1 tbsp extract', save: 3, match: /\bvanilla beans?\b/, note: 'Add extract at the end of cooking.' },
  { from: 'Saffron (for color)', to: 'Turmeric', ratio: '¼ tsp turmeric per pinch of saffron', save: 3, match: /\bsaffron\b/, note: 'Gives the golden color; the flavor is different.', fromFood: 'Spices, saffron', toFood: 'Spices, turmeric, ground' },
  { from: 'Wine (in cooking)', to: 'Broth + a little vinegar', ratio: '1 cup broth + 1 tsp vinegar = 1 cup wine', save: 2, match: /\b(white|red|dry) wine\b/, note: 'Use red wine vinegar for red wine, white for white.' },
  { from: 'Cake flour', to: 'All-purpose flour + cornstarch', ratio: '1 cup AP flour − 2 tbsp + 2 tbsp cornstarch', save: 1, match: /\bcake flour\b/, note: 'Sift twice for the lightest crumb.', fromFood: 'Wheat flour, white, cake, enriched', toFood: 'Wheat flour, white, all-purpose, enriched, bleached' },
  { from: 'Self-rising flour', to: 'All-purpose flour + baking powder + salt', ratio: '1 cup AP + 1½ tsp baking powder + ¼ tsp salt', save: 1, match: /\bself[- ]rising flour\b/, note: 'Whisk together before using.' },
  { from: 'Brown sugar', to: 'White sugar + molasses', ratio: '1 cup sugar + 1 tbsp molasses', save: 1, match: /\bbrown sugar\b/, note: 'Use 2 tbsp molasses for dark brown sugar.', fromFood: 'Sugars, brown', toFood: 'Sugars, granulated' },
  { from: 'Powdered sugar', to: 'Blended granulated sugar + cornstarch', ratio: '1 cup sugar + 1 tbsp cornstarch, blended fine', save: 1, match: /\b(powdered|confectioners'?) sugar\b/, note: 'Blend in a blender until powdery.' },
  { from: 'Panko', to: 'Crumbs from stale bread or crackers', ratio: 'Same amount', save: 1, match: /\bpanko\b/, note: 'Toast in a dry pan for crunch.' },
  { from: 'Quinoa', to: 'Brown rice', ratio: 'Same amount cooked', save: 2, match: /\bquinoa\b/, note: 'Slightly less protein — add beans to make it up.', fromFood: 'Quinoa, cooked', toFood: 'Rice, brown, long-grain, cooked' },
  { from: 'Fresh lemon juice (in cooking)', to: 'Bottled lemon juice', ratio: 'Same amount', save: 1, match: /\b(fresh )?lemon juice\b/, note: 'Use fresh where lemon is the star (dressings, drinks).', fromFood: 'Lemon juice, raw', toFood: 'Lemon juice from concentrate, canned or bottled' },
  { from: 'Butter (in muffins & quick breads)', to: 'Vegetable oil', ratio: '¾ cup oil for 1 cup butter', save: 1, match: /\bbutter\b/, note: 'Moister crumb; not for cookies or pastry.', fromFood: 'Butter, salted', toFood: 'Oil, canola' },
  { from: 'Carton broth', to: 'Bouillon base or cubes + water', ratio: '1 cube or 1 tsp base per cup of water', save: 2, match: /\b(broth|stock)\b/, note: 'Saltier — taste before adding salt.' },
  { from: 'Eggs (binding in baking)', to: 'Flax "egg"', ratio: '1 tbsp ground flaxseed + 3 tbsp water per egg', save: 1, match: /\beggs?\b/, note: 'Rest 5 minutes to thicken. Best for muffins and cookies, not cakes that need lift.' },
  { from: 'Store-bought taco seasoning', to: 'Homemade mix', ratio: '1 packet ≈ 1 tbsp chili powder + 1 tsp cumin + ½ tsp each garlic powder, onion powder, paprika, salt', save: 1, match: /\btaco seasoning\b/, note: 'Less salt, no fillers.' },
  { from: 'San Marzano tomatoes', to: 'Regular canned whole tomatoes', ratio: 'Same amount', save: 2, match: /\bsan marzano\b/, note: 'Add a pinch of sugar if they taste sharp.' },
];

// Swaps that apply to a recipe's ingredients.
export function swapsForRecipe(recipe) {
  const lines = parseIngredients(recipe.ingredients || '').filter(p => !p.header).map(p => p.raw.toLowerCase());
  return SWAPS.filter(s => lines.some(l => s.match.test(l)));
}
