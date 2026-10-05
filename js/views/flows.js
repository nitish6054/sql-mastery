// Session orchestration: daily sessions, diagnostic, interview, challenge, review, assessments.
import { esc, $, $$, toast, pct, mins, topicName, diffBadge, date, statusBadge } from '../ui.js';
import { PROBLEMS, PROBLEM_BY_ID } from '../content/problems.js';
import { TOPICS, TOPIC_BY_ID, LEVELS } from '../content/curriculum.js';
import * as S from '../store.js';
import * as A from '../adaptive.js';
import { mountWorkspace } from './workspace.js';

const go = (h) => { location.hash = h; };
const MODE = { daily: 'session', review: 'review', challenge: 'challenge', diagnostic: 'diagnostic', assessment: 'assessment', interview: 'interview', mixed: 'review', free: 'practice' };

export async function startDaily() {
  const plan = A.buildDailyPlan(S.state, S.state.derived.mastery);
  if (!plan.length) { toast('Nothing to schedule — open the problem bank.'); return; }
  await S.startSession('daily', plan); go('#/session/0');
}

export async function startDiagnostic() {
  const plan = PROBLEMS.filter(p => p.diagnostic)
    .sort((a, b) => TOPIC_BY_ID[a.topics[0]].level - TOPIC_BY_ID[b.topics[0]].level || A.DIFF_ORDER.indexOf(a.difficulty) - A.DIFF_ORDER.indexOf(b.difficulty))
    .map(p => ({ section: `Level ${TOPIC_BY_ID[p.topics[0]].level}`, problemId: p.id, topicId: p.topics[0], status: 'pending' }));
  await S.startSession('diagnostic', plan); go('#/session/0');
}

export async function startInterview() {
  const seen = new Set(S.state.episodes.map(e => e.problemId));
  const m = S.state.derived.mastery;
  const unlocked = new Set(TOPICS.filter(t => A.isUnlocked(t.id, m, S.state.curriculum)).map(t => t.id));
  const pick = (diffs) => {
    const pool = PROBLEMS.filter(p => diffs.includes(p.difficulty));
    const pref = pool.filter(p => p.topics.every(t => unlocked.has(t)));
    const list = (pref.length ? pref : pool).sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)) || Math.random() - .5);
    return list[0];
  };
  const p1 = pick(['Medium', 'Hard']); const p2 = PROBLEMS.filter(p => ['Hard', 'Very Hard'].includes(p.difficulty) && p.id !== p1.id)
    .sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)) || Math.random() - .5)
    .find(p => p.topics.every(t => unlocked.has(t))) || pick(['Hard', 'Very Hard']);
  const plan = [p1, p2].filter(Boolean).map((p, i) => ({ section: `Question ${i + 1}`, problemId: p.id, topicId: p.topics[0], status: 'pending' }));
  const id = S.uid('I');
  await S.startSession('interview', plan, { deadline: Date.now() + 45 * 60000, interviewId: id });
  await S.saveInterview({ id, startedAt: Date.now(), endedAt: null, problems: plan.map(x => x.problemId), sessionId: S.state.activeSession.id });
  go('#/session/0');
}

export async function startChallenge() {
  const solved = new Set(S.state.episodes.filter(e => A.episodeOutcome(e).solved).map(e => e.problemId));
  const m = S.state.derived.mastery;
  const pool = PROBLEMS.filter(p => ['Hard', 'Very Hard'].includes(p.difficulty) && !solved.has(p.id));
  const fair = pool.filter(p => p.topics.every(t => A.isUnlocked(t, m, S.state.curriculum)));
  const p = (fair.length ? fair : pool)[0] || PROBLEMS.filter(p => p.difficulty === 'Very Hard')[0];
  await S.startSession('challenge', [{ section: 'Challenge', problemId: p.id, topicId: p.topics[0], status: 'pending' }]); go('#/session/0');
}

export function reviewPlan() {
  const used = new Set(); const plan = [];
  for (const r of A.dueReviews(S.state)) {
    let p = null, topicId = null, note = '';
    if (r.kind === 'topic') { topicId = r.refId; p = A.chooseProblem(S.state, topicId, { target: A.targetDifficulty(S.state.derived.mastery[topicId].masteryScore), exclude: used }); note = `Scheduled review: ${topicName(topicId)}`; }
    if (r.kind === 'mistake') {
      const m = S.state.mistakes.find(x => x.id === r.refId); if (!m || m.status === 'resolved') continue;
      topicId = m.topic; const orig = PROBLEM_BY_ID[m.occ[m.occ.length - 1].problemId];
      p = !used.has(orig.id) && Date.now() - m.lastAt > A.DAY / 2 ? orig : A.chooseProblem(S.state, topicId, { exclude: used });
      note = `Re-test of a past mistake: ${m.specific}`;
    }
    if (r.kind === 'pattern') continue; // patterns are reviewed through their topics
    if (p && !used.has(p.id)) { used.add(p.id); plan.push({ section: 'Review', problemId: p.id, topicId, note, status: 'pending' }); }
    if (plan.length >= 8) break;
  }
  return plan;
}
export async function startReview() {
  const plan = reviewPlan();
  if (!plan.length) { toast('Nothing is due for review right now.'); return; }
  await S.startSession('review', plan); go('#/session/0');
}

export async function startMixed() {
  const m = S.state.derived.mastery;
  const practiced = TOPICS.filter(t => m[t.id].problemsAttempted > 0).sort((a, b) => (m[a.id].lastPracticedAt || 0) - (m[b.id].lastPracticedAt || 0));
  const used = new Set(); const plan = [];
  for (const t of practiced) { const p = A.chooseProblem(S.state, t.id, { target: A.targetDifficulty(m[t.id].masteryScore), exclude: used }); if (p) { used.add(p.id); plan.push({ section: 'Mixed review', problemId: p.id, topicId: t.id, status: 'pending' }); } if (plan.length >= 6) break; }
  if (!plan.length) { toast('Practise a few topics first.'); return; }
  await S.startSession('mixed', plan); go('#/session/0');
}

export async function startAssessment(milestoneId) {
  const ms = A.MILESTONES.find(x => x.id === milestoneId);
  const plan = A.pickAssessment(S.state, ms).map((id, i) => ({ section: `${ms.name} ${i + 1}`, problemId: id, topicId: PROBLEM_BY_ID[id].topics[0], status: 'pending' }));
  await S.startSession('assessment', plan, { milestone: milestoneId }); go('#/session/0');
}

export async function openFree(problemId, mode = 'practice') {
  return { problemId, mode };
}

// ---------- Session runner ----------
export async function renderSession(root) {
  const s = S.state.activeSession;
  if (!s) { go('#/'); return () => {}; }
  if (s.cursor >= s.plan.length) { await finish(s); return () => {}; }
  const item = s.plan[s.cursor];
  const last = s.cursor === s.plan.length - 1;
  return mountWorkspace(root, {
    problemId: item.problemId, mode: MODE[s.kind] || 'practice', item, session: s,
    advanceLabel: last ? 'Finish' : 'Next problem',
    onAdvance: async () => { s.cursor++; await S.saveSession(s); go(`#/session/${s.cursor}`); },
  });
}

async function finish(s) {
  if (s.kind === 'diagnostic') return finishDiagnostic(s);
  if (s.kind === 'interview') { await S.endSession(); go(`#/interview/${s.interviewId}`); return; }
  if (s.kind === 'assessment') return finishAssessment(s);
  const done = await S.endSession(); go(`#/summary/${done.id}`);
}

const epFor = (s, problemId) => S.state.episodes.filter(e => e.sessionId === s.id && e.problemId === problemId).sort((a, b) => b.openedAt - a.openedAt);

async function finishDiagnostic(s) {
  const results = s.plan.map(it => {
    const eps = epFor(s, it.problemId); const e = eps.find(x => x.submits > 0) || eps[0];
    return { problemId: it.problemId, topicId: it.topicId, level: TOPIC_BY_ID[it.topicId].level, correct: !!(e && e.solved && e.firstSubmitCorrect), skipped: !e || !!e.skipped || !e.submits, timeMs: e?.activeMs || 0 };
  });
  const placed = new Set();
  const addAncestors = (id) => { if (placed.has(id)) return; placed.add(id); TOPIC_BY_ID[id].prereqs.forEach(addAncestors); };
  results.filter(r => r.correct).forEach(r => PROBLEM_BY_ID[r.problemId].topics.forEach(addAncestors));
  let level = -1;
  for (const L of LEVELS) { const rs = results.filter(r => r.level === L.id); if (!rs.length) continue; if (rs.every(r => r.correct)) level = L.id; else break; }
  const gaps = [...new Set(results.filter(r => !r.correct).map(r => r.topicId))];
  S.state.curriculum.placedTopics = [...placed];
  S.state.curriculum.diagnostic = { at: Date.now(), results, placementLevel: Math.max(0, level + 1 > 7 ? 7 : level + 1), passedThrough: level, gaps, sessionId: s.id };
  S.state.profile.diagnosticDone = true; S.state.profile.onboarded = true;
  await S.saveCurriculum(); await S.saveProfile();
  await S.endSession(); S.recompute();
  go('#/diagnostic');
}

async function finishAssessment(s) {
  const items = s.plan.map(it => {
    const e = epFor(s, it.problemId).find(x => x.submits > 0);
    const p = PROBLEM_BY_ID[it.problemId];
    return { problemId: it.problemId, correct: !!(e && e.solved && e.firstSubmitCorrect), timeMs: e?.activeMs || 0, withinTime: !!e && e.activeMs <= 2 * (p.timeTarget || A.TIME_TARGET_MIN[p.difficulty]) * 60000 };
  });
  const score = items.filter(i => i.correct).length / items.length;
  const rec = { milestone: s.milestone, at: Date.now(), score, passed: score >= 0.8 && items.filter(i => i.correct && !i.withinTime).length <= 1, items, sessionId: s.id };
  S.state.curriculum.assessments.push(rec);
  if (rec.passed && !S.state.curriculum.milestones.includes(s.milestone)) S.state.curriculum.milestones.push(s.milestone);
  await S.saveCurriculum(); await S.endSession();
  go(`#/assessments?last=${rec.at}`);
}

// ---------- Result pages ----------
export function renderDiagnosticResults(root) {
  const d = S.state.curriculum.diagnostic;
  if (!d) { root.innerHTML = '<div class="page"><div class="empty">No diagnostic yet.</div></div>'; return; }
  const m = S.state.derived.mastery;
  const focus = TOPICS.filter(t => !S.state.curriculum.placedTopics.includes(t.id) && A.isUnlocked(t.id, m, S.state.curriculum)).slice(0, 5);
  root.innerHTML = `<div class="page stack"><h1>Your starting point</h1>
    <div class="panel"><h2>Placement: Level ${d.placementLevel} — ${esc(LEVELS[d.placementLevel].name)}</h2>
      <p>${d.passedThrough < 0 ? 'You will start from the foundations. That is the fastest path — the early levels go quickly once each topic is demonstrated.' : `You solved every diagnostic question through Level ${d.passedThrough}. Those topics are unlocked, but they are <b>not</b> marked as mastered: mastery still needs repeated evidence.`}</p>
      <table class="tbl"><thead><tr><th>Level</th><th>Question</th><th>Result</th><th class="num">Time</th></tr></thead><tbody>
      ${d.results.map(r => `<tr><td>${r.level} · ${esc(LEVELS[r.level].name)}</td><td>${esc(PROBLEM_BY_ID[r.problemId].title)} ${diffBadge(PROBLEM_BY_ID[r.problemId].difficulty)}</td>
        <td>${r.correct ? '<span style="color:var(--pass)">Correct</span>' : r.skipped ? '<span class="faint">Skipped</span>' : '<span style="color:var(--fail)">Incorrect</span>'}</td><td class="num">${mins(r.timeMs)}</td></tr>`).join('')}</tbody></table></div>
    <div class="grid g2"><div class="panel"><h2>Knowledge gaps</h2>${d.gaps.length ? `<ul>${d.gaps.map(t => `<li><a href="#/topic/${t}">${esc(topicName(t))}</a></li>`).join('')}</ul>` : '<p>None found at diagnostic depth.</p>'}</div>
    <div class="panel"><h2>Your initial plan</h2><p class="small muted">The daily session engine will start with these, mixing in reviews as you go.</p>
      <ol>${focus.map(t => `<li><a href="#/topic/${t.id}">${esc(t.name)}</a> <span class="faint small">Level ${t.level}</span></li>`).join('')}</ol>
      <button class="btn primary" id="go-daily">Start today's session</button></div></div></div>`;
  $('#go-daily', root).onclick = startDaily;
}

export function renderSummary(root, id) {
  const s = S.state.sessions.find(x => x.id === id);
  if (!s) { root.innerHTML = '<div class="page"><div class="empty">Session not found.</div></div>'; return; }
  const mname = (mid) => S.state.mistakes.find(m => m.id === mid)?.specific || mid;
  root.innerHTML = `<div class="page stack"><h1>Session summary</h1><p class="muted">${date(s.startedAt)} · ${mins(s.durationMs)} · ${esc(s.kind)}</p>
    <div class="grid g4">${[['Attempted', s.attempted], ['Solved', s.solved], ['Accuracy', pct(s.accuracy)], ['Hint-free', pct(s.hintFreeRate)], ['Avg time to solve', mins(s.avgTimeMs)], ['Submissions', s.submits]]
      .map(([l, v]) => `<div class="stat"><div class="v">${v ?? '—'}</div><div class="l">${l}</div></div>`).join('')}</div>
    <div class="grid g2">
      <div class="panel"><h2>Strongest areas</h2>${s.strongest?.length ? s.strongest.map(t => `<span class="chip">${esc(topicName(t))}</span>`).join('') : '<p class="muted small">Not enough evidence yet.</p>'}
        <h2 style="margin-top:14px">Weakest areas</h2>${s.weakAreas?.length ? s.weakAreas.map(t => `<span class="chip">${esc(topicName(t))}</span>`).join('') : '<p class="muted small">None this session.</p>'}</div>
      <div class="panel"><h2>Mistakes</h2><p class="small"><b>New:</b> ${s.newMistakes?.length ? s.newMistakes.map(mname).map(esc).join('; ') : 'none'}</p>
        <p class="small"><b>Repeated:</b> ${s.repeatedMistakes?.length ? s.repeatedMistakes.map(mname).map(esc).join('; ') : 'none'}</p></div>
      <div class="panel"><h2>Concepts to review</h2>${(s.conceptsToReview || []).map(t => `<a class="chip" href="#/topic/${t}">${esc(topicName(t))}</a>`).join('') || '<p class="muted small">Nothing urgent.</p>'}</div>
      <div class="panel"><h2>Recommended next session</h2>${(s.recommendedNext || []).map(t => `<span class="chip">${esc(topicName(t))}</span>`).join('')}
        <div class="row" style="margin-top:12px"><a class="btn primary" href="#/">Back to dashboard</a></div></div></div>
    <div class="panel"><h2>Problems</h2><table class="tbl"><tbody>${s.plan.map(it => `<tr><td>${esc(it.section)}</td><td><a href="#/problem/${it.problemId}?mode=practice">${esc(PROBLEM_BY_ID[it.problemId]?.title)}</a></td><td>${esc(it.status)}</td></tr>`).join('')}</tbody></table></div></div>`;
}

const COMM = ['Restated the question and the output', 'Stated table grain and how joins change it', 'Named edge cases (NULLs, ties, duplicates, boundaries)', 'Validated the result / walked through a row', 'Discussed alternatives or performance'];

export function renderInterview(root, id) {
  const iv = S.state.interviews.find(x => x.id === id);
  if (!iv) { root.innerHTML = '<div class="page"><div class="empty">Interview not found.</div></div>'; return; }
  const sess = S.state.sessions.find(x => x.id === iv.sessionId);
  const rows = iv.problems.map(pid => {
    const p = PROBLEM_BY_ID[pid]; const eps = S.state.episodes.filter(e => e.sessionId === iv.sessionId && e.problemId === pid);
    const e = eps.sort((a, b) => b.submits - a.submits)[0];
    const atts = S.state.attempts.filter(a => a.episodeId === e?.id && a.executionStatus !== 'revealed');
    const last = atts[atts.length - 1];
    return { p, e, solved: !!e?.solved, timeMs: e?.activeMs || 0, hints: e?.hintLevel || 0, quality: atts.filter(a => a.correct)[0]?.quality?.total ?? null,
      edge: last && last.hiddenTotal ? last.hiddenPassed / last.hiddenTotal : (last?.correct ? 1 : 0), explanation: e?.explainText || sess?.plan.find(x => x.problemId === pid)?.explanation || '',
      reasoning: e?.reasoningTotal ? e.reasoningCorrect / e.reasoningTotal : null, clar: e?.clarificationsAsked?.length || 0, confidence: e?.confidence };
  });
  const scored = iv.endedAt != null;
  root.innerHTML = `<div class="page stack"><h1>Interview debrief</h1><p class="muted">${date(iv.startedAt)}${sess ? ` · ${mins((sess.endedAt || Date.now()) - sess.startedAt)} of 45 min` : ''}</p>
    ${rows.map((r, i) => `<div class="panel"><div class="row between"><h2>Question ${i + 1}: ${esc(r.p.title)} ${diffBadge(r.p.difficulty)}</h2><span>${r.solved ? '<b style="color:var(--pass)">Solved</b>' : '<b style="color:var(--fail)">Not solved</b>'}</span></div>
      <p class="small">Time ${mins(r.timeMs)} (target ${r.p.timeTarget} min) · Hints ${r.hints} · Query quality ${r.quality ?? '—'} · Hidden edge cases ${pct(r.edge)} · Clarifying questions asked ${r.clar} · Confidence ${r.confidence ?? '—'}/5 · Business reasoning ${pct(r.reasoning)}</p>
      <p class="small"><b>Your explanation:</b> ${r.explanation ? esc(r.explanation) : '<span class="faint">none written</span>'}</p>
      <details><summary>Reference solution</summary><pre>${esc(r.p.solution)}</pre><p class="small">${esc(r.p.explain)}</p></details></div>`).join('')}
    <div class="panel"><h2>Communication (self-assessment)</h2><p class="small muted">Be strict — tick only what you actually did.</p>
      <div class="checklist" id="comm">${COMM.map((c, i) => `<label><input type="checkbox" data-i="${i}" ${iv.communication?.[i] ? 'checked' : ''} ${scored ? 'disabled' : ''}> ${esc(c)}</label>`).join('')}</div>
      ${scored ? '' : '<button class="btn primary" id="score">Score this interview</button>'}</div>
    <div id="scorebox">${scored ? scoreHtml(iv) : ''}</div></div>`;
  $('#score', root)?.addEventListener('click', async () => {
    const comm = $$('#comm input', root).map(i => i.checked);
    const n = rows.length;
    const solvedFrac = rows.filter(r => r.solved).length / n;
    const parts = {
      correctness: 40 * solvedFrac,
      edgeCases: 10 * rows.reduce((s, r) => s + r.edge, 0) / n,
      queryQuality: 15 * rows.reduce((s, r) => s + (r.quality || 0), 0) / (100 * n),
      time: 10 * rows.filter(r => r.solved && r.timeMs <= r.p.timeTarget * 60000).length / n,
      hintIndependence: 10 * (1 - rows.reduce((s, r) => s + r.hints, 0) / (3 * n)),
      communication: 15 * comm.filter(Boolean).length / COMM.length,
    };
    const rs = rows.filter(r => r.reasoning != null);
    Object.assign(iv, { endedAt: Date.now(), durationMs: sess ? (sess.endedAt || Date.now()) - sess.startedAt : null, communication: comm,
      parts, score: Math.round(Object.values(parts).reduce((a, b) => a + b, 0)), accuracy: solvedFrac,
      hintsUsed: rows.reduce((s, r) => s + r.hints, 0), communicationScore: Math.round(100 * comm.filter(Boolean).length / COMM.length),
      businessReasoningScore: rs.length ? Math.round(100 * rs.reduce((s, r) => s + r.reasoning, 0) / rs.length) : null,
      queryQuality: Math.round(rows.reduce((s, r) => s + (r.quality || 0), 0) / n), edgeCasePerformance: rows.reduce((s, r) => s + r.edge, 0) / n,
      timePerformance: rows.map(r => ({ problemId: r.p.id, ms: r.timeMs, targetMin: r.p.timeTarget })), difficulty: rows.map(r => r.p.difficulty),
      explanations: rows.map(r => r.explanation) });
    iv.readinessAssessment = iv.score >= 80 ? 'Strong — this would likely pass a typical analytics SQL round.' : iv.score >= 65 ? 'Borderline — correct direction, but gaps an interviewer would probe.' : 'Not yet — focus on the weak parts below before the next mock.';
    await S.saveInterview(iv); renderInterview(root, id);
  });
}
function scoreHtml(iv) {
  const p = iv.parts || {};
  return `<div class="panel"><h2>Interview score ${iv.score}/100</h2><p>${esc(iv.readinessAssessment)}</p>
    <div class="qparts">${[['Correctness', p.correctness, 40], ['Edge cases', p.edgeCases, 10], ['Quality', p.queryQuality, 15], ['Time', p.time, 10], ['Hints', p.hintIndependence, 10], ['Communication', p.communication, 15]]
      .map(([n, v, m]) => `<div>${n}<b>${Math.round(v || 0)}/${m}</b></div>`).join('')}</div>
    <p class="small muted">Business reasoning (scored separately): ${iv.businessReasoningScore ?? '—'}%. Communication is self-rated.</p></div>`;
}

export function renderAssessments(root) {
  const cur = S.state.curriculum; const { stats, readiness } = S.state.derived;
  const last = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('last'));
  const lastRec = cur.assessments.find(a => a.at === last);
  const list = A.interviewReadyChecklist(S.state, stats, readiness);
  root.innerHTML = `<div class="page stack"><h1>Milestone assessments</h1>
    <p class="muted">Five problems, one submission each, no hints. Pass = at least 80% correct on the first submission within twice the target time. Unseen problems are preferred; once the bank runs low, you may see problems again.</p>
    ${lastRec ? `<div class="callout ${lastRec.passed ? 'pass' : 'fail'}"><b>${lastRec.passed ? 'Passed' : 'Not passed'}</b> — ${Math.round(lastRec.score * 100)}% correct. ${lastRec.items.map(i => `${esc(PROBLEM_BY_ID[i.problemId].title)}: ${i.correct ? '✓' : '✗'}`).join(' · ')}</div>` : ''}
    <div class="grid g3">${A.MILESTONES.map(ms => { const recs = cur.assessments.filter(a => a.milestone === ms.id); const passed = recs.some(r => r.passed);
      return `<div class="panel"><div class="row between"><h2>${esc(ms.name)}</h2>${passed ? statusBadge('Mastered').replace('Mastered', 'Passed') : ''}</div>
        <p class="small">${esc(ms.desc)}</p><p class="small muted">${recs.length ? `Best ${Math.round(Math.max(...recs.map(r => r.score)) * 100)}% over ${recs.length} attempt(s)` : 'Not attempted'}</p>
        <button class="btn ${passed ? '' : 'primary'}" data-ms="${ms.id}">Start ${esc(ms.name)} assessment</button></div>`; }).join('')}
      <div class="panel"><h2>Interview ready</h2><p class="small">Earned from your record, not from one test.</p>
        <div class="checklist">${list.map(c => `<label><span style="color:var(--${c.ok ? 'pass' : 'ink-3'})">${c.ok ? '✓' : '○'}</span> ${esc(c.label)}</label>`).join('')}</div></div></div>
    <div class="panel"><h2>Capstones</h2><p class="small muted">Senior-analyst style cases combining several concepts.</p>
      ${PROBLEMS.filter(p => p.capstone).map(p => `<div class="row between" style="padding:6px 0;border-top:1px solid var(--line)"><span><b>${esc(p.capstone[0].toUpperCase() + p.capstone.slice(1))} capstone:</b> ${esc(p.title)} ${diffBadge(p.difficulty)}</span><a class="btn sm" href="#/problem/${p.id}?mode=challenge">Open</a></div>`).join('')}</div>
    <div class="panel"><h2>Mixed assessment</h2><p class="small">Six problems from your older topics — a check on what you may be forgetting.</p><button class="btn" id="mixed">Start mixed assessment</button></div></div>`;
  $$('[data-ms]', root).forEach(b => b.onclick = () => startAssessment(b.dataset.ms));
  $('#mixed', root).onclick = startMixed;
}
