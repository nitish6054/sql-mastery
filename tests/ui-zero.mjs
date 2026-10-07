// End-to-end UI test in jsdom: real app code, fake-indexeddb, PGlite inside a Worker stand-in.
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { PGlite } from '@electric-sql/pglite';

const dom = new JSDOM('<!doctype html><div id="app"></div>', { url: 'http://localhost:5173/', pretendToBeVisual: true });
const w = dom.window;
for (const k of ['window', 'document', 'location', 'localStorage', 'navigator', 'HTMLElement', 'Element', 'Node', 'getComputedStyle', 'Event', 'KeyboardEvent', 'MouseEvent', 'FileReader', 'Blob'])
  Object.defineProperty(globalThis, k, { value: k === 'window' ? w : w[k], configurable: true, writable: true });
globalThis.indexedDB = new IDBFactory();
w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = function () {};
w.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.matchMedia = w.matchMedia;
const errors = [];
w.addEventListener('error', e => errors.push(e.message));
process.on('unhandledRejection', e => errors.push('unhandled: ' + (e?.stack || e)));

class FakeWorker {
  constructor() {
    this.q = (async () => { this.db = await PGlite.create(); const v = await this.db.query('select version()'); setTimeout(() => this.onmessage?.({ data: { type: 'ready', version: v.rows[0].version } })); })();
  }
  async postMessage({ id, op, sql }) {
    await this.q; const db = this.db;
    try {
      let result = null;
      if (op === 'reset') { try { await db.exec('ROLLBACK'); } catch {} await db.exec(`DROP SCHEMA IF EXISTS ws CASCADE; CREATE SCHEMA ws; SET search_path TO ws;\n${sql}`); }
      if (op === 'run') { const res = await db.exec(sql, { rowMode: 'array' }); const wf = res.filter(r => r.fields?.length); const r = wf.length ? wf[wf.length - 1] : res[res.length - 1];
        result = { fields: r.fields.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })), rows: r.rows, totalRows: r.rows.length }; }
      if (op === 'explain') { const r = await db.query('EXPLAIN (FORMAT JSON) ' + sql); result = r.rows[0]['QUERY PLAN'][0].Plan['Total Cost']; }
      this.onmessage?.({ data: { id, ok: true, result } });
    } catch (err) { try { await db.exec('ROLLBACK'); } catch {} this.onmessage?.({ data: { id, ok: false, error: { message: err.message, code: err.code, position: err.position } } }); }
  }
  terminate() {}
}
globalThis.Worker = FakeWorker;

const $ = (s) => w.document.querySelector(s);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, label, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await sleep(25); } throw new Error('Timed out waiting for ' + label + '\nPAGE: ' + $('#view')?.textContent.slice(0, 400)); }
const text = () => $('#view').textContent;
const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) process.exitCode = 1; };
const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const go = async (h) => { w.location.hash = h; await sleep(80); };

const { PROBLEM_BY_ID } = await import('../js/content/problems.js');
await import('../js/main.js');
const S = await import('../js/store.js');
const A = await import('../js/adaptive.js');
await waitFor(() => text().includes('Start lesson 1'), 'welcome');
ok(true, 'welcome leads with the zero-start path');
click($('#zero'));
await waitFor(() => text().includes('What SQL is') && $('#go-session'), 'lesson 1');
ok(/spreadsheet/.test(text()), 'lesson 1 explains tables/rows/columns for a beginner');
click($('#runex')); await waitFor(() => $('#exout table'), 'example'); ok(true, 'lesson example runs');
click($('#go-session'));
await waitFor(() => $('#lesson-go') || $('#sql'), 'first session');
const unlockedNow = () => new Set(S.state.derived ? Object.keys(S.state.derived.mastery).filter(id => A.isUnlocked(id, S.state.derived.mastery, S.state.curriculum)) : []);
const checkPlan = (label) => {
  const U = unlockedNow(); const plan = S.state.activeSession.plan;
  const bad = plan.filter(it => PROBLEM_BY_ID[it.problemId].topics.some(t => !U.has(t)));
  ok(bad.length === 0, `${label}: ${plan.length} problems, all within unlocked topics [${plan.map(it => it.problemId + '/' + PROBLEM_BY_ID[it.problemId].difficulty).join(', ')}]`);
};
checkPlan('session 1');
ok(!!$('#lesson-go') && /Learn first/.test(text()), 'a dedicated lesson screen comes first: ' + text().match(/Learn first: [^\n]+/)?.[0]?.slice(0, 50));
click($('#lesson-go')); await waitFor(() => $('#sql'), 'problem after the lesson');
ok(/New concept/.test($('.crumb').textContent), 'first problem follows its lesson: ' + $('.crumb').textContent.trim().split('\n')[0]);
// solve the whole session
for (let i = 0; i < 20; i++) {
  if (w.location.hash.startsWith('#/summary')) break;
  await waitFor(() => ($('#sql') && $('.ws-head h1')) || $('#lesson-go'), 'item');
  if ($('#lesson-go')) { click($('#lesson-go')); await sleep(60); }
  await waitFor(() => $('#sql') && $('.ws-head h1'), 'item problem');
  const title = $('.ws-head h1').textContent; const p = Object.values(PROBLEM_BY_ID).find(x => x.title === title);
  $('#sql').value = p.solution; click($('#submit')); await sleep(50);
  if ($('.modal-bg .conf')) click($('.modal-bg .conf button'));
  await waitFor(() => $('.verdict'), 'verdict');
  ok($('.verdict').classList.contains('pass'), `${p.id} ${p.title} solved`);
  const before = w.location.hash; click($('#advance'));
  await waitFor(() => w.location.hash !== before, 'advance'); await sleep(150);
}
await waitFor(() => text().includes('Session summary'), 'summary');
ok(true, 'session 1 complete → summary');
const m = S.state.derived.mastery;
ok(m.f_select.masteryScore >= 40, `SELECT mastery ${m.f_select.masteryScore}% (stage ${m.f_select.stage}, status ${m.f_select.status}) — not "mastered" after one session`);
ok(m.f_select.status !== 'Mastered', 'one day of easy problems does not count as mastery');
// Simulate coming back two days later and re-solving: retention evidence.
const twoDays = 2 * 86400000;
for (const e of S.state.episodes) e.openedAt -= twoDays;
S.recompute();
const U = unlockedNow(); ok(U.has('f_sort') && U.has('f_filter') && !U.has('a_basic') && !U.has('j_inner'), 'unlocked next: ' + [...U].join(', '));
const session1 = new Set(S.state.sessions.flatMap(x => (x.plan || []).map(it => it.problemId)));
await go('#/'); await waitFor(() => $('#start'), 'dashboard start'); click($('#start'));
await waitFor(() => $('#sql') || $('#lesson-go'), 'session 2'); checkPlan('session 2');
ok(S.state.activeSession.plan[0].section === 'New concept' && !!$('#lesson-go'), 'session 2 starts with a lesson screen for the new concept');
ok(S.state.activeSession.plan.every(it => !session1.has(it.problemId)), 'session 2 contains none of the problems already solved in session 1');
for (let i = 0; i < 20; i++) {
  if (w.location.hash.startsWith('#/summary')) break;
  await waitFor(() => ($('#sql') && $('.ws-head h1')) || $('#lesson-go'), 'item');
  if ($('#lesson-go')) { click($('#lesson-go')); await sleep(60); }
  await waitFor(() => $('#sql') && $('.ws-head h1'), 'item problem');
  const title = $('.ws-head h1').textContent; const p = Object.values(PROBLEM_BY_ID).find(x => x.title === title);
  $('#sql').value = p.solution; click($('#submit')); await sleep(50);
  if ($('.modal-bg .conf')) click($('.modal-bg .conf button'));
  await waitFor(() => $('.verdict'), 'verdict');
  const before = w.location.hash; click($('#advance')); await waitFor(() => w.location.hash !== before, 'advance'); await sleep(150);
}
const m2 = S.state.derived.mastery.f_select;
ok(m2.daysPractised >= 2, `after a second day: SELECT ${m2.masteryScore}% · ${m2.stage} · ${m2.status}`);
ok(errors.length === 0, 'no uncaught errors' + (errors.length ? ': ' + errors.join(' | ').slice(0, 500) : ''));
process.exit(process.exitCode || 0);
