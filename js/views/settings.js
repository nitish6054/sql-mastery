import { esc, $, toast, modal, download, typedConfirm, confirmDialog, date, dateTime, prefs } from '../ui.js';
import * as db from '../db.js';
import * as S from '../store.js';
import { engineVersion, exclusive } from '../sql/engine.js';
import { validatePack, installPack, listInstalledPacks, PACK_APP } from '../packs.js';
import { applyTheme } from '../ui.js';

export async function renderSettings(root) {
  const p = S.state.profile;
  const storage = await db.requestPersistentStorage().catch(() => ({ supported: false }));
  const packs = await listInstalledPacks();
  const mb = (b) => b == null ? '—' : `${(b / 1048576).toFixed(1)} MB`;
  root.innerHTML = `<div class="page stack"><h1>Settings & data</h1>
    <div class="grid g2">
      <div class="panel"><h2>Profile & display</h2>
        <p><label>Name <input type="text" id="name" value="${esc(p.name || '')}"></label></p>
        <p><label>Theme <select id="theme">${['system', 'light', 'dark'].map(t => `<option ${prefs.get('theme', 'system') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label style="margin-left:12px">Editor font <select id="font">${[12, 13, 14, 15, 16, 18].map(s => `<option ${prefs.get('editorSize', 14) === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></p>
        <button class="btn sm" id="save-prof">Save</button></div>
      <div class="panel"><h2>Storage</h2>
        <p class="small">Your learning history is stored in this browser's IndexedDB for <code>${esc(location.origin)}</code>. Always open the app at this exact address — a different port or host is a different, empty database.</p>
        <p class="small">Persistent storage: <b>${storage.supported ? (storage.persisted ? 'granted (the browser will not evict it)' : 'not granted — export backups regularly') : 'unknown in this browser'}</b><br>
        Used: ${mb(storage.usage)} · Records: ${S.state.attempts.length} attempts, ${S.state.mistakes.length} mistakes, ${S.state.sessions.length} sessions<br>
        PostgreSQL engine: ${esc(engineVersion() || 'starting…')}<br>Database schema version: ${db.DB_VERSION}</p></div>
    </div>
    <div class="panel"><h2>Backup</h2><p>Last backup: <b>${p.lastBackupAt ? dateTime(p.lastBackupAt) : 'never'}</b>. The file contains your complete history (attempts, mistakes, mastery, sessions, reviews, notes, interviews, settings, installed problem packs).</p>
      <div class="row"><button class="btn primary" id="export">Export my learning data</button><label class="btn">Import learning data<input type="file" id="import" accept="application/json,.json" hidden></label></div></div>
    <div class="panel"><h2>Problem packs</h2><p class="small">Add more problems as a JSON pack (see README → "Adding problems"). Every pack is checked against PostgreSQL before it's accepted.</p>
      ${packs.length ? `<ul class="small">${packs.map(k => `<li>${esc(k.name)} — ${k.count} problems, added ${date(k.addedAt)}</li>`).join('')}</ul>` : '<p class="small muted">No packs installed.</p>'}
      <label class="btn">Add problem pack<input type="file" id="pack" accept="application/json,.json" hidden></label></div>
    <div class="panel"><h2>Self-check</h2><p class="small">Writes a test record to IndexedDB, reads it back, and runs a query on the SQL engine. Does not touch your history.</p>
      <button class="btn" id="check">Run self-check</button><div id="check-out" class="small" style="margin-top:8px"></div></div>
    <div class="panel"><h2>Reset</h2><p class="small">Resets keep your attempt history; mastery and scheduling restart from the reset moment. Only "Delete all learning data" erases anything.</p>
      <div class="row"><button class="btn" id="r-session" ${S.state.activeSession ? '' : 'disabled'}>Discard current session</button>
        <button class="btn" id="r-all">Reset all progress</button><button class="btn danger" id="r-delete">Delete all learning data</button></div>
      <p class="small muted" style="margin-top:8px">To reset one topic, open it from the Roadmap.</p></div>
    <div class="panel"><h2>Privacy</h2><p class="small">Nothing you write is sent anywhere. SQL runs in your browser (PGlite, PostgreSQL compiled to WebAssembly, served from this folder). The only optional network requests: Google Fonts (falls back to system fonts offline) and, only if the local engine files are missing, the jsDelivr CDN for the engine.</p></div></div>`;

  $('#save-prof', root).onclick = async () => {
    p.name = $('#name', root).value.trim(); await S.saveProfile();
    prefs.set('theme', $('#theme', root).value); prefs.set('editorSize', Number($('#font', root).value)); applyTheme(); toast('Saved');
  };
  $('#export', root).onclick = async () => {
    const data = await db.exportAll({ theme: prefs.get('theme', 'system'), editorSize: prefs.get('editorSize', 14) });
    download(`sql-mastery-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
    await S.markBackedUp(); toast('Backup downloaded'); renderSettings(root);
  };
  $('#import', root).onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    let json; try { json = JSON.parse(await f.text()); } catch { toast('That file is not valid JSON.'); return; }
    const a = await db.analyzeImport(json);
    if (!a.ok) { await modal(`<h2>Can't import this file</h2><ul>${a.errors.map(x => `<li>${esc(x)}</li>`).join('')}</ul><div class="row" style="justify-content:flex-end"><button class="btn" data-close="">Close</button></div>`); return; }
    const rows = Object.entries(a.summary).filter(([, v]) => v.incoming).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${v.incoming}</td><td class="num">${v.new}</td><td class="num">${v.duplicates}</td><td class="num">${v.invalid}</td></tr>`).join('');
    const choice = await modal(`<h2>Import learning data</h2><p class="small">Backup from ${esc(a.exportedAt || 'unknown date')} (schema v${a.fromVersion}).</p>
      <table class="tbl"><thead><tr><th>Store</th><th class="num">In file</th><th class="num">New</th><th class="num">Already here</th><th class="num">Invalid</th></tr></thead><tbody>${rows}</tbody></table>
      ${a.errors.length ? `<p class="small" style="color:var(--warn)">${a.errors.map(esc).join('<br>')}</p>` : ''}
      <p class="small"><b>Merge</b> adds new records and keeps existing ones when IDs collide. <b>Replace</b> wipes current history first. Either runs as one transaction: if anything fails, nothing changes.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close="">Cancel</button><button class="btn" data-close="replace">Replace</button><button class="btn primary" data-close="merge">Merge</button></div>`);
    if (!choice) return;
    if (choice === 'replace' && !(await typedConfirm('Replace all data', 'Your current history will be replaced by the backup.', 'REPLACE'))) return;
    try { await db.applyImport(a, choice); if (a.settings?.theme) prefs.set('theme', a.settings.theme); toast('Import complete — reloading'); setTimeout(() => location.reload(), 700); }
    catch (err) { toast('Import failed, nothing was changed: ' + err.message, 5000); }
  };
  $('#pack', root).onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    let pack; try { pack = JSON.parse(await f.text()); } catch { toast('That file is not valid JSON.'); return; }
    toast('Validating pack against PostgreSQL…');
    const v = await validatePack(pack);
    if (!v.ok) { await modal(`<h2>Pack rejected</h2><ul class="small">${v.errors.slice(0, 30).map(x => `<li>${esc(x)}</li>`).join('')}</ul><div class="row" style="justify-content:flex-end"><button class="btn" data-close="">Close</button></div>`); return; }
    if (await confirmDialog('Install pack?', `${esc(pack.name || pack.id)}: ${pack.problems.length} problem(s), all solutions verified.`, 'Install')) { await installPack(pack); toast('Pack installed'); renderSettings(root); }
  };
  $('#check', root).onclick = async () => {
    const out = $('#check-out', root); out.textContent = 'Running…';
    const lines = [];
    try { const token = String(Math.random()); await db.put('meta', { key: 'selfcheck', token, at: Date.now() }); const back = await db.get('meta', 'selfcheck'); lines.push(back?.token === token ? '✓ IndexedDB write/read' : '✗ IndexedDB read-back mismatch'); }
    catch (e) { lines.push('✗ IndexedDB: ' + e.message); }
    try { const r = await exclusive(async (run) => { await run.reset('CREATE TABLE t(x int); INSERT INTO t VALUES (1),(2);'); return run.run('SELECT SUM(x) AS s FROM t'); }); lines.push(Number(r.rows[0][0]) === 3 ? '✓ PostgreSQL engine' : '✗ PostgreSQL returned an unexpected result'); }
    catch (e) { lines.push('✗ PostgreSQL: ' + e.message); }
    lines.push(`✓ ${S.state.attempts.length} attempts loaded from disk`);
    out.innerHTML = lines.map(esc).join('<br>');
  };
  $('#r-session', root).onclick = async () => { if (await confirmDialog('Discard the current session?', 'The session plan is closed. Attempts already submitted remain in your history.', 'Discard')) { await S.discardActiveSession(); toast('Session discarded'); renderSettings(root); } };
  $('#r-all', root).onclick = async () => { if (await typedConfirm('Reset all progress', 'Mastery, reviews and placement restart from now. Attempts, mistakes and notes stay in history.', 'RESET')) { await S.resetAllProgress(); toast('Progress reset'); location.hash = '#/'; } };
  $('#r-delete', root).onclick = async () => {
    if (!(await typedConfirm('Delete all learning data', 'This permanently erases everything stored by this app in this browser. Export a backup first if you might want it back.', 'DELETE'))) return;
    await S.deleteEverything(); localStorage.clear(); location.hash = '#/'; location.reload();
  };
}
