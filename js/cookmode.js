// Cook mode helpers: steps with their sections, timers found in step text, and the
// ingredients each step uses. Pure functions so they can be unit tested.

import { isSectionHeader, parseIngredients } from './ingredients.js';

// Directions -> [{ text, section, number }], skipping "For the sauce:" headings (kept as `section`).
export function cookSteps(directions) {
  const out = [];
  let section = '';
  let n = 0;
  for (const raw of String(directions || '').split(/\n\s*\n|\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (isSectionHeader(line)) { section = line.replace(/:$/, '').replace(/^#+\s*/, ''); continue; }
    out.push({ text: line, section, number: ++n });
  }
  return out;
}

const WORD_NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90 };
const NUM = String.raw`(\d+(?:\.\d+)?|\d*[½¼¾⅓⅔]|\d+\s+\d\/\d|\d\/\d|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty-five|forty|fifty|sixty|ninety)`;
const UNIT = String.raw`(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b`;
// "20 minutes", "1-2 hours", "25 to 30 min", "1 hour 15 minutes", "1½ hours", "a minute"
const TIME_RE = new RegExp(String.raw`\b${NUM}(?:\s*(?:-|–|to)\s*${NUM})?\s*${UNIT}(?:\s*(?:and\s*)?${NUM}\s*${UNIT})?`, 'gi');

function num(s) {
  const t = String(s).toLowerCase().trim();
  if (t in WORD_NUM) return WORD_NUM[t];
  const frac = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
  const m = t.match(/^(\d*)([½¼¾⅓⅔])$/);
  if (m) return Number(m[1] || 0) + frac[m[2]];
  const mixed = t.match(/^(\d+)\s+(\d)\/(\d)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const f = t.match(/^(\d)\/(\d)$/);
  if (f) return Number(f[1]) / Number(f[2]);
  return Number(t);
}
const unitSec = u => { const x = u.toLowerCase(); return x.startsWith('h') ? 3600 : x.startsWith('m') ? 60 : 1; };

// Timers mentioned in a step: [{ text, seconds, maxSeconds, start, end }].
// Ranges ("25-30 minutes") start at the low end so you can check early.
export function findTimers(text) {
  const out = [];
  const s = String(text || '');
  TIME_RE.lastIndex = 0;
  let m;
  while ((m = TIME_RE.exec(s))) {
    const [whole, a, b, unit, c, unit2] = m;
    const per = unitSec(unit);
    if (!per) continue;
    let seconds = num(a) * per;
    let maxSeconds = b ? num(b) * per : null;
    if (c && unit2) {
      const extra = num(c) * unitSec(unit2);
      seconds += extra;
      if (maxSeconds) maxSeconds += extra;
    }
    if (!(seconds > 0) || seconds > 24 * 3600) continue;
    // "a minute or two" and "every 5 minutes" aren't something to time.
    const before = s.slice(Math.max(0, m.index - 8), m.index).toLowerCase();
    if (/every\s*$/.test(before)) continue;
    out.push({ text: whole, seconds: Math.round(seconds), maxSeconds: maxSeconds ? Math.round(maxSeconds) : null, start: m.index, end: m.index + whole.length });
  }
  return out;
}

// "1:05:00", "12:30", "0:45"
export function formatClock(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
// "20 min", "1 hr 15 min", "45 sec"
export function formatDuration(sec) {
  if (sec < 60) return `${Math.round(sec)} sec`;
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

const GENERIC = new Set(['oil', 'water', 'sauce', 'juice', 'powder', 'cheese', 'cream', 'leaf', 'seed', 'mix', 'stock', 'broth', 'paste']);

// Ingredient lines (indexes into parseIngredients) a step mentions, e.g. "Whisk the eggs and milk".
export function stepIngredients(stepText, ingredientsText) {
  const step = ` ${String(stepText).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')} `;
  const found = [];
  parseIngredients(ingredientsText).forEach((p, index) => {
    if (p.header || !p.key) return;
    const words = p.key.split(' ').filter(w => w.length > 2);
    if (!words.length) return;
    const head = words[words.length - 1];
    const forms = [p.key, head, `${head}s`, `${head}es`, head.replace(/y$/, 'ies')];
    // A generic last word ("oil") needs the word before it too ("olive oil"), unless it's the whole name.
    const ok = GENERIC.has(head) && words.length > 1
      ? step.includes(` ${p.key} `) || step.includes(` ${words[words.length - 2]} `)
      : forms.some(f => step.includes(` ${f} `));
    if (ok) found.push(index);
  });
  return found;
}
