// Optional second copy of the learner's data in the app folder (user-data/, git-ignored), written by server.js.
// IndexedDB stays the source of truth. If the server API is absent (static hosting, tests) everything here quietly does nothing.
import * as db from './db.js';
import { prefs } from './ui.js';

export const status = { savedAt: null, error: null };
let active = false, timer = null, getState = null;

const call = (path, opts = {}) => fetch(path, { cache: 'no-store', ...opts, headers: { 'X-SQLM': '1', ...(opts.headers || {}) } });
const hasData = (st) => st.attempts.length > 0 || (st.profile?.submitCount || 0) > 0;

export async function info() {
  try { const r = await call('/api/backup/info'); return r.ok ? await r.json() : null; } catch { return null; }
}
export async function fetchBackup() {
  const r = await call('/api/backup'); if (!r.ok) throw new Error('No file backup found');
  return r.json();
}
export async function saveNow() {
  const data = await db.exportAll({ theme: prefs.get('theme', 'system'), editorSize: prefs.get('editorSize', 14) });
  const r = await call('/api/backup', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!r.ok) throw new Error(`The server refused the backup (${r.status})`);
  const j = await r.json(); status.savedAt = j.savedAt; status.error = null; return j;
}
// Autosave a few seconds after the last write; never from a state with no learning history (so an empty browser can't clobber the file).
export function enable(stateGetter) {
  if (active) return; active = true; getState = stateGetter;
  db.onWrite(() => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (hasData(getState())) saveNow().catch(e => { status.error = e.message; }); }, 3000);
  });
}
export const isActive = () => active;
