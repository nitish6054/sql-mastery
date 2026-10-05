// Problem workspace. Handles every mode: learn, practice/session, challenge, review, diagnostic, assessment, interview.
import { esc, $, $$, md, resultTable, rowsTable, toast, modal, confirmDialog, diffBadge, clock, topicName, drafts, mins } from '../ui.js';
import { PROBLEM_BY_ID } from '../content/problems.js';
import { DATASETS } from '../content/datasets.js';
import { TOPIC_BY_ID, ERROR_CATEGORIES, PROCESS_STEPS } from '../content/curriculum.js';
import { PATTERN_BY_ID, EXPLAIN_PROMPTS } from '../content/patterns.js';
import { gradeProblem, scoreQuality, splitStatements } from '../grader.js';
import { diagnose } from '../diagnose.js';
import { exclusive } from '../sql/engine.js';
import * as S from '../store.js';
import { chooseProblem, targetDifficulty, TIME_TARGET_MIN, DAY } from '../adaptive.js';

const STRICT = new Set(['diagnostic', 'assessment']);       // one submission, no hints
const MODE_LABEL = { learn: 'Learn', practice: 'Practice', session: "Today's session", challenge: 'Challenge', review: 'Review',
  diagnostic: 'Diagnostic', assessment: 'Milestone assessment', interview: 'Interview' };

export async function mountWorkspace(root, { problemId, mode, item = null, session = null, onAdvance = null, advanceLabel = 'Next problem' }) {
  const p = PROBLEM_BY_ID[problemId];
  if (!p) { root.innerHTML = `<div class="page"><div class="empty">Problem ${esc(problemId)} not found.</div></div>`; return () => {}; }
  const ds = DATASETS[p.dataset];
  const ep = await S.openEpisode(p.id, mode, { planSection: item?.section || null });
  const target = (p.timeTarget || TIME_TARGET_MIN[p.difficulty]) * 60000;
  let lastGrade = null, busy = false, done = false, tab = 'problem';
  const strict = STRICT.has(mode);
  const showSkillsUpfront = mode === 'learn';
  const interview = mode === 'interview';

  if (item?.lesson) await S.markLessonViewed(item.topicId);

  root.innerHTML = `
  <div class="ws">
    <section class="ws-left">
      <div class="ws-head">
        <div class="crumb"><span>${esc(MODE_LABEL[mode] || mode)}${item ? ` · ${esc(item.section)}` : ''}${session?.plan ? ` · ${session.cursor + 1} of ${session.plan.length}` : ''}</span>
          ${diffBadge(p.difficulty)} <span>${esc(p.domain)}</span> <span class="faint">${esc(p.id)}</span></div>
        <h1>${esc(p.title)}</h1>
        <div class="crumb"><span>Target ${p.timeTarget || TIME_TARGET_MIN[p.difficulty]} min</span>
          <span id="skills">${showSkillsUpfront ? `Skills: ${esc(p.skills)}` : '<span class="faint">Skills tested are revealed after your first submission</span>'}</span></div>
      </div>
      <div class="tabs" role="tablist">
        ${['problem', 'schema', 'data', 'notes'].map(t => `<button role="tab" data-tab="${t}" class="${t === tab ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
      </div>
      <div class="tab-body" id="tabbody"></div>
    </section>
    <section class="ws-right">
      <div class="toolbar">
        <button class="btn" id="run" title="Ctrl/Cmd + Enter">Run</button>
        <button class="btn primary" id="submit" title="Ctrl/Cmd + Shift + Enter">Submit</button>
        <button class="btn ghost" id="reset">Reset editor</button>
        ${strict ? '' : `<button class="btn ghost" id="hint">${interview ? 'Request hint' : 'Hint'} (0/3)</button>`}
        ${strict || interview ? '' : '<button class="btn ghost" id="reveal">Show solution</button>'}
        ${mode === 'diagnostic' ? '<button class="btn ghost" id="skip">I don\'t know this yet</button>' : ''}
        ${session && !strict && !interview ? '<button class="btn ghost" id="skip">Skip</button>' : ''}
        ${interview ? '<button class="btn ghost" id="done-iv">Done with this problem</button>' : ''}
        <span class="timer" id="timer">00:00</span>
      </div>
      <div class="editor"><div class="gutter" id="gutter">1</div>
        <textarea class="sql" id="sql" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="SQL editor"></textarea></div>
      <div class="out" id="out"><p class="muted small">Write a query, <b>Run</b> it against the sample data as often as you like, then <b>Submit</b> to grade it against the sample and hidden test cases. Runs are not graded.</p></div>
    </section>
  </div>`;

  const sqlEl = $('#sql', root), gutter = $('#gutter', root), out = $('#out', root);
  sqlEl.value = drafts.get(p.id) || `-- ${p.title}\n`;
  const syncGutter = () => { const n = sqlEl.value.split('\n').length; gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); gutter.scrollTop = sqlEl.scrollTop; };
  syncGutter();
  sqlEl.addEventListener('input', () => { syncGutter(); drafts.set(p.id, sqlEl.value); });
  sqlEl.addEventListener('scroll', () => gutter.scrollTop = sqlEl.scrollTop);
  sqlEl.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); const s = sqlEl.selectionStart; sqlEl.setRangeText('  ', s, sqlEl.selectionEnd, 'end'); syncGutter(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.shiftKey ? submit() : run(); }
  });

  // ---- Tabs ----
  const renderTab = async () => {
    $$('.tabs button', root).forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const body = $('#tabbody', root);
    if (tab === 'problem') body.innerHTML = problemTab();
    if (tab === 'schema') body.innerHTML = schemaTab();
    if (tab === 'notes') {
      const n = S.state.notes.find(x => x.targetType === 'problem' && x.targetId === p.id);
      body.innerHTML = `<p class="small muted">Private notes for this problem (saved locally).</p><textarea id="note" rows="10">${esc(n?.text || '')}</textarea>
        <div class="row" style="margin-top:8px"><button class="btn sm" id="save-note">Save note</button></div>`;
      $('#save-note', body).onclick = async () => { await S.saveNote('problem', p.id, $('#note', body).value); toast('Note saved'); };
    }
    if (tab === 'data') {
      body.innerHTML = '<p class="muted small">Loading sample data…</p>';
      try {
        const parts = await exclusive(async (r) => { await r.reset(ds.setup); const res = []; for (const t of ds.tables) res.push([t.name, await r.run(`SELECT * FROM ${t.name} LIMIT 100`)]); return res; });
        body.innerHTML = `<p class="small muted">Sample data. Hidden tests add or change a few rows to probe edge cases.</p>` +
          parts.map(([n, r]) => `<h3 class="mono" style="margin-top:14px">${esc(n)} <span class="faint small">${r.rows.length} rows</span></h3>${resultTable(r)}`).join('');
      } catch (e) { body.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
    }
    wireProblemTab();
  };
  $$('.tabs button', root).forEach(b => b.onclick = () => { tab = b.dataset.tab; renderTab(); });

  function problemTab() {
    const t = TOPIC_BY_ID[item?.topicId];
    const lesson = item?.lesson && t ? `<div class="callout" style="margin-bottom:14px"><b>New concept: ${esc(t.name)}</b>
      <p class="small" style="margin:6px 0">${esc(t.lesson.idea)}</p><details><summary>Example and traps</summary><pre>${esc(t.lesson.example)}</pre>
      <ul class="small">${t.lesson.traps.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details></div>` : '';
    const note = item?.note ? `<div class="callout warn small" style="margin-bottom:12px">${esc(item.note)}</div>` : '';
    const reasoning = (p.reasoning || []).length && mode !== 'diagnostic' ? `<h3 style="margin-top:18px">Before you write SQL</h3>
      <p class="small muted">Pin down the metric definition. These are scored separately as business reasoning.</p>
      ${p.reasoning.map((q, i) => `<div class="mcq" data-q="${i}"><p class="small"><b>${esc(q.q)}</b></p>${q.options.map((o, j) => {
        const chosen = ep.reasoningAnswers[i]; const cls = chosen == null ? '' : j === q.answer ? 'right' : j === chosen ? 'wrong' : '';
        return `<label class="${cls}"><input type="radio" name="rq${i}" value="${j}" ${chosen != null ? 'disabled' : ''} ${chosen === j ? 'checked' : ''}> ${esc(o)}</label>`;
      }).join('')}${ep.reasoningAnswers[i] != null ? `<p class="small muted">${esc(q.why)}</p>` : ''}</div>`).join('')}` : '';
    const clar = (p.clarifications || []).length && !strict ? (interview || mode === 'challenge'
      ? `<h3 style="margin-top:18px">Clarifying questions</h3><p class="small muted">Ask before you code — good candidates do.</p>${p.clarifications.map((c, i) => `<div style="margin:6px 0">
          ${ep.clarificationsAsked.includes(i) ? `<p class="small"><b>Q:</b> ${esc(c.q)}<br><b>A:</b> ${esc(c.a)}</p>` : `<button class="btn sm" data-ask="${i}">Ask: ${esc(c.q)}</button>`}</div>`).join('')}`
      : `<details style="margin-top:14px"><summary>Clarifications you might ask</summary>${p.clarifications.map(c => `<p class="small"><b>${esc(c.q)}</b> ${esc(c.a)}</p>`).join('')}</details>`) : '';
    return `${note}${lesson}<div class="prompt">${md(p.prompt)}</div>
      <h3>Expected output</h3><p class="small">${p.output.map(c => `<code>${esc(c)}</code>`).join(' ')}<br><span class="muted">${p.orderMatters ? 'Row order is checked.' : 'Row order is not checked.'} Numbers are compared to 2 decimals; column names should match.</span></p>
      ${reasoning}${clar}`;
  }
  function wireProblemTab() {
    $$('.mcq input', root).forEach(inp => inp.onchange = async () => {
      const i = Number(inp.closest('.mcq').dataset.q), j = Number(inp.value);
      if (ep.reasoningAnswers[i] != null) return;
      ep.reasoningAnswers[i] = j; ep.reasoningTotal++; if (j === p.reasoning[i].answer) ep.reasoningCorrect++;
      await S.saveEpisode(ep); renderTab();
    });
    $$('[data-ask]', root).forEach(b => b.onclick = async () => { ep.clarificationsAsked.push(Number(b.dataset.ask)); await S.saveEpisode(ep); renderTab(); });
  }
  function schemaTab() {
    return `<p class="small muted">${esc(ds.description)}</p>` + ds.tables.map(t => `<div class="schema-table"><h4>${esc(t.name)}</h4>
      <div class="grain">Grain: ${esc(t.grain)}</div>
      <table class="tbl"><tbody>${t.columns.map(([c, ty, n]) => `<tr><td class="mono">${esc(c)}</td><td class="mono faint">${esc(ty)}</td><td class="small muted">${esc(n)}</td></tr>`).join('')}</tbody></table></div>`).join('');
  }
  renderTab();

  // ---- Timer ----
  const timerEl = $('#timer', root);
  const iv = setInterval(() => {
    S.tick(ep, document.visibilityState === 'visible');
    if (interview && session?.deadline) {
      const left = session.deadline - Date.now();
      timerEl.textContent = `${clock(left)} left`; timerEl.classList.toggle('over', left < 0);
    } else { timerEl.textContent = clock(ep.activeMs); timerEl.classList.toggle('over', ep.activeMs > target); }
  }, 1000);
  const saver = setInterval(() => S.saveEpisode(ep), 30000);

  // ---- Run ----
  async function run() {
    if (busy) return; busy = true; $('#run', root).disabled = true;
    out.innerHTML = '<p class="muted small">Running…</p>';
    const sql = sqlEl.value;
    try {
      const res = await exclusive(async (r) => { await r.reset(ds.setup); return r.run(sql); });
      ep.runs++; ep.runsSinceSubmit++;
      out.innerHTML = `<div class="row between small muted" style="margin-bottom:6px"><span>${res.totalRows ?? res.rows.length} row(s) · sample data</span>${res.truncated ? '<span>Truncated</span>' : ''}</div>${resultTable(res)}`;
    } catch (e) { out.innerHTML = errorBlock(e, sql); }
    busy = false; $('#run', root).disabled = false;
  }

  function errorBlock(e, sql) {
    let caret = '';
    if (e.position) {
      const pos = Number(e.position) - 1; const before = sql.slice(0, pos); const line = before.split('\n').length; const col = pos - before.lastIndexOf('\n');
      caret = `<p class="small muted">Line ${line}, column ${col}: <code>${esc(sql.split('\n')[line - 1]?.trim().slice(0, 80) || '')}</code></p>`;
    }
    return `<div class="callout fail"><div class="err">${esc(e.message)}</div>${caret}</div>`;
  }

  // ---- Submit ----
  async function askConfidence() {
    return modal(`<h2>How confident are you?</h2><p class="small muted">Rate before seeing the result. It's compared with your actual performance to spot over- and under-confidence.</p>
      <div class="conf">${[1, 2, 3, 4, 5].map(n => `<button class="btn" data-close="${n}">${n}</button>`).join('')}</div>
      <div class="row between small muted"><span>1 = guessing</span><span>5 = certain</span></div>`).then(v => v == null ? null : Number(v));
  }

  async function submit() {
    if (busy || done && strict) return;
    const sql = sqlEl.value;
    if (!splitStatements(sql).length) { toast('Write a query first'); return; }
    const needConf = mode !== 'diagnostic' && ep.submits === 0 && (interview || (p.difficulty !== 'Easy' && (S.state.profile.submitCount % 3 === 0)));
    const confidence = needConf ? await askConfidence() : null;
    busy = true; $('#submit', root).disabled = true; out.innerHTML = '<p class="muted small">Grading against sample and hidden tests…</p>';
    let grade, costRatio = null;
    try {
      ({ grade, costRatio } = await exclusive(async (r) => {
        const g = await gradeProblem(r, p, ds.setup, sql);
        let cr = null;
        const stmts = splitStatements(sql);
        if (g.allPassed && stmts.length === 1) {
          try { await r.reset(ds.setup); const a = await r.explainCost(stmts[0]); const b = await r.explainCost(p.solution.replace(/;\s*$/, '')); cr = b > 0 ? a / b : null; } catch {}
        }
        return { grade: g, costRatio: cr };
      }));
    } catch (e) { out.innerHTML = errorBlock(e, sql); busy = false; $('#submit', root).disabled = false; return; }
    const quality = scoreQuality({ problem: p, sql, grade, costRatio });
    const diagnosis = grade.allPassed ? [] : diagnose({ problem: p, sql, grade });
    const attempt = await S.recordSubmission(ep, { sql, grade, quality, diagnosis, confidence, costRatio });
    lastGrade = grade;
    if (item && grade.allPassed) { item.status = 'solved'; await S.saveSession(session); }
    else if (item && item.status === 'pending') { item.status = 'attempted'; await S.saveSession(session); }
    if (grade.allPassed) drafts.clear(p.id);
    $('#skills', root).innerHTML = `Skills: ${esc(p.skills)}`;
    if (strict) { done = true; $('#submit', root).disabled = true; }
    else $('#submit', root).disabled = false;
    busy = false;
    renderFeedback(grade, quality, attempt, sql);
  }

  function ledger(grade) {
    const total = grade.totalCases;
    const cases = [...grade.cases];
    while (cases.length < total) cases.push({ name: 'Not run', skipped: true });
    return `<div class="ledger">${cases.map(c => `<div class="case ${c.skipped ? '' : c.passed ? 'pass' : 'fail'}"><div class="n">${esc(c.isSample ? 'Sample data' : c.name)}</div>
      <div class="s">${c.skipped ? 'not run' : c.passed ? 'passed' : c.error ? 'error' : 'failed'}</div></div>`).join('')}</div>`;
  }

  function renderFeedback(grade, quality, attempt, sql) {
    const passed = grade.cases.filter(c => c.passed).length;
    let html = `<div class="verdict ${grade.allPassed ? 'pass' : 'fail'}">${grade.allPassed ? 'Correct' : 'Not yet'}<small>${passed} of ${grade.totalCases} test cases passed · attempt ${ep.submits}</small></div>${ledger(grade)}`;
    if (strict) {
      html += `<p class="muted small">${mode === 'diagnostic' ? 'Diagnostic questions are graded once; detailed feedback comes in practice.' : 'Assessment questions are graded once.'}</p>
        ${onAdvance ? `<button class="btn primary" id="advance">${esc(advanceLabel)}</button>` : ''}`;
      out.innerHTML = html; wireFeedback(); return;
    }
    const sample = grade.cases.find(c => c.isSample);
    if (grade.error && sample?.error) html += errorBlock(grade.error, sql);
    if (grade.allPassed) {
      const q = quality.parts;
      html += `<h3>Query quality ${quality.total}/100</h3><div class="qparts">
        ${[['Correctness', q.correctness, 40], ['Logic', q.logic, 20], ['Readability', q.readability, 10], ['Robustness', q.robustness, 10], ['Efficiency', q.efficiency, 10], ['Technique', q.technique, 10]]
          .map(([n, v, m]) => `<div>${n}<b>${v}/${m}</b></div>`).join('')}</div>
        ${quality.notes.length ? `<ul class="small">${quality.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        ${sample?.cmp?.nameMismatch ? `<p class="small callout warn">${esc(sample.cmp.message)}</p>` : ''}
        <h3 style="margin-top:14px">Why it works</h3><p>${esc(p.explain)}</p>
        ${(p.patterns || []).length ? `<p class="small">Pattern: ${p.patterns.map(id => `<a class="chip" href="#/patterns/${id}">${esc(PATTERN_BY_ID[id].name)}</a>`).join('')} — a frequent interview pattern; review its recognition clues.</p>` : ''}
        <details><summary>Compare with the reference solution</summary><pre>${esc(p.solution)}</pre></details>
        ${['Hard', 'Very Hard'].includes(p.difficulty) ? processBlock() : ''}
        ${explainBackBlock()}`;
    } else {
      if (sample && !sample.passed && sample.cmp) {
        const c = sample.cmp;
        html += `<p><b>Sample data:</b> ${esc(c.message)}</p>`;
        if (c.missing?.length) html += `<p class="small muted">Expected rows missing from your result (up to 5):</p>${rowsTable(c.fields, c.missing, 'miss')}`;
        if (c.extra?.length) html += `<p class="small muted" style="margin-top:8px">Rows in your result that shouldn't be there (up to 5):</p>${rowsTable(grade.sampleActual.fields, c.extra, 'extra')}`;
        if (grade.sampleActual) html += `<details><summary>Your full result on the sample data</summary>${resultTable(grade.sampleActual)}</details>`;
      } else if (sample?.passed) {
        html += `<p>Your query works on the sample data but fails ${grade.hiddenTotal - grade.hiddenPassed} hidden edge case(s). The sample data is not the whole truth.</p>`;
      }
      const ms = attempt.mistakeIds.map(id => S.state.mistakes.find(m => m.id === id)).filter(Boolean);
      html += ms.map(m => `<div class="diag" data-mid="${esc(m.id)}"><div class="cat">${esc(m.category)}</div><h3 style="margin:2px 0 6px">${esc(m.specific)}</h3>
        <p class="small"><b>Likely root cause:</b> ${esc(m.rootCause)}</p><p class="small"><b>Concept:</b> ${esc(m.concept)}</p>
        ${m.occurrences >= 2 ? `<p class="callout warn small">You have made this mistake ${m.occurrences} times.</p>` : ''}
        <div class="row small" style="margin-top:8px"><label>Real cause? <select data-cause>${['(auto) ' + m.category, ...ERROR_CATEGORIES].map(c => `<option ${m.userRootCause === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>
        <textarea data-intent rows="2" placeholder="What were you trying to do? (helps your notebook)" style="margin-top:6px"></textarea>
        <div class="row" style="margin-top:6px"><button class="btn sm" data-save-m>Save to mistake log</button>${remediationLink(m)}</div></div>`).join('');
      html += `<div class="row" style="margin-top:10px"><button class="btn" id="again">Try again</button>
        ${ep.hintLevel < 3 ? '<button class="btn ghost" id="hint2">Get a hint</button>' : ''}
        ${!interview ? `<button class="btn ghost" id="reveal2">Show solution${ep.submits < 3 ? ' (after a few attempts)' : ''}</button>` : ''}</div>`;
    }
    if (grade.allPassed && onAdvance && interview) html += `<div class="row" style="margin-top:16px"><button class="btn primary" id="advance">Explain your solution</button></div>`;
    else if (grade.allPassed && onAdvance) html += `<div class="row" style="margin-top:16px"><button class="btn primary" id="advance">${esc(advanceLabel)}</button></div>`;
    else if (grade.allPassed) html += nextInTopicBlock();
    out.innerHTML = html; wireFeedback();
  }

  function remediationLink(m) {
    const t = m.topic; const next = chooseProblem(S.state, t, { target: 'Easy', exclude: new Set([p.id]) });
    return next ? `<a class="btn sm ghost" href="#/problem/${next.id}?mode=practice">Targeted practice: ${esc(topicName(t))}</a>` : '';
  }
  function nextInTopicBlock() {
    const t = p.topics[0]; const m = S.state.derived.mastery[t];
    const next = chooseProblem(S.state, t, { target: targetDifficulty(m.masteryScore), exclude: new Set([p.id]) });
    return `<div class="row" style="margin-top:16px">${next ? `<a class="btn primary" href="#/problem/${next.id}?mode=${mode === 'learn' ? 'learn' : 'practice'}">Next in ${esc(topicName(t))}</a>` : ''}
      <a class="btn" href="#/">Back to dashboard</a></div>`;
  }
  function processBlock() {
    return `<details style="margin-top:12px"><summary>Problem-solving process check (tracks your habits over time)</summary>
      <div class="checklist" id="proc">${PROCESS_STEPS.map((s, i) => `<label><input type="checkbox" data-i="${i}" ${ep.processChecklist?.[i] ? 'checked' : ''}> ${esc(s)}</label>`).join('')}</div>
      <button class="btn sm" id="save-proc">Save</button></details>`;
  }
  function explainBackBlock() {
    const recent = new Set(S.state.explains.filter(x => Date.now() - x.at < 14 * DAY).map(x => x.promptId));
    const pr = EXPLAIN_PROMPTS.find(e => p.topics.includes(e.topic) && !recent.has(e.id));
    if (!pr || (S.state.profile.submitCount % 3 !== 1 && !interview)) return '';
    return `<div class="panel tight" style="margin-top:14px" id="xb"><h3>Explain it back</h3><p class="small">${esc(pr.q)}</p>
      <textarea id="xb-text" rows="4" placeholder="In your own words, without notes"></textarea>
      <button class="btn sm" id="xb-go" data-p="${pr.id}" style="margin-top:6px">Check against key points</button><div id="xb-res"></div></div>`;
  }

  function wireFeedback() {
    $('#advance', out)?.addEventListener('click', interview ? () => $('#done-iv', root).click() : advance);
    $('#again', out)?.addEventListener('click', () => sqlEl.focus());
    $('#hint2', out)?.addEventListener('click', hint);
    $('#reveal2', out)?.addEventListener('click', reveal);
    $$('[data-save-m]', out).forEach(b => b.onclick = async () => {
      const box = b.closest('.diag'); const m = S.state.mistakes.find(x => x.id === box.dataset.mid);
      const cause = $('[data-cause]', box).value; m.userRootCause = cause.startsWith('(auto)') ? null : cause;
      const intent = $('[data-intent]', box).value.trim();
      if (intent) { const o = m.occ[m.occ.length - 1]; o.intent = intent; }
      await S.saveMistake(m); toast('Saved to mistake log');
    });
    $('#save-proc', out)?.addEventListener('click', async () => {
      ep.processChecklist = $$('#proc input', out).map(i => i.checked); await S.saveEpisode(ep); toast('Process check saved');
    });
    $('#xb-go', out)?.addEventListener('click', async (e) => {
      const pr = EXPLAIN_PROMPTS.find(x => x.id === e.target.dataset.p); const text = $('#xb-text', out).value.trim();
      if (text.length < 20) { toast('Write a few sentences first'); return; }
      $('#xb-res', out).innerHTML = `<p class="small muted" style="margin-top:8px">Tick each key point your explanation genuinely covered:</p>
        <div class="checklist">${pr.points.map((pt, i) => `<label><input type="checkbox" data-k="${i}"> ${esc(pt)}</label>`).join('')}</div>
        <button class="btn sm" id="xb-save">Save self-assessment</button>`;
      $('#xb-save', out).onclick = async () => {
        const hits = $$('[data-k]', out).map(i => i.checked);
        await S.saveExplain({ id: S.uid('X'), promptId: pr.id, topic: pr.topic, text, pointsHit: hits, score: hits.filter(Boolean).length / hits.length, at: Date.now() });
        $('#xb', out).innerHTML = `<p class="small">Explain-it-back saved: ${hits.filter(Boolean).length}/${hits.length} key points.</p>`;
      };
    });
  }

  // ---- Hints / solution / skip ----
  async function hint() {
    if (ep.hintLevel >= 3) return;
    if (interview && !(await confirmDialog('Request a hint?', 'Hints are allowed in interviews but lower your interview score.', 'Show hint'))) return;
    const lvl = ep.hintLevel + 1; await S.useHint(ep, lvl);
    const label = ['Nudge', 'Approach', 'Strong hint'][lvl - 1];
    const hb = $('#hint', root); if (hb) hb.textContent = `${interview ? 'Request hint' : 'Hint'} (${lvl}/3)`;
    const box = document.createElement('div'); box.className = 'callout'; box.style.margin = '0 16px 12px';
    box.innerHTML = `<b>${label}:</b> ${esc(p.hints[lvl - 1])}`;
    out.before(box);
  }
  async function reveal() {
    const early = ep.submits < 2 && !ep.solved;
    if (!(await confirmDialog('Show the solution?', early ? 'You have made fewer than two attempts. Seeing the solution now counts as not solved and schedules this topic for review sooner. Struggling a little longer is where learning happens.' : 'This counts as not solved for this problem and schedules a review.', 'Show solution'))) return;
    await S.revealSolution(ep);
    if (item) { item.status = 'revealed'; await S.saveSession(session); }
    out.innerHTML = `<h3>Reference solution</h3><pre>${esc(p.solution)}</pre><p>${esc(p.explain)}</p>
      <p class="small muted">Retype it from memory later — this problem comes back in your review queue.</p>
      ${onAdvance ? `<button class="btn primary" id="advance">${esc(advanceLabel)}</button>` : nextInTopicBlock()}`;
    wireFeedback();
  }
  async function skip() {
    if (mode === 'diagnostic') { await S.skipProblem(ep); if (item) item.status = 'skipped'; await S.saveSession(session); advance(); return; }
    if (item) { item.status = 'skipped'; await S.saveSession(session); }
    advance();
  }
  async function advance() { cleanup(); onAdvance ? onAdvance() : (location.hash = '#/'); }

  $('#run', root).onclick = run;
  $('#submit', root).onclick = submit;
  $('#reset', root).onclick = async () => { if (await confirmDialog('Reset the editor?', 'Your current draft will be cleared.', 'Reset')) { sqlEl.value = `-- ${p.title}\n`; drafts.clear(p.id); syncGutter(); } };
  $('#hint', root)?.addEventListener('click', hint);
  $('#reveal', root)?.addEventListener('click', reveal);
  $('#skip', root)?.addEventListener('click', skip);
  $('#done-iv', root)?.addEventListener('click', async () => {
    const text = await modal(`<h2>Explain your solution</h2><p class="small muted">As you would say it to the interviewer: approach, grain, edge cases, trade-offs.</p>
      <textarea id="ivx" rows="7"></textarea><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn primary" id="ivok">Save and continue</button></div>`,
      { onMount: (m, close) => { $('#ivok', m).onclick = () => close($('#ivx', m).value); } });
    if (text == null) return;
    ep.explainText = text; item && (item.explanation = text, item.status = item.status === 'pending' ? 'attempted' : item.status);
    await S.saveEpisode(ep); await S.saveSession(session); advance();
  });

  let cleaned = false;
  function cleanup() {
    if (cleaned) return; cleaned = true;
    clearInterval(iv); clearInterval(saver);
    S.closeEpisode(ep);
  }
  return cleanup;
}
