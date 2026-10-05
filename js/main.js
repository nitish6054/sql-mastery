// Boot + hash router.
import { esc, $, $$, applyTheme, toast } from './ui.js';
import * as S from './store.js';
import { initEngine, onEngineEvent } from './sql/engine.js';
import { loadPacks } from './packs.js';
import { requestPersistentStorage, openDB } from './db.js';
import { renderDashboard, renderWelcome } from './views/dashboard.js';
import { mountWorkspace } from './views/workspace.js';
import { renderSession, renderDiagnosticResults, renderSummary, renderInterview, renderAssessments } from './views/flows.js';
import { renderRoadmap, renderTopic, renderBank, renderPatterns, renderNotebook } from './views/learn.js';
import { renderProgress, renderMistakes, renderHistory, renderWeekly } from './views/insights.js';
import { renderSettings } from './views/settings.js';
import { dueReviews } from './adaptive.js';

let cleanup = null;
const app = document.getElementById('app');

function shell() {
  app.innerHTML = `<div class="app"><nav class="rail" aria-label="Main">
    <div class="brand">SQL Mastery <span>pg</span></div>
    <div class="nav" id="nav">
      <a href="#/" data-r="">Dashboard</a>
      <a href="#/session" data-r="session">Current session</a>
      <div class="nav-group">Practise</div>
      <a href="#/roadmap" data-r="roadmap">Roadmap & lessons</a>
      <a href="#/bank" data-r="bank">Problem bank</a>
      <a href="#/assessments" data-r="assessments">Assessments</a>
      <div class="nav-group">Insight</div>
      <a href="#/progress" data-r="progress">Progress</a>
      <a href="#/mistakes" data-r="mistakes">Mistake log <span class="count" id="mcount"></span></a>
      <a href="#/patterns" data-r="patterns">Patterns</a>
      <a href="#/notebook" data-r="notebook">Notebook</a>
      <a href="#/history" data-r="history">History</a>
      <div class="nav-group">Data</div>
      <a href="#/settings" data-r="settings">Settings & backup</a>
    </div>
    <div class="rail-foot"><span class="engine-dot" id="edot"></span><span id="estatus">Starting PostgreSQL…</span></div>
  </nav><main class="main" id="view"></main></div>`;
  onEngineEvent((e) => {
    const dot = $('#edot'), st = $('#estatus'); if (!dot) return;
    if (e.type === 'ready') { dot.className = 'engine-dot ok'; st.textContent = 'PostgreSQL ' + (e.version.match(/PostgreSQL ([\d.]+)/)?.[1] || '') + ' · offline'; }
    if (e.type === 'loading') { dot.className = 'engine-dot'; st.textContent = 'Starting PostgreSQL…'; }
    if (e.type === 'fatal') { dot.className = 'engine-dot bad'; st.textContent = 'SQL engine failed: ' + e.message; }
    if (e.type === 'notice') toast(e.message, 4000);
  });
}

async function route() {
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  const hash = location.hash.replace(/^#\/?/, '');
  const [path] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  const view = $('#view');
  const q = new URLSearchParams(hash.split('?')[1] || '');
  $$('#nav a').forEach(a => a.classList.toggle('active', (a.dataset.r || '') === (parts[0] || '')));
  const open = S.state.mistakes.filter(m => m.status !== 'resolved').length; $('#mcount').textContent = open || '';
  view.className = 'main';
  window.scrollTo(0, 0);
  try {
    if (!S.state.profile.onboarded && !['session', 'settings', 'diagnostic'].includes(parts[0])) return renderWelcome(view);
    switch (parts[0] || '') {
      case '': return renderDashboard(view);
      case 'session': cleanup = await renderSession(view); return;
      case 'problem': cleanup = await mountWorkspace(view, { problemId: parts[1], mode: q.get('mode') || 'practice' }); return;
      case 'diagnostic': return renderDiagnosticResults(view);
      case 'summary': return renderSummary(view, parts[1]);
      case 'interview': return renderInterview(view, parts[1]);
      case 'assessments': return renderAssessments(view);
      case 'roadmap': return renderRoadmap(view);
      case 'topic': return await renderTopic(view, parts[1]);
      case 'bank': return renderBank(view);
      case 'patterns': return renderPatterns(view, parts[1]);
      case 'notebook': return renderNotebook(view);
      case 'progress': renderProgress(view); if (location.hash.includes('#readiness')) document.getElementById('readiness')?.scrollIntoView(); return;
      case 'mistakes': return renderMistakes(view);
      case 'history': return renderHistory(view);
      case 'weekly': return await renderWeekly(view, parts[1]);
      case 'settings': return await renderSettings(view);
      default: view.innerHTML = '<div class="page"><div class="empty">Page not found. <a href="#/">Go to the dashboard</a>.</div></div>';
    }
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="page"><div class="callout fail"><b>Something went wrong on this page.</b><p class="err">${esc(e.stack || e.message)}</p><p class="small">Your data is safe in IndexedDB. Try the dashboard, or reload.</p></div></div>`;
  }
}

async function boot() {
  applyTheme();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  if (location.protocol === 'file:') {
    app.innerHTML = `<div class="page"><div class="callout fail"><h2>Open this app through the local server</h2><p>Browsers block the SQL engine when a page is opened as a file. In the app folder run <code>node server.js</code> (or <code>python3 -m http.server 5173</code>) and open <code>http://localhost:5173</code>.</p></div></div>`;
    return;
  }
  shell();
  initEngine().catch(() => {});
  try {
    await openDB();
    await loadPacks();
    await S.loadState();
  } catch (e) {
    $('#view').innerHTML = `<div class="page"><div class="callout fail"><h2>Could not open your learning database</h2><p class="err">${esc(e.message)}</p><p>Private/incognito windows and some strict privacy settings disable IndexedDB. Use a normal window.</p></div></div>`;
    return;
  }
  requestPersistentStorage().catch(() => {});
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', () => { if (S.state.activeSession) S.saveSession(); });
  route();
}
boot();
