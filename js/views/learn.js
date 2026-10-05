import { esc, $, $$, toast, pct, mins, topicName, diffBadge, statusBadge, bar, rel, resultTable, typedConfirm, date } from '../ui.js';
import { PROBLEMS } from '../content/problems.js';
import { TOPICS, TOPIC_BY_ID, LEVELS } from '../content/curriculum.js';
import { DATASETS } from '../content/datasets.js';
import { PATTERNS, PATTERN_BY_ID, PG_VS_MYSQL, PG_FUNCTIONS, INTERVIEW_TIPS, EXPLAIN_PROMPTS } from '../content/patterns.js';
import { exclusive } from '../sql/engine.js';
import * as S from '../store.js';
import * as A from '../adaptive.js';
import { startDaily } from './flows.js';

function problemStatus(id) {
  const eps = S.state.episodes.filter(e => e.problemId === id && (e.submits > 0 || e.solutionRevealed || e.skipped));
  if (!eps.length) return 'new';
  return eps.some(e => A.episodeOutcome(e).solved) ? 'solved' : 'attempted';
}
const statusText = { new: '<span class="faint">New</span>', attempted: '<span style="color:var(--warn)">Attempted</span>', solved: '<span style="color:var(--pass)">Solved</span>' };

export function depMap(mastery, curriculum) {
  const colW = 172, rowH = 50, nodeW = 152, nodeH = 36;
  const pos = {};
  LEVELS.forEach(l => TOPICS.filter(t => t.level === l.id).forEach((t, i) => { pos[t.id] = { x: 12 + l.id * colW, y: 34 + i * rowH }; }));
  const H = 34 + Math.max(...LEVELS.map(l => TOPICS.filter(t => t.level === l.id).length)) * rowH + 10;
  const W = 12 + LEVELS.length * colW;
  const edges = TOPICS.flatMap(t => t.prereqs.map(p => {
    const a = pos[p], b = pos[t.id]; const x1 = a.x + nodeW, y1 = a.y + nodeH / 2, x2 = b.x, y2 = b.y + nodeH / 2;
    const mx = (x1 + x2) / 2;
    return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="var(--line-2)" stroke-width="1"/>`;
  })).join('');
  const heads = LEVELS.map(l => `<text x="${12 + l.id * colW}" y="18" style="font-weight:600;fill:var(--ink-2)">${l.id} · ${esc(l.name)}</text>`).join('');
  const nodes = TOPICS.map(t => {
    const m = mastery[t.id]; const { x, y } = pos[t.id]; const un = A.isUnlocked(t.id, mastery, curriculum);
    const fill = m.masteryScore >= 75 ? 'var(--pass-soft)' : m.masteryScore > 0 ? 'var(--accent-soft)' : 'var(--surface)';
    const name = t.name.length > 24 ? t.name.slice(0, 23) + '…' : t.name;
    return `<a href="#/topic/${t.id}"><rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="5" fill="${fill}" stroke="${un ? 'var(--line-2)' : 'var(--ink-3)'}" ${un ? '' : 'stroke-dasharray="3 3"'}/>
      <rect x="${x}" y="${y + nodeH - 4}" width="${nodeW * m.masteryScore / 100}" height="4" rx="2" fill="${m.masteryScore >= 75 ? 'var(--pass)' : 'var(--accent)'}"/>
      <text x="${x + 8}" y="${y + 15}">${esc(name)}</text><text x="${x + 8}" y="${y + 28}" style="fill:var(--ink-3)">${m.masteryScore}% · ${esc(m.status)}${un ? '' : ' · locked'}</text></a>`;
  }).join('');
  return `<div class="depmap"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:${W}px;height:auto" role="img" aria-label="Concept dependency map">${heads}${edges}${nodes}</svg></div>`;
}

export function renderRoadmap(root) {
  const { mastery } = S.state.derived;
  root.innerHTML = `<div class="page stack"><h1>Roadmap</h1>
    <p class="muted">Arrows are prerequisites. A topic unlocks when its prerequisites reach 40% mastery (or the diagnostic placed you past them). Dashed = locked, but you can still open any lesson. Completion and mastery are tracked separately: reading a lesson is exposure, not mastery.</p>
    ${depMap(mastery, S.state.curriculum)}
    ${LEVELS.map(l => `<div class="panel"><div class="row between"><h2>Level ${l.id} · ${esc(l.name)}</h2><span class="small muted">${esc(l.goal)}</span></div>
      <table class="tbl"><tbody>${TOPICS.filter(t => t.level === l.id).map(t => { const m = mastery[t.id]; return `<tr><td style="width:40%"><a href="#/topic/${t.id}">${esc(t.name)}</a></td>
        <td style="width:22%"><div class="row" style="gap:8px">${bar(m.masteryScore, m.masteryScore >= 75 ? 'pass' : '')}<span class="small">${m.masteryScore}%</span></div></td>
        <td class="small">${esc(m.stage)}</td><td>${statusBadge(m.status)}</td><td class="small faint">${A.problemsForTopic(t.id).length} problems</td></tr>`; }).join('')}</tbody></table></div>`).join('')}</div>`;
}

export async function renderTopic(root, id) {
  const t = TOPIC_BY_ID[id]; if (!t) { root.innerHTML = '<div class="page"><div class="empty">Unknown topic.</div></div>'; return; }
  await S.markLessonViewed(id);
  const m = S.state.derived.mastery[id];
  const probs = A.problemsForTopic(id);
  const next = A.chooseProblem(S.state, id, { target: A.targetDifficulty(m.masteryScore) });
  const note = S.state.notes.find(n => n.targetType === 'topic' && n.targetId === id);
  const root2 = A.rootCausePrereq(S.state, id, S.state.derived.mastery);
  root.innerHTML = `<div class="page stack">
    <div class="crumb"><a href="#/roadmap">Roadmap</a> <span>Level ${t.level} · ${esc(LEVELS[t.level].name)}</span></div>
    <div class="row between"><h1>${esc(t.name)}</h1>${statusBadge(m.status)}</div>
    ${root2 ? `<div class="callout warn">${esc(root2.reason)} <a href="#/topic/${root2.topicId}">Strengthen ${esc(topicName(root2.topicId))} first</a>.</div>` : ''}
    <div class="grid split-b">
      <div class="panel"><p class="lesson-idea">${esc(t.lesson.idea)}</p>
        <h3>Example <span class="faint small">(${esc(DATASETS[t.lesson.dataset].name)})</span></h3><pre id="ex">${esc(t.lesson.example)}</pre>
        <button class="btn sm" id="runex">Run example</button><div id="exout" style="margin-top:8px"></div>
        <h3 style="margin-top:14px">Traps</h3><ul>${t.lesson.traps.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <h3>You should be able to</h3><ul>${t.lesson.objectives.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <div class="row" style="margin-top:14px">${next ? `<a class="btn primary" href="#/problem/${next.id}?mode=learn">Practise this topic</a>` : ''}
          ${m.conceptOnly ? `<button class="btn primary" id="go-session">${S.state.activeSession ? 'Continue my session' : "I've read this — start my first session"}</button>` : ''}
          ${t.level >= 2 ? '<a class="btn" href="#/patterns">Pattern library</a>' : '<a class="btn" href="#/roadmap">Roadmap</a>'}</div></div>
      <div class="stack"><div class="panel"><h2>Your progress</h2>
        <p class="small">Mastery <b>${m.masteryScore}%</b> · stage <b>${esc(m.stage)}</b> · trend ${esc(m.trend)}</p>
        <p class="small">Accuracy ${pct(m.accuracy)} · first attempt ${pct(m.firstAttemptAcc)} · hint-free ${pct(m.hintFreeAcc)} · avg ${mins(m.avgTimeMs)} · best ${mins(m.bestTimeMs)}</p>
        <p class="small">Hardest solved: ${esc(m.difficultyReached || '—')} · next review ${rel(m.nextReviewAt)} · recurring mistakes ${m.repeatedMistakes}</p>
        <p class="small muted">Prerequisites: ${t.prereqs.length ? t.prereqs.map(p => `<a href="#/topic/${p}">${esc(topicName(p))}</a> (${S.state.derived.mastery[p].masteryScore}%)`).join(', ') : 'none'}</p>
        <button class="btn sm ghost" id="reset-topic">Reset topic progress</button></div>
      <div class="panel"><h2>Problems</h2><table class="tbl"><tbody>${probs.map(p => `<tr><td><a href="#/problem/${p.id}?mode=learn">${esc(p.title)}</a></td><td>${diffBadge(p.difficulty)}</td><td>${statusText[problemStatus(p.id)]}</td></tr>`).join('')}</tbody></table></div>
      <div class="panel"><h2>Notes</h2><textarea id="tnote" rows="5">${esc(note?.text || '')}</textarea><button class="btn sm" id="tsave" style="margin-top:6px">Save note</button></div></div></div></div>`;
  $('#runex', root).onclick = async () => {
    try { const r = await exclusive(async (run) => { await run.reset(DATASETS[t.lesson.dataset].setup); return run.run(t.lesson.example); }); $('#exout', root).innerHTML = resultTable(r); }
    catch (e) { $('#exout', root).innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  };
  $('#go-session', root)?.addEventListener('click', () => S.state.activeSession ? (location.hash = `#/session/${S.state.activeSession.cursor}`) : startDaily());
  $('#tsave', root).onclick = async () => { await S.saveNote('topic', id, $('#tnote', root).value); toast('Note saved'); };
  $('#reset-topic', root).onclick = async () => {
    if (await typedConfirm('Reset topic', `Mastery and review scheduling for <b>${esc(t.name)}</b> will start again from now. Your attempt history is kept.`, 'RESET')) { await S.resetTopic(id); toast('Topic progress reset'); renderTopic(root, id); }
  };
}

export function renderBank(root) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const lv = q.get('level') ?? '', df = q.get('diff') ?? '', st = q.get('status') ?? '';
  const rows = PROBLEMS.filter(p => (lv === '' || TOPIC_BY_ID[p.topics[0]].level === Number(lv)) && (df === '' || p.difficulty === df) && (st === '' || problemStatus(p.id) === st));
  const sel = (name, opts, v) => `<select data-f="${name}"><option value="">All</option>${opts.map(([val, label]) => `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  root.innerHTML = `<div class="page stack"><h1>Problem bank</h1>
    <p class="muted small">Free practice. Daily sessions choose for you; use this when you want a specific problem. Titles describe the business question, not the technique.</p>
    <div class="row small">Level ${sel('level', LEVELS.map(l => [l.id, `${l.id} · ${l.name}`]), lv)} Difficulty ${sel('diff', A.DIFF_ORDER.map(d => [d, d]), df)} Status ${sel('status', [['new', 'New'], ['attempted', 'Attempted'], ['solved', 'Solved']], st)}</div>
    <div class="panel tight"><table class="tbl data"><thead><tr><th>ID</th><th>Problem</th><th>Domain</th><th>Level</th><th>Difficulty</th><th>Status</th><th>Last attempt</th></tr></thead><tbody>
    ${rows.map(p => { const last = S.state.attempts.filter(a => a.problemId === p.id).sort((a, b) => b.timestamp - a.timestamp)[0];
      return `<tr data-id="${p.id}"><td class="faint">${p.id}</td><td>${esc(p.title)}${p.capstone ? ' <span class="chip">capstone</span>' : ''}</td><td class="small">${esc(p.domain)}</td><td>${TOPIC_BY_ID[p.topics[0]].level}</td><td>${diffBadge(p.difficulty)}</td><td>${statusText[problemStatus(p.id)]}</td><td class="small">${last ? rel(last.timestamp) : ''}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
  $$('select[data-f]', root).forEach(s => s.onchange = () => { const p = new URLSearchParams(); $$('select[data-f]', root).forEach(x => x.value !== '' && p.set(x.dataset.f, x.value)); location.hash = '#/bank?' + p; });
  $$('tr[data-id]', root).forEach(tr => tr.onclick = () => { location.hash = `#/problem/${tr.dataset.id}?mode=practice`; });
}

export function renderPatterns(root, focus) {
  const pm = Object.fromEntries(S.state.derived.patterns.map(p => [p.id, p]));
  root.innerHTML = `<div class="page stack"><h1>Pattern library</h1><p class="muted">Recognise the shape of a problem first; the syntax follows. Mastery here is earned only by solving the linked problems.</p>
    ${PATTERNS.map(pt => { const m = pm[pt.id]; return `<div class="panel" id="pat-${pt.id}"><div class="row between"><h2>${esc(pt.name)}</h2><span class="small">Mastery ${m.mastery}% · ${m.problemsEncountered}/${m.problemIds.length} problems seen${m.nextReview ? ` · review ${rel(m.nextReview)}` : ''}</span></div>
      <div class="grid g2"><div><h3>How to recognise it</h3><ul class="small">${pt.clues.map(c => `<li>${esc(c)}</li>`).join('')}</ul><h3>Thought process</h3><p class="small">${esc(pt.thinking)}</p><h3>Technique</h3><p class="small">${esc(pt.technique)}</p></div>
      <div><h3>Example</h3><pre>${esc(pt.example)}</pre><h3>Common mistakes</h3><ul class="small">${pt.mistakes.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      <h3>Related problems</h3>${m.problemIds.map(id => `<a class="chip" href="#/problem/${id}?mode=practice">${esc(PROBLEMS.find(p => p.id === id).title)} · ${problemStatus(id)}</a>`).join('') || '<span class="small muted">—</span>'}</div></div></div>`; }).join('')}</div>`;
  if (focus) setTimeout(() => document.getElementById('pat-' + focus)?.scrollIntoView({ block: 'start' }), 30);
}

export function renderNotebook(root) {
  const general = S.state.notes.find(n => n.targetType === 'general');
  const notes = S.state.notes.filter(n => n.targetType !== 'general' && n.text?.trim()).sort((a, b) => b.updatedAt - a.updatedAt);
  const ms = S.state.mistakes.slice().sort((a, b) => b.lastAt - a.lastAt);
  const forget = ms.filter(m => m.occurrences >= 2);
  const practicedTopics = TOPICS.filter(t => S.state.derived.mastery[t.id].problemsAttempted > 0);
  const link = (n) => n.targetType === 'problem' ? `#/problem/${n.targetId}?mode=practice` : n.targetType === 'topic' ? `#/topic/${n.targetId}` : '#/notebook';
  root.innerHTML = `<div class="page stack"><h1>Notebook</h1><p class="muted">Your personal SQL reference, built from your own mistakes and notes.</p>
    <div class="panel"><h2>Scratchpad</h2><textarea id="gnote" rows="5">${esc(general?.text || '')}</textarea><button class="btn sm" id="gsave" style="margin-top:6px">Save</button></div>
    <div class="grid g2">
      <div class="panel"><h2>Things I repeatedly forget</h2>${forget.length ? forget.map(m => `<p class="small"><b>${m.occurrences}× ${esc(m.specific)}</b><br>${esc(m.concept)}</p>`).join('') : '<p class="small muted">Recurring mistakes will collect here.</p>'}</div>
      <div class="panel"><h2>My notes</h2>${notes.length ? notes.map(n => `<p class="small"><a href="${link(n)}">${esc(n.targetType)}: ${esc(n.targetType === 'topic' ? topicName(n.targetId) : (PROBLEMS.find(p => p.id === n.targetId)?.title || n.targetId))}</a><br>${esc(n.text.slice(0, 240))}</p>`).join('') : '<p class="small muted">Notes you add to problems and topics appear here.</p>'}</div>
    </div>
    <div class="panel"><h2>Mistakes and corrected approaches</h2>${ms.length ? ms.slice(0, 30).map(m => { const o = m.occ[m.occ.length - 1]; const c = m.correctedBy[m.correctedBy.length - 1];
      return `<details><summary><b>${esc(m.specific)}</b> <span class="faint small">${esc(m.category)} · ${m.occurrences}× · ${esc(m.status)}</span></summary><p class="small">${esc(m.concept)}</p>
        ${o?.sql ? `<p class="small muted">What I wrote${o.intent ? ` (trying to: ${esc(o.intent)})` : ''}:</p><pre>${esc(o.sql)}</pre>` : ''}${c ? `<p class="small muted">Corrected:</p><pre>${esc(c.sql)}</pre>` : ''}</details>`; }).join('') : '<p class="small muted">Empty — mistakes are recorded automatically when a submission is wrong.</p>'}</div>
    <div class="panel"><h2>Common traps in topics I've practised</h2>${practicedTopics.length ? practicedTopics.map(t => `<p class="small"><b>${esc(t.name)}:</b> ${t.lesson.traps.map(esc).join(' ')}</p>`).join('') : '<p class="small muted">Appears as you practise.</p>'}</div>
    <div class="panel"><h2>Explain-it-back history</h2>${S.state.explains.length ? S.state.explains.slice().reverse().map(x => `<details><summary>${esc(EXPLAIN_PROMPTS.find(e => e.id === x.promptId)?.q || x.promptId)} <span class="faint small">${Math.round(x.score * 100)}% · ${date(x.at)}</span></summary><p class="small">${esc(x.text)}</p></details>`).join('') : '<p class="small muted">You\'ll occasionally be asked to explain a concept in your own words after solving.</p>'}</div>
    <div class="grid g2"><div class="panel"><h2>PostgreSQL functions</h2><table class="tbl"><tbody>${PG_FUNCTIONS.map(([f, d]) => `<tr><td class="mono">${esc(f)}</td><td class="small" style="white-space:normal">${esc(d)}</td></tr>`).join('')}</tbody></table></div>
      <div class="panel"><h2>Interview tips</h2><ul class="small">${INTERVIEW_TIPS.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      <h2>Performance lessons</h2><ul class="small"><li>Filter early (WHERE) and aggregate before joining large child tables.</li><li>Correlated subqueries run per row; a pre-aggregated join or window is usually cheaper.</li><li>UNION sorts to deduplicate; prefer UNION ALL when duplicates are impossible or wanted.</li><li>EXISTS can stop at the first match; COUNT(*) > 0 scans everything.</li><li>Functions on indexed columns in WHERE (e.g. DATE(ts) = …) prevent index use; use ranges.</li></ul></div></div>
    <div class="panel"><h2>PostgreSQL vs MySQL — interview differences</h2><table class="tbl"><thead><tr><th>Task</th><th>PostgreSQL</th><th>MySQL</th></tr></thead><tbody>${PG_VS_MYSQL.map(([a, b, c]) => `<tr><td class="small">${esc(a)}</td><td class="mono small">${esc(b)}</td><td class="mono small">${esc(c)}</td></tr>`).join('')}</tbody></table></div></div>`;
  $('#gsave', root).onclick = async () => { await S.saveNote('general', 'scratch', $('#gnote', root).value); toast('Saved'); };
}
