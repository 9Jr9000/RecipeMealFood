import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTIONS, emptyBase, stateAccessor, photoAccessor, computePush, applyRemote, dedupe, canonical } from '../js/cloudsync.js';
import { emptyState, saveRecipe, addManualItem, addToPantry, setChecked, clearChecked, deleteRecipe } from '../js/sync.js';

// A fake cloud (one map per collection) and devices that sync through it like the real app:
// push local changes, then receive the other device's changes as snapshot events.
function makeCloud() {
  const data = Object.fromEntries([...COLLECTIONS, 'photos'].map(c => [c, new Map()]));
  return { data };
}
function makeDevice(cloud) {
  const dev = { state: emptyState(), photos: new Map(), base: emptyBase(), seen: Object.fromEntries([...COLLECTIONS, 'photos'].map(c => [c, new Map()])) };
  dev.acc = col => (col === 'photos' ? photoAccessor(dev.photos) : stateAccessor(() => dev.state, col));
  dev.push = () => {
    for (const col of [...COLLECTIONS, 'photos']) {
      const { writes, deletes } = computePush(dev.acc(col), dev.base[col]);
      for (const w of writes) cloud.data[col].set(w.id, JSON.parse(JSON.stringify(w.doc)));
      for (const id of deletes) cloud.data[col].delete(id);
    }
  };
  // Snapshot listener: diff the cloud against what this device last saw.
  dev.pull = () => {
    let changed = false;
    for (const col of [...COLLECTIONS, 'photos']) {
      const changes = [];
      for (const [id, doc] of cloud.data[col]) {
        const prev = dev.seen[col].get(id);
        if (prev === undefined) changes.push({ type: 'added', id, data: doc });
        else if (canonical(prev) !== canonical(doc)) changes.push({ type: 'modified', id, data: doc });
      }
      for (const id of dev.seen[col].keys()) if (!cloud.data[col].has(id)) changes.push({ type: 'removed', id });
      dev.seen[col] = new Map([...cloud.data[col]].map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
      if (applyRemote(dev.acc(col), dev.base[col], changes)) changed = true;
    }
    if (dedupe(dev.state)) dev.push();
    return changed;
  };
  // Like the app: the first time, download before uploading anything.
  dev.sync = () => {
    if (!dev.started) { dev.pull(); dev.started = true; }
    dev.push();
    dev.pull();
  };
  return dev;
}
const names = list => list.map(x => x.name).sort();

test('first sign-in uploads this phone, a second phone downloads it', () => {
  const cloud = makeCloud();
  const a = makeDevice(cloud);
  saveRecipe(a.state, { name: 'Pasta', ingredients: '1 lb spaghetti' });
  addManualItem(a.state, 'milk');
  addToPantry(a.state, 'salt');
  a.photos.set(a.state.recipes[0].id, 'data:image/jpeg;base64,AAAA');
  a.sync();
  const b = makeDevice(cloud);
  b.sync();
  assert.deepEqual(names(b.state.recipes), ['Pasta']);
  assert.deepEqual(names(b.state.grocery), ['Milk']);
  assert.deepEqual(names(b.state.pantry), ['Salt']);
  assert.equal(b.photos.get(b.state.recipes[0].id), 'data:image/jpeg;base64,AAAA');
});

test('signing in on a phone that already has data merges both', () => {
  const cloud = makeCloud();
  const a = makeDevice(cloud);
  saveRecipe(a.state, { name: 'Pasta', ingredients: '' });
  addManualItem(a.state, '2 cups milk');
  a.sync();
  const b = makeDevice(cloud);
  saveRecipe(b.state, { name: 'Tacos', ingredients: '' });
  addManualItem(b.state, '1 cup milk'); // same item added separately on both phones
  b.sync();
  a.sync();
  for (const d of [a, b]) {
    assert.deepEqual(names(d.state.recipes), ['Pasta', 'Tacos']);
    assert.equal(d.state.grocery.length, 1, 'duplicate milk merged');
    assert.equal(d.state.grocery[0].parts.length, 2);
  }
});

test('edits, check-offs and deletions reach the other phone', () => {
  const cloud = makeCloud();
  const a = makeDevice(cloud);
  const b = makeDevice(cloud);
  const r = saveRecipe(a.state, { name: 'Pasta', ingredients: '' });
  const milk = addManualItem(a.state, 'milk');
  a.sync(); b.sync();

  saveRecipe(b.state, { ...b.state.recipes[0], name: 'Garlic Pasta' });
  setChecked(b.state, milk.id, true);
  clearChecked(b.state); // milk moves to the pantry
  b.sync(); a.sync();
  assert.deepEqual(names(a.state.recipes), ['Garlic Pasta']);
  assert.equal(a.state.grocery.length, 0);
  assert.deepEqual(names(a.state.pantry), ['Milk']);

  deleteRecipe(a.state, r.id);
  a.sync(); b.sync();
  assert.equal(b.state.recipes.length, 0);
});

test('edits on both phones to different items both survive', () => {
  const cloud = makeCloud();
  const a = makeDevice(cloud);
  const b = makeDevice(cloud);
  saveRecipe(a.state, { name: 'One', ingredients: '' });
  saveRecipe(a.state, { name: 'Two', ingredients: '' });
  a.sync(); b.sync();
  // Both phones offline, each edits a different recipe, then both reconnect.
  const [oneA] = a.state.recipes.filter(x => x.name === 'One');
  const [twoB] = b.state.recipes.filter(x => x.name === 'Two');
  saveRecipe(a.state, { ...oneA, notes: 'from A' });
  saveRecipe(b.state, { ...twoB, notes: 'from B' });
  a.sync(); b.sync(); a.sync();
  for (const d of [a, b]) {
    assert.equal(d.state.recipes.find(x => x.name === 'One').notes, 'from A');
    assert.equal(d.state.recipes.find(x => x.name === 'Two').notes, 'from B');
  }
});

test('an edit made offline wins over a delete from another phone', () => {
  const cloud = makeCloud();
  const a = makeDevice(cloud);
  const b = makeDevice(cloud);
  saveRecipe(a.state, { name: 'Soup', ingredients: '' });
  a.sync(); b.sync();
  deleteRecipe(a.state, a.state.recipes[0].id);
  saveRecipe(b.state, { ...b.state.recipes[0], notes: 'keep me' });
  a.sync(); b.sync(); a.sync();
  for (const d of [a, b]) assert.equal(d.state.recipes[0]?.notes, 'keep me');
});

test('aisle choices sync, and a new phone keeps its own', () => {
  const cloud = makeCloud();
  const a = makeDevice(cloud);
  const b = makeDevice(cloud);
  a.state.aisleOverrides.tofu = 'Produce';
  b.state.aisleOverrides.oats = 'Baking';
  a.sync(); b.sync(); a.sync();
  for (const d of [a, b]) assert.deepEqual(d.state.aisleOverrides, { tofu: 'Produce', oats: 'Baking' });
});

test('nothing is uploaded again when nothing changed', () => {
  const cloud = makeCloud();
  const a = makeDevice(cloud);
  saveRecipe(a.state, { name: 'Pasta', ingredients: '' });
  a.sync();
  for (const col of COLLECTIONS) {
    const { writes, deletes } = computePush(a.acc(col), a.base[col]);
    assert.equal(writes.length + deletes.length, 0, col);
  }
});
