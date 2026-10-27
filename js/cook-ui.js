// "What Can I Make?" screens (#/cook and #/cook/together). Uses only the recipes you've saved.
// Self-contained: renders into the main view and handles its own events (data-c attributes).

import { rankByPantry, bestPairs, buildPlan, isStaple } from './planner.js';
import { recipeListPlan, addRecipeToGrocery } from './sync.js';

let ctx = null; // { view, esc, toast, getState, commit, go, icons }
const prefs = (() => {
  try { return { assumeStaples: localStorage.getItem('cook:staples') !== '0', size: Number(localStorage.getItem('cook:size')) || 3 }; } catch { return { assumeStaples: true, size: 3 }; }
})();
let planStart = '';

const esc = s => ctx.esc(s);
function savePrefs() {
  try { localStorage.setItem('cook:staples', prefs.assumeStaples ? '1' : '0'); localStorage.setItem('cook:size', String(prefs.size)); } catch { /* private mode */ }
}
function subRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  return { tab: parts[1] === 'together' ? 'together' : 'pantry', arg: parts[2] ? decodeURIComponent(parts[2]) : '' };
}
const recipeLink = r => `<a href="#/recipe/${encodeURIComponent(r.id)}">${esc(r.name)}</a>`;

function header(tab) {
  const s = ctx.getState();
  return `<header class="topbar"><div class="topbar-row">
      <h1>What Can I Make?<span class="sub">From your ${s.recipes.length} recipe${s.recipes.length === 1 ? '' : 's'} and ${s.pantry.length} pantry item${s.pantry.length === 1 ? '' : 's'}</span></h1>
    </div></header>
    <div class="content cook">
    <div class="segmented" style="margin-bottom:10px">
      <button class="${tab === 'pantry' ? 'active' : ''}" data-c="tab" data-v="pantry">From My Pantry</button>
      <button class="${tab === 'together' ? 'active' : ''}" data-c="tab" data-v="together">Cook Together</button>
    </div>
    <label class="cook-toggle"><input type="checkbox" data-c="staples" ${prefs.assumeStaples ? 'checked' : ''}> Count basics (salt, pepper, oil, water) as on hand</label>`;
}

function itemsHtml(m) {
  const pills = [
    ...m.low.map(n => `<span class="pill low" title="Not enough in your pantry">${esc(n)} — more</span>`),
    ...m.onList.map(n => `<span class="pill list" title="Already on your grocery list">${esc(n)} ✓ list</span>`),
    ...m.missing.map(n => `<span class="pill need">${esc(n)}</span>`),
  ];
  return pills.join(' ');
}

function matchCard(m) {
  const pct = Math.round(m.coverage * 100);
  const addable = m.low.length + m.missing.length;
  return `<div class="cook-card">
    <div class="cook-card-top"><b>${recipeLink(m.recipe)}</b><span class="cook-count">${m.have.length}/${m.total}</span></div>
    <div class="bar"><span style="width:${pct}%"></span></div>
    ${m.toBuy ? `<div class="cook-need"><span class="cook-label">Need</span> ${itemsHtml(m)}</div>` : '<div class="cook-ready">✓ You have everything</div>'}
    ${m.have.length ? `<div class="cook-have"><span class="cook-label">Have</span> ${esc(m.have.join(', '))}</div>` : ''}
    <div class="cook-actions">
      ${addable ? `<button type="button" class="btn small" data-c="add-missing" data-id="${esc(m.recipe.id)}">Add Missing to Grocery List</button>` : ''}
      <a class="link-btn" href="#/cook/together/${encodeURIComponent(m.recipe.id)}">Pair with other meals →</a>
    </div>
  </div>`;
}

function viewPantry() {
  const s = ctx.getState();
  if (!s.recipes.length) return `${header('pantry')}<div class="empty"><h2>No recipes yet</h2><p>Add or import recipes, then this page shows which ones you can make with what you have.</p><a class="btn primary" href="#/recipes">Go to Recipes</a></div></div>`;
  const ranked = rankByPantry(s, { assumeStaples: prefs.assumeStaples });
  const ready = ranked.filter(m => m.toBuy === 0);
  const close = ranked.filter(m => m.toBuy > 0 && m.toBuy <= 2);
  const more = ranked.filter(m => m.toBuy > 2);
  const section = (title, list, note) => (list.length ? `<section class="group cook-group"><h3 class="group-title"><span class="grow">${title}</span><span class="n">${list.length}</span></h3>
    ${note ? `<p class="hint cook-note">${note}</p>` : ''}<div class="cook-list">${list.map(matchCard).join('')}</div></section>` : '');
  return `${header('pantry')}
    ${!s.pantry.length ? `<div class="banner"><span class="grow">Your pantry is empty, so everything shows as missing. Add what you have at home to see what you can make.</span><a class="btn small" href="#/pantry">Open Pantry</a></div>` : ''}
    ${section('Ready to Cook', ready, 'You have everything for these.')}
    ${section('Missing 1–2 Things', close, 'A quick stop at the store — or tap to add what’s missing to your list.')}
    ${section('Need More', more)}
    ${!ranked.length ? '<p class="hint">Your recipes don’t have ingredients listed yet.</p>' : ''}
  </div>`;
}

function viewTogether(arg) {
  const s = ctx.getState();
  if (s.recipes.length < 2) return `${header('together')}<div class="empty"><h2>Add a few more recipes</h2><p>With two or more recipes, this finds meals that share ingredients so you buy less and waste less.</p></div></div>`;
  if (arg && arg !== planStart) planStart = arg;
  const plan = buildPlan(s, { startId: planStart, size: Math.min(prefs.size, s.recipes.length), assumeStaples: prefs.assumeStaples });
  const recipes = [...s.recipes].sort((a, b) => a.name.localeCompare(b.name));
  const pairs = bestPairs(s);
  const sizes = [2, 3, 4, 5].filter(n => n <= s.recipes.length);
  return `${header('together')}
    <div class="settings-card"><h2>Plan Meals That Share Ingredients</h2>
      <div class="cook-plan-controls">
        <label class="field"><span>Start with</span><select data-c="start">
          <option value="">The recipe you can most nearly make</option>
          ${recipes.map(r => `<option value="${esc(r.id)}" ${r.id === planStart ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
        </select></label>
        <div class="field"><span>How many meals</span><div class="segmented">${sizes.map(n => `<button type="button" class="${n === Math.min(prefs.size, s.recipes.length) ? 'active' : ''}" data-c="size" data-v="${n}">${n}</button>`).join('')}</div></div>
      </div>
      ${plan ? `
        <ol class="cook-plan">${plan.plan.map(m => `<li>${recipeLink(m.recipe)} <small>${m.toBuy ? `${m.toBuy} to buy` : 'ready to cook'}</small></li>`).join('')}</ol>
        ${plan.shared.length ? `<div class="cook-sub"><span class="cook-label">Used in more than one meal</span>
          <div class="cook-chips">${plan.shared.map(u => `<span class="pill pantry" title="${esc(u.recipes.join(', '))}">${esc(u.name)} ×${u.recipes.length}</span>`).join(' ')}</div></div>` : '<p class="hint">These recipes don’t share ingredients — try a different starting recipe.</p>'}
        <div class="cook-sub"><span class="cook-label">Shopping list for this plan (${plan.toBuy.length})</span>
          ${plan.toBuy.length ? `<ul class="pick-list cook-buy">${plan.toBuy.map(t => `<li><span class="txt"><b>${esc(t.name)}</b>${t.onList ? ' <small>(already on your list)</small>' : ''}<br><small>for ${esc(t.recipes.join(', '))}</small></span></li>`).join('')}</ul>` : '<p class="hint">Nothing to buy — you have it all.</p>'}
        </div>
        ${plan.toBuy.length ? `<button type="button" class="btn primary block" data-c="add-plan">Add Plan to Grocery List</button>` : ''}
      ` : ''}
    </div>
    <section class="group cook-group"><h3 class="group-title"><span class="grow">Recipes That Share Ingredients</span></h3>
      ${pairs.length ? `<div class="cook-list">${pairs.map(p => `<div class="cook-card">
          <div class="cook-card-top"><b>${recipeLink(p.a)} + ${recipeLink(p.b)}</b><span class="cook-count">${p.shared.length} shared</span></div>
          <div class="cook-chips">${p.shared.map(n => `<span class="pill pantry">${esc(n)}</span>`).join(' ')}</div>
        </div>`).join('')}</div>` : '<p class="hint cook-note">None of your recipes share two or more ingredients yet (basics like salt and oil don’t count).</p>'}
    </section>
  </div>`;
}

export function renderCook(context) {
  ctx = context;
  const { tab, arg } = subRoute();
  ctx.view.innerHTML = tab === 'together' ? viewTogether(arg) : viewPantry();
}

function rerender() {
  if (ctx && ctx.view.dataset.section === 'cook') renderCook(ctx);
}

function addToList(recipeIds) {
  const s = ctx.getState();
  let n = 0;
  for (const id of recipeIds) {
    const recipe = s.recipes.find(r => r.id === id);
    if (!recipe) continue;
    const plan = recipeListPlan(s, recipe);
    // Basics counted as on hand (salt, oil...) stay off the list.
    if (prefs.assumeStaples) for (const row of plan) if (!row.header && isStaple(row.parsed.key)) row.selected = false;
    n += addRecipeToGrocery(s, recipe, plan);
  }
  ctx.commit();
  ctx.toast(n ? `Added ${n} item${n === 1 ? '' : 's'} to your grocery list` : 'Everything is already on your list or in your pantry');
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-c]');
  if (!el || !ctx) return;
  const action = el.dataset.c;
  if (action === 'tab') ctx.go(el.dataset.v === 'together' ? '#/cook/together' : '#/cook');
  else if (action === 'size') { prefs.size = Number(el.dataset.v); savePrefs(); rerender(); }
  else if (action === 'add-missing') addToList([el.dataset.id]);
  else if (action === 'add-plan') {
    const plan = buildPlan(ctx.getState(), { startId: planStart, size: prefs.size, assumeStaples: prefs.assumeStaples });
    if (plan) addToList(plan.plan.map(m => m.recipe.id));
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (!el.dataset || !el.dataset.c || !ctx) return;
  if (el.dataset.c === 'staples') { prefs.assumeStaples = el.checked; savePrefs(); rerender(); }
  else if (el.dataset.c === 'start') { planStart = el.value; rerender(); }
});
