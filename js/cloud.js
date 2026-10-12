// Cloud sync through Firebase (sign-in + Firestore). Data lives under users/{uid}/... so each
// account only sees its own recipes. Firebase is only loaded once someone signs in.
//
// While offline, changes are saved on the phone and queued by Firestore; they upload when the
// connection is back. Merging between phones is done by ./cloudsync.js.

import { firebaseConfig } from './firebase-config.js';
import * as db from './db.js';
import { COLLECTIONS, emptyBase, stateAccessor, photoAccessor, computePush, applyRemote, dedupe } from './cloudsync.js';

const ENABLED_KEY = 'cloud:enabled';
const SYNCED = [...COLLECTIONS, 'photos'];
const MAX_PHOTO_CHARS = 950000; // Firestore documents are limited to 1 MB

let fb = null; // { auth, fs, A: auth module, F: firestore module }
let hooks = null; // { getState, photos, onRemote, onStatus }
let user = null;
let base = null;
let ready = false;
let unsubs = [];
let pushTimer = null;
let baseTimer = null;
let status = { state: 'off', message: '' };

export function cloudStatus() {
  return { ...status, email: user ? user.email || user.displayName || 'your account' : null };
}
export function isSignedIn() { return !!user; }

function setStatus(state, message = '') {
  status = { state, message };
  if (hooks) hooks.onStatus();
}

function accessor(col) {
  return col === 'photos' ? photoAccessor(hooks.photos) : stateAccessor(hooks.getState, col);
}

function remember(on) {
  try { on ? localStorage.setItem(ENABLED_KEY, '1') : localStorage.removeItem(ENABLED_KEY); } catch { /* private mode */ }
}
function remembered() {
  try { return localStorage.getItem(ENABLED_KEY) === '1'; } catch { return false; }
}

async function load() {
  if (fb) return fb;
  const [appMod, A, F] = await Promise.all([
    import('./vendor/firebase/firebase-app.js'),
    import('./vendor/firebase/firebase-auth.js'),
    import('./vendor/firebase/firebase-firestore.js'),
  ]);
  const app = appMod.getApps()[0] || appMod.initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let fs;
  try {
    // Keeps a copy on the phone so the listeners work offline and writes queue up.
    fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch {
    fs = F.getFirestore(app);
  }
  fb = { auth, fs, A, F };
  A.onAuthStateChanged(auth, u => { if (u) startSync(u); else stopSync(); });
  return fb;
}

// Called once at startup.
export async function initCloud(h) {
  hooks = h;
  window.addEventListener('online', () => { if (user) { setStatus('syncing'); schedulePush(0); } });
  window.addEventListener('offline', () => { if (user) setStatus('offline'); });
  if (!remembered()) return;
  setStatus('syncing', 'Connecting…');
  try {
    await load();
  } catch (err) {
    console.error(err);
    setStatus('error', 'Couldn’t load sync. Check your connection and reopen the app.');
  }
}

// ---------- Sign in / out ----------

export async function signInWithGoogle() {
  const { auth, A } = await load();
  remember(true);
  try {
    await A.signInWithPopup(auth, new A.GoogleAuthProvider());
  } catch (err) {
    if (!user) remember(false);
    throw new Error(explain(err));
  }
}

export async function signInWithEmail(email, password, create = false) {
  const { auth, A } = await load();
  remember(true);
  try {
    if (create) await A.createUserWithEmailAndPassword(auth, email, password);
    else await A.signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    if (!user) remember(false);
    throw new Error(explain(err));
  }
}

export async function resetPassword(email) {
  const { auth, A } = await load();
  try {
    await A.sendPasswordResetEmail(auth, email);
  } catch (err) {
    throw new Error(explain(err));
  }
}

export async function signOutCloud() {
  if (!fb) return;
  const { auth, A, F, fs } = fb;
  clearTimeout(pushTimer);
  if (user && ready) push();
  // Give queued uploads a few seconds to reach the server so nothing is lost.
  try { await Promise.race([F.waitForPendingWrites(fs), new Promise(r => setTimeout(r, 4000))]); } catch { /* offline */ }
  const uid = user && user.uid;
  stopSync();
  remember(false);
  await A.signOut(auth);
  if (uid) await db.del(`syncbase:${uid}`);
}

// ---------- Sync ----------

async function startSync(u) {
  if (user && user.uid === u.uid) return;
  stopListeners();
  user = u;
  ready = false;
  remember(true);
  base = { ...emptyBase(), ...((await db.get(`syncbase:${u.uid}`)) || {}) };
  // A phone that has never synced waits for the real cloud copy (not an empty offline cache)
  // before uploading, so it can't overwrite anything.
  const firstTime = SYNCED.every(col => !Object.keys(base[col] || {}).length);
  const waiting = new Set(SYNCED);
  setStatus(navigator.onLine ? 'syncing' : 'offline', firstTime ? 'Downloading your recipes…' : '');
  if (firstTime && !navigator.onLine) setStatus('offline', 'Connect to the internet to finish signing in.');

  const { F, fs } = fb;
  for (const col of SYNCED) {
    const ref = F.collection(fs, 'users', u.uid, col);
    const unsub = F.onSnapshot(ref, { includeMetadataChanges: true }, snap => {
      if (!user || user.uid !== u.uid) return;
      const changes = snap.docChanges().map(c => ({
        type: c.type,
        id: c.doc.id,
        data: c.type === 'removed' ? null : c.doc.data(),
      }));
      const changed = changes.length ? applyRemote(accessor(col), base[col], changes) : false;
      if (col === 'photos' && changed) savePhotos(changes);
      const deduped = col !== 'photos' && changed && dedupe(hooks.getState());
      if (changed || deduped) hooks.onRemote();
      if (changes.length) saveBaseSoon();

      if (!ready && (!firstTime || !snap.metadata.fromCache)) {
        waiting.delete(col);
        if (!waiting.size) {
          ready = true;
          schedulePush(0); // uploads anything made on this phone before/while signing in
        }
      } else if (ready && deduped) {
        schedulePush(0);
      }
      if (ready && !snap.metadata.hasPendingWrites && status.state === 'syncing' && !pushTimer) updateSyncedStatus();
    }, err => {
      console.error(err);
      setStatus('error', explain(err));
    });
    unsubs.push(unsub);
  }
}

function stopListeners() {
  for (const u of unsubs) u();
  unsubs = [];
}

function stopSync() {
  stopListeners();
  clearTimeout(pushTimer);
  pushTimer = null;
  user = null;
  ready = false;
  base = null;
  setStatus('off');
}

async function savePhotos(changes) {
  for (const c of changes) {
    const url = hooks.photos.get(c.id);
    if (url) await db.set(`photo:${c.id}`, url);
    else await db.del(`photo:${c.id}`);
  }
}

function saveBaseSoon() {
  if (!user) return;
  const uid = user.uid;
  const snapshot = base;
  clearTimeout(baseTimer);
  baseTimer = setTimeout(() => db.set(`syncbase:${uid}`, snapshot), 300);
}

// Called after every local change.
export function schedulePush(delay = 500) {
  if (!user || !ready) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; push(); }, delay);
}

function push() {
  if (!user || !ready) return;
  const { F, fs } = fb;
  const uid = user.uid;
  const ops = [];
  for (const col of SYNCED) {
    const { writes, deletes } = computePush(accessor(col), base[col]);
    for (const w of writes) {
      if (col === 'photos' && String(w.doc.data).length > MAX_PHOTO_CHARS) {
        console.warn('Photo too large to sync', w.id);
        continue;
      }
      ops.push({ col, id: w.id, run: b => b.set(F.doc(fs, 'users', uid, col, w.id), w.doc) });
    }
    for (const id of deletes) ops.push({ col, id, run: b => b.delete(F.doc(fs, 'users', uid, col, id)) });
  }
  if (!ops.length) { updateSyncedStatus(); return; }
  saveBaseSoon();
  setStatus(navigator.onLine ? 'syncing' : 'offline');
  // Firestore allows 500 operations per batch.
  for (let i = 0; i < ops.length; i += 400) {
    const chunk = ops.slice(i, i + 400);
    const batch = F.writeBatch(fs);
    for (const op of chunk) op.run(batch);
    // While offline this waits in Firestore's queue and resolves once the server has it.
    batch.commit().then(updateSyncedStatus).catch(err => {
      console.error(err);
      // Forget these as "synced" so they're retried on the next change.
      if (base && user && user.uid === uid) for (const op of chunk) delete base[op.col][op.id];
      setStatus('error', explain(err));
    });
  }
}

function updateSyncedStatus() {
  if (!user || !fb) return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  fb.F.waitForPendingWrites(fb.fs).then(() => {
    if (user && status.state !== 'error') setStatus('synced');
  }).catch(() => {});
}

// ---------- Messages ----------

function explain(err) {
  const code = (err && err.code) || '';
  const messages = {
    'auth/popup-closed-by-user': 'Sign-in was closed before finishing.',
    'auth/cancelled-popup-request': 'Sign-in was closed before finishing.',
    'auth/popup-blocked': 'The sign-in window was blocked. Allow pop-ups for this site, or sign in with email instead.',
    'auth/operation-not-supported-in-this-environment': 'Google sign-in isn’t available here. Use email sign-in instead.',
    'auth/unauthorized-domain': 'This website isn’t allowed to sign in yet. In Firebase → Authentication → Settings → Authorized domains, add 9jr9000.github.io.',
    'auth/operation-not-allowed': 'This sign-in method is turned off. In Firebase → Authentication → Sign-in method, turn it on.',
    'auth/configuration-not-found': 'Sign-in isn’t switched on in Firebase yet. In Firebase → Build → Authentication, click “Get started”, then under Sign-in method turn on Email/Password (and Google if you want it).',
    'auth/admin-restricted-operation': 'New accounts are blocked. In Firebase → Authentication → Settings → User actions, allow “Enable create (sign-up)”.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The app’s Firebase settings don’t match your project. Check the config in js/firebase-config.js.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with that email. Tap “Create Account” to make one.',
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/email-already-in-use': 'There’s already an account with that email. Tap “Sign In” instead.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/missing-password': 'Enter a password.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No internet connection. Try again when you’re online.',
    'permission-denied': 'The cloud database refused access. In Firebase → Firestore Database → Rules, paste the rules from the setup steps and click Publish.',
    'failed-precondition': 'The cloud database isn’t set up yet. In Firebase, open Firestore Database and click Create database.',
    'not-found': 'The cloud database isn’t set up yet. In Firebase, open Firestore Database and click Create database.',
    unavailable: 'Can’t reach the cloud right now. Changes are saved on this phone and will sync later.',
  };
  if (messages[code]) return messages[code];
  if (/CONFIGURATION_NOT_FOUND/i.test(String(err && err.message))) return messages['auth/configuration-not-found'];
  if (/database .* does not exist|NOT_FOUND/i.test(String(err && err.message))) return messages['not-found'];
  return `Something went wrong (${code || (err && err.message) || 'unknown error'}).`;
}
