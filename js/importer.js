// Importing recipes from links (recipe websites and TikTok).
//
// Most recipe websites embed a machine-readable copy of the recipe (schema.org "Recipe" JSON-LD),
// which gives clean ingredients and steps. TikTok recipes live in the video caption, which TikTok
// exposes through its public oEmbed endpoint. Parsing is pure (no DOM) so it can be unit tested;
// fetching is passed in.

import { parseRecipeText } from './ingredients.js';

// ---------- Links ----------

export function extractUrls(text) {
  const found = String(text || '').match(/https?:\/\/[^\s<>"'()]+/gi) || [];
  // Trim punctuation that often sticks to links pasted from messages.
  return [...new Set(found.map(u => u.replace(/[.,;:!?)\]]+$/, '')))];
}

export function isTikTok(url) {
  try { return /(^|\.)tiktok\.com$/i.test(new URL(url).hostname); } catch { return false; }
}

// ---------- Small helpers ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

function clean(s) {
  return decodeEntities(String(s ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// "PT1H30M" -> "1 hr 30 min"
export function isoDuration(value) {
  const m = String(value || '').match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i);
  if (!m) return '';
  const hours = Number(m[1] || 0) * 24 + Number(m[2] || 0);
  let minutes = Math.round(Number(m[3] || 0));
  let h = Math.floor(hours);
  minutes += Math.round((hours - h) * 60);
  h += Math.floor(minutes / 60);
  minutes %= 60;
  if (!h && !minutes) return '';
  return [h ? `${h} hr` : '', minutes ? `${minutes} min` : ''].filter(Boolean).join(' ');
}

function asArray(v) {
  return v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
}

function hasType(node, type) {
  return asArray(node && node['@type']).some(t => String(t).toLowerCase() === type.toLowerCase());
}

// ---------- Websites (schema.org Recipe) ----------

function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
    try { out.push(JSON.parse(raw)); } catch {
      // Some sites put stray control characters in their JSON.
      try { out.push(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' '))); } catch { /* skip */ }
    }
  }
  return out;
}

function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n, depth + 1); if (r) return r; }
    return null;
  }
  if (hasType(node, 'Recipe')) return node;
  for (const key of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item']) {
    const r = findRecipe(node[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function imageUrl(img) {
  for (const i of asArray(img)) {
    if (typeof i === 'string' && i) return i;
    if (i && typeof i === 'object') {
      const u = i.url || i.contentUrl || (typeof i['@id'] === 'string' && /^https?:/.test(i['@id']) ? i['@id'] : '');
      if (u) return u;
    }
  }
  return '';
}

function instructionSteps(value) {
  const steps = [];
  const walk = v => {
    if (!v) return;
    if (typeof v === 'string') {
      // A single string can hold several steps separated by line breaks or <li>/<p> tags.
      const parts = v.split(/<\/(?:li|p)>|<br\s*\/?>|\n+/i).map(clean).filter(Boolean);
      steps.push(...parts);
      return;
    }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') {
      if (hasType(v, 'HowToSection') || v.itemListElement) {
        // Keep the site's step sections ("Cake", "Glaze") as headings.
        const title = clean(v.name || '');
        if (title) steps.push(`${title.replace(/:$/, '')}:`);
        walk(v.itemListElement);
        return;
      }
      walk(v.text || v.name || v.description || '');
    }
  };
  walk(value);
  return steps;
}

function yieldText(v) {
  const list = asArray(v).map(x => clean(x)).filter(Boolean);
  // Prefer "4 servings" over a bare "4" when both are given.
  return list.find(x => /[a-z]/i.test(x)) || list[0] || '';
}

function metaTags(html) {
  const meta = {};
  const re = /<meta\s+([^>]+)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    m[1].replace(/([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi, (_, k, __, v1, v2) => { attrs[k.toLowerCase()] = v1 ?? v2; return ''; });
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = decodeEntities(attrs.content);
  }
  return meta;
}

function emptyDraft(url) {
  return { name: '', source: url || '', imageUrl: '', ingredients: '', directions: '', servings: '', prepTime: '', cookTime: '', notes: '', hints: '' };
}

// Reads a recipe out of a web page's HTML. Returns null when nothing recipe-like is found.
export function recipeFromHtml(html, url = '') {
  const page = String(html || '');
  const meta = metaTags(page);
  const recipe = jsonLdBlocks(page).map(b => findRecipe(b)).find(Boolean);
  if (recipe) {
    const d = emptyDraft(url);
    d.name = clean(recipe.name || recipe.headline || meta['og:title'] || '');
    d.imageUrl = imageUrl(recipe.image) || meta['og:image'] || '';
    d.ingredients = asArray(recipe.recipeIngredient || recipe.ingredients).map(clean).filter(Boolean).join('\n');
    d.directions = instructionSteps(recipe.recipeInstructions).join('\n');
    d.servings = yieldText(recipe.recipeYield);
    d.prepTime = isoDuration(recipe.prepTime);
    d.cookTime = isoDuration(recipe.cookTime) || (!d.prepTime ? isoDuration(recipe.totalTime) : '');
    // The site's own labels ("Main Course", "Mexican", keywords) help pick categories.
    d.hints = [recipe.recipeCategory, recipe.recipeCuisine, recipe.keywords].flatMap(asArray).map(x => clean(x)).join(', ');
    const desc = clean(recipe.description || '');
    if (desc && desc.length < 600) d.notes = desc;
    return d;
  }
  // No structured recipe: fall back to the page's title/description (e.g. a TikTok page).
  const caption = meta['og:description'] || meta.description || '';
  const title = meta['og:title'] || clean((page.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  if (!caption && !title) return null;
  const d = captionDraft(caption || title, url);
  if (!d.name && title) d.name = cleanTitle(title);
  d.imageUrl = d.imageUrl || meta['og:image'] || '';
  return d;
}

function cleanTitle(t) {
  return clean(t).replace(/\s*[|–—-]\s*(TikTok|Instagram|YouTube|Pinterest).*$/i, '').slice(0, 80);
}

// ---------- TikTok (and other captions) ----------

// Turns a video caption into a recipe draft: "Garlic pasta 🍝 Ingredients: 1 lb spaghetti, ... #pasta"
export function captionDraft(caption, url = '') {
  const d = emptyDraft(url);
  let text = String(caption || '')
    .replace(/\r/g, '')
    .replace(/(^|\s)[#＃][\p{L}\p{N}_]+/gu, '$1') // hashtags
    .replace(/(^|\s)@[\w.]+/g, '$1') // mentions
    .replace(/[ \t]+$/gm, '');

  // Section words written inline ("Ingredients: a, b, c") get their own line.
  const SECTION = /(ingredients?|what you(?:'|’)ll need|you(?:'|’)ll need|instructions?|directions?|method|steps|how to make(?: it)?)\s*[:：\-–]\s*/gi;
  text = text.replace(SECTION, (_, word) => `\n${word}\n`);

  const lines = text.split('\n').map(l => l
    .replace(/^[\s\p{Extended_Pictographic}\u{FE0F}\u{20E3}•·▪▫◦‣∙*\-–—✓✔️☑️]+/u, '') // emoji / bullet prefixes
    .trim()).filter(Boolean);

  // An ingredients line written as a comma list becomes one ingredient per line.
  const expanded = [];
  let section = '';
  for (const line of lines) {
    const lower = line.toLowerCase().replace(/[:：]$/, '');
    if (/^(ingredients?|what you(?:'|’)ll need|you(?:'|’)ll need)$/.test(lower)) { section = 'ingredients'; expanded.push('Ingredients'); continue; }
    if (/^(instructions?|directions?|method|steps|how to make( it)?)$/.test(lower)) { section = 'directions'; expanded.push('Directions'); continue; }
    if (section === 'ingredients' && line.includes(',') && !/[.!?]$/.test(line)) {
      expanded.push(...line.split(/,(?![^(]*\))/).map(s => s.trim()).filter(Boolean));
    } else if (section === 'directions' && /\d[.)]\s/.test(line) && line.split(/\s(?=\d+[.)]\s)/).length > 1) {
      expanded.push(...line.split(/\s(?=\d+[.)]\s)/).map(s => s.trim()));
    } else {
      expanded.push(line);
    }
  }

  const parsed = parseRecipeText(expanded.join('\n'));
  d.name = (parsed.name || '').replace(/[.!]+$/, '').slice(0, 80);
  d.ingredients = parsed.ingredients;
  d.directions = parsed.directions.replace(/\n\n/g, '\n');
  d.servings = parsed.servings;
  d.prepTime = parsed.prepTime;
  d.cookTime = parsed.cookTime;
  if (!d.ingredients && !d.directions) {
    // Nothing structured: keep the whole caption so nothing is lost.
    d.notes = lines.slice(1).join('\n');
  }
  return d;
}

// TikTok oEmbed response -> draft.
export function recipeFromTikTokOEmbed(data, url = '') {
  if (!data || typeof data !== 'object') return null;
  const caption = String(data.title || '');
  const d = captionDraft(caption, url);
  if (!d.name) d.name = data.author_name ? `TikTok recipe by ${data.author_name}` : 'TikTok recipe';
  d.imageUrl = data.thumbnail_url || '';
  return d;
}

// ---------- Fetching ----------

// Websites don't let other sites read their pages directly from a browser, so pages are
// requested through public relay services, tried in order.
export const RELAYS = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
];

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), ms); })]);
  } finally {
    clearTimeout(timer);
  }
}

// Your own relay (e.g. the Cloudflare Worker in tools/cloudflare-worker.js), tried before the
// public ones. Set from Settings; '' turns it off.
let customRelay = '';
export function setCustomRelay(base) {
  customRelay = String(base || '').trim().replace(/[?&]+$/, '');
}

// Fetches through the relays (direct first, which works for sites that allow it).
export async function fetchViaRelays(url, as = 'text', fetchFn = globalThis.fetch) {
  const own = customRelay ? [u => `${customRelay}${customRelay.includes('?') ? '&' : '?'}url=${encodeURIComponent(u)}`] : [];
  const attempts = [...own, u => u, ...RELAYS];
  let lastErr;
  for (const wrap of attempts) {
    try {
      const res = await withTimeout(fetchFn(wrap(url)), 15000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = as === 'blob' ? await res.blob() : await res.text();
      if (as === 'text' && !body) throw new Error('empty');
      if (as === 'blob' && (!body.size || !/^image\//.test(body.type || 'image/'))) throw new Error('not an image');
      return body;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not load');
}

// Turns a link into a recipe draft. Throws when nothing usable is found.
export async function draftFromLink(url, fetchFn = globalThis.fetch) {
  if (isTikTok(url)) {
    try {
      const json = await fetchViaRelays(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, 'text', fetchFn);
      const d = recipeFromTikTokOEmbed(JSON.parse(json), url);
      if (d) return d;
    } catch { /* fall back to the page itself */ }
  }
  const html = await fetchViaRelays(url, 'text', fetchFn);
  const d = recipeFromHtml(html, url);
  if (!d || (!d.name && !d.ingredients)) throw new Error('No recipe found on that page');
  return d;
}

// ---------- Pasting many recipes at once ----------

const META_LINE = /^(servings?|serves|yield|makes|prep(?: time)?|cook(?: time)?|total(?: time)?)\b/i;
const INGREDIENT_HEADER = /^(ingredients?|what you(?:'|’)ll need|you(?:'|’)ll need)$/;
const SEPARATOR = /^\s*(-{3,}|={3,}|\*{3,}|_{3,}|~{3,})\s*$/;

function headerWord(line) {
  return line.toLowerCase().replace(/[:#*]/g, '').trim();
}

// Splits text holding several recipes (e.g. copied from a notes app) into one chunk per recipe.
// A line of "---" always separates recipes; otherwise each "Ingredients" heading starts a new
// recipe whose name is the line above it.
export function splitRecipeTexts(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  if (lines.some(l => SEPARATOR.test(l))) {
    const chunks = [];
    let cur = [];
    for (const l of lines) {
      if (SEPARATOR.test(l)) { chunks.push(cur.join('\n')); cur = []; } else cur.push(l);
    }
    chunks.push(cur.join('\n'));
    return chunks.map(c => c.trim()).filter(Boolean);
  }
  const headers = lines.map((l, i) => (INGREDIENT_HEADER.test(headerWord(l)) ? i : -1)).filter(i => i >= 0);
  if (headers.length <= 1) return String(text || '').trim() ? [String(text).trim()] : [];
  // Start of each recipe: walk up from its Ingredients heading past blank and meta lines to the title.
  const starts = headers.map((h, k) => {
    let i = h - 1;
    const floor = k ? headers[k - 1] + 1 : 0;
    while (i > floor && (!lines[i].trim() || META_LINE.test(lines[i].trim()))) i--;
    return k === 0 ? 0 : Math.max(floor, i);
  });
  return starts.map((st, k) => lines.slice(st, k + 1 < starts.length ? starts[k + 1] : lines.length).join('\n').trim()).filter(Boolean);
}

export function draftsFromText(text, source = '') {
  return splitRecipeTexts(text).map(chunk => {
    const p = parseRecipeText(chunk);
    return { ...emptyDraft(source), ...p, directions: p.directions.replace(/\n\n/g, '\n') };
  }).filter(d => d.name && (d.ingredients || d.directions || d.notes));
}

// ---------- Files: Paprika exports, saved web pages, text files ----------

async function inflate(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export const gunzip = bytes => inflate(bytes, 'gzip');

// Minimal ZIP reader (stored + deflate entries), enough for Paprika's .paprikarecipes files.
export async function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Bad zip directory');
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(start, start + compSize);
    if (!name.endsWith('/')) {
      if (method === 0) entries.push({ name, data: raw });
      else if (method === 8) entries.push({ name, data: await inflate(raw, 'deflate-raw') });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// One Paprika recipe (JSON) -> draft.
export function draftFromPaprika(r) {
  const d = emptyDraft(r.source_url || r.source || '');
  d.name = clean(r.name || '');
  d.ingredients = String(r.ingredients || '').replace(/\r/g, '').trim();
  d.directions = String(r.directions || '').replace(/\r/g, '').split(/\n+/).map(s => s.trim()).filter(Boolean).join('\n');
  d.notes = [r.description, r.notes].filter(Boolean).map(s => String(s).trim()).join('\n\n');
  d.servings = clean(r.servings || '');
  d.prepTime = clean(r.prep_time || '');
  d.cookTime = clean(r.cook_time || '') || clean(r.total_time || '');
  d.categories = asArray(r.categories).map(c => clean(c)).filter(Boolean);
  d.rating = Math.max(0, Math.min(5, Number(r.rating) || 0));
  if (r.photo_data) d.photoDataUrl = `data:image/jpeg;base64,${r.photo_data}`;
  else if (r.image_url) d.imageUrl = r.image_url;
  return d;
}

const looksGzip = b => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

// Reads any supported file into recipe drafts.
export async function draftsFromFile(name, bytes) {
  const lower = String(name).toLowerCase();
  const text = () => new TextDecoder().decode(bytes);
  if (lower.endsWith('.paprikarecipes')) {
    const out = [];
    for (const entry of await readZip(bytes)) {
      const raw = looksGzip(entry.data) ? await gunzip(entry.data) : entry.data;
      out.push(draftFromPaprika(JSON.parse(new TextDecoder().decode(raw))));
    }
    return out;
  }
  if (lower.endsWith('.paprikarecipe')) {
    const raw = looksGzip(bytes) ? await gunzip(bytes) : bytes;
    return [draftFromPaprika(JSON.parse(new TextDecoder().decode(raw)))];
  }
  if (/\.(html?|webarchive|mhtml?)$/.test(lower)) {
    const html = text();
    const canonical = (html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)/i) || html.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)/i) || [])[1] || '';
    const d = recipeFromHtml(html, decodeEntities(canonical));
    return d && (d.ingredients || d.directions) ? [d] : [];
  }
  return draftsFromText(text());
}
