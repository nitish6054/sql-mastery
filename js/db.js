// IndexedDB persistence layer. Local-first, versioned, transactional.
// Every schema change gets a new entry in MIGRATIONS; never edit an old one.

export const DB_NAME = 'sql-mastery';
export const DB_VERSION = 1;
export const APP_ID = 'sql-mastery-platform';

export const STORES = {
  meta: { keyPath: 'key' },
  user_profile: { keyPath: 'id' },
  topics: { keyPath: 'id' },
  problems: { keyPath: 'id' },
  episodes: { keyPath: 'id', indexes: [['problemId', 'problemId'], ['sessionId', 'sessionId']] },
  problem_attempts: { keyPath: 'id', indexes: [['problemId', 'problemId'], ['sessionId', 'sessionId'], ['timestamp', 'timestamp']] },
  mistakes: { keyPath: 'id', indexes: [['category', 'category']] },
  mastery: { keyPath: 'topicId' },
  reviews: { keyPath: 'key' },
  patterns: { keyPath: 'id' },
  sessions: { keyPath: 'id', indexes: [['startedAt', 'startedAt']] },
  progress_snapshots: { keyPath: 'id' },
  curriculum_progress: { keyPath: 'id' },
  interview_sessions: { keyPath: 'id' },
  notes: { keyPath: 'id' },
  explain_backs: { keyPath: 'id' },
  weekly_reviews: { keyPath: 'id' },
};

// Stores that hold learner history (exported/imported). topics/problems are content and are re-seeded.
export const DATA_STORES = Object.keys(STORES).filter(s => !['topics', 'problems'].includes(s));

const MIGRATIONS = {
  1: (db) => {
    for (const [name, def] of Object.entries(STORES)) {
      if (db.objectStoreNames.contains(name)) continue;
      const os = db.createObjectStore(name, { keyPath: def.keyPath });
      for (const [idx, path] of def.indexes || []) os.createIndex(idx, path, { unique: false });
    }
  },
  // 2: (db, tx) => { /* example: tx.objectStore('problem_attempts').createIndex('mode','mode') */ },
};

let _db = null;
let _idb = (typeof indexedDB !== 'undefined') ? indexedDB : null;
export function _setIndexedDB(impl) { _idb = impl; _db = null; } // for Node tests

export function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    if (!_idb) return reject(new Error('IndexedDB is not available in this browser.'));
    const req = _idb.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result; const tx = req.transaction;
      for (let v = e.oldVersion + 1; v <= DB_VERSION; v++) MIGRATIONS[v]?.(db, tx);
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database upgrade blocked — close other tabs of this app and reload.'));
  });
}

export function closeDB() { if (_db) { _db.close(); _db = null; } }

const p = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function getAll(store) {
  const db = await openDB();
  return p(db.transaction(store).objectStore(store).getAll());
}
export async function get(store, key) {
  const db = await openDB();
  return p(db.transaction(store).objectStore(store).get(key));
}

// Atomic multi-store write: { storeName: [records], ... } plus optional deletes { storeName: [keys] }.
export async function writeAtomic(puts = {}, deletes = {}) {
  const db = await openDB();
  const names = [...new Set([...Object.keys(puts), ...Object.keys(deletes)])].filter(n => (puts[n]?.length || deletes[n]?.length));
  if (!names.length) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    for (const n of names) {
      const os = tx.objectStore(n);
      for (const r of puts[n] || []) os.put(r);
      for (const k of deletes[n] || []) os.delete(k);
    }
  });
}

export async function put(store, record) { return writeAtomic({ [store]: [record] }); }

export async function clearStores(names) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, 'readwrite');
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    names.forEach(n => tx.objectStore(n).clear());
  });
}

export async function deleteDatabase() {
  closeDB();
  return new Promise((resolve, reject) => {
    const req = _idb.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(); req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

// ---------- Export / import ----------
export async function exportAll(settings = {}) {
  const data = {};
  for (const s of DATA_STORES) data[s] = await getAll(s);
  return { app: APP_ID, schemaVersion: DB_VERSION, exportedAt: new Date().toISOString(), settings, data };
}

const REQUIRED_KEYS = Object.fromEntries(Object.entries(STORES).map(([n, d]) => [n, d.keyPath]));

export async function analyzeImport(json) {
  const errors = [];
  if (!json || typeof json !== 'object') return { ok: false, errors: ['File is not a JSON object.'] };
  if (json.app !== APP_ID) errors.push(`This file is not a SQL Mastery backup (app = ${JSON.stringify(json.app)}).`);
  if (typeof json.schemaVersion !== 'number') errors.push('Missing schemaVersion.');
  else if (json.schemaVersion > DB_VERSION) errors.push(`Backup schema v${json.schemaVersion} is newer than this app (v${DB_VERSION}). Update the app first.`);
  if (!json.data || typeof json.data !== 'object') errors.push('Missing data section.');
  if (errors.length) return { ok: false, errors };
  const summary = {}; const clean = {};
  for (const [store, rows] of Object.entries(json.data)) {
    if (!DATA_STORES.includes(store)) { summary[store] = { skipped: true, reason: 'unknown store' }; continue; }
    if (!Array.isArray(rows)) { errors.push(`${store} is not a list.`); continue; }
    const key = REQUIRED_KEYS[store];
    const valid = [], invalid = [];
    for (const r of rows) (r && typeof r === 'object' && r[key] !== undefined && r[key] !== null ? valid : invalid).push(r);
    const existing = new Set((await getAll(store)).map(r => r[key]));
    const dupes = valid.filter(r => existing.has(r[key])).length;
    summary[store] = { incoming: rows.length, valid: valid.length, invalid: invalid.length, duplicates: dupes, new: valid.length - dupes };
    if (invalid.length) errors.push(`${store}: ${invalid.length} record(s) lack the "${key}" field and will be skipped.`);
    clean[store] = valid;
  }
  const blocking = errors.filter(e => !e.includes('will be skipped'));
  return { ok: blocking.length === 0, errors, summary, clean, fromVersion: json.schemaVersion, exportedAt: json.exportedAt, settings: json.settings };
}

// mode 'merge': keep existing records on ID collision (except singleton profile/curriculum, where newer wins).
// mode 'replace': wipe learner data, then load the backup. Either way it's one transaction.
export async function applyImport(analysis, mode = 'merge') {
  const db = await openDB();
  const migrated = migrateRecords(analysis.clean, analysis.fromVersion);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DATA_STORES, 'readwrite');
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Import aborted — nothing was changed.'));
    const work = async () => {
      for (const store of DATA_STORES) {
        const os = tx.objectStore(store);
        const rows = migrated[store] || [];
        if (mode === 'replace') { os.clear(); rows.forEach(r => os.put(r)); continue; }
        const key = REQUIRED_KEYS[store];
        for (const r of rows) {
          const req = os.get(r[key]);
          req.onsuccess = () => {
            const cur = req.result;
            if (!cur) os.put(r);
            else if (['user_profile', 'curriculum_progress'].includes(store) && singletonWeight(r) > singletonWeight(cur)) os.put(r);
          };
        }
      }
    };
    work().catch(e => { try { tx.abort(); } catch {} reject(e); });
  });
}

// For singleton records, the one carrying more learning history wins (a fresh install never overwrites a backup).
function singletonWeight(r) {
  return (r.submitCount || 0) * 10 + Object.keys(r.lessonsViewed || {}).length + (r.assessments || []).length * 5 + (r.onboarded ? 1 : 0) + (r.diagnostic ? 3 : 0);
}

// Upgrade records from older backup versions. Add a case per schema version bump.
function migrateRecords(data, fromVersion) {
  const out = structuredClone(data);
  // if (fromVersion < 2) { … }
  return out;
}

export async function requestPersistentStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return { supported: false };
  const already = await navigator.storage.persisted();
  const granted = already || await navigator.storage.persist();
  const est = await navigator.storage.estimate?.();
  return { supported: true, persisted: granted, usage: est?.usage, quota: est?.quota };
}
