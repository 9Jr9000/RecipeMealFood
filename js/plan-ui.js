// Weekly meal plan screen (#/plan, #/plan/YYYY-MM-DD). Only your own saved recipes go on it.
// Self-contained: renders into the main view and handles its own events (data-p attributes).

import {
  MEALS, isoDate, parseDate, addDays, weekStart, weekDates, isValidDate, defaultMeal,
  addToPlan, removeFromPlan, moveInPlan, planForWeek, clearWeek, weekShopping, addWeekToGrocery,
} from './mealplan.js';

let ctx = null; // { view, esc, toast, go, commit, getState, openSheet, closeSheet, photos, icons }
let moving = null; // entry id being moved: tap a day to drop it there
let lastMeal = 'Dinner';

const esc = s => ctx.esc(s);
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function firstDay() {
  try { return localStorage.getItem('plan:firstDay') === '1' ? 1 : 0; } catch { return 0; }
}
function setFirstDay(n) {
  try { localStorage.setItem('plan:firstDay', String(n)); } catch { /* private mode */ }
}
export const today = () => isoDate(new Date());
const short = iso => { const d = parseDate(iso); return `${MONTH[d.getMonth()]} ${d.getDate()}`; };
const dayName = iso => DAY[parseDate(iso).getDay()];

function currentStart() {
  const arg = location.hash.replace(/^#\/?/, '').split('/')[1];
  return weekStart(arg && isValidDate(arg) ? arg : today(), firstDay());
}

// Meals planned this week (for the nav count).
export function mealsThisWeek(state) {
  return planForWeek(state, weekStart(today(), firstDay())).length;
}

function weekLabel(start) {
  const end = addDays(start, 6);
  const s = parseDate(start), e = parseDate(end);
  return s.getMonth() === e.getMonth() ? `${short(start)} – ${e.getDate()}` : `${short(start)} – ${short(end)}`;
}

function entryHtml(e, state) {
  const r = state.recipes.find(x => x.id === e.recipeId);
  const photo = ctx.photos.get(r.id);
  return `<div class="plan-entry ${moving === e.id ? 'moving' : ''}">
    <a class="plan-thumb" href="#/recipe/${encodeURIComponent(r.id)}">${photo ? `<img src="${photo}" alt="" loading="lazy">` : ctx.icons.dish}</a>
    <a class="plan-name" href="#/recipe/${encodeURIComponent(r.id)}"><span class="plan-meal">${esc(e.meal)}</span>${esc(r.name)}</a>
    <button type="button" class="plan-btn" data-p="move" data-id="${esc(e.id)}" aria-label="Move to another day" title="Move">⇄</button>
    <button type="button" class="plan-btn" data-p="remove" data-id="${esc(e.id)}" aria-label="Remove from plan" title="Remove">✕</button>
  </div>`;
}

export function renderPlan(c) {
  ctx = c;
  const state = ctx.getState();
  const start = currentStart();
  const entries = planForWeek(state, start);
  if (moving && !(state.plan || []).some(e => e.id === moving)) moving = null;
  const movingEntry = moving && (state.plan || []).find(e => e.id === moving);
  const movingName = movingEntry ? (state.recipes.find(r => r.id === movingEntry.recipeId) || {}).name : '';
  const t = today();
  const isThisWeek = start === weekStart(t, firstDay());

  ctx.view.innerHTML = `
    <header class="topbar"><div class="topbar-row">
      <h1>Meal Plan<span class="sub">${esc(weekLabel(start))} · ${entries.length} meal${entries.length === 1 ? '' : 's'}</span></h1>
      <a class="icon-btn" href="#/plan/${addDays(start, -7)}" aria-label="Previous week" title="Previous week">‹</a>
      <a class="icon-btn" href="#/plan/${addDays(start, 7)}" aria-label="Next week" title="Next week">›</a>
    </div></header>
    <div class="content plan">
      <div class="list-toolbar plan-toolbar">
        ${isThisWeek ? '<span class="plan-this-week">This Week</span>' : '<a class="btn small" href="#/plan">Back to This Week</a>'}
        <a class="btn small" href="#/together">Cook Together</a>
        <label>Week starts <select data-p="first-day">
          <option value="0" ${firstDay() === 0 ? 'selected' : ''}>Sunday</option>
          <option value="1" ${firstDay() === 1 ? 'selected' : ''}>Monday</option>
        </select></label>
      </div>
      ${!state.recipes.length ? `<div class="banner">${ctx.icons.book}<span class="grow">Save some recipes first, then tap <b>+ Add</b> on a day to plan them.</span></div>` : ''}
      ${movingEntry ? `<div class="banner plan-moving"><span class="grow">Tap <b>Move Here</b> on a day to move <b>${esc(movingName)}</b>.</span>
        <button type="button" class="btn small" data-p="cancel-move">Cancel</button></div>` : ''}
      ${entries.length ? `<div class="plan-actions">
        <button type="button" class="btn primary" data-p="shop">${ctx.icons.cart} Add Week to Grocery List</button>
        <button type="button" class="btn small" data-p="clear-week">Clear Week</button>
      </div>` : ''}
      <div class="plan-days">${weekDates(start).map(d => {
        const list = entries.filter(e => e.date === d);
        return `<section class="plan-day ${d === t ? 'today' : ''} ${d < t ? 'past' : ''}">
          <h3><span>${dayName(d)}</span><small>${short(d)}${d === t ? ' · Today' : ''}</small></h3>
          ${list.map(e => entryHtml(e, state)).join('')}
          ${movingEntry
            ? (movingEntry.date === d ? '' : `<button type="button" class="btn small plan-add drop" data-p="drop" data-date="${d}">Move Here</button>`)
            : state.recipes.length ? `<button type="button" class="plan-add" data-p="add" data-date="${d}">+ Add</button>` : ''}
        </section>`;
      }).join('')}</div>
    </div>`;
}

function mealChips(selected) {
  return `<div class="segmented plan-meals">${MEALS.map(m => `<label class="${m === selected ? 'active' : ''}">
    <input type="radio" name="meal" value="${m}" ${m === selected ? 'checked' : ''}>${m}</label>`).join('')}</div>`;
}

// Pick a recipe for a day.
function openPicker(date) {
  const state = ctx.getState();
  const recipes = [...state.recipes].sort((a, b) => a.name.localeCompare(b.name));
  ctx.openSheet(`${dayName(date)} ${short(date)}`, `
    ${mealChips(lastMeal)}
    <label class="search plan-search">${ctx.icons.search}<input id="plan-search" type="search" placeholder="Search your recipes" autocomplete="off"></label>
    <ul class="plan-pick">${recipes.map(r => `<li data-name="${esc(`${r.name} ${(r.categories || []).join(' ')} ${r.creator || ''}`.toLowerCase())}">
      <button type="button" data-p="pick" data-id="${esc(r.id)}" data-date="${date}">
        <span class="plan-thumb">${ctx.photos.get(r.id) ? `<img src="${ctx.photos.get(r.id)}" alt="" loading="lazy">` : ctx.icons.dish}</span>
        <span class="grow">${esc(r.name)}${(r.categories || []).length ? `<small>${esc(r.categories.slice(0, 3).join(' · '))}</small>` : ''}</span>
      </button></li>`).join('')}</ul>`);
}

// From a recipe page: pick a day this week or next.
export function openPlanRecipe(c, recipe) {
  ctx = c;
  const start = weekStart(today(), firstDay());
  const t = today();
  const state = ctx.getState();
  const planned = (state.plan || []).filter(e => e.recipeId === recipe.id && e.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const week = (s, label) => `<h4 class="plan-week-label">${label}</h4><div class="plan-day-grid">${weekDates(s).map(d =>
    `<button type="button" class="btn small ${d < t ? 'past' : ''}" data-p="pick" data-id="${esc(recipe.id)}" data-date="${d}" ${d < t ? 'disabled' : ''}>
      <b>${dayName(d)}</b><span>${short(d)}</span></button>`).join('')}</div>`;
  ctx.openSheet('Add to Meal Plan', `
    <p style="margin:0 0 10px;color:var(--muted);font-size:14px">${esc(recipe.name)} — pick a meal, then tap a day.</p>
    ${mealChips(defaultMeal(recipe))}
    ${week(start, 'This Week')}
    ${week(addDays(start, 7), 'Next Week')}
    ${planned.length ? `<p class="hint" style="margin-top:12px">Already planned: ${planned.map(e => `${dayName(e.date)} ${short(e.date)} (${esc(e.meal)})`).join(', ')}</p>` : ''}`);
}

function openShopping() {
  const state = ctx.getState();
  const start = currentStart();
  const shop = weekShopping(state, start);
  if (!shop.toBuy.length) {
    ctx.toast(shop.entries.length ? 'You have everything for this week' : 'Nothing planned this week');
    return;
  }
  ctx.openSheet('Shop for the Week', `
    <p style="margin:0 0 12px;color:var(--muted);font-size:14px">${weekLabel(start)} · ${shop.entries.length} meal${shop.entries.length === 1 ? '' : 's'}. Amounts are combined, and pantry amounts are used up across the week — uncheck anything you don't need.</p>
    <ul class="pick-list">${shop.toBuy.map(t => `<li><label><input type="checkbox" name="buy" value="${esc(t.key)}" checked>
      <span class="txt">${esc(t.name.charAt(0).toUpperCase() + t.name.slice(1))}<small class="plan-for">${esc(t.recipes.join(', '))}</small></span></label>${t.low ? '<span class="pill low">Need more</span>' : ''}</li>`).join('')}</ul>
    ${shop.have.length ? `<p class="hint" style="margin-top:10px">Already have: ${esc(shop.have.join(', '))}</p>` : ''}`, {
    confirmLabel: 'Add',
    onConfirm: form => {
      const keep = new Set(new FormData(form).getAll('buy').map(String));
      const now = ctx.getState();
      const fresh = weekShopping(now, start);
      const skip = new Set(fresh.toBuy.map(t => t.key).filter(k => !keep.has(k)));
      const n = addWeekToGrocery(now, fresh, skip);
      ctx.commit();
      ctx.toast(n ? `Added ${keep.size} item${keep.size === 1 ? '' : 's'} to your grocery list` : 'Nothing added');
    },
  });
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-p]');
  if (!el || !ctx || el.tagName === 'SELECT') return;
  const state = ctx.getState();
  const act = el.dataset.p;
  if (act === 'add') openPicker(el.dataset.date);
  else if (act === 'pick') {
    const form = el.closest('form');
    const meal = form ? new FormData(form).get('meal') || 'Dinner' : 'Dinner';
    lastMeal = String(meal);
    const recipe = state.recipes.find(r => r.id === el.dataset.id);
    if (!recipe) return;
    addToPlan(state, { recipeId: recipe.id, date: el.dataset.date, meal: lastMeal });
    ctx.closeSheet();
    ctx.commit();
    ctx.toast(`${recipe.name} → ${dayName(el.dataset.date)} ${lastMeal.toLowerCase()}`);
  } else if (act === 'remove') {
    removeFromPlan(state, el.dataset.id);
    ctx.commit();
  } else if (act === 'move') {
    moving = moving === el.dataset.id ? null : el.dataset.id;
    renderPlan(ctx);
  } else if (act === 'cancel-move') {
    moving = null;
    renderPlan(ctx);
  } else if (act === 'drop') {
    const id = moving;
    moving = null;
    moveInPlan(state, id, { date: el.dataset.date });
    ctx.commit();
  } else if (act === 'clear-week') {
    if (confirm('Remove every meal from this week’s plan?')) {
      clearWeek(state, currentStart());
      ctx.commit();
    }
  } else if (act === 'shop') openShopping();
});

document.addEventListener('change', e => {
  if (!ctx) return;
  if (e.target.matches('[data-p=first-day]')) {
    setFirstDay(Number(e.target.value));
    renderPlan(ctx);
  } else if (e.target.name === 'meal' && e.target.closest('.plan-meals')) {
    for (const l of e.target.closest('.plan-meals').querySelectorAll('label')) l.classList.toggle('active', l.contains(e.target));
  }
});

document.addEventListener('input', e => {
  if (e.target.id !== 'plan-search') return;
  const q = e.target.value.trim().toLowerCase();
  for (const li of document.querySelectorAll('.plan-pick li')) li.hidden = !!q && !li.dataset.name.includes(q);
});
