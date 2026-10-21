// Screens for the Health & Nutrition tools (#/health/...). Self-contained: it renders into the
// main view and handles its own events (data-h / data-hform / data-hin attributes), so it can't
// interfere with the rest of the app.

import {
  ACTIVITY, GOALS, CLIMATES, LB_PER_KG, CM_PER_IN, tdeeAndMacros, bodyFatNavy, bodyFatCategory, waterIntake,
  loadFoods, searchFoods, toGrams, nutrientsFor, sumNutrients, unitOptions, rowsFromRecipe, SWAPS,
  swapsForRecipe, foodByName, DAILY_VALUES, NUTRIENT_LABELS,
} from './health.js';

let ctx = null; // { view, esc, toast, openSheet, closeSheet, getState, go }
const svg = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  flame: svg('<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5 1-1 1-3 0-9Z"/>'),
  swap: svg('<path d="M7 7h13l-4-4M17 17H4l4 4"/>'),
  calc: svg('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h8"/>'),
  search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  drop: svg('<path d="M12 2.7 6.3 9.5a7 7 0 1 0 11.4 0Z"/>'),
  body: svg('<circle cx="12" cy="4" r="2"/><path d="M12 6v8M8 22l4-8 4 8M6 10h12"/>'),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
};

export const TOOLS = [
  { id: 'tdee', icon: 'flame', title: 'TDEE & Macro Calculator', tag: 'Popular', text: 'Estimate your daily calorie needs and personalized macro targets based on your body, activity level, and goals.' },
  { id: 'swaps', icon: 'swap', title: 'Ingredient Swap Calculator', tag: 'Popular', text: 'Find budget-friendly ingredient substitutions that save money without sacrificing nutrition or flavor.' },
  { id: 'calories', icon: 'calc', title: 'Calorie Calculator', tag: 'New', text: 'Add ingredients with custom amounts — or load one of your recipes — and see total calories, protein, carbs, and fat.' },
  { id: 'lookup', icon: 'search', title: 'Nutrition Lookup', tag: 'New', text: 'Search any ingredient and see its full nutritional profile — calories, macros, vitamins, and minerals per 100 g.' },
  { id: 'water', icon: 'drop', title: 'Water Intake Calculator', tag: 'New', text: 'Get a daily hydration goal based on your body weight, activity level, and climate.' },
  { id: 'bodyfat', icon: 'body', title: 'Body Fat Calculator', tag: 'New', text: 'Estimate your body fat percentage using the U.S. Navy method with simple body measurements.' },
];

const DISCLAIMER = 'Estimates for general information only — not medical advice. Talk to a doctor or dietitian for personal guidance.';

// ---------- Saved inputs (this device only) ----------
function load(key, fallback) {
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(`health:${key}`) || '{}') }; } catch { return { ...fallback }; }
}
function save(key, value) {
  try { localStorage.setItem(`health:${key}`, JSON.stringify(value)); } catch { /* private mode */ }
}
const profile = load('profile', { units: 'us', sex: 'female', age: '', heightCm: '', weightKg: '', activity: 'moderate', goal: 'maintain', exerciseMin: 30, climate: 'cool' });
const meal = load('meal', { rows: [], servings: 1, recipeId: '' });
const results = {}; // last calculation per tool (in memory)
let lookupQuery = '';
let swapFilter = '';
let swapRecipe = '';

// ---------- Nutrition data (loaded on first use) ----------
let foods = null;
let foodsPromise = null;
function ensureFoods() {
  if (foods) return Promise.resolve(foods);
  if (!foodsPromise) {
    foodsPromise = fetch('data/nutrition.json')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(json => { foods = loadFoods(json); return foods; })
      .catch(err => { foodsPromise = null; throw err; });
  }
  return foodsPromise;
}
const foodById = id => (foods ? foods.find(f => f.id === id) : null);

// ---------- Helpers ----------
const esc = s => ctx.esc(s);
const fmt = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 }));
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const isUS = () => profile.units === 'us';

function subRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  return { tool: parts[1] || '', arg: parts[2] ? decodeURIComponent(parts[2]) : '' };
}

function page(title, sub, body, back = true) {
  return `<header class="topbar"><div class="topbar-row">
      ${back ? `<a class="icon-btn" href="#/health" aria-label="Back to Health tools">${ICON.back}</a>` : ''}
      <h1>${esc(title)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</h1>
    </div></header>
    <div class="content health">${body}<p class="health-note">${DISCLAIMER}</p></div>`;
}

function unitToggle() {
  return `<div class="segmented health-units" role="group" aria-label="Units">
    <button type="button" class="${isUS() ? 'active' : ''}" data-h="units" data-v="us">US (lb, in)</button>
    <button type="button" class="${!isUS() ? 'active' : ''}" data-h="units" data-v="metric">Metric (kg, cm)</button>
  </div>`;
}

function sexToggle(current) {
  return `<div class="field"><span>Sex</span><div class="segmented" role="group">
    <button type="button" class="${current === 'female' ? 'active' : ''}" data-h="sex" data-v="female">Female</button>
    <button type="button" class="${current === 'male' ? 'active' : ''}" data-h="sex" data-v="male">Male</button>
  </div></div>`;
}

function numField(name, label, value, unit, extra = '') {
  return `<label class="field"><span>${esc(label)}${unit ? ` <small>(${esc(unit)})</small>` : ''}</span>
    <input name="${name}" type="number" inputmode="decimal" step="any" min="0" value="${value === null || value === undefined ? '' : esc(value)}" ${extra}></label>`;
}

// Height/weight fields in the chosen units (stored as cm/kg).
function heightFields() {
  if (isUS()) {
    const totalIn = profile.heightCm ? profile.heightCm / CM_PER_IN : null;
    const ft = totalIn ? Math.floor(totalIn / 12) : '';
    const inch = totalIn ? Math.round((totalIn - ft * 12) * 10) / 10 : '';
    return `<div class="row-fields two">${numField('ft', 'Height', ft, 'ft', 'required')}${numField('in', '\u00a0', inch, 'in')}</div>`;
  }
  return numField('cm', 'Height', profile.heightCm ? Math.round(profile.heightCm) : '', 'cm', 'required');
}
function weightField(required = true) {
  const v = profile.weightKg ? (isUS() ? Math.round(profile.weightKg * LB_PER_KG * 10) / 10 : Math.round(profile.weightKg * 10) / 10) : '';
  return numField('weight', 'Weight', v, isUS() ? 'lb' : 'kg', required ? 'required' : '');
}
function readBody(form) {
  const f = form.elements;
  if (f.weight && num(f.weight.value) !== null) profile.weightKg = isUS() ? num(f.weight.value) / LB_PER_KG : num(f.weight.value);
  if (f.ft) {
    const ft = num(f.ft.value) || 0;
    const inch = num(f.in.value) || 0;
    if (ft || inch) profile.heightCm = (ft * 12 + inch) * CM_PER_IN;
  } else if (f.cm && num(f.cm.value)) profile.heightCm = num(f.cm.value);
  if (f.age && num(f.age.value)) profile.age = num(f.age.value);
  save('profile', profile);
}

// ---------- Hub ----------
function viewHub() {
  return page('Health', 'Nutrition & body calculators', `
    <div class="tool-grid">${TOOLS.map(t => `
      <a class="tool-card" href="#/health/${t.id}">
        <span class="tool-icon">${ICON[t.icon]}</span>
        <span class="tool-body"><span class="tool-tag ${t.tag === 'New' ? 'new' : ''}">${esc(t.tag)}</span>
        <b>${esc(t.title)}</b><span>${esc(t.text)}</span></span>
      </a>`).join('')}
    </div>
    <p class="health-note">Nutrition data: USDA National Nutrient Database for Standard Reference (7,600+ foods).</p>`, false);
}

// ---------- TDEE ----------
function viewTdee() {
  const r = results.tdee;
  return page('TDEE & Macros', 'Daily calories and macro targets', `
    <form class="settings-card" data-hform="tdee"><h2>Your Details</h2>
      ${unitToggle()}
      ${sexToggle(profile.sex)}
      ${numField('age', 'Age', profile.age, 'years', 'required min="13" max="100"')}
      ${heightFields()}
      ${weightField()}
      <label class="field"><span>Activity level</span><select name="activity">${ACTIVITY.map(a => `<option value="${a.id}" ${profile.activity === a.id ? 'selected' : ''}>${esc(a.label)}</option>`).join('')}</select></label>
      <label class="field"><span>Goal</span><select name="goal">${GOALS.map(g => `<option value="${g.id}" ${profile.goal === g.id ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}</select></label>
      <button class="btn primary block" type="submit">Calculate</button>
    </form>
    ${r ? `<div class="settings-card result-card" id="h-result"><h2>Your Results</h2>
      <div class="big-stats">
        <div><b>${fmt(r.target)}</b><span>calories / day for your goal</span></div>
        <div><b>${fmt(r.tdee)}</b><span>to maintain (TDEE)</span></div>
        <div><b>${fmt(r.bmr)}</b><span>at rest (BMR)</span></div>
      </div>
      ${r.clamped ? `<p class="sync-error">That goal would put you below ${profile.sex === 'female' ? '1,200' : '1,500'} calories a day, so the target is set at that minimum.</p>` : ''}
      <div class="macro-bars">${[['protein', 'Protein', 4], ['carbs', 'Carbs', 4], ['fat', 'Fat', 9]].map(([k, label]) => `
        <div class="macro ${k}"><div class="macro-top"><b>${label}</b><span>${fmt(r.macros[k])} g · ${r.percents[k]}%</span></div>
        <div class="bar"><span style="width:${r.percents[k]}%"></span></div></div>`).join('')}</div>
      <p class="hint">BMR uses the Mifflin–St Jeor equation. Protein is set by body weight (${(GOALS.find(g => g.id === profile.goal) || GOALS[2]).protein} g per kg for this goal), fat at 25% of calories, and carbs fill the rest.</p>
    </div>` : ''}`);
}

function calcTdee(form) {
  readBody(form);
  profile.activity = form.elements.activity.value;
  profile.goal = form.elements.goal.value;
  save('profile', profile);
  if (!profile.age || !profile.heightCm || !profile.weightKg) { ctx.toast('Fill in age, height and weight'); return; }
  results.tdee = tdeeAndMacros({ sex: profile.sex, age: profile.age, weightKg: profile.weightKg, heightCm: profile.heightCm, activity: profile.activity, goal: profile.goal });
  rerender('h-result');
}

// ---------- Body fat ----------
function viewBodyFat() {
  const r = results.bodyfat;
  const u = isUS() ? 'in' : 'cm';
  const conv = v => (v ? (isUS() ? Math.round(v / CM_PER_IN * 10) / 10 : Math.round(v * 10) / 10) : '');
  const m = load('bodyfat', { neckCm: '', waistCm: '', hipCm: '' });
  const cats = profile.sex === 'female'
    ? [['Essential', 10, 13], ['Athletic', 14, 20], ['Fitness', 21, 24], ['Average', 25, 31], ['Above average', 32, 45]]
    : [['Essential', 2, 5], ['Athletic', 6, 13], ['Fitness', 14, 17], ['Average', 18, 24], ['Above average', 25, 40]];
  return page('Body Fat', 'U.S. Navy method', `
    <form class="settings-card" data-hform="bodyfat"><h2>Measurements</h2>
      ${unitToggle()}
      ${sexToggle(profile.sex)}
      ${heightFields()}
      ${numField('neck', 'Neck — just below the larynx', conv(m.neckCm), u, 'required')}
      ${numField('waist', profile.sex === 'female' ? 'Waist — at the narrowest point' : 'Waist — at the belly button', conv(m.waistCm), u, 'required')}
      ${profile.sex === 'female' ? numField('hip', 'Hips — at the widest point', conv(m.hipCm), u, 'required') : ''}
      ${weightField(false)}
      <p class="hint">Measure with a soft tape, snug but not compressing the skin. Weight is optional — it adds fat and lean mass to the result.</p>
      <button class="btn primary block" type="submit">Calculate</button>
    </form>
    ${r ? `<div class="settings-card result-card" id="h-result"><h2>Your Results</h2>
      ${r.pct === null ? '<p class="sync-error">Those measurements don’t work with this formula — check that your waist is larger than your neck.</p>' : `
      <div class="big-stats">
        <div><b>${fmt(r.pct, 1)}%</b><span>body fat</span></div>
        <div><b>${esc(r.category)}</b><span>category</span></div>
        ${r.fatMass !== null ? `<div><b>${fmt(r.fatMass, 1)} ${isUS() ? 'lb' : 'kg'}</b><span>fat mass</span></div><div><b>${fmt(r.leanMass, 1)} ${isUS() ? 'lb' : 'kg'}</b><span>lean mass</span></div>` : ''}
      </div>
      <table class="nut-table"><thead><tr><th>Category (${profile.sex === 'female' ? 'women' : 'men'})</th><th>Body fat</th></tr></thead><tbody>
        ${cats.map(([c, lo, hi]) => `<tr class="${r.category.startsWith(c.split(' ')[0]) ? 'on' : ''}"><td>${c}</td><td>${lo}–${hi}%${c === 'Above average' ? '+' : ''}</td></tr>`).join('')}
      </tbody></table>
      <p class="hint">Ranges from the American Council on Exercise. The Navy method is usually within a few percent of lab measurements.</p>`}
    </div>` : ''}`);
}

function calcBodyFat(form) {
  readBody(form);
  const f = form.elements;
  const toCm = v => (num(v) === null ? null : isUS() ? num(v) * CM_PER_IN : num(v));
  const m = { neckCm: toCm(f.neck.value), waistCm: toCm(f.waist.value), hipCm: f.hip ? toCm(f.hip.value) : null };
  save('bodyfat', m);
  if (!profile.heightCm || !m.neckCm || !m.waistCm || (profile.sex === 'female' && !m.hipCm)) { ctx.toast('Fill in all the measurements'); return; }
  const pct = bodyFatNavy({ sex: profile.sex, heightIn: profile.heightCm / CM_PER_IN, neckIn: m.neckCm / CM_PER_IN, waistIn: m.waistCm / CM_PER_IN, hipIn: (m.hipCm || 0) / CM_PER_IN });
  const weight = profile.weightKg ? (isUS() ? profile.weightKg * LB_PER_KG : profile.weightKg) : null;
  const okPct = pct !== null && pct > 0 && pct < 70 ? pct : null;
  results.bodyfat = {
    pct: okPct,
    category: okPct === null ? '' : bodyFatCategory(profile.sex, okPct),
    fatMass: okPct !== null && weight ? weight * okPct / 100 : null,
    leanMass: okPct !== null && weight ? weight * (1 - okPct / 100) : null,
  };
  rerender('h-result');
}

// ---------- Water ----------
function viewWater() {
  const r = results.water;
  return page('Water Intake', 'Daily hydration goal', `
    <form class="settings-card" data-hform="water"><h2>Your Day</h2>
      ${unitToggle()}
      ${weightField()}
      ${numField('exercise', 'Exercise per day', profile.exerciseMin, 'minutes')}
      <label class="field"><span>Climate</span><select name="climate">${CLIMATES.map(c => `<option value="${c.id}" ${profile.climate === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>
      <button class="btn primary block" type="submit">Calculate</button>
    </form>
    ${r ? `<div class="settings-card result-card" id="h-result"><h2>Your Goal</h2>
      <div class="big-stats">
        <div><b>${isUS() ? `${fmt(r.oz)} oz` : `${fmt(r.liters, 1)} L`}</b><span>per day</span></div>
        <div><b>${fmt(r.cups, 1)}</b><span>cups (8 oz)</span></div>
        <div><b>${isUS() ? `${fmt(r.liters, 1)} L` : `${fmt(r.oz)} oz`}</b><span>${isUS() ? 'liters' : 'fluid ounces'}</span></div>
        <div><b>${fmt(r.oz / 16.9, 1)}</b><span>standard bottles (16.9 oz)</span></div>
      </div>
      <div class="glasses" aria-hidden="true">${'<span class="glass"></span>'.repeat(Math.min(20, Math.round(r.cups)))}</div>
      <p class="hint">About half an ounce per pound of body weight, plus 12 oz for every 30 minutes of exercise and more in hot weather. Any drink counts, and water-rich foods help too. Drink more if you’re thirsty, sick, pregnant or breastfeeding.</p>
    </div>` : ''}`);
}

function calcWater(form) {
  readBody(form);
  profile.exerciseMin = num(form.elements.exercise.value) || 0;
  profile.climate = form.elements.climate.value;
  save('profile', profile);
  if (!profile.weightKg) { ctx.toast('Enter your weight'); return; }
  results.water = waterIntake({ weightLb: profile.weightKg * LB_PER_KG, exerciseMin: profile.exerciseMin, climate: profile.climate });
  rerender('h-result');
}

// ---------- Nutrition lookup ----------
function foodListHtml(list, action) {
  if (!list.length) return '<p class="hint" style="padding:10px">No foods found. Try a simpler word, like “cheddar” or “chicken breast”.</p>';
  return `<ul class="pick-list food-list">${list.map(f => `
    <li><button type="button" class="food-pick" data-h="${action}" data-id="${f.id}">
      <span class="txt"><b>${esc(f.name)}</b><small>${esc(f.group)}</small></span>
      <span class="kcal">${fmt(f.n.kcal)}<small>kcal/100g</small></span>
    </button></li>`).join('')}</ul>`;
}

function viewLookup(arg) {
  if (!foods) return loadingPage('Nutrition Lookup');
  if (arg) return viewFood(foodById(Number(arg)));
  const list = lookupQuery ? searchFoods(foods, lookupQuery, 40) : [];
  return page('Nutrition Lookup', 'Per 100 g, from USDA data', `
    <label class="search">${ICON.search}<span class="sr-only">Search foods</span>
      <input data-hin="lookup" type="search" placeholder="Search any ingredient, e.g. salmon, oats, cheddar" value="${esc(lookupQuery)}" autocomplete="off"></label>
    <div id="h-lookup-results">${lookupQuery ? foodListHtml(list, 'open-food') : '<p class="hint" style="margin-top:12px">Search 7,600+ foods for calories, macros, vitamins and minerals.</p>'}</div>`);
}

let foodGrams = 100;
function viewFood(food) {
  if (!food) return page('Nutrition Lookup', '', '<p>Food not found.</p>');
  const portionOpts = [[100, '100 g'], ...food.portions.map(([g, d]) => [g, `${d} (${fmt(g, 1)} g)`])];
  const n = nutrientsFor(food, foodGrams);
  return page('Nutrition Facts', food.group, `
    <div class="settings-card"><h2>${esc(food.name)}</h2>
      <label class="field"><span>Amount</span><div class="amount-row">
        <select data-hin="food-portion">${portionOpts.map(([g, label]) => `<option value="${g}" ${Math.abs(g - foodGrams) < 0.01 ? 'selected' : ''}>${esc(label)}</option>`).join('')}<option value="custom" ${portionOpts.some(([g]) => Math.abs(g - foodGrams) < 0.01) ? '' : 'selected'}>Custom</option></select>
        <input data-hin="food-grams" type="number" inputmode="decimal" step="any" min="0" value="${fmt(foodGrams, 1).replace(/,/g, '')}" aria-label="Grams"><span>g</span>
      </div></label>
      <div id="h-food-table">${nutritionTable(n)}</div>
      <button type="button" class="btn small" data-h="add-food-to-meal" data-id="${food.id}">${ICON.plus} Add to Calorie Calculator</button>
    </div>`);
}

function nutritionTable(n) {
  const row = (k, sub = false) => {
    const v = n[k];
    const dv = DAILY_VALUES[k];
    const unit = { kcal: '', protein: 'g', fat: 'g', satFat: 'g', carbs: 'g', fiber: 'g', sugar: 'g' }[k] ?? (['vitA', 'vitD', 'vitK', 'folate', 'vitB12', 'selenium'].includes(k) ? 'µg' : 'mg');
    return `<tr class="${sub ? 'sub' : ''}"><td>${esc(NUTRIENT_LABELS[k])}</td><td>${v === null || v === undefined ? '—' : `${fmt(v, v < 10 ? 1 : 0)}${unit ? ` ${unit}` : ''}`}</td><td>${dv && v !== null && v !== undefined ? `${Math.round((v / dv) * 100)}%` : ''}</td></tr>`;
  };
  return `<table class="nut-table label">
    <thead><tr><th>Nutrient</th><th>Amount</th><th>% DV*</th></tr></thead><tbody>
    ${row('kcal')}${row('fat')}${row('satFat', true)}${row('cholesterol')}${row('sodium')}${row('carbs')}${row('fiber', true)}${row('sugar', true)}${row('protein')}
    <tr class="divider"><td colspan="3">Vitamins & minerals</td></tr>
    ${['vitA', 'vitC', 'vitD', 'vitE', 'vitK', 'thiamin', 'riboflavin', 'niacin', 'vitB6', 'folate', 'vitB12', 'calcium', 'iron', 'magnesium', 'phosphorus', 'potassium', 'zinc', 'selenium'].map(k => row(k)).join('')}
    </tbody></table>
    <p class="hint">*Percent Daily Value based on a 2,000-calorie diet. “—” means USDA has no value for this food.</p>`;
}

// ---------- Calorie calculator ----------
function normalizeRow(row) {
  const food = foodById(row.foodId);
  if (!food) return { ...row, unit: row.unit || 'g' };
  const ids = unitOptions(food).map(o => o.id);
  if (row.unit && ids.includes(row.unit)) return row;
  if (row.qty === null || row.qty === undefined) return { ...row, unit: ids.includes(row.unit) ? row.unit : 'g' };
  if (!row.unit) {
    // A plain count ("2 eggs"): use the food's own piece size ("large") if it has one.
    const idx = food.portions.findIndex((_, j) => ids.includes(`p${j}`));
    if (idx >= 0) return { ...row, unit: `p${idx}` };
  }
  // Units the dropdown doesn't list (ml, fl oz, clove...): convert to grams.
  const g = toGrams(food, row.qty, row.unit).grams;
  return g !== null ? { ...row, qty: Math.round(g), unit: 'g' } : { ...row, qty: null, unit: 'g' };
}

function mealTotals() {
  const parts = [];
  let missing = 0;
  let approx = false;
  for (const row of meal.rows) {
    const food = foodById(row.foodId);
    if (!food || row.qty === null || row.qty === undefined) { missing++; continue; }
    const { grams, approx: a } = toGrams(food, row.qty, row.unit);
    if (grams === null) { missing++; continue; }
    approx = approx || a;
    parts.push(nutrientsFor(food, grams));
  }
  return { total: sumNutrients(parts), missing, approx };
}

function mealRowHtml(row, i) {
  const food = foodById(row.foodId);
  let kcal = '';
  if (food && row.qty !== null && row.qty !== undefined) {
    const g = toGrams(food, row.qty, row.unit).grams;
    if (g !== null) kcal = `${fmt(nutrientsFor(food, g).kcal)} kcal`;
  }
  return `<div class="meal-row ${food ? '' : 'needs'}">
    <div class="meal-row-top">
      <button type="button" class="meal-food" data-h="pick-food" data-i="${i}">${food ? `<b>${esc(food.name)}</b>` : '<b>Choose a food…</b>'}${row.text ? `<small>from recipe: ${esc(row.text)}</small>` : ''}</button>
      <button type="button" class="icon-btn" data-h="remove-row" data-i="${i}" aria-label="Remove">${ICON.x}</button>
    </div>
    <div class="meal-row-amt">
      <input type="number" inputmode="decimal" step="any" min="0" data-hin="row-qty" data-i="${i}" value="${row.qty === null || row.qty === undefined ? '' : Math.round(row.qty * 100) / 100}" placeholder="Amount" aria-label="Amount">
      <select data-hin="row-unit" data-i="${i}" aria-label="Unit" ${food ? '' : 'disabled'}>${(food ? unitOptions(food) : [{ id: 'g', label: 'g' }]).map(o => `<option value="${o.id}" ${o.id === row.unit ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
      <span class="row-kcal">${kcal}</span>
    </div>
  </div>`;
}

function totalsHtml() {
  const { total, missing, approx } = mealTotals();
  const s = Math.max(1, num(meal.servings) || 1);
  const cell = (k, label, unit, d = 0) => `<div><b>${fmt((total[k] || 0) / s, d)}${unit}</b><span>${label}</span></div>`;
  return `<div class="big-stats">
      ${cell('kcal', 'calories', '')}${cell('protein', 'protein', ' g')}${cell('carbs', 'carbs', ' g')}${cell('fat', 'fat', ' g')}
    </div>
    <div class="small-stats">${cell('fiber', 'fiber', ' g', 1)}${cell('sugar', 'sugar', ' g', 1)}${cell('satFat', 'sat. fat', ' g', 1)}${cell('sodium', 'sodium', ' mg')}</div>
    <p class="hint">${s > 1 ? `Per serving (÷${s}). Whole recipe: ${fmt(total.kcal || 0)} calories. ` : ''}${missing ? `${missing} item${missing === 1 ? '' : 's'} not counted — choose a food and amount. ` : ''}${approx ? 'Some cup/spoon amounts were estimated as water-weight. ' : ''}</p>`;
}

function viewCalories(arg) {
  if (!foods) return loadingPage('Calorie Calculator');
  // Opened from a recipe's Nutrition button: load that recipe once.
  if (arg && arg !== meal.recipeId) loadRecipeIntoMeal(arg);
  const recipes = [...ctx.getState().recipes].sort((a, b) => a.name.localeCompare(b.name));
  return page('Calorie Calculator', 'Calories and macros for a meal', `
    <div class="settings-card"><h2>Ingredients</h2>
      ${recipes.length ? `<label class="field"><span>Load one of your recipes</span><select data-hin="load-recipe">
        <option value="">— Choose a recipe —</option>${recipes.map(r => `<option value="${esc(r.id)}" ${r.id === meal.recipeId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : ''}
      <div id="h-meal-rows">${meal.rows.map(mealRowHtml).join('') || '<p class="hint">Add ingredients to start.</p>'}</div>
      <div class="btns" style="margin-top:10px">
        <button type="button" class="btn small" data-h="pick-food" data-i="new">${ICON.plus} Add Ingredient</button>
        ${meal.rows.length ? '<button type="button" class="btn danger small" data-h="clear-meal">Clear</button>' : ''}
      </div>
      <label class="field" style="margin-top:12px"><span>Servings</span><input data-hin="servings" type="number" inputmode="numeric" min="1" step="1" value="${esc(meal.servings || 1)}"></label>
    </div>
    <div class="settings-card result-card"><h2>${num(meal.servings) > 1 ? 'Per Serving' : 'Total'}</h2><div id="h-totals">${totalsHtml()}</div></div>`);
}

function loadRecipeIntoMeal(id) {
  const recipe = ctx.getState().recipes.find(r => r.id === id);
  if (!recipe) return;
  meal.recipeId = id;
  meal.rows = rowsFromRecipe(foods, recipe).map(normalizeRow);
  const servings = parseFloat(String(recipe.servings || '').match(/\d+(\.\d+)?/)?.[0] || '');
  meal.servings = servings > 0 ? servings : 1;
  save('meal', meal);
}

function refreshMeal(full = false) {
  save('meal', meal);
  const rows = document.getElementById('h-meal-rows');
  if (full && rows) rows.innerHTML = meal.rows.map(mealRowHtml).join('') || '<p class="hint">Add ingredients to start.</p>';
  const t = document.getElementById('h-totals');
  if (t) t.innerHTML = totalsHtml();
}

function openFoodPicker(onPick) {
  ctx.openSheet('Choose a Food', `
    <label class="search" style="margin-top:0">${ICON.search}<input data-hin="picker" type="search" placeholder="Search, e.g. chicken thigh" autocomplete="off"></label>
    <div id="h-picker-results"><p class="hint" style="margin-top:10px">Type to search 7,600+ foods.</p></div>`);
  pickerCallback = onPick;
  setTimeout(() => document.querySelector('#sheet [data-hin=picker]')?.focus(), 50);
}
let pickerCallback = null;

// ---------- Ingredient swaps ----------
function viewSwaps() {
  const recipes = [...ctx.getState().recipes].sort((a, b) => a.name.localeCompare(b.name));
  const recipe = recipes.find(r => r.id === swapRecipe);
  let list = recipe ? swapsForRecipe(recipe) : SWAPS;
  const q = swapFilter.trim().toLowerCase();
  if (q) list = list.filter(s => `${s.from} ${s.to} ${s.note}`.toLowerCase().includes(q));
  if (!foods) ensureFoods().then(() => { if (subRoute().tool === 'swaps') rerender(); }).catch(() => {});
  return page('Ingredient Swaps', 'Save money without losing flavor', `
    ${recipes.length ? `<label class="field"><span>Check one of your recipes</span><select data-hin="swap-recipe">
      <option value="">— All swaps —</option>${recipes.map(r => `<option value="${esc(r.id)}" ${r.id === swapRecipe ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : ''}
    <label class="search">${ICON.search}<input data-hin="swap-filter" type="search" placeholder="Filter, e.g. cheese, flour" value="${esc(swapFilter)}" autocomplete="off"></label>
    ${recipe && !list.length ? '<p class="hint" style="margin-top:12px">No money-saving swaps found for this recipe — it’s already budget-friendly.</p>' : ''}
    <div class="swap-list">${list.map(swapCard).join('')}</div>
    <p class="hint">Savings: <b>$</b> a little · <b>$$</b> moderate · <b>$$$</b> a lot, based on typical U.S. grocery prices. Nutrition per 100 g from USDA data.</p>`);
}

function swapCard(s) {
  const a = foods && s.fromFood ? foodByName(foods, s.fromFood) : null;
  const b = foods && s.toFood ? foodByName(foods, s.toFood) : null;
  const cmp = a && b ? `<table class="nut-table compare"><thead><tr><th>Per 100 g</th><th>${esc(s.from.split(' (')[0])}</th><th>${esc(s.to)}</th></tr></thead><tbody>
    ${[['kcal', 'Calories', ''], ['protein', 'Protein', ' g'], ['fat', 'Fat', ' g'], ['fiber', 'Fiber', ' g']].map(([k, l, u]) => `<tr><td>${l}</td><td>${fmt(a.n[k], 1)}${u}</td><td>${fmt(b.n[k], 1)}${u}</td></tr>`).join('')}
    </tbody></table>` : '';
  return `<div class="swap-card">
    <div class="swap-head"><span class="swap-from">${esc(s.from)}</span><span class="swap-arrow">→</span><span class="swap-to">${esc(s.to)}</span><span class="swap-save" title="Savings">${'$'.repeat(s.save)}</span></div>
    <p><b>How much:</b> ${esc(s.ratio)}</p>
    <p>${esc(s.note)}</p>
    ${cmp}
  </div>`;
}

// ---------- Rendering ----------
function loadingPage(title) {
  ensureFoods().then(() => rerender()).catch(() => {
    if (ctx.view.dataset.section === 'health') ctx.view.querySelector('.health-loading').innerHTML = 'Couldn’t load the nutrition data. Check your connection and try again.';
  });
  return page(title, '', '<div class="empty health-loading">Loading nutrition data…</div>');
}

function rerender(scrollToId) {
  if (ctx.view.dataset.section !== 'health') return;
  renderHealth(ctx);
  if (scrollToId) document.getElementById(scrollToId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function renderHealth(context) {
  ctx = context;
  const { tool, arg } = subRoute();
  const views = { tdee: viewTdee, bodyfat: viewBodyFat, water: viewWater, lookup: () => viewLookup(arg), calories: () => viewCalories(arg), swaps: viewSwaps };
  ctx.view.innerHTML = (views[tool] || viewHub)();
}

// ---------- Events ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-h]');
  if (!el || !ctx) return;
  const action = el.dataset.h;
  if (action === 'units' || action === 'sex') {
    const form = el.closest('form');
    if (form) readBody(form);
    profile[action] = el.dataset.v;
    save('profile', profile);
    rerender();
  } else if (action === 'open-food') {
    foodGrams = 100;
    ctx.go(`#/health/lookup/${el.dataset.id}`);
  } else if (action === 'add-food-to-meal') {
    const food = foodById(Number(el.dataset.id));
    meal.rows.push({ foodId: food.id, qty: Math.round(foodGrams * 10) / 10, unit: 'g' });
    meal.recipeId = '';
    save('meal', meal);
    ctx.toast(`Added ${food.name.split(',')[0]} to the Calorie Calculator`);
  } else if (action === 'pick-food') {
    const i = el.dataset.i;
    openFoodPicker(food => {
      if (i === 'new') meal.rows.push(normalizeRow({ foodId: food.id, qty: food.portions.length ? 1 : 100, unit: food.portions.length ? null : 'g' }));
      else {
        // Changing the food keeps the amount: generic units carry over, others become grams.
        const row = meal.rows[Number(i)];
        const old = foodById(row.foodId);
        const generic = ['g', 'oz', 'lb', 'kg', 'cup', 'tbsp', 'tsp'].includes(row.unit);
        let next = { ...row, foodId: food.id };
        if (!generic && old && row.qty !== null && row.qty !== undefined) {
          const g = toGrams(old, row.qty, row.unit).grams;
          next = { ...next, qty: g !== null ? Math.round(g) : null, unit: 'g' };
        }
        meal.rows[Number(i)] = normalizeRow(next);
      }
      refreshMeal(true);
    });
  } else if (action === 'picked') {
    const food = foodById(Number(el.dataset.id));
    ctx.closeSheet();
    if (food && pickerCallback) pickerCallback(food);
    pickerCallback = null;
  } else if (action === 'remove-row') {
    meal.rows.splice(Number(el.dataset.i), 1);
    refreshMeal(true);
  } else if (action === 'clear-meal') {
    meal.rows = [];
    meal.recipeId = '';
    save('meal', meal);
    rerender();
  }
});

document.addEventListener('submit', e => {
  const form = e.target.closest && e.target.closest('[data-hform]');
  if (!form) return;
  e.preventDefault();
  ({ tdee: calcTdee, bodyfat: calcBodyFat, water: calcWater })[form.dataset.hform]?.(form);
});

let searchTimer = null;
document.addEventListener('input', e => {
  const el = e.target;
  if (!el.dataset || !el.dataset.hin || !ctx) return;
  const kind = el.dataset.hin;
  if (kind === 'lookup') {
    lookupQuery = el.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const box = document.getElementById('h-lookup-results');
      if (box) box.innerHTML = lookupQuery.trim() ? foodListHtml(searchFoods(foods, lookupQuery, 40), 'open-food') : '';
    }, 150);
  } else if (kind === 'picker') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const box = document.getElementById('h-picker-results');
      if (box) box.innerHTML = el.value.trim() ? foodListHtml(searchFoods(foods, el.value, 30), 'picked') : '';
    }, 150);
  } else if (kind === 'row-qty') {
    meal.rows[Number(el.dataset.i)].qty = num(el.value);
    const row = el.closest('.meal-row');
    const tmp = document.createElement('div');
    tmp.innerHTML = mealRowHtml(meal.rows[Number(el.dataset.i)], Number(el.dataset.i));
    row.querySelector('.row-kcal').textContent = tmp.querySelector('.row-kcal').textContent;
    refreshMeal();
  } else if (kind === 'servings') {
    meal.servings = num(el.value) || 1;
    refreshMeal();
    const h = el.closest('.content')?.querySelector('.result-card h2');
    if (h) h.textContent = meal.servings > 1 ? 'Per Serving' : 'Total';
  } else if (kind === 'food-grams') {
    foodGrams = num(el.value) || 0;
    const food = foodById(Number(subRoute().arg));
    if (food) document.getElementById('h-food-table').innerHTML = nutritionTable(nutrientsFor(food, foodGrams));
  } else if (kind === 'swap-filter') {
    swapFilter = el.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const pos = el.selectionStart;
      rerender();
      const box = document.querySelector('[data-hin=swap-filter]');
      if (box) { box.focus(); box.setSelectionRange(pos, pos); }
    }, 200);
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (!el.dataset || !el.dataset.hin || !ctx) return;
  const kind = el.dataset.hin;
  if (kind === 'row-unit') {
    meal.rows[Number(el.dataset.i)].unit = el.value;
    refreshMeal(true);
  } else if (kind === 'load-recipe') {
    if (el.value) loadRecipeIntoMeal(el.value);
    else { meal.recipeId = ''; save('meal', meal); }
    rerender();
  } else if (kind === 'food-portion') {
    if (el.value !== 'custom') {
      foodGrams = Number(el.value);
      rerender();
    } else {
      document.querySelector('[data-hin=food-grams]')?.focus();
    }
  } else if (kind === 'swap-recipe') {
    swapRecipe = el.value;
    rerender();
  }
});
