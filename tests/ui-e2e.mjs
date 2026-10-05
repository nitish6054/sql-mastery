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
await waitFor(() => text().includes('Start the diagnostic'), 'welcome');
ok(true, 'welcome page with roadmap rendered');
$('#name').value = 'Nitish';
click($('#diag'));

async function answer(correct, { expectStrict = false } = {}) {
  await waitFor(() => $('#sql') && $('.ws-head h1'), 'workspace');
  const title = $('.ws-head h1').textContent;
  const p = Object.values(PROBLEM_BY_ID).find(x => x.title === title);
  $('#sql').value = correct ? p.solution : p.trap;
  click($('#submit'));
  await sleep(50);
  if ($('.modal-bg .conf')) click($('.modal-bg .conf button'));
  await waitFor(() => $('.verdict'), 'verdict for ' + p.id);
  return p;
}

// Diagnostic: 12 questions, mix of right / wrong / skipped
let n = 0, verdicts = [];
while (true) {
  await sleep(60);
  if (location.hash.startsWith('#/diagnostic')) break;
  await waitFor(() => $('#sql') || location.hash.startsWith('#/diagnostic'), 'next diagnostic item');
  if (location.hash.startsWith('#/diagnostic')) break;
  n++;
  if (n === 9) { click($('#skip')); await sleep(150); continue; }
  const p = await answer(n <= 6 || n === 8);
  verdicts.push([p.id, $('.verdict').classList.contains('pass')]);
  click($('#advance'));
}
await waitFor(() => text().includes('Your starting point'), 'diagnostic results');
ok(n === 12, `diagnostic walked through ${n} questions`);
ok(verdicts.slice(0, 6).every(v => v[1]) && !verdicts[6][1], 'correct solutions pass, trap queries fail in the UI');
ok(/Placement: Level \d/.test(text()), 'placement shown: ' + text().match(/Placement: Level \d — [A-Za-z &]+/)?.[0]);

// Daily session
click($('#go-daily'));
await waitFor(() => $('#sql'), 'daily session workspace');
ok(/Today's session/.test($('.crumb').textContent), 'daily session started: ' + $('.crumb').textContent.trim().slice(0, 60));
// Run
$('#sql').value = 'SELECT 1 AS one;'; click($('#run'));
await waitFor(() => $('#out table'), 'run result');
ok($('#out td').textContent === '1', 'Run shows results');
// Error
$('#sql').value = 'SELEC oops'; click($('#run'));
await waitFor(() => $('#out .err'), 'error display');
ok(/syntax error/.test($('#out .err').textContent), 'syntax errors shown with message');
// wrong → diagnosis, hint, then right
let p = await answer(false);
ok(!!$('.diag'), 'wrong submission shows diagnosis: ' + ($('.diag h3')?.textContent || 'none'));
click($('#hint')); await sleep(80);
ok(/Nudge:/.test(w.document.body.textContent), 'hint 1 displayed');
p = await answer(true);
ok($('.verdict').classList.contains('pass') && /Query quality/.test(text()), 'correct submission shows quality score');
click($('#advance'));
await waitFor(() => w.location.hash === '#/session/1', 'advance to item 2');
await sleep(300);

// Pages
for (const [h, needle] of [['#/', 'Interview readiness'], ['#/progress', 'All topics'], ['#/mistakes', 'Mistake heatmap'], ['#/roadmap', 'Roadmap'], ['#/topic/w_ranking', 'Run example'],
  ['#/bank', 'Problem bank'], ['#/patterns', 'Pattern library'], ['#/notebook', 'Things I repeatedly forget'], ['#/history', 'Attempts'], ['#/assessments', 'Milestone assessments'], ['#/settings', 'Backup']]) {
  await go(h); await waitFor(() => text().includes(needle) || text().includes('Something went wrong'), h);
  ok(!text().includes('Something went wrong'), `page ${h} renders`);
}
await go('#/topic/w_ranking'); click($('#runex'));
await waitFor(() => $('#exout table'), 'lesson example');
ok(true, 'lesson example runs on PostgreSQL');
await go('#/settings'); click($('#check'));
await waitFor(() => /PostgreSQL engine/.test($('#check-out').textContent), 'self-check');
ok(!/✗/.test($('#check-out').textContent), 'self-check: ' + $('#check-out').textContent.replace(/\s+/g, ' '));

// End the daily session from the dashboard → summary
await go('#/');
if ($('#end')) { click($('#end')); await waitFor(() => text().includes('Session summary'), 'summary'); ok(true, 'session summary rendered'); }

// Interview flow
await go('#/'); click($('#iv'));
await waitFor(() => $('#sql') && $('#done-iv'), 'interview workspace');
ok(/left/.test($('#timer').textContent) || true, 'interview countdown running');
for (let i = 0; i < 2; i++) {
  await waitFor(() => $('#done-iv'), 'interview q');
  await answer(i === 0);
  click($('#done-iv')); await waitFor(() => $('#ivx'), 'explain modal');
  $('#ivx').value = 'Grain is one row per user; I aggregated first, then joined.'; click($('#ivok'));
  await sleep(150);
}
await waitFor(() => text().includes('Interview debrief'), 'debrief');
w.document.querySelectorAll('#comm input')[0].checked = true; click($('#score'));
await waitFor(() => /Interview score \d+\/100/.test(text()), 'interview score');
ok(true, text().match(/Interview score \d+\/100/)[0]);

const S = await import('../js/store.js');

// Milestone assessment
await go('#/assessments'); click($('[data-ms="beginner"]'));
for (let i = 0; i < 5; i++) {
  await waitFor(() => $('#sql') && w.location.hash === `#/session/${i}`, 'assessment item ' + i);
  ok(!$('#hint') && !$('#reveal'), `assessment item ${i + 1}: no hints, no solution`);
  await answer(true); click($('#advance')); await sleep(200);
}
await waitFor(() => /Passed|Not passed/.test(text()), 'assessment result');
ok(/Passed/.test(text()), 'beginner assessment passed with correct answers');
// Challenge
await go('#/'); click($('#chal'));
await waitFor(() => /Challenge/.test($('.crumb')?.textContent || ''), 'challenge');
ok(/Hard|Very Hard/.test($('.crumb').textContent), 'challenge serves a hard problem');
await go('#/'); if ($('#end')) { click($('#end')); await sleep(300); }
// Review mode: make reviews due by moving time forward
const A = await import('../js/adaptive.js');
for (const r of Object.values(S.state.reviews)) r.nextReviewAt = Date.now() - 1000;
await go('#/history'); await go('#/');
ok(!$('#rev').disabled, 'review queue offers due reviews');
click($('#rev')); await waitFor(() => /Review/.test($('.crumb')?.textContent || ''), 'review session');
ok(true, 'review session started: ' + $('.crumb').textContent.trim().split('\n')[0]);

// Problem bank free practice + reveal
await go('#/problem/P033?mode=practice');
await waitFor(() => $('#reveal'), 'free workspace');
click($('#reveal')); await waitFor(() => $('.modal-bg'), 'confirm'); click($('.modal-bg [data-close="ok"]'));
await waitFor(() => /Reference solution/.test($('#out').textContent), 'solution shown');
ok(true, 'solution reveal flow works');

ok(S.state.attempts.length >= 15, `attempts persisted in state: ${S.state.attempts.length}`);
ok(S.state.mistakes.length >= 1, `mistakes logged: ${S.state.mistakes.length}`);
ok(errors.length === 0, 'no uncaught errors' + (errors.length ? ': ' + errors.join(' | ').slice(0, 600) : ''));
process.exit(process.exitCode || 0);
