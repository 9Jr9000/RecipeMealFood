import * as db from './db.js';
import {
  parseIngredient, parseIngredients, formatAmount, formatQty, parseRecipeText, servingsNumber, AISLES,
  normalizeName, UNIT_GROUPS, UNIT_VALUES, FRACTION_OPTIONS, splitQty, joinQty, readQuantity,
  isConvertible, convertAmount, CONVERT_TARGETS, buildLine, ingredientAmounts, totalAmount,
} from './ingredients.js';
import {
  emptyState, uid, saveRecipe, deleteRecipe, recipeListPlan, addRecipeToGrocery, addManualItem,
  ingredientStatus, setChecked, clearChecked, recipesOnList, removeRecipeFromGrocery, addToPantry,
  removeFromPantry, groceryInPantry, setAisle, renameGroceryItem, amountText, allCategories, findPantry,
} from './sync.js';

// Shown in Settings so it's easy to tell which version is running.
const APP_VERSION = '4';

// ---------- Icons ----------
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  cart: svg('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>'),
  pantry: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M12 3v18"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>', 'stroke-width="3"'),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  image: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'),
  dish: svg('<path d="M3 13h18a9 9 0 0 1-18 0Z"/><path d="M12 4v3M8 5.5 9 8M16 5.5 15 8"/>'),
  home: svg('<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>'),
  clipboard: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'),
  more: svg('<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'),
};

// ---------- State ----------
let state = emptyState();
const photos = new Map(); // recipeId -> data URL
const ui = {
  search: '',
  category: null,
  sort: localPref('sort', 'name'),
  groceryGroup: localPref('groceryGroup', 'aisle'),
  pantrySearch: '',
  detailTab: 'ingredients',
  scale: {}, // recipeId -> factor
  crossed: {}, // recipeId -> Set of ingredient indexes
  step: {}, // recipeId -> active step index
  convert: {}, // recipeId -> { all: unit, lines: { index: unit } } for the unit dropdowns
  focusAfterRender: null,
};

function localPref(key, fallback) {
  try { return localStorage.getItem(`pref:${key}`) || fallback; } catch { return fallback; }
}
function setPref(key, value) {
  try { localStorage.setItem(`pref:${key}`, value); } catch { /* private mode */ }
}

let saveTimer = null;
function commit() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => db.set('state', state), 150);
  render();
}
// Flush pending saves when the app is backgrounded (e.g. switching apps on a phone).
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    db.set('state', state);
  }
});

// ---------- Helpers ----------
const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function stars(n) {
  if (!n) return '';
  return `<span class="stars" aria-label="${n} stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
}
function recipeById(id) { return state.recipes.find(r => r.id === id); }
function uncheckedCount() { return state.grocery.filter(g => !g.checked).length; }
function sortAisles(names) {
  return names.sort((a, b) => {
    const ia = AISLES.indexOf(a), ib = AISLES.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}
function groupBy(items, fn) {
  const map = new Map();
  for (const it of items) {
    const k = fn(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  return map;
}
function safeUrl(u) {
  try {
    const url = new URL(u);
    return /^https?:$/.test(url.protocol) ? url.href : null;
  } catch { return null; }
}

// ---------- Dropdowns ----------
const SERVING_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '14', '16', '18', '20', '24', '30', '36', '48'];
const TIME_OPTIONS = [
  '5 min', '10 min', '15 min', '20 min', '25 min', '30 min', '35 min', '40 min', '45 min', '50 min', '55 min',
  '1 hr', '1 hr 15 min', '1 hr 30 min', '1 hr 45 min', '2 hr', '2 hr 30 min', '3 hr', '3 hr 30 min',
  '4 hr', '5 hr', '6 hr', '8 hr', '10 hr', '12 hr', '24 hr',
];
const CONVERT_LABELS = { cup: 'Cups', oz: 'Ounces', g: 'Grams', tbsp: 'Tablespoons', tsp: 'Teaspoons', ml: 'Milliliters', lb: 'Pounds', kg: 'Kilograms', l: 'Liters' };

function choiceSelect(name, current, options, blank) {
  const list = current && !options.includes(current) ? [current, ...options] : options;
  return `<select name="${name}"><option value="">${esc(blank)}</option>${list.map(o => `<option ${o === current ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
}

function unitOptions(current) {
  const extra = current && !UNIT_VALUES.includes(current) ? `<option selected>${esc(current)}</option>` : '';
  return `<option value="">Unit</option>${extra}${UNIT_GROUPS.map(([group, units]) => `<optgroup label="${group}">${units
    .map(([v, label]) => `<option value="${esc(v)}" title="${esc(label)}" ${v === current ? 'selected' : ''}>${esc(v)}</option>`).join('')}</optgroup>`).join('')}`;
}

// One amount: a number box, a fraction dropdown and a unit dropdown.
// Extra amounts (for "⅔ cup + ¼ tbsp") get an × to remove them.
function amountGroup(a = {}, removable = false) {
  let qtyText = '';
  let frac = '';
  if (a.qty !== null && a.qty !== undefined) {
    const split = splitQty(a.qty);
    if (split) {
      qtyText = split.whole === '' ? '' : String(split.whole);
      frac = split.frac;
    } else {
      qtyText = String(Math.round(a.qty * 100) / 100); // e.g. 2.37 stays as typed
    }
  }
  return `<span class="amt-group">
    <input class="qty-input" inputmode="decimal" placeholder="Qty" value="${esc(qtyText)}" aria-label="Amount" autocomplete="off">
    <select class="frac-select" aria-label="Fraction"><option value="">–</option>${FRACTION_OPTIONS.map(([f]) => `<option ${f === frac ? 'selected' : ''}>${f}</option>`).join('')}</select>
    <select class="unit-select" aria-label="Unit">${unitOptions(a.unit || null)}</select>
    ${removable ? `<button type="button" class="amt-x" data-action="remove-amount" aria-label="Remove this amount" title="Remove">${I.x}</button>` : ''}
  </span>`;
}

// The + adds another amount only when a recipe needs one (e.g. ⅔ cup + ¼ tbsp).
function amountPicker(amounts = []) {
  const list = amounts.length ? amounts : [{}];
  return `<span class="amount-picker">${list.map((a, i) => amountGroup(a, i > 0)).join('')}<button type="button" class="amt-plus" data-action="add-amount" aria-label="Add another amount" title="Add another amount, e.g. ⅔ cup + ¼ tbsp">${I.plus}</button></span>`;
}

// Reads every filled-in amount from the picker inside `root`.
function readAmounts(root) {
  const picker = root.querySelector('.amount-picker');
  if (!picker) return [];
  return [...picker.querySelectorAll('.amt-group')].map(g => {
    const typed = g.querySelector('.qty-input').value.trim();
    const whole = typed ? readQuantity(typed).qty : null; // accepts "2", "2.5", "1 1/2"
    const frac = joinQty('', g.querySelector('.frac-select').value);
    const qty = whole === null && frac === null ? null : (whole || 0) + (frac || 0);
    return { qty, unit: g.querySelector('.unit-select').value || null };
  }).filter(hasAmount);
}

// "⅔ cup + ¼ tbsp" / "1½ cups" for a parsed ingredient.
function amountsText(p, factor = 1) {
  const amounts = ingredientAmounts(p, factor);
  if (amounts.length > 1) return amounts.map(a => formatAmount(a.qty, null, a.unit)).join(' + ');
  return p.qty !== null ? formatAmount(p.qty * factor, p.qtyMax !== null ? p.qtyMax * factor : null, p.unit) : '';
}

function hasAmount(a) { return !!a && ((a.qty !== null && a.qty !== undefined) || !!a.unit); }

let toastTimer;
function toast(message, action) {
  clearTimeout(toastTimer);
  $toast.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  $toast.hidden = false;
  if (action) {
    $toast.querySelector('button').onclick = () => { $toast.hidden = true; action.run(); };
  }
  toastTimer = setTimeout(() => { $toast.hidden = true; }, action ? 5000 : 2500);
}

// ---------- Routing ----------
function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'recipes';
  const [name, id] = hash.split('/');
  return { name, id: id ? decodeURIComponent(id) : null };
}
function go(path) { location.hash = path; }
window.addEventListener('hashchange', () => {
  closeSheet();
  ui.detailTab = 'ingredients';
  render();
  window.scrollTo(0, 0);
});

// ---------- Navigation chrome ----------
function renderNav(r) {
  const section = ['recipe', 'edit', 'new'].includes(r.name) ? 'recipes' : r.name;
  const links = [
    ['recipes', 'Recipes', I.book, state.recipes.length],
    ['grocery', 'Groceries', I.cart, uncheckedCount()],
    ['pantry', 'Pantry', I.pantry, state.pantry.length],
    ['settings', 'Settings', I.gear, null],
  ];
  document.getElementById('side-links').innerHTML = links.map(([k, label, icon, n]) => `
    <a class="nav-link ${section === k && !(k === 'recipes' && ui.category) ? 'active' : ''}" href="#/${k}" data-action="nav-all">
      ${icon}<span>${label}</span>${n ? `<span class="count">${n}</span>` : ''}
    </a>`).join('');
  document.getElementById('tabbar').innerHTML = links.map(([k, label, icon, n]) => `
    <a class="tab ${section === k ? 'active' : ''}" href="#/${k}">
      ${icon}<span>${label}</span>${k === 'grocery' && n ? `<span class="badge">${n}</span>` : ''}
    </a>`).join('');
  const cats = allCategories(state);
  document.getElementById('side-categories').innerHTML = cats.length ? `
    <h4>Categories</h4>
    ${cats.map(c => `
      <a class="nav-link ${section === 'recipes' && ui.category === c ? 'active' : ''}" href="#/recipes" data-action="set-category" data-cat="${esc(c)}">
        <span>${esc(c)}</span><span class="count">${state.recipes.filter(r => (r.categories || []).includes(c)).length}</span>
      </a>`).join('')}` : '';
}

// ---------- Views ----------
function render() {
  const r = route();
  renderNav(r);
  const views = {
    recipes: viewRecipes,
    recipe: () => viewRecipe(r.id),
    new: () => viewEditor(null),
    edit: () => viewEditor(r.id),
    grocery: viewGrocery,
    pantry: viewPantry,
    settings: viewSettings,
  };
  // The editor keeps its own form state; don't wipe it on background re-renders.
  if ((r.name === 'edit' || r.name === 'new') && $view.dataset.view === `${r.name}/${r.id}`) return;
  $view.dataset.view = `${r.name}/${r.id}`;
  (views[r.name] || viewRecipes)();
  if (ui.focusAfterRender) {
    const el = document.getElementById(ui.focusAfterRender);
    ui.focusAfterRender = null;
    if (el) el.focus();
  }
}

// Recipes list
function filteredRecipes() {
  const q = ui.search.trim().toLowerCase();
  let list = state.recipes.filter(r => {
    if (ui.category && !(r.categories || []).includes(ui.category)) return false;
    if (!q) return true;
    return [r.name, r.ingredients, (r.categories || []).join(' '), r.source]
      .some(f => String(f || '').toLowerCase().includes(q));
  });
  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name),
    recent: (a, b) => b.created - a.created,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name),
  };
  return list.sort(sorters[ui.sort] || sorters.name);
}

function recipeCardsHtml() {
  if (!state.recipes.length) {
    return `<div class="empty">${I.book}<h2>No recipes yet</h2>
      <p>Add your own recipes — type them in or paste them from anywhere.</p>
      <a class="btn primary" href="#/new">${I.plus} Add Recipe</a></div>`;
  }
  const list = filteredRecipes();
  if (!list.length) return `<div class="empty"><h2>No matches</h2><p>Nothing matches your search.</p></div>`;
  return `<div class="recipe-grid">${list.map(r => {
    const time = [r.prepTime && `Prep ${r.prepTime}`, r.cookTime && `Cook ${r.cookTime}`].filter(Boolean)[0] || '';
    return `<a class="card" href="#/recipe/${encodeURIComponent(r.id)}">
      <div class="photo">${photos.get(r.id) ? `<img src="${photos.get(r.id)}" alt="" loading="lazy">` : I.dish}</div>
      <div class="body"><h3>${esc(r.name)}</h3>
        <div class="meta">${stars(r.rating)}${time ? `<span>${esc(time)}</span>` : ''}</div>
      </div></a>`;
  }).join('')}</div>`;
}

function viewRecipes() {
  const cats = allCategories(state);
  if (ui.category && !cats.includes(ui.category)) ui.category = null;
  $view.innerHTML = `
    <header class="topbar">
      <div class="topbar-row">
        <h1>${esc(ui.category || 'Recipes')}<span class="sub">${state.recipes.length} recipe${state.recipes.length === 1 ? '' : 's'}</span></h1>
        <a class="icon-btn" href="#/new" aria-label="Add recipe" title="Add recipe">${I.plus}</a>
      </div>
      ${state.recipes.length ? `<label class="search">${I.search}<span class="sr-only">Search recipes</span>
        <input id="recipe-search" type="search" placeholder="Search recipes or ingredients" value="${esc(ui.search)}" autocomplete="off"></label>` : ''}
    </header>
    <div class="content">
      ${cats.length ? `<div class="chips">
        <button class="chip ${!ui.category ? 'active' : ''}" data-action="set-category" data-cat="">All</button>
        ${cats.map(c => `<button class="chip ${ui.category === c ? 'active' : ''}" data-action="set-category" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>` : ''}
      ${state.recipes.length ? `<div class="list-toolbar"><span></span>
        <label>Sort <select id="recipe-sort">
          <option value="name" ${ui.sort === 'name' ? 'selected' : ''}>Name</option>
          <option value="recent" ${ui.sort === 'recent' ? 'selected' : ''}>Recently Added</option>
          <option value="rating" ${ui.sort === 'rating' ? 'selected' : ''}>Rating</option>
        </select></label></div>` : ''}
      <div id="recipe-results">${recipeCardsHtml()}</div>
    </div>`;
}

// Recipe detail
function viewRecipe(id) {
  const r = recipeById(id);
  if (!r) {
    $view.innerHTML = `<div class="empty"><h2>Recipe not found</h2><a class="btn" href="#/recipes">Back to Recipes</a></div>`;
    return;
  }
  const factor = ui.scale[id] || 1;
  const crossed = ui.crossed[id] || new Set();
  const ingredients = parseIngredients(r.ingredients);
  const steps = String(r.directions || '').split(/\n\s*\n|\n/).map(s => s.trim()).filter(Boolean);
  const baseServings = servingsNumber(r.servings);
  const counts = { pantry: 0, list: 0, bought: 0, need: 0, low: 0 };
  const conv = ui.convert[id] || { all: '', lines: {} };
  const anyConvertible = ingredients.some(p => p.qty !== null && isConvertible(p.unit));

  const ingHtml = ingredients.map((p, i) => {
    if (p.header) return `<li class="header">${esc(p.header)}</li>`;
    const amounts = ingredientAmounts(p, factor);
    const total = totalAmount(amounts);
    const status = ingredientStatus(state, p.key, total || amounts[0] || null);
    counts[status]++;
    const written = amountsText(p, factor);
    let text;
    if (total && amounts.every(a => isConvertible(a.unit))) {
      // The amount itself is a dropdown listing it in every unit from the kitchen chart.
      const max = amounts.length === 1 && p.qtyMax !== null ? p.qtyMax * factor : null;
      const inUnit = u => convertAmount(total.qty, total.unit, u);
      // "Show amounts in" skips lines that would become awkward decimals (½ tsp -> 0.17 tbsp).
      const allFits = conv.all && inUnit(conv.all) >= 1 / 16 && !formatQty(inUnit(conv.all)).includes('.');
      const target = i in conv.lines ? conv.lines[i] : allFits ? conv.all : '';
      const options = [`<option value="" ${target === '' ? 'selected' : ''}>${esc(written)}</option>`]
        .concat(CONVERT_TARGETS
          .filter(u => amounts.length > 1 || u !== p.unit)
          // Skip units where the amount would round to nothing (e.g. "0 kg" of salt).
          .filter(u => u === target || inUnit(u) >= 1 / 16)
          .map(u => {
            const label = formatAmount(inUnit(u), max !== null ? convertAmount(max, total.unit, u) : null, u);
            return `<option value="${esc(u)}" ${u === target ? 'selected' : ''}>${esc(label)}</option>`;
          }))
        .join('');
      text = `<select class="convert" data-i="${i}" aria-label="Change unit">${options}</select> ${esc(p.name)}`;
    } else if (written && amounts[0].qty !== null) {
      text = `<span class="amt">${esc(written)}</span> ${esc(p.name)}`;
    } else {
      text = esc(p.raw);
    }
    const pantry = status === 'low' ? findPantry(state, p.key) : null;
    const title = {
      pantry: 'In your pantry',
      low: pantry ? `You have ${formatAmount(pantry.qty, null, pantry.unit)} — not enough` : 'Not enough in your pantry',
      list: 'On your grocery list',
      bought: 'Checked off on your grocery list',
      need: 'Not in your pantry',
    }[status];
    const icon = status === 'list' ? I.cart : status === 'need' ? '' : status === 'low' ? '!' : I.check;
    return `<li class="${crossed.has(i) ? 'crossed' : ''}" data-action="cross-ingredient" data-i="${i}">
      <span class="status-dot ${status}" title="${title}">${icon}</span><span class="txt">${text}</span></li>`;
  }).join('');

  const scaleLabel = baseServings ? `${formatAmount(baseServings * factor)} serving${baseServings * factor === 1 ? '' : 's'}` : `${formatAmount(factor)}×`;
  const source = safeUrl(r.source);
  const tab = ui.detailTab;
  const activeStep = ui.step[id];

  $view.innerHTML = `
    <div class="detail">
    <header class="topbar"><div class="topbar-row">
      <a class="icon-btn" href="#/recipes" aria-label="Back to recipes">${I.back}</a>
      <span class="spacer"></span>
      <button class="icon-btn" data-action="open-add-to-list" aria-label="Add to grocery list" title="Add to grocery list">${I.cart}</button>
      <a class="icon-btn" href="#/edit/${encodeURIComponent(id)}" aria-label="Edit recipe" title="Edit">${I.edit}</a>
      <button class="icon-btn" data-action="delete-recipe" aria-label="Delete recipe" title="Delete">${I.trash}</button>
    </div></header>
    <div class="detail-head">
      <div class="detail-photo">${photos.get(id) ? `<img src="${photos.get(id)}" alt="">` : I.dish}</div>
      <div>
        <h1 class="title">${esc(r.name)}</h1>
        ${stars(r.rating)}
        <div class="facts">
          ${r.servings ? `<div class="fact">Servings<b>${esc(r.servings)}</b></div>` : ''}
          ${r.prepTime ? `<div class="fact">Prep time<b>${esc(r.prepTime)}</b></div>` : ''}
          ${r.cookTime ? `<div class="fact">Cook time<b>${esc(r.cookTime)}</b></div>` : ''}
        </div>
        ${r.source ? `<div class="source">${source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">${esc(new URL(source).hostname.replace(/^www\./, ''))}</a>` : esc(r.source)}</div>` : ''}
        ${(r.categories || []).length ? `<div class="cats">${r.categories.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
        <div class="detail-actions">
          <button class="btn primary" data-action="open-add-to-list">${I.cart} Add to Grocery List</button>
        </div>
      </div>
    </div>
    <div class="detail-tabs"><div class="segmented" role="tablist">
      <button class="${tab === 'ingredients' ? 'active' : ''}" data-action="detail-tab" data-tab="ingredients">Ingredients</button>
      <button class="${tab === 'directions' ? 'active' : ''}" data-action="detail-tab" data-tab="directions">Directions</button>
      ${r.notes ? `<button class="${tab === 'notes' ? 'active' : ''}" data-action="detail-tab" data-tab="notes">Notes</button>` : ''}
    </div></div>
    <div class="detail-body">
      <section ${tab !== 'ingredients' ? 'hidden' : ''}>
        <h2><span class="grow">Ingredients</span>
          <span class="scale"><button data-action="scale" data-d="-1" aria-label="Scale down">−</button><span>${esc(scaleLabel)}</span><button data-action="scale" data-d="1" aria-label="Scale up">+</button></span>
        </h2>
        ${ingredients.length ? `
          <div class="have-summary">
            ${counts.pantry + counts.bought ? `<span class="pill pantry">${I.check} Have ${counts.pantry + counts.bought}</span>` : ''}
            ${counts.list ? `<span class="pill list">${I.cart} On list ${counts.list}</span>` : ''}
            ${counts.low ? `<span class="pill low">Not enough ${counts.low}</span>` : ''}
            ${counts.need ? `<span class="pill need">Need ${counts.need}</span>` : ''}
          </div>
          ${anyConvertible ? `<label class="convert-all">Show amounts in
            <select id="convert-all"><option value="">As written</option>${CONVERT_TARGETS.map(u => `<option value="${u}" ${conv.all === u ? 'selected' : ''}>${CONVERT_LABELS[u]}</option>`).join('')}</select></label>` : ''}
          <ul class="ing-list">${ingHtml}</ul>
          <div class="legend">
            <span><span class="status-dot pantry">${I.check}</span>In pantry</span>
            <span><span class="status-dot low">!</span>Not enough</span>
            <span><span class="status-dot list">${I.cart}</span>On grocery list</span>
            <span><span class="status-dot need"></span>Need to buy</span>
          </div>` : '<p class="fact">No ingredients yet.</p>'}
      </section>
      <section ${tab !== 'directions' ? 'hidden' : ''}>
        <h2>Directions</h2>
        ${steps.length ? `<ol class="steps">${steps.map((s, i) => `<li class="${activeStep === i ? 'active' : activeStep > i ? 'done' : ''}" data-action="step" data-i="${i}">${esc(s)}</li>`).join('')}</ol>` : '<p class="fact">No directions yet.</p>'}
      </section>
      ${r.notes ? `<section class="notes-sec" ${tab !== 'notes' ? 'hidden' : ''}><h2>Notes</h2><div class="notes">${esc(r.notes)}</div></section>` : ''}
    </div>
    </div>`;
}

// Recipe editor
let editorPhoto; // undefined = unchanged, null = removed, string = new data URL
let editorRating = 0;

function viewEditor(id) {
  const r = id ? recipeById(id) : null;
  if (id && !r) { go('#/recipes'); return; }
  editorPhoto = undefined;
  editorRating = r ? r.rating || 0 : 0;
  const cats = allCategories(state);
  const photo = r && photos.get(r.id);
  $view.innerHTML = `
    <form id="recipe-form" class="editor" autocomplete="off">
    <header class="topbar"><div class="topbar-row">
      <a class="link-btn" href="${r ? `#/recipe/${encodeURIComponent(r.id)}` : '#/recipes'}">Cancel</a>
      <h1 style="text-align:center;font-size:17px">${r ? 'Edit Recipe' : 'New Recipe'}</h1>
      <button class="link-btn" type="submit">Save</button>
    </div></header>
    <div class="content">
      ${!r ? `<button type="button" class="btn block" data-action="open-import" style="margin-bottom:16px">${I.clipboard} Paste recipe text to fill in</button>` : ''}
      <label class="field"><span>Name</span><input name="name" required value="${esc(r?.name)}" placeholder="Recipe name"></label>
      <div class="field"><span>Photo</span>
        <div class="photo-pick">
          <div class="thumb" id="photo-thumb">${photo ? `<img src="${photo}" alt="">` : I.image}</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <label class="btn small" style="cursor:pointer">Choose Photo<input type="file" accept="image/*" id="photo-input" hidden></label>
            <button type="button" class="link-btn" data-action="remove-photo" style="text-align:left">Remove</button>
          </div>
        </div>
      </div>
      <div class="field"><span>Rating</span><div class="star-input" id="star-input">${starButtons(editorRating)}</div></div>
      <div class="field"><span>Categories</span>
        ${cats.length ? `<div class="cat-picks">${cats.map(c => `<label class="chip check-chip"><input type="checkbox" name="cat" value="${esc(c)}" ${(r?.categories || []).includes(c) ? 'checked' : ''}>${esc(c)}</label>`).join('')}</div>` : ''}
        <input class="input" name="newcats" placeholder="${cats.length ? 'Add a new category' : 'e.g. Dinner, Chicken'}">
        <div class="hint">${cats.length ? 'Tap to pick. ' : ''}Separate new categories with commas.</div></div>
      <div class="row-fields">
        <label class="field"><span>Servings</span>${choiceSelect('servings', r?.servings || '', SERVING_OPTIONS, '—')}</label>
        <label class="field"><span>Prep time</span>${choiceSelect('prepTime', r?.prepTime || '', TIME_OPTIONS, '—')}</label>
        <label class="field"><span>Cook time</span>${choiceSelect('cookTime', r?.cookTime || '', TIME_OPTIONS, '—')}</label>
      </div>
      <label class="field"><span>Source</span><input name="source" value="${esc(r?.source)}" placeholder="Website, book, or person"></label>
      <div class="field"><span>Ingredients</span>
        <div id="ing-rows" class="ing-rows">${ingredientRowsHtml(r ? parseIngredients(r.ingredients) : [])}</div>
        <div class="ing-actions">
          <button type="button" class="btn small" data-action="add-ing-row">${I.plus} Ingredient</button>
          <button type="button" class="btn small" data-action="add-ing-header">${I.plus} Section</button>
          <button type="button" class="btn small" data-action="paste-ingredients">${I.clipboard} Paste List</button>
        </div></div>
      <label class="field"><span>Directions</span>
        <textarea name="directions" rows="10" placeholder="One step per line">${esc(r?.directions)}</textarea></label>
      <label class="field"><span>Notes</span><textarea name="notes" rows="4">${esc(r?.notes)}</textarea></label>
      <button class="btn primary block" type="submit">Save Recipe</button>
    </div>
    </form>`;
}

function ingredientRowHtml(p = null) {
  const remove = `<button type="button" class="icon-btn" data-action="remove-ing-row" aria-label="Remove">${I.x}</button>`;
  if (p && p.header) {
    return `<div class="ing-row header-row" data-kind="header">
      <input class="input" value="${esc(p.header)}" placeholder="Section name, e.g. For the sauce">${remove}</div>`;
  }
  const name = !p ? '' : p.qty === null && !p.unit ? p.raw : p.name;
  return `<div class="ing-row" data-kind="item" data-max="${p && p.qtyMax !== null ? p.qtyMax : ''}">
    ${amountPicker(p ? ingredientAmounts(p) : [])}
    <input class="input ing-name" value="${esc(name)}" placeholder="Ingredient" enterkeyhint="next">${remove}</div>`;
}

function ingredientRowsHtml(parsed) {
  const rows = parsed.map(ingredientRowHtml);
  // Always leave an empty row (a few for a new recipe) ready to fill in.
  const blanks = parsed.length ? 1 : 3;
  for (let i = 0; i < blanks; i++) rows.push(ingredientRowHtml());
  return rows.join('');
}

// Reads the ingredient rows back into lines of text ("1½ cups flour").
function editorIngredients() {
  return [...document.querySelectorAll('#ing-rows .ing-row')].map(row => {
    const input = row.querySelector('input.input');
    const text = input.value.trim();
    if (row.dataset.kind === 'header') return text ? `${text.replace(/:$/, '')}:` : '';
    if (!text) return '';
    const [first = { qty: null, unit: null }, ...extras] = readAmounts(row);
    const max = row.dataset.max ? Number(row.dataset.max) : null;
    const qtyMax = first.qty !== null && !extras.length && max > first.qty ? max : null;
    return buildLine({ qty: first.qty, qtyMax, unit: first.unit, extras, name: text });
  }).filter(Boolean).join('\n');
}

function appendIngredientRow(html, after = null) {
  const wrap = document.getElementById('ing-rows');
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const row = tmp.firstElementChild;
  if (after) after.after(row); else wrap.append(row);
  row.querySelector('input.input').focus();
  return row;
}

function starButtons(n) {
  return [1, 2, 3, 4, 5].map(i => `<button type="button" class="${i <= n ? 'on' : ''}" data-action="rate" data-n="${i}" aria-label="${i} star${i > 1 ? 's' : ''}">★</button>`).join('');
}

async function submitEditor(form) {
  const id = route().id;
  const fd = new FormData(form);
  const data = {
    name: String(fd.get('name')).trim(),
    categories: [...new Set([...fd.getAll('cat').map(String), ...String(fd.get('newcats')).split(',').map(s => s.trim()).filter(Boolean)])],
    servings: String(fd.get('servings')).trim(),
    prepTime: String(fd.get('prepTime')).trim(),
    cookTime: String(fd.get('cookTime')).trim(),
    source: String(fd.get('source')).trim(),
    ingredients: editorIngredients(),
    directions: String(fd.get('directions')).trim(),
    notes: String(fd.get('notes')).trim(),
    rating: editorRating,
  };
  if (!data.name) return;
  const saved = saveRecipe(state, id ? { ...data, id } : { ...data, id: uid() });
  if (editorPhoto !== undefined) {
    if (editorPhoto) {
      await db.set(`photo:${saved.id}`, editorPhoto);
      photos.set(saved.id, editorPhoto);
    } else {
      await db.del(`photo:${saved.id}`);
      photos.delete(saved.id);
    }
    saved.photo = !!editorPhoto;
  }
  $view.dataset.view = '';
  commit();
  go(`#/recipe/${encodeURIComponent(saved.id)}`);
}

function resizeImage(file, max = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

// Grocery list
function groceryRow(g, amount) {
  const sources = [...new Set(g.parts.map(p => p.recipeName).filter(Boolean))];
  // Same rule as the "already in your pantry" banner: top-ups of a known amount aren't flagged.
  const inPantry = groceryInPantry(state).includes(g);
  const sub = [sources.join(', '), g.note].filter(Boolean).join(' · ');
  return `<div class="item ${g.checked ? 'checked' : ''}">
    <button class="check ${g.checked ? 'on' : ''}" data-action="toggle-item" data-id="${g.id}" aria-label="${g.checked ? 'Uncheck' : 'Check off'} ${esc(g.name)}" aria-pressed="${g.checked}">${I.check}</button>
    <div class="main" data-action="edit-item" data-id="${g.id}">
      <div><span class="name">${esc(g.name)}</span>${amount ? `<span class="amount">${esc(amount)}</span>` : ''}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    </div>
    ${inPantry ? `<div class="trail"><span class="pill pantry" title="Already in your pantry">${I.check} In pantry</span></div>` : ''}
  </div>`;
}

function viewGrocery() {
  const open = state.grocery.filter(g => !g.checked);
  const done = state.grocery.filter(g => g.checked);
  const onList = recipesOnList(state);
  const dupes = groceryInPantry(state);
  let groupsHtml = '';

  if (ui.groceryGroup === 'recipe') {
    const groups = onList.map(r => ({
      title: r.name,
      recipeId: r.id,
      rows: open
        .filter(g => g.parts.some(p => p.recipeId === r.id))
        .map(g => groceryRow(g, amountText({ parts: g.parts.filter(p => p.recipeId === r.id) }))),
    }));
    const other = open.filter(g => g.parts.some(p => !p.recipeId));
    if (other.length) {
      groups.push({ title: 'Other Items', rows: other.map(g => groceryRow(g, amountText({ parts: g.parts.filter(p => !p.recipeId) }))) });
    }
    groupsHtml = groups.filter(gr => gr.rows.length).map(gr => `
      <section class="group"><h3 class="group-title"><span class="grow">${esc(gr.title)}</span>
        ${gr.recipeId && recipeById(gr.recipeId) ? `<a href="#/recipe/${encodeURIComponent(gr.recipeId)}">View</a>` : ''}</h3>
      <div class="rows">${gr.rows.join('')}</div></section>`).join('');
  } else {
    const byAisle = groupBy(open, g => g.aisle || 'Other');
    groupsHtml = sortAisles([...byAisle.keys()]).map(aisle => {
      const rows = byAisle.get(aisle).sort((a, b) => a.name.localeCompare(b.name));
      return `<section class="group"><h3 class="group-title">${esc(aisle)} <span class="n">${rows.length}</span></h3>
        <div class="rows">${rows.map(g => groceryRow(g, amountText(g))).join('')}</div></section>`;
    }).join('');
  }

  $view.innerHTML = `
    <header class="topbar">
      <div class="topbar-row">
        <h1>Grocery List<span class="sub">${open.length} item${open.length === 1 ? '' : 's'} to buy</span></h1>
        ${state.grocery.length ? `<button class="icon-btn" data-action="grocery-menu" aria-label="List options" title="Options">${I.more}</button>` : ''}
      </div>
      <form class="add-form" data-form="add-grocery">
        <input id="grocery-input" class="input" name="entry" placeholder="Add an item" autocomplete="off" enterkeyhint="done">
        <div class="add-row">${amountPicker()}<button class="btn primary" type="submit">Add</button></div>
      </form>
    </header>
    <div class="content">
      ${state.grocery.length ? `<div class="segmented" style="max-width:320px;margin-top:4px">
        <button class="${ui.groceryGroup === 'aisle' ? 'active' : ''}" data-action="group-by" data-by="aisle">By Aisle</button>
        <button class="${ui.groceryGroup === 'recipe' ? 'active' : ''}" data-action="group-by" data-by="recipe">By Recipe</button>
      </div>` : ''}
      ${onList.length ? `<div class="chips">${onList.map(r => `
        <span class="chip">${esc(r.name)}<button class="x" data-action="remove-recipe-from-list" data-id="${esc(r.id)}" aria-label="Remove ${esc(r.name)} from list">${I.x}</button></span>`).join('')}</div>` : ''}
      ${dupes.length ? `<div class="banner">${I.home}<span class="grow">${dupes.length} item${dupes.length === 1 ? ' is' : 's are'} already in your pantry.</span>
        <button class="btn small" data-action="remove-pantry-dupes">Remove</button></div>` : ''}
      ${!state.grocery.length ? `<div class="empty">${I.cart}<h2>Your list is empty</h2>
        <p>Add items above, or open a recipe and tap “Add to Grocery List”. Things already in your pantry are left off automatically.</p></div>` : ''}
      ${groupsHtml}
      ${done.length ? `<section class="group"><h3 class="group-title"><span class="grow">In Cart <span class="n">${done.length}</span></span>
          <button class="link-btn" data-action="clear-checked">Move to Pantry</button></h3>
        <div class="rows">${done.sort((a, b) => a.name.localeCompare(b.name)).map(g => groceryRow(g, amountText(g))).join('')}</div></section>` : ''}
    </div>`;
}

// Pantry
function viewPantry() {
  const q = ui.pantrySearch.trim().toLowerCase();
  const items = state.pantry.filter(p => !q || p.name.toLowerCase().includes(q));
  const byAisle = groupBy(items, p => p.aisle || 'Other');
  $view.innerHTML = `
    <header class="topbar">
      <div class="topbar-row"><h1>Pantry<span class="sub">${state.pantry.length} item${state.pantry.length === 1 ? '' : 's'} on hand</span></h1></div>
      <form class="add-form" data-form="add-pantry">
        <input id="pantry-input" class="input" name="entry" placeholder="Add something you have" autocomplete="off" enterkeyhint="done">
        <div class="add-row">${amountPicker()}<button class="btn primary" type="submit">Add</button></div>
      </form>
      ${state.pantry.length > 8 ? `<label class="search">${I.search}<span class="sr-only">Search pantry</span>
        <input id="pantry-search" type="search" placeholder="Search pantry" value="${esc(ui.pantrySearch)}"></label>` : ''}
    </header>
    <div class="content">
      ${!state.pantry.length ? `<div class="empty">${I.pantry}<h2>Nothing in your pantry</h2>
        <p>Add what you have at home. Recipes will show what you already have, and those items won’t be added to your grocery list. Pick an amount and recipes that need more will add just the difference. Items you check off while shopping land here too.</p></div>` : ''}
      ${sortAisles([...byAisle.keys()]).map(aisle => {
        const rows = byAisle.get(aisle).sort((a, b) => a.name.localeCompare(b.name));
        return `<section class="group"><h3 class="group-title">${esc(aisle)} <span class="n">${rows.length}</span></h3>
        <div class="rows">${rows.map(p => `<div class="item">
          <div class="main" data-action="edit-pantry" data-id="${p.id}"><span class="name">${esc(p.name)}</span>${p.qty !== null && p.qty !== undefined ? `<span class="amount">${esc(formatAmount(p.qty, null, p.unit))}</span>` : ''}</div>
          <button class="btn small" data-action="used-up" data-id="${p.id}">Used Up</button>
        </div>`).join('')}</div></section>`;
      }).join('')}
    </div>`;
}

// Settings
function viewSettings() {
  $view.innerHTML = `
    <header class="topbar"><div class="topbar-row"><h1>Settings</h1></div></header>
    <div class="content" style="max-width:720px">
      <div class="settings-card">
        <h2>Backup</h2>
        <p>Your recipes, grocery list and pantry are stored only on this device. Export a backup file to keep them safe or move them to another device.</p>
        <div class="btns">
          <button class="btn" data-action="export">Export Backup</button>
          <label class="btn" style="cursor:pointer">Import Backup<input type="file" accept="application/json,.json" id="import-input" hidden></label>
        </div>
      </div>
      <div class="settings-card">
        <h2>How the grocery list stays in sync</h2>
        <p>When you add a recipe to the list, anything already in your pantry or already on the list is unchecked, so you only add what you need. If your pantry has an amount and the recipe needs more, only the difference is added. The same ingredient from different recipes is combined into one item. Checked-off items move to your pantry when you tap “Move to Pantry”, and removing a recipe from the list takes its ingredients with it.</p>
      </div>
      <div class="settings-card">
        <h2>App Version</h2>
        <p>Version ${APP_VERSION}. Updates load automatically when you open the app.</p>
      </div>
      <div class="settings-card">
        <h2>Erase Everything</h2>
        <p>Delete all recipes, photos, the grocery list and the pantry from this device.</p>
        <button class="btn danger" data-action="erase">Erase All Data</button>
      </div>
    </div>`;
}

// ---------- Sheets ----------
function openSheet(title, bodyHtml, { confirmLabel, onConfirm, footHtml = '' } = {}) {
  $sheet.innerHTML = `<form method="dialog" class="sheet-inner">
    <div class="sheet-head">
      <button type="button" class="link-btn" data-action="close-sheet">Cancel</button>
      <h2>${esc(title)}</h2>
      ${confirmLabel ? `<button type="submit" class="link-btn" value="ok">${esc(confirmLabel)}</button>` : '<span style="min-width:64px"></span>'}
    </div>
    <div class="sheet-body">${bodyHtml}</div>
    ${footHtml ? `<div class="sheet-foot">${footHtml}</div>` : ''}
  </form>`;
  const form = $sheet.querySelector('form');
  form.onsubmit = e => {
    e.preventDefault();
    if (onConfirm && onConfirm(form) === false) return;
    closeSheet();
  };
  if (!$sheet.open) $sheet.showModal();
}
function closeSheet() { if ($sheet.open) $sheet.close(); }
$sheet.addEventListener('click', e => { if (e.target === $sheet) closeSheet(); });

function openAddToList(recipe) {
  const factor = ui.scale[recipe.id] || 1;
  const plan = recipeListPlan(state, recipe, factor);
  const label = { pantry: 'In pantry', list: 'On list', bought: 'In cart', need: '', low: '' };
  const body = `
    <p style="margin:0 0 12px;color:var(--muted);font-size:14px">${esc(recipe.name)}${factor !== 1 ? ` · scaled ${esc(formatAmount(factor))}×` : ''}. Items you already have are unchecked; amounts for items already on the list are combined.</p>
    <div style="display:flex;gap:14px;margin-bottom:10px">
      <button type="button" class="link-btn" data-action="pick" data-mode="all">Select All</button>
      <button type="button" class="link-btn" data-action="pick" data-mode="need">Only What I Need</button>
      <button type="button" class="link-btn" data-action="pick" data-mode="none">None</button>
    </div>
    <ul class="pick-list">${plan.map(row => {
      if (row.header) return `<li class="header">${esc(row.parsed.header)}</li>`;
      const p = row.parsed;
      const text = p.qty !== null ? `<b>${esc(amountsText(p, factor))}</b> ${esc(p.name)}` : esc(p.raw);
      const pill = row.status === 'list' && !row.alreadyAdded ? 'On list · adds more'
        : row.status === 'low' ? `Not enough · adds ${formatAmount(row.qty, null, p.unit)}`
          : label[row.status];
      return `<li><label><input type="checkbox" name="pick" value="${row.index}" data-need="${row.selected}" ${row.selected ? 'checked' : ''}>
        <span class="txt">${text}</span></label>${pill ? `<span class="pill ${row.status}">${pill}</span>` : ''}</li>`;
    }).join('')}</ul>`;
  openSheet('Add to Grocery List', body, {
    confirmLabel: 'Add',
    footHtml: `<button type="submit" class="btn primary block">${I.cart} Add to Grocery List</button>`,
    onConfirm: form => {
      const picked = new Set([...form.querySelectorAll('input[name=pick]:checked')].map(i => Number(i.value)));
      for (const row of plan) row.selected = picked.has(row.index);
      const n = addRecipeToGrocery(state, recipe, plan);
      commit();
      toast(n ? `Added ${n} item${n === 1 ? '' : 's'} to your grocery list` : 'Nothing added', n ? { label: 'View List', run: () => go('#/grocery') } : null);
    },
  });
}

function aisleSelect(current) {
  const list = AISLES.includes(current) ? AISLES : [...AISLES, current];
  return `<select name="aisle">${list.map(a => `<option ${a === current ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select>`;
}

function openEditItem(item) {
  const fromRecipes = item.parts.filter(p => p.recipeId);
  const mine = item.parts.filter(p => !p.recipeId && hasAmount(p));
  const key = list => JSON.stringify(list.map(a => [a.qty === null ? null : Math.round(a.qty * 1000) / 1000, a.unit || null]));
  const breakdown = fromRecipes.map(p => {
    const amt = formatAmount(p.qty, null, p.unit);
    return `<li><span class="txt">${esc(p.recipeName || 'Added by you')}</span><span style="color:var(--muted)">${esc(amt || '—')}</span></li>`;
  }).join('');
  openSheet('Edit Item', `
    <label class="field"><span>Name</span><input name="name" value="${esc(item.name)}" required></label>
    <label class="field"><span>Aisle</span>${aisleSelect(item.aisle)}<div class="hint">Remembered for next time.</div></label>
    <label class="field"><span>Note</span><input name="note" value="${esc(item.note)}" placeholder="Brand, size…"></label>
    <div class="field"><span>${fromRecipes.length ? 'Extra amount (besides recipes)' : 'Amount'}</span>${amountPicker(mine)}</div>
    ${fromRecipes.length ? `<div class="field"><span>Needed for</span><ul class="pick-list">${breakdown}</ul></div>` : ''}
    <button type="button" class="btn danger block" data-action="delete-item" data-id="${item.id}">${I.trash} Remove from List</button>`, {
    confirmLabel: 'Done',
    onConfirm: form => {
      const fd = new FormData(form);
      const name = String(fd.get('name')).trim();
      if (name && name !== item.name) renameGroceryItem(state, item.id, name);
      const aisle = String(fd.get('aisle'));
      if (aisle !== item.aisle) setAisle(state, item.key, aisle);
      item.note = String(fd.get('note')).trim();
      const amounts = readAmounts(form);
      if (key(amounts) !== key(mine)) {
        item.parts = item.parts.filter(p => p.recipeId);
        for (const a of amounts) item.parts.push({ recipeId: null, recipeName: null, ...a });
      }
      // An item with no amounts still needs one entry to stay on the list.
      if (!item.parts.length) item.parts.push({ recipeId: null, recipeName: null, qty: null, unit: null });
      commit();
    },
  });
}

function openEditPantry(item) {
  openSheet('Pantry Item', `
    <label class="field"><span>Name</span><input name="name" value="${esc(item.name)}" required></label>
    <div class="field"><span>Amount you have</span>${amountPicker(hasAmount(item) ? [{ qty: item.qty ?? null, unit: item.unit ?? null }] : [])}<div class="hint">Leave blank if you’re not sure — it will count as enough.</div></div>
    <label class="field"><span>Aisle</span>${aisleSelect(item.aisle)}</label>
    <button type="button" class="btn danger block" data-action="delete-pantry" data-id="${item.id}">${I.trash} Remove from Pantry</button>`, {
    confirmLabel: 'Done',
    onConfirm: form => {
      const fd = new FormData(form);
      const name = String(fd.get('name')).trim();
      if (name && name !== item.name) {
        item.name = name;
        item.key = normalizeName(name) || item.key;
      }
      // Several amounts (e.g. 1 cup + 2 tbsp) are stored as their total.
      const amounts = readAmounts(form);
      const amount = totalAmount(amounts) || amounts[0] || { qty: null, unit: null };
      item.qty = amount.qty;
      item.unit = amount.unit || null;
      const aisle = String(fd.get('aisle'));
      if (aisle !== item.aisle) setAisle(state, item.key, aisle);
      commit();
    },
  });
}

function openPasteIngredients() {
  openSheet('Paste Ingredients', `
    <p style="margin:0 0 10px;color:var(--muted);font-size:14px">Paste a list of ingredients, one per line. Amounts and units will be put into the dropdowns for you.</p>
    <textarea class="input" name="text" rows="12" placeholder="2 cups flour&#10;1 tsp salt&#10;3 tbsp butter" required></textarea>`, {
    confirmLabel: 'Add',
    onConfirm: form => {
      const wrap = document.getElementById('ing-rows');
      if (!wrap) return;
      // Drop empty rows, add the pasted ones, then keep one blank row at the end.
      for (const row of wrap.querySelectorAll('.ing-row')) if (!row.querySelector('input.input').value.trim()) row.remove();
      wrap.insertAdjacentHTML('beforeend', ingredientRowsHtml(parseIngredients(new FormData(form).get('text'))));
    },
  });
}

function openImport() {
  openSheet('Paste Recipe', `
    <p style="margin:0 0 10px;color:var(--muted);font-size:14px">Paste a recipe copied from a website, message or note. The name, ingredients and directions will be filled in for you to review.</p>
    <textarea class="input" name="text" rows="14" placeholder="Recipe name&#10;&#10;Ingredients&#10;2 cups flour&#10;…&#10;&#10;Directions&#10;1. Preheat the oven…" required></textarea>`, {
    confirmLabel: 'Fill In',
    onConfirm: form => {
      const parsed = parseRecipeText(new FormData(form).get('text'));
      const f = document.getElementById('recipe-form');
      if (!f) return;
      for (const k of ['name', 'directions', 'notes']) {
        if (parsed[k] && f.elements[k]) f.elements[k].value = parsed[k];
      }
      // Dropdowns: keep what was pasted even if it isn't one of the usual choices.
      for (const k of ['servings', 'prepTime', 'cookTime']) {
        if (!parsed[k] || !f.elements[k]) continue;
        const sel = f.elements[k];
        if (![...sel.options].some(o => o.value === parsed[k])) sel.add(new Option(parsed[k], parsed[k]), 1);
        sel.value = parsed[k];
      }
      if (parsed.ingredients) document.getElementById('ing-rows').innerHTML = ingredientRowsHtml(parseIngredients(parsed.ingredients));
    },
  });
}

function openGroceryMenu() {
  const done = state.grocery.filter(g => g.checked).length;
  openSheet('List Options', `
    <div style="display:flex;flex-direction:column;gap:10px">
      <button type="button" class="btn block" data-action="clear-checked" ${done ? '' : 'disabled'}>Move ${done} Checked Item${done === 1 ? '' : 's'} to Pantry</button>
      <button type="button" class="btn block" data-action="uncheck-all" ${done ? '' : 'disabled'}>Uncheck All</button>
      <button type="button" class="btn danger block" data-action="clear-all">Clear Entire List</button>
    </div>`);
}

// ---------- Backup ----------
async function exportBackup() {
  const data = { app: 'recipe-box', version: 1, exported: new Date().toISOString(), state, photos: Object.fromEntries(photos) };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `recipe-box-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { data = null; }
  if (!data || data.app !== 'recipe-box' || !data.state) { toast('That file is not a Recipe Box backup'); return; }
  if (!confirm('Replace everything on this device with this backup?')) return;
  await eraseAll(false);
  state = normalizeState(data.state);
  for (const [id, url] of Object.entries(data.photos || {})) {
    photos.set(id, url);
    await db.set(`photo:${id}`, url);
  }
  await db.set('state', state);
  render();
  toast(`Restored ${state.recipes.length} recipe${state.recipes.length === 1 ? '' : 's'}`);
}

async function eraseAll(reRender = true) {
  for (const k of await db.keys()) await db.del(k);
  photos.clear();
  state = emptyState();
  if (reRender) { await db.set('state', state); render(); }
}

function normalizeState(s) {
  const base = emptyState();
  return {
    recipes: Array.isArray(s.recipes) ? s.recipes : base.recipes,
    grocery: Array.isArray(s.grocery) ? s.grocery.map(g => ({ note: '', parts: [], ...g })) : base.grocery,
    pantry: Array.isArray(s.pantry) ? s.pantry : base.pantry,
    aisleOverrides: s.aisleOverrides && typeof s.aisleOverrides === 'object' ? s.aisleOverrides : {},
  };
}

// ---------- Events ----------
function handleAction(el, e) {
  const action = el.dataset.action;
  const r = route();
  const recipe = r.name === 'recipe' ? recipeById(r.id) : null;
  switch (action) {
    case 'nav-all':
      if (el.getAttribute('href') === '#/recipes') { ui.category = null; if (route().name === 'recipes') render(); }
      break;
    case 'set-category':
      ui.category = el.dataset.cat || null;
      if (route().name !== 'recipes') go('#/recipes'); else render();
      break;
    case 'detail-tab':
      ui.detailTab = el.dataset.tab;
      render();
      break;
    case 'scale': {
      const steps = [0.25, 0.5, 1, 1.5, 2, 3, 4, 6, 8];
      const cur = ui.scale[r.id] || 1;
      const i = steps.indexOf(cur);
      ui.scale[r.id] = steps[Math.max(0, Math.min(steps.length - 1, i + Number(el.dataset.d)))];
      render();
      break;
    }
    case 'cross-ingredient': {
      const set = ui.crossed[r.id] || (ui.crossed[r.id] = new Set());
      const i = Number(el.dataset.i);
      set.has(i) ? set.delete(i) : set.add(i);
      el.classList.toggle('crossed');
      break;
    }
    case 'step': {
      const i = Number(el.dataset.i);
      ui.step[r.id] = ui.step[r.id] === i ? undefined : i;
      render();
      break;
    }
    case 'open-add-to-list':
      if (recipe) openAddToList(recipe);
      break;
    case 'delete-recipe':
      if (recipe && confirm(`Delete “${recipe.name}”? Its items will also be removed from your grocery list.`)) {
        deleteRecipe(state, recipe.id);
        photos.delete(recipe.id);
        db.del(`photo:${recipe.id}`);
        commit();
        go('#/recipes');
        toast('Recipe deleted');
      }
      break;
    case 'rate':
      editorRating = editorRating === Number(el.dataset.n) ? 0 : Number(el.dataset.n);
      document.getElementById('star-input').innerHTML = starButtons(editorRating);
      break;
    case 'remove-photo':
      editorPhoto = null;
      document.getElementById('photo-thumb').innerHTML = I.image;
      break;
    case 'open-import':
      openImport();
      break;
    case 'add-ing-row':
      appendIngredientRow(ingredientRowHtml());
      break;
    case 'add-ing-header':
      appendIngredientRow(ingredientRowHtml({ header: '' }));
      break;
    case 'remove-ing-row':
      el.closest('.ing-row').remove();
      if (!document.querySelector('#ing-rows .ing-row')) appendIngredientRow(ingredientRowHtml());
      break;
    case 'paste-ingredients':
      openPasteIngredients();
      break;
    case 'add-amount':
      el.insertAdjacentHTML('beforebegin', amountGroup({}, true));
      el.previousElementSibling.querySelector('.qty-input').focus();
      break;
    case 'remove-amount':
      el.closest('.amt-group').remove();
      break;
    case 'close-sheet':
      closeSheet();
      break;
    case 'pick':
      for (const cb of $sheet.querySelectorAll('input[name=pick]')) {
        cb.checked = el.dataset.mode === 'all' || (el.dataset.mode === 'need' && cb.dataset.need === 'true');
      }
      break;
    case 'toggle-item': {
      const item = state.grocery.find(g => g.id === el.dataset.id);
      if (item) { setChecked(state, item.id, !item.checked); commit(); }
      break;
    }
    case 'edit-item': {
      const item = state.grocery.find(g => g.id === el.dataset.id);
      if (item) openEditItem(item);
      break;
    }
    case 'delete-item':
      state.grocery = state.grocery.filter(g => g.id !== el.dataset.id);
      closeSheet();
      commit();
      break;
    case 'group-by':
      ui.groceryGroup = el.dataset.by;
      setPref('groceryGroup', ui.groceryGroup);
      render();
      break;
    case 'remove-recipe-from-list': {
      const name = recipesOnList(state).find(x => x.id === el.dataset.id)?.name || 'this recipe';
      const before = JSON.stringify(state.grocery);
      removeRecipeFromGrocery(state, el.dataset.id);
      commit();
      toast(`Removed ${name}`, { label: 'Undo', run: () => { state.grocery = JSON.parse(before); commit(); } });
      break;
    }
    case 'remove-pantry-dupes': {
      const ids = new Set(groceryInPantry(state).map(g => g.id));
      const before = JSON.stringify(state.grocery);
      state.grocery = state.grocery.filter(g => !ids.has(g.id));
      commit();
      toast(`Removed ${ids.size} item${ids.size === 1 ? '' : 's'}`, { label: 'Undo', run: () => { state.grocery = JSON.parse(before); commit(); } });
      break;
    }
    case 'grocery-menu':
      openGroceryMenu();
      break;
    case 'clear-checked': {
      const n = clearChecked(state);
      closeSheet();
      commit();
      if (n) toast(`Moved ${n} item${n === 1 ? '' : 's'} to your pantry`, { label: 'View', run: () => go('#/pantry') });
      break;
    }
    case 'uncheck-all':
      for (const g of state.grocery) g.checked = false;
      closeSheet();
      commit();
      break;
    case 'clear-all':
      if (confirm('Remove every item from your grocery list?')) {
        state.grocery = [];
        closeSheet();
        commit();
      }
      break;
    case 'used-up': {
      const item = removeFromPantry(state, el.dataset.id);
      commit();
      if (item) {
        toast(`${item.name} used up`, {
          label: 'Add to List',
          run: () => { addManualItem(state, item.name, { qty: item.qty ?? null, unit: item.unit ?? null }); commit(); toast(`${item.name} added to your grocery list`); },
        });
      }
      break;
    }
    case 'edit-pantry': {
      const item = state.pantry.find(p => p.id === el.dataset.id);
      if (item) openEditPantry(item);
      break;
    }
    case 'delete-pantry':
      removeFromPantry(state, el.dataset.id);
      closeSheet();
      commit();
      break;
    case 'export':
      exportBackup();
      break;
    case 'erase':
      if (confirm('Erase all recipes, photos, your grocery list and pantry from this device? This cannot be undone.')) {
        eraseAll().then(() => toast('All data erased'));
      }
      break;
    default:
      return;
  }
  if (el.tagName !== 'A' || action === 'set-category') e.preventDefault();
}

for (const root of [document.body]) {
  root.addEventListener('click', e => {
    if (e.target.closest('select')) return;
    const el = e.target.closest('[data-action]');
    if (el) handleAction(el, e);
  });
}

document.addEventListener('submit', e => {
  const form = e.target;
  if (form.id === 'recipe-form') {
    e.preventDefault();
    submitEditor(form);
  } else if (form.dataset.form === 'add-grocery') {
    e.preventDefault();
    const text = form.elements.entry.value.trim();
    if (!text) return;
    const amounts = readAmounts(form);
    const lines = text.split(/\n|,(?![^(]*\))/).map(s => s.trim()).filter(Boolean);
    // The picked amounts apply when adding a single item.
    for (const line of lines) addManualItem(state, line, lines.length === 1 ? amounts : null);
    ui.focusAfterRender = 'grocery-input';
    commit();
  } else if (form.dataset.form === 'add-pantry') {
    e.preventDefault();
    const text = form.elements.entry.value.trim();
    if (!text) return;
    const picked = readAmounts(form);
    const lines = text.split(/\n|,/).map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      if (lines.length === 1 && picked.length) {
        addToPantry(state, line, null, totalAmount(picked) || picked[0]);
      } else {
        // "2 cups flour" typed in works too.
        const p = parseIngredient(line);
        const typed = p && !p.header ? totalAmount(ingredientAmounts(p)) : null;
        addToPantry(state, typed ? p.name : line, null, typed || {});
      }
    }
    ui.focusAfterRender = 'pantry-input';
    commit();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.closest && e.target.closest('#ing-rows')) {
    e.preventDefault();
    const row = e.target.closest('.ing-row');
    const next = row.nextElementSibling;
    if (next && !next.querySelector('input.input').value.trim()) next.querySelector('input.input').focus();
    else appendIngredientRow(ingredientRowHtml(), row);
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'recipe-search') {
    ui.search = e.target.value;
    document.getElementById('recipe-results').innerHTML = recipeCardsHtml();
  } else if (e.target.id === 'pantry-search') {
    ui.pantrySearch = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const el = document.getElementById('pantry-search');
    el.focus();
    el.setSelectionRange(pos, pos);
  }
});

document.addEventListener('change', async e => {
  if (e.target.classList.contains('convert') || e.target.id === 'convert-all') {
    const id = route().id;
    const conv = ui.convert[id] || (ui.convert[id] = { all: '', lines: {} });
    if (e.target.id === 'convert-all') {
      conv.all = e.target.value;
      conv.lines = {};
    } else {
      conv.lines[e.target.dataset.i] = e.target.value;
    }
    render();
  } else if (e.target.id === 'recipe-sort') {
    ui.sort = e.target.value;
    setPref('sort', ui.sort);
    document.getElementById('recipe-results').innerHTML = recipeCardsHtml();
  } else if (e.target.id === 'photo-input' && e.target.files[0]) {
    try {
      editorPhoto = await resizeImage(e.target.files[0]);
      document.getElementById('photo-thumb').innerHTML = `<img src="${editorPhoto}" alt="">`;
    } catch {
      toast('Could not read that image');
    }
  } else if (e.target.id === 'import-input' && e.target.files[0]) {
    await importBackup(e.target.files[0]);
    e.target.value = '';
  }
});

// ---------- Start ----------
async function start() {
  try {
    const saved = await db.get('state');
    if (saved) state = normalizeState(saved);
    for (const r of state.recipes) {
      if (r.photo) {
        const url = await db.get(`photo:${r.id}`);
        if (url) photos.set(r.id, url);
      }
    }
  } catch (err) {
    console.error('Could not load saved data', err);
  }
  render();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // When an update takes over, reload once so the new version shows right away.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then(reg => {
      // Check for updates whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  }
}

start();
