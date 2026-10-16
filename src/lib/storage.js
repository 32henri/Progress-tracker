import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Provider API keys used to be device-local only; now synced like everything else so
// entering a key on one device makes it available on the other too. Firestore access
// is already scoped per-uid the same way as every other synced field here, so this
// inherits the same protection — just make sure the Firestore rules for
// users/{uid}/appData/main actually restrict reads/writes to request.auth.uid == uid
// (not this file's concern, but worth double-checking in the Firebase console since
// this doc now holds a secret).
const LOCAL_ONLY_KEYS = new Set([]);

let uid = null;
let cache = {};
let ready = false;
let writeTimer = null;

function localGet(key, fallback) {
  try {
    const raw = localStorage.getItem(`progress-tracker:${key}`);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function localSet(key, value) {
  try {
    localStorage.setItem(`progress-tracker:${key}`, JSON.stringify(value));
  } catch (e) {
    console.error("local save failed", key, e);
  }
}

// One-time carry-over for keys entered back when they were device-local-only. If a key
// already exists on the synced doc, that wins (don't clobber a value entered on another
// device since). Only migrates, never deletes the local copy — harmless leftover.
const MIGRATED_LOCAL_KEYS = ["apiKey", "geminiKey"];

// Call once after sign-in, before rendering the tracker. Pulls the whole
// synced doc down into an in-memory cache so every load() call afterward
// is synchronous-fast (still returns a Promise to match the old API).
export async function initStore(userId) {
  uid = userId;
  try {
    const snap = await getDoc(doc(db, "users", uid, "appData", "main"));
    cache = snap.exists() ? snap.data() : {};
  } catch (e) {
    console.error("initStore fetch failed, starting empty", e);
    cache = {};
  }
  ready = true;

  let migrated = false;
  MIGRATED_LOCAL_KEYS.forEach((key) => {
    if (key in cache) return;
    const local = localGet(key, null);
    if (local) {
      cache[key] = local;
      migrated = true;
    }
  });
  if (migrated) {
    try {
      await setDoc(doc(db, "users", uid, "appData", "main"), cache, { merge: true });
    } catch (e) {
      console.error("key migration push failed", e);
    }
  }
}

export function isReady() {
  return ready;
}

export async function load(key, fallback) {
  if (LOCAL_ONLY_KEYS.has(key)) return localGet(key, fallback);
  if (!ready) return fallback; // shouldn't happen if initStore is awaited first
  return key in cache ? cache[key] : fallback;
}

// Optimistic local update + debounced push of the whole doc to Firestore.
// Async/refresh-based sync by design (no realtime requirement) — PC just
// needs to see the latest on its next load.
export async function save(key, value) {
  if (LOCAL_ONLY_KEYS.has(key)) {
    localSet(key, value);
    return;
  }
  cache[key] = value;
  if (!uid) return; // not signed in yet, nothing to push
  clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    try {
      await setDoc(doc(db, "users", uid, "appData", "main"), cache, { merge: true });
    } catch (e) {
      console.error("cloud save failed", e);
    }
  }, 600);
}

export function resetStoreCache() {
  cache = {};
}
