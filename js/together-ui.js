// Cook Together (#/together, #/together/recipe/<id>, #/together/ingredient/<key>): groups of your
// own recipes that use up what you buy, with leftovers shown by amount and recipes that would use
// them. Self-contained: renders into the main view and handles its own events (data-t attributes).

import { lowWastePlan, anchorIngredients, leftoverText } from './lowwaste.js';
import { shoppingFor, addWeekToGrocery, addToPlan, defaultMeal, isoDate, addDays, parseDate } from './mealplan.js';
import { formatAmount } from './ingredients.js';
import { isStaple } from './planner.js';

let ctx = null; // { view, esc, toast, go, commit, getState, openSheet, photos, icons }
const opts = { mode: 'best', ingredient: '', startId: '', size: 3, include: [], exclude: [] };
try { opts.size = Number(localStorage.getItem('together:size')) || 3; } catch { /* private mode */ }
let lastHash = '';
const esc = s => ctx.esc(s);
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fromHash() {
  const [, kind, arg] = location.hash.replace(/^#\/?/, '').split('/');
  if (location.hash === lastHash) return;
  lastHash = location.hash;
  opts.include = []; opts.exclude = [];
  if (kind === 'recipe' && arg) { opts.mode = 'recipe'; opts.startId = decodeURIComponent(arg); }
  else if (kind === 'ingredient' && arg) { opts.mode = 'ingredient'; opts.ingredient = decodeURIComponent(arg); }
}

function currentPlan(state) {
  return lowWastePlan(state, {
    size: opts.size,
    startId: opts.mode === 'recipe' ? opts.startId : '',
    ingredient: opts.mode === 'ingredient' ? opts.ingredient : '',
    include: opts.include,
    exclude: opts.exclude,
  });
}

const amt = a => (a ? formatAmount(a.qty, null, a.unit) : '');

function itemRow(i) {
  let status;
  if (i.status === 'have') status = `<span class="pill pantry">${i.fromPantry ? 'From your pantry' : 'Have it'}</span>`;
  else if (i.leftover && i.weight >= 0.7) status = `<span class="pill low">~${esc(leftoverText(i))} left over</span>`;
  else if (i.leftover) status = `<span class="pill">${esc(leftoverText(i))} left (keeps)</span>`;
  else if (i.pack && i.weight > 0) status = '<span class="pill pantry">Used up ✓</span>';
  else status = '';
  let buy = i.need ? `Need ${esc(amt(i.need))}` : '';
  if (i.status === 'buy' && i.pack && i.pack.label) {
    buy = `Buy ${i.pack.count > 1 ? `${i.pack.count} × ` : ''}${esc(i.pack.label)} · need ${esc(amt(i.need))}`;
  } else if (i.status === 'buy' && i.pack) {
    // Bought one at a time ("2 onions"; "½ avocado" means buying 1).
    const n = i.pack.count * i.pack.qty;
    buy = n > i.need.qty + 1e-9 ? `Buy ${esc(amt({ qty: n, unit: i.pack.unit }))} · need ${esc(amt(i.need))}` : `Buy ${esc(amt(i.need))}`;
  }
  return `<li class="tg-item ${i.weight >= 0.7 ? 'fresh' : ''}">
    <div class="grow"><b>${esc(i.name)}</b>${i.recipes.length > 1 ? ` <span class="tg-shared">×${i.recipes.length} meals</span>` : ''}
      <small>${[buy, i.recipes.join(', ')].filter(Boolean).join(' · ')}</small></div>${status}</li>`;
}

export function renderTogether(c) {
  ctx = c;
  fromHash();
  const state = ctx.getState();
  const anchors = anchorIngredients(state);
  if (opts.mode === 'ingredient' && !anchors.some(a => a.key === opts.ingredient) && anchors.length && !opts.ingredient) opts.ingredient = anchors[0].key;
  const recipes = [...state.recipes].sort((a, b) => a.name.localeCompare(b.name));
  if (opts.mode === 'recipe' && !state.recipes.some(r => r.id === opts.startId)) opts.startId = recipes[0]?.id || '';
  const plan = state.recipes.length >= 2 ? currentPlan(state) : null;
  const sizes = [2, 3, 4, 5];

  let result = '';
  if (state.recipes.length < 2) {
    result = `<div class="empty"><h2>Add a few more recipes</h2><p>With two or more of your recipes, this finds meals that use up the same groceries so less goes to waste.</p></div>`;
  } else if (!plan || plan.recipes.length < 2) {
    result = `<div class="banner">${ctx.icons.book}<span class="grow">None of your other recipes share fresh ingredients with ${opts.mode === 'recipe' ? 'this recipe' : 'this'} yet. Try a different starting point.</span></div>`;
  } else {
    const fresh = plan.items.filter(i => i.weight >= 0.7);
    const leftovers = fresh.filter(i => i.leftover || (i.status === 'buy' && !i.pack));
    const saved = plan.wasteAlone > 0 ? Math.round((1 - plan.waste / plan.wasteAlone) * 100) : 0;
    const level = plan.waste / plan.recipes.length;
    const meter = level < 0.15 ? ['low', 'Very little waste'] : level < 0.4 ? ['mid', 'Some leftovers'] : ['high', 'Several leftovers'];
    const buy = plan.items.filter(i => i.status === 'buy');
    const have = plan.items.filter(i => i.status === 'have');
    result = `
      <div class="tg-summary ${meter[0]}"><b>${meter[1]}</b>
        <span>${saved > 0 ? `About ${saved}% less waste than shopping for each meal on its own.` : 'These meals don’t overlap much.'} ${fresh.length - leftovers.length} of ${fresh.length} fresh ingredient${fresh.length === 1 ? '' : 's'} used up.</span></div>
      <ol class="tg-meals">${plan.recipes.map(r => {
        const shares = plan.items.filter(i => i.recipes.length > 1 && i.recipes.includes(r.name)).map(i => i.name);
        const photo = ctx.photos.get(r.id);
        return `<li><span class="plan-thumb">${photo ? `<img src="${photo}" alt="" loading="lazy">` : ctx.icons.dish}</span>
          <a class="grow" href="#/recipe/${encodeURIComponent(r.id)}"><b>${esc(r.name)}</b>${shares.length ? `<small>Shares ${esc(shares.join(", ").toLowerCase())}</small>` : ''}</a>
          <button type="button" class="plan-btn" data-t="drop" data-id="${esc(r.id)}" aria-label="Leave out ${esc(r.name)}" title="Leave this one out">✕</button></li>`;
      }).join('')}</ol>
      ${plan.useUp.length ? `<div class="tg-useup"><h3>Use up the leftovers</h3>${plan.useUp.map(u => `<div class="tg-useup-row">
          <span class="grow">${u.leftover ? `~${esc(formatAmount(u.leftover.qty, null, u.leftover.unit))} ` : ''}${esc(u.name.toLowerCase())} would be left — also in:</span>
          ${u.recipes.map(r => `<button type="button" class="btn small" data-t="include" data-id="${esc(r.id)}">+ ${esc(r.name)}</button>`).join('')}
        </div>`).join('')}</div>` : ''}
      <div class="detail-actions tg-actions">
        <button type="button" class="btn primary" data-t="plan">${ctx.icons.calendar} Put on Meal Plan</button>
        <button type="button" class="btn" data-t="shop">${ctx.icons.cart} Add to Grocery List</button>
      </div>
      <section class="tg-list"><h3>To buy (${buy.length})</h3><ul>${buy.map(itemRow).join('') || '<li class="hint">Nothing — you have it all.</li>'}</ul></section>
      ${have.length ? `<section class="tg-list"><h3>Already have (${have.length})</h3><ul>${have.map(itemRow).join('')}</ul></section>` : ''}
      <p class="hint">Package sizes are typical U.S. store sizes. Salt, pepper, oil and water aren’t counted. Fresh items without amounts in a recipe are estimated.</p>`;
  }

  ctx.view.innerHTML = `
    <header class="topbar"><div class="topbar-row">
      <h1>Cook Together<span class="sub">Meals that use up what you buy</span></h1>
      <a class="icon-btn" href="#/plan" aria-label="Meal plan" title="Meal plan">${ctx.icons.calendar}</a>
    </div></header>
    <div class="content tg">
      <div class="settings-card tg-controls">
        <div class="field"><span>Build around</span><div class="segmented">
          <button type="button" class="${opts.mode === 'best' ? 'active' : ''}" data-t="mode" data-v="best">Least Waste</button>
          <button type="button" class="${opts.mode === 'ingredient' ? 'active' : ''}" data-t="mode" data-v="ingredient" ${anchors.length ? '' : 'disabled'}>An Ingredient</button>
          <button type="button" class="${opts.mode === 'recipe' ? 'active' : ''}" data-t="mode" data-v="recipe">A Recipe</button>
        </div></div>
        ${opts.mode === 'ingredient' ? `<label class="field"><span>Ingredient</span><select data-t="ingredient">
          ${anchors.map(a => `<option value="${esc(a.key)}" ${a.key === opts.ingredient ? 'selected' : ''}>${esc(a.name)} (${a.count} recipes)</option>`).join('')}
        </select></label>` : ''}
        ${opts.mode === 'recipe' ? `<label class="field"><span>Recipe</span><select data-t="recipe">
          ${recipes.map(r => `<option value="${esc(r.id)}" ${r.id === opts.startId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
        </select></label>` : ''}
        <div class="field"><span>Meals</span><div class="segmented">${sizes.map(n => `<button type="button" class="${n === opts.size ? 'active' : ''}" data-t="size" data-v="${n}">${n}</button>`).join('')}</div></div>
        ${opts.exclude.length ? `<button type="button" class="link-btn" data-t="reset">Bring back ${opts.exclude.length} left-out recipe${opts.exclude.length === 1 ? '' : 's'}</button>` : ''}
      </div>
      ${result}
    </div>`;
}

function rerender() { if (ctx) renderTogether(ctx); }

// Next days (from today) without that meal planned yet.
function putOnPlan(plan) {
  const state = ctx.getState();
  const taken = new Set((state.plan || []).map(e => `${e.date}|${e.meal}`));
  let day = isoDate(new Date());
  const placed = [];
  for (const r of plan.recipes) {
    const meal = defaultMeal(r);
    while (taken.has(`${day}|${meal}`)) day = addDays(day, 1);
    addToPlan(state, { recipeId: r.id, date: day, meal });
    taken.add(`${day}|${meal}`);
    placed.push(DAY[parseDate(day).getDay()]);
    day = addDays(day, 1);
  }
  ctx.commit();
  ctx.toast(`Planned: ${placed.join(', ')}`, { label: 'View Plan', run: () => ctx.go('#/plan') });
}

function openShop(plan) {
  const state = ctx.getState();
  const counts = new Map(plan.recipes.map(r => [r.id, 1]));
  const shop = shoppingFor(state, counts);
  if (!shop.toBuy.length) { ctx.toast('You have everything for these meals'); return; }
  ctx.openSheet('Shop for These Meals', `
    <p style="margin:0 0 12px;color:var(--muted);font-size:14px">${plan.recipes.length} meals. Shared ingredients are combined. Basics like salt and oil start unchecked.</p>
    <ul class="pick-list">${shop.toBuy.map(t => `<li><label><input type="checkbox" name="buy" value="${esc(t.key)}" ${isStaple(t.key) ? '' : 'checked'}>
      <span class="txt">${esc(t.name.charAt(0).toUpperCase() + t.name.slice(1))}<small class="plan-for">${esc(t.recipes.join(', '))}</small></span></label>${t.low ? '<span class="pill low">Need more</span>' : ''}</li>`).join('')}</ul>`, {
    confirmLabel: 'Add',
    onConfirm: form => {
      const keep = new Set(new FormData(form).getAll('buy').map(String));
      const now = ctx.getState();
      const fresh = shoppingFor(now, counts);
      addWeekToGrocery(now, fresh, new Set(fresh.toBuy.map(t => t.key).filter(k => !keep.has(k))));
      ctx.commit();
      ctx.toast(keep.size ? `Added ${keep.size} item${keep.size === 1 ? '' : 's'} to your grocery list` : 'Nothing added');
    },
  });
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-t]');
  if (!el || !ctx || el.tagName === 'SELECT' || !ctx.view.querySelector('.tg')) return;
  const t = el.dataset.t;
  if (t === 'mode') {
    opts.mode = el.dataset.v; opts.include = []; opts.exclude = [];
    if (opts.mode === 'ingredient' && !opts.ingredient) opts.ingredient = anchorIngredients(ctx.getState())[0]?.key || '';
    rerender();
  } else if (t === 'size') {
    opts.size = Number(el.dataset.v);
    opts.include = opts.include.slice(0, opts.size - 1);
    try { localStorage.setItem('together:size', String(opts.size)); } catch { /* private mode */ }
    rerender();
  } else if (t === 'drop') {
    opts.exclude.push(el.dataset.id);
    opts.include = opts.include.filter(id => id !== el.dataset.id);
    if (opts.startId === el.dataset.id && opts.mode === 'recipe') opts.mode = 'best';
    rerender();
  } else if (t === 'include') {
    const plan = currentPlan(ctx.getState());
    // Keep the current meals and add this one.
    opts.include = [...new Set([...plan.recipes.map(r => r.id), el.dataset.id])];
    opts.size = Math.min(6, Math.max(opts.size, opts.include.length));
    rerender();
  } else if (t === 'reset') {
    opts.exclude = [];
    rerender();
  } else if (t === 'plan' || t === 'shop') {
    const plan = currentPlan(ctx.getState());
    if (plan) (t === 'plan' ? putOnPlan : openShop)(plan);
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (!ctx || !el.dataset || !el.dataset.t) return;
  if (el.dataset.t === 'ingredient') { opts.ingredient = el.value; opts.include = []; opts.exclude = []; rerender(); }
  else if (el.dataset.t === 'recipe') { opts.startId = el.value; opts.include = []; opts.exclude = []; rerender(); }
});
