// Merge logic for syncing between devices. Pure functions, no Firebase, so it can be unit tested.
//
// Each synced collection is a set of items by id. For every item we remember the version last
// seen in the cloud ("base"). That gives a simple three-way rule per item:
//   - changed here since base   -> our version is uploaded (and wins over a remote edit)
//   - unchanged here            -> the cloud version is taken (edits and deletions from other devices)
// Items are independent, so two phones editing different recipes never conflict.

import { keysMatch } from './sync.js';

export const COLLECTIONS = ['recipes', 'grocery', 'pantry', 'meta'];

export function emptyBase() {
  return { recipes: {}, grocery: {}, pantry: {}, meta: {}, photos: {} };
}

// JSON with sorted keys, so the same data always gives the same string.
export function canonical(value) {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

// Cheap fingerprint for photos (data URLs are large; the base only needs to detect changes).
export function photoHash(dataUrl) {
  const s = String(dataUrl || '');
  return `${s.length}:${s.slice(-48)}`;
}

// Read/write access to one collection of the app state.
export function stateAccessor(getState, col) {
  if (col === 'meta') {
    return {
      ids: () => ['aisles'],
      get: id => (id === 'aisles' ? { id: 'aisles', overrides: getState().aisleOverrides || {} } : undefined),
      set: (id, value) => { if (id === 'aisles') getState().aisleOverrides = { ...(value.overrides || {}) }; },
      remove: () => {},
      canon: canonical,
      toDoc: value => JSON.parse(JSON.stringify({ overrides: value.overrides || {} })),
      fromDoc: (id, data) => ({ id, overrides: data.overrides || {} }),
      // First sync on a phone: keep aisle choices from both sides (this phone's win on clashes).
      merge: (local, remote) => ({ id: local.id, overrides: { ...remote.overrides, ...local.overrides } }),
    };
  }
  return {
    ids: () => getState()[col].map(x => x.id),
    get: id => getState()[col].find(x => x.id === id),
    set: (id, value) => {
      const list = getState()[col];
      const i = list.findIndex(x => x.id === id);
      if (i >= 0) list[i] = value; else list.push(value);
    },
    remove: id => { getState()[col] = getState()[col].filter(x => x.id !== id); },
    canon: canonical,
    // Firestore rejects undefined values; a JSON round trip drops them.
    toDoc: value => JSON.parse(JSON.stringify(value)),
    fromDoc: (id, data) => ({ ...data, id }),
  };
}

export function photoAccessor(photos) {
  return {
    ids: () => [...photos.keys()],
    get: id => photos.get(id),
    set: (id, value) => photos.set(id, value),
    remove: id => photos.delete(id),
    canon: photoHash,
    toDoc: value => ({ data: value }),
    fromDoc: (id, data) => data.data,
  };
}

// What needs uploading: items changed since base, and deletions of items that are gone here.
// Updates `base` as if the uploads succeeded (the Firestore SDK queues them while offline).
export function computePush(acc, base) {
  const writes = [];
  const deletes = [];
  const ids = new Set(acc.ids());
  for (const id of ids) {
    const value = acc.get(id);
    const c = acc.canon(value);
    if (base[id] !== c) {
      writes.push({ id, doc: acc.toDoc(value) });
      base[id] = c;
    }
  }
  for (const id of Object.keys(base)) {
    if (!ids.has(id)) {
      deletes.push(id);
      delete base[id];
    }
  }
  return { writes, deletes };
}

// Applies changes from the cloud: [{ type: 'added' | 'modified' | 'removed', id, data }].
// Returns true when local data changed.
export function applyRemote(acc, base, changes) {
  let changed = false;
  for (const ch of changes) {
    const local = acc.get(ch.id);
    const localCanon = local === undefined ? undefined : acc.canon(local);
    const editedHere = local !== undefined && base[ch.id] !== undefined && localCanon !== base[ch.id];
    if (ch.type === 'removed') {
      if (base[ch.id] === undefined && local === undefined) continue;
      // Deleted elsewhere: drop it here too, unless it was edited here (then the edit is re-uploaded).
      if (!editedHere && local !== undefined) {
        acc.remove(ch.id);
        changed = true;
      }
      delete base[ch.id];
      continue;
    }
    const remote = acc.fromDoc(ch.id, ch.data);
    const remoteCanon = acc.canon(remote);
    if (editedHere) {
      // Our newer edit wins and will be uploaded — unless the cloud already has the same thing.
      if (localCanon === remoteCanon) base[ch.id] = remoteCanon;
      continue;
    }
    const neverSynced = base[ch.id] === undefined;
    base[ch.id] = remoteCanon;
    if (localCanon === remoteCanon) continue;
    if (neverSynced && local !== undefined && acc.merge) {
      // Exists on both sides but never synced here: combine them (the result differs from base,
      // so it gets uploaded on the next push).
      const merged = acc.merge(local, remote);
      if (acc.canon(merged) !== localCanon) changed = true;
      acc.set(ch.id, merged);
      continue;
    }
    acc.set(ch.id, remote);
    changed = true;
  }
  return changed;
}

// Two phones can add the same thing separately ("milk" on both). Merge such duplicates.
// The item with the smallest id is kept, so every device makes the same choice.
export function dedupe(state) {
  let changed = false;
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const pantry = [...state.pantry].sort(byId);
  const keptPantry = [];
  for (const p of pantry) {
    if (keptPantry.some(k => keysMatch(k.key, p.key))) { changed = true; continue; }
    keptPantry.push(p);
  }
  if (changed) state.pantry = state.pantry.filter(p => keptPantry.includes(p));

  const open = state.grocery.filter(g => !g.checked).sort(byId);
  const drop = new Set();
  for (let i = 0; i < open.length; i++) {
    if (drop.has(open[i].id)) continue;
    for (let j = i + 1; j < open.length; j++) {
      if (drop.has(open[j].id) || !keysMatch(open[i].key, open[j].key)) continue;
      open[i].parts = [...open[i].parts, ...open[j].parts];
      drop.add(open[j].id);
    }
  }
  if (drop.size) {
    state.grocery = state.grocery.filter(g => !drop.has(g.id));
    changed = true;
  }
  return changed;
}
