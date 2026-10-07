// File backup API: writes only from localhost with the custom header, validates payloads, keeps dated snapshots, never serves user-data/ statically.
import { spawn } from 'node:child_process';
import http from 'node:http';
import { mkdtemp, readdir, writeFile, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 5199, BASE = `http://127.0.0.1:${PORT}`, dir = await mkdtemp(join(tmpdir(), 'sqlm-'));
const srv = spawn(process.execPath, ['server.js', String(PORT), '--no-open'], { env: { ...process.env, SQLM_DATA_DIR: dir }, stdio: 'ignore' });
let fails = 0; const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fails++; };
const H = { 'X-SQLM': '1' };
const payload = (n) => JSON.stringify({ app: 'sql-mastery-platform', schemaVersion: 1, exportedAt: new Date().toISOString(), settings: {}, data: { problem_attempts: Array.from({ length: n }, (_, i) => ({ id: 'A' + i })) } });
try {
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/index.html'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
  ok((await fetch(BASE + '/api/backup/info')).status === 403, 'API refuses requests without the custom header');
  const evil = await new Promise((res, rej) => http.get({ host: '127.0.0.1', port: PORT, path: '/api/backup/info', headers: { ...H, Host: 'evil.example' } }, r => res(r.statusCode)).on('error', rej));
  ok(evil === 403, 'API refuses a foreign Host header (DNS-rebinding guard)');
  let r = await fetch(BASE + '/api/backup/info', { headers: H }); ok((await r.json()).exists === false, 'no backup yet');
  ok((await fetch(BASE + '/api/backup', { headers: H })).status === 404, 'GET before any backup is 404');
  r = await fetch(BASE + '/api/backup', { method: 'PUT', headers: H, body: '{not json' }); ok(r.status === 400, 'invalid JSON rejected');
  r = await fetch(BASE + '/api/backup', { method: 'PUT', headers: H, body: JSON.stringify({ app: 'other', schemaVersion: 1, data: {} }) }); ok(r.status === 400, 'foreign file rejected');
  r = await fetch(BASE + '/api/backup', { method: 'PUT', headers: H, body: payload(3) }); ok(r.status === 200, 'valid backup saved');
  r = await fetch(BASE + '/api/backup/info', { headers: H }); const inf = await r.json(); ok(inf.exists && inf.attempts === 3, 'info reports 3 attempts');
  r = await fetch(BASE + '/api/backup', { method: 'PUT', headers: H, body: payload(5) }); ok(r.status === 200, 'second save overwrites');
  const back = await (await fetch(BASE + '/api/backup', { headers: H })).json(); ok(back.data.problem_attempts.length === 5, 'GET returns the latest copy');
  let files = await readdir(dir);
  ok(!files.some(f => /^backup-\d/.test(f)), 'no snapshot while all saves happen on the same day');
  // Pretend backup.json was last written on 3 Jan 2026: the next save must keep it as backup-2026-01-03.json (the day it represents).
  await utimes(join(dir, 'backup.json'), new Date('2026-01-03T20:00:00Z'), new Date('2026-01-03T20:00:00Z'));
  await fetch(BASE + '/api/backup', { method: 'PUT', headers: H, body: payload(7) });
  files = await readdir(dir);
  ok(files.includes('backup-2026-01-03.json'), 'snapshot is named after the day its data represents');
  ok(JSON.parse(await readFile(join(dir, 'backup-2026-01-03.json'), 'utf8')).data.problem_attempts.length === 5, 'snapshot holds that day\'s final state');
  ok(!files.some(f => f.endsWith('.tmp')), 'no temp file left behind');
  const lst = await (await fetch(BASE + '/api/backup/list', { headers: H })).json();
  ok(lst.length === 2 && lst[0].latest === true && lst[0].attempts === 7 && lst[1].attempts === 5, 'list shows latest + snapshot with attempt counts, newest first');
  const one = await (await fetch(BASE + '/api/backup?file=backup-2026-01-03.json', { headers: H })).json();
  ok(one.data.problem_attempts.length === 5, 'a specific snapshot can be fetched');
  ok((await fetch(BASE + '/api/backup?file=../server.js', { headers: H })).status === 400, 'path traversal rejected');
  for (let d = 1; d <= 20; d++) await writeFile(join(dir, `backup-2020-01-${String(d).padStart(2, '0')}.json`), payload(1));
  await fetch(BASE + '/api/backup', { method: 'PUT', headers: H, body: payload(6) });
  ok((await readdir(dir)).filter(f => /^backup-\d{4}/.test(f)).length === 14, 'only the newest 14 snapshots are kept');
  ok((await fetch(BASE + '/user-data/backup.json')).status === 403, 'user-data/ is not served as a static file');
} finally { srv.kill(); await rm(dir, { recursive: true, force: true }); }
console.log(fails ? `\n${fails} failure(s)` : '\nfile backup API: all good'); process.exit(fails ? 1 : 0);
