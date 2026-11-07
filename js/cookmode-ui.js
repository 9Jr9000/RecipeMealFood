// Cook mode (#/cooking/<recipe id>): one big step at a time, the screen kept awake, and tap-to-start
// timers for times mentioned in the steps. Timers keep running while you move around the app and
// show in a tray at the bottom of every screen.
// Self-contained: renders into the main view and handles its own events (data-k attributes).

import { cookSteps, findTimers, stepIngredients, formatClock, formatDuration } from './cookmode.js';
import { parseIngredients } from './ingredients.js';

let ctx = null; // { view, esc, go, getState, photos, icons, amountsText, scaleFor, getStep, setStep, crossed, openSheet, toast }
let current = null; // recipe id being cooked
const esc = s => ctx.esc(s);

// ---------- Text size ----------
const SIZES = ['m', 'l', 'xl'];
let size = (() => { try { return localStorage.getItem('cook:size-text') || 'l'; } catch { return 'l'; } })();

// ---------- Keeping the screen on ----------
let wakeLock = null;
let wakeState = 'off'; // 'on' | 'off' | 'unsupported'
async function keepAwake() {
  if (!('wakeLock' in navigator)) { wakeState = 'unsupported'; updateWake(); return; }
  try {
    if (!wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; wakeState = 'off'; updateWake(); });
    }
    wakeState = 'on';
  } catch {
    wakeState = 'off';
  }
  updateWake();
}
function letSleep() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}
function updateWake() {
  const el = document.querySelector('.cm-wake');
  if (!el) return;
  el.dataset.state = wakeState;
  el.textContent = wakeState === 'on' ? 'Screen stays on' : wakeState === 'unsupported' ? 'Screen may dim — this browser can’t keep it on' : 'Tap anywhere to keep the screen on';
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (current) keepAwake();
    tick(); // catch up on timers that finished while the app was in the background
  }
});

// ---------- Timers ----------
// { id, recipeId, recipeName, label, duration, end (ms) | null when paused, left (s) when paused, done, stopped }
let timers = (() => {
  try { return JSON.parse(localStorage.getItem('cook:timers') || '[]').filter(t => t && t.id); } catch { return []; }
})();
function saveTimers() {
  try { localStorage.setItem('cook:timers', JSON.stringify(timers)); } catch { /* private mode */ }
}
const leftOf = t => (t.end ? (t.end - Date.now()) / 1000 : t.left);

let audio = null;
function unlockAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
}
function beep() {
  if (!audio) return;
  const now = audio.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'square';
    o.frequency.value = i === 2 ? 1175 : 880;
    g.gain.setValueAtTime(0.0001, now + i * 0.22);
    g.gain.exponentialRampToValueAtTime(0.25, now + i * 0.22 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + 0.18);
    o.connect(g).connect(audio.destination);
    o.start(now + i * 0.22);
    o.stop(now + i * 0.22 + 0.2);
  }
}
async function notify(t) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const body = `${t.label} — ${t.recipeName}`;
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg && reg.showNotification) await reg.showNotification('Timer done', { body, tag: t.id, renotify: true, vibrate: [300, 150, 300] });
    else new Notification('Timer done', { body, tag: t.id });
  } catch { /* not allowed here */ }
}

export function startTimer(recipe, seconds, label) {
  unlockAudio();
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  const t = { id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, recipeId: recipe.id, recipeName: recipe.name, label, duration: seconds, end: Date.now() + seconds * 1000, left: seconds, done: false };
  timers.push(t);
  saveTimers();
  renderTray();
  ensureTicking();
}

let ticker = null;
let lastBeep = 0;
function ensureTicking() {
  if (!ticker && timers.length) ticker = setInterval(tick, 250);
}
function tick() {
  let changed = false;
  for (const t of timers) {
    if (!t.done && t.end && Date.now() >= t.end) {
      t.done = true;
      t.left = 0;
      changed = true;
      if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
      notify(t);
    }
  }
  if (changed) { saveTimers(); renderTray(); }
  // Keep beeping until every finished timer is stopped.
  if (timers.some(t => t.done) && Date.now() - lastBeep > 1600) { lastBeep = Date.now(); beep(); }
  for (const el of document.querySelectorAll('[data-clock]')) {
    const t = timers.find(x => x.id === el.dataset.clock);
    if (t) el.textContent = t.done ? 'Done!' : formatClock(leftOf(t));
  }
  if (!timers.length) { clearInterval(ticker); ticker = null; }
}

function trayHtml() {
  return timers.map(t => `<div class="timer ${t.done ? 'done' : ''} ${!t.end && !t.done ? 'paused' : ''}">
    <a class="timer-label" href="#/cooking/${encodeURIComponent(t.recipeId)}"><b data-clock="${t.id}">${t.done ? 'Done!' : formatClock(leftOf(t))}</b><span>${esc(t.label)} · ${esc(t.recipeName)}</span></a>
    ${t.done
      ? `<button type="button" class="timer-btn stop" data-k="t-stop" data-id="${t.id}">Stop</button>`
      : `<button type="button" class="timer-btn" data-k="t-add" data-id="${t.id}" title="Add a minute">+1</button>
         <button type="button" class="timer-btn" data-k="t-pause" data-id="${t.id}" title="${t.end ? 'Pause' : 'Resume'}">${t.end ? '❚❚' : '▶'}</button>
         <button type="button" class="timer-btn" data-k="t-stop" data-id="${t.id}" title="Cancel timer">✕</button>`}
  </div>`).join('');
}
export function renderTray() {
  let tray = document.getElementById('timer-tray');
  if (!tray) {
    tray = document.createElement('div');
    tray.id = 'timer-tray';
    tray.className = 'timer-tray';
    tray.setAttribute('aria-live', 'polite');
    document.body.appendChild(tray);
  }
  tray.hidden = !timers.length;
  tray.innerHTML = ctx || timers.length ? trayHtml() : '';
  document.body.classList.toggle('has-timers', timers.length > 0);
  document.documentElement.style.setProperty('--tray-h', `${timers.length ? tray.offsetHeight : 0}px`);
}

// ---------- The cook mode screen ----------
export function leaveCookMode() {
  if (!current) return;
  current = null;
  letSleep();
  document.body.classList.remove('cooking');
}

export function renderCookMode(c) {
  ctx = c;
  const id = decodeURIComponent(location.hash.split('/')[2] || '');
  const r = ctx.getState().recipes.find(x => x.id === id);
  if (!r) {
    ctx.view.innerHTML = `<div class="empty"><h2>Recipe not found</h2><a class="btn" href="#/recipes">Back to Recipes</a></div>`;
    return;
  }
  if (current !== id) { current = id; keepAwake(); }
  document.body.classList.add('cooking');
  const steps = cookSteps(r.directions);
  const factor = ctx.scaleFor(id);
  const ings = parseIngredients(r.ingredients);
  let i = ctx.getStep(id);
  if (!(i >= 0) || i >= steps.length) i = 0;
  ctx.setStep(id, steps.length ? i : undefined);
  const step = steps[i];

  let body;
  if (!step) {
    body = `<p class="cm-step">This recipe has no steps yet.</p>
      <a class="btn" href="#/edit/${encodeURIComponent(id)}">Add Directions</a>`;
  } else {
    // Times in the step become buttons that start a timer.
    const found = findTimers(step.text);
    let html = '';
    let at = 0;
    found.forEach((t, k) => {
      html += esc(step.text.slice(at, t.start));
      html += `<button type="button" class="cm-time" data-k="timer" data-n="${k}">⏱ ${esc(t.text)}</button>`;
      at = t.end;
    });
    html += esc(step.text.slice(at));
    const uses = stepIngredients(step.text, r.ingredients).map(n => ings[n]);
    body = `
      ${step.section ? `<div class="cm-section">${esc(step.section)}</div>` : ''}
      <p class="cm-step">${html}</p>
      ${found.length ? `<div class="cm-timers">${found.map((t, k) => `<button type="button" class="btn" data-k="timer" data-n="${k}">⏱ Start ${esc(formatDuration(t.seconds))} Timer</button>`).join('')}</div>` : ''}
      ${uses.length ? `<div class="cm-uses"><h3>For this step</h3><ul>${uses.map(p => {
        const amt = ctx.amountsText(p, factor);
        return `<li>${amt && p.qty !== null ? `<b>${esc(amt)}</b> ${esc(p.name)}` : esc(p.raw)}</li>`;
      }).join('')}</ul></div>` : ''}`;
  }
  const last = i >= steps.length - 1;
  ctx.view.innerHTML = `
    <div class="cm" data-size="${size}">
      <header class="cm-top">
        <a class="cm-exit" href="#/recipe/${encodeURIComponent(id)}" aria-label="Exit cook mode">✕</a>
        <div class="cm-title"><b>${esc(r.name)}</b><small>${steps.length ? `Step ${i + 1} of ${steps.length}` : 'Cook mode'}${factor !== 1 ? ` · ${factor}× amounts` : ''}</small></div>
        <button type="button" class="cm-tool" data-k="size" aria-label="Text size" title="Text size">A<span>A</span></button>
        <button type="button" class="cm-tool" data-k="ings">Ingredients</button>
      </header>
      <div class="cm-progress"><span style="width:${steps.length ? ((i + 1) / steps.length) * 100 : 0}%"></span></div>
      <div class="cm-body" id="cm-body">${body}</div>
      <footer class="cm-nav">
        <button type="button" class="btn" data-k="prev" ${i === 0 ? 'disabled' : ''}>‹ Back</button>
        ${last
          ? `<a class="btn primary" href="#/recipe/${encodeURIComponent(id)}" data-k="finish">Finish ✓</a>`
          : `<button type="button" class="btn primary" data-k="next">Next ›</button>`}
      </footer>
      <div class="cm-wake" data-state="${wakeState}"></div>
    </div>`;
  updateWake();
  renderTray();
}

function go(delta) {
  const steps = cookSteps(ctx.getState().recipes.find(x => x.id === current)?.directions);
  const i = Math.max(0, Math.min(steps.length - 1, (ctx.getStep(current) || 0) + delta));
  ctx.setStep(current, i);
  renderCookMode(ctx);
  window.scrollTo(0, 0);
}

function openIngredients() {
  const r = ctx.getState().recipes.find(x => x.id === current);
  const factor = ctx.scaleFor(current);
  const crossed = ctx.crossed(current);
  ctx.openSheet('Ingredients', `<ul class="cm-ing-list">${parseIngredients(r.ingredients).map((p, n) => {
    if (p.header) return `<li class="header">${esc(p.header)}</li>`;
    const amt = ctx.amountsText(p, factor);
    return `<li><label><input type="checkbox" data-k="cross" data-n="${n}" ${crossed.has(n) ? 'checked' : ''}>
      <span>${amt && p.qty !== null ? `<b>${esc(amt)}</b> ${esc(p.name)}` : esc(p.raw)}</span></label></li>`;
  }).join('')}</ul><p class="hint">Check things off as you add them.</p>`);
}

document.addEventListener('click', e => {
  if (!ctx) return;
  // Any tap in cook mode can re-request the wake lock (some browsers need a tap first).
  if (current && wakeState !== 'on' && wakeState !== 'unsupported') keepAwake();
  const el = e.target.closest('[data-k]');
  if (!el) return;
  const k = el.dataset.k;
  if (k === 'next') go(1);
  else if (k === 'prev') go(-1);
  else if (k === 'size') {
    size = SIZES[(SIZES.indexOf(size) + 1) % SIZES.length];
    try { localStorage.setItem('cook:size-text', size); } catch { /* private mode */ }
    document.querySelector('.cm')?.setAttribute('data-size', size);
  } else if (k === 'ings') openIngredients();
  else if (k === 'cross') {
    const set = ctx.crossed(current);
    const n = Number(el.dataset.n);
    el.checked ? set.add(n) : set.delete(n);
  } else if (k === 'timer') {
    const r = ctx.getState().recipes.find(x => x.id === current);
    const i = ctx.getStep(current) || 0;
    const step = cookSteps(r.directions)[i];
    const t = findTimers(step.text)[Number(el.dataset.n)];
    if (!t) return;
    startTimer(r, t.seconds, `Step ${i + 1}: ${formatDuration(t.seconds)}`);
    ctx.toast(`Timer started: ${formatDuration(t.seconds)}${t.maxSeconds ? ` (check again at ${formatDuration(t.maxSeconds)})` : ''}`);
  } else if (k === 't-stop') {
    timers = timers.filter(t => t.id !== el.dataset.id);
    saveTimers();
    renderTray();
  } else if (k === 't-add') {
    const t = timers.find(x => x.id === el.dataset.id);
    if (t) { if (t.end) t.end += 60000; else t.left += 60; t.duration += 60; saveTimers(); tick(); }
  } else if (k === 't-pause') {
    const t = timers.find(x => x.id === el.dataset.id);
    if (!t) return;
    if (t.end) { t.left = leftOf(t); t.end = null; } else { t.end = Date.now() + t.left * 1000; }
    saveTimers();
    renderTray();
  }
});

document.addEventListener('keydown', e => {
  if (!current || e.target.closest('input, textarea, select, button, a') || document.getElementById('sheet')?.open) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); if (document.querySelector('[data-k=next]')) go(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  else if (e.key === 'Escape') ctx.go(`#/recipe/${encodeURIComponent(current)}`);
});

// Swipe left/right between steps.
let touchX = null, touchY = null;
document.addEventListener('touchstart', e => {
  if (!current || !e.target.closest('#cm-body')) { touchX = null; return; }
  touchX = e.touches[0].clientX; touchY = e.touches[0].clientY;
}, { passive: true });
document.addEventListener('touchend', e => {
  if (touchX === null || !current) return;
  const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY;
  touchX = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    if (dx < 0 && document.querySelector('[data-k=next]')) go(1);
    else if (dx > 0) go(-1);
  }
}, { passive: true });

// Timers left running from before a reload pick up where they were.
export function initTimers(c) {
  ctx = ctx || c;
  renderTray();
  ensureTicking();
  tick();
}
