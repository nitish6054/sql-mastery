// SQL worker: real PostgreSQL (PGlite / WebAssembly) running off the main thread.
// Loaded from the local vendor folder (offline); falls back to the CDN only if the local copy is missing.
const VERSION = '0.5.8';
let db = null;
const MAX_ROWS = 5000;

async function boot() {
  let mod;
  try { mod = await import('../../vendor/pglite/index.js'); }
  catch (e) {
    mod = await import(`https://cdn.jsdelivr.net/npm/@electric-sql/pglite@${VERSION}/dist/index.js`);
    self.postMessage({ type: 'notice', message: 'Loaded PostgreSQL engine from CDN (local vendor copy missing).' });
  }
  db = await mod.PGlite.create();
  const v = await db.query('SELECT version()');
  return v.rows[0].version;
}
const ready = boot().then(
  (version) => self.postMessage({ type: 'ready', version }),
  (err) => self.postMessage({ type: 'fatal', message: String(err?.message || err) }));

function pick(results) {
  const withFields = results.filter(r => r.fields && r.fields.length);
  const r = withFields.length ? withFields[withFields.length - 1] : results[results.length - 1];
  const rows = r?.rows || [];
  return { fields: (r?.fields || []).map(f => ({ name: f.name, dataTypeID: f.dataTypeID })), rows: rows.slice(0, MAX_ROWS),
    truncated: rows.length > MAX_ROWS, totalRows: rows.length, command: r?.command || null, affectedRows: r?.affectedRows ?? null, statements: results.length };
}

self.onmessage = async (ev) => {
  const { id, op, sql } = ev.data;
  try {
    await ready;
    if (!db) throw new Error('PostgreSQL engine failed to start.');
    let result = null;
    if (op === 'reset') {
      try { await db.exec('ROLLBACK'); } catch {}
      await db.exec(`DROP SCHEMA IF EXISTS ws CASCADE; CREATE SCHEMA ws; SET search_path TO ws;\n${sql}`);
    } else if (op === 'run') {
      result = pick(await db.exec(sql, { rowMode: 'array' }));
    } else if (op === 'explain') {
      const r = await db.query('EXPLAIN (FORMAT JSON) ' + sql);
      result = r.rows[0]['QUERY PLAN'][0].Plan['Total Cost'];
    }
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    try { await db?.exec('ROLLBACK'); } catch {}
    self.postMessage({ id, ok: false, error: { message: err?.message || String(err), code: err?.code || null, position: err?.position || null } });
  }
};
