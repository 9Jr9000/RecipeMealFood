// Tiny key-value store on IndexedDB (falls back to localStorage if IndexedDB is unavailable).
// Everything stays on this device.

const DB_NAME = 'recipe-box';
const STORE = 'kv';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
  }));
}

export async function get(key) {
  try {
    return await tx('readonly', s => s.get(key));
  } catch {
    const v = localStorage.getItem(`${DB_NAME}:${key}`);
    return v === null ? undefined : JSON.parse(v);
  }
}

export async function set(key, value) {
  try {
    await tx('readwrite', s => s.put(value, key));
  } catch {
    localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(value));
  }
}

export async function del(key) {
  try {
    await tx('readwrite', s => s.delete(key));
  } catch {
    localStorage.removeItem(`${DB_NAME}:${key}`);
  }
}

export async function keys() {
  try {
    return await tx('readonly', s => s.getAllKeys());
  } catch {
    return Object.keys(localStorage)
      .filter(k => k.startsWith(`${DB_NAME}:`))
      .map(k => k.slice(DB_NAME.length + 1));
  }
}
