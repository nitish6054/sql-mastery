import { esc, $, $$, toast, pct, mins, topicName, diffBadge, statusBadge, bar, rel, date, dateTime, lineChart } from '../ui.js';
import { PROBLEM_BY_ID } from '../content/problems.js';
import { TOPICS, ERROR_CATEGORIES, PROCESS_STEPS, LEVELS } from '../content/curriculum.js';
import { PATTERN_BY_ID } from '../content/patterns.js';
import * as S from '../store.js';
import * as A from '../adaptive.js';

const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

export function renderProgress(root) {
  const { mastery, stats, readiness, patterns } = S.state.derived;
  const snaps = S.state.snapshots.slice().sort((a, b) => a.at - b.at);
  const eps = S.state.episodes.filter(e => e.submits > 0 || e.solutionRevealed);
  const outs = eps.map(e => ({ e, ...A.episodeOutcome(e), p: PROBLEM_BY_ID[e.problemId] })).filter(o => o.p);
  const byDiff = A.DIFF_ORDER.map(d => {
    const s = outs.filter(o => o.solved && o.p.difficulty === d).map(o => o.e.activeMs).sort((a, b) => a - b);
    return [d, s.length, avg(s), s.length ? s[Math.floor(s.length / 2)] : null, s.length ? s.filter(x => x <= A.TIME_TARGET_MIN[d] * 60000).length / s.length : null];
  });
  const pressured = S.state.attempts.filter(a => ['interview', 'challenge', 'assessment'].includes(a.mode) && a.executionStatus !== 'revealed' && a.executionStatus !== 'skipped');
  const relaxed = S.state.attempts.filter(a => !['interview', 'challenge', 'assessment', 'diagnostic'].includes(a.mode) && a.executionStatus !== 'revealed' && a.executionStatus !== 'skipped');
  const hintDist = [0, 1, 2, 3].map(h => outs.filter(o => o.solved && (o.e.hintLevel || 0) === h).length);
  const revealed = outs.filter(o => o.e.solutionRevealed).length;
  const conf = [1, 2, 3, 4, 5].map(c => { const xs = eps.filter(e => e.confidence === c); return [c, xs.length, xs.length ? xs.filter(e => e.firstSubmitCorrect).length / xs.length : null]; });
  const calib = (c, acc) => acc == null ? '' : acc < (c - 1) / 4 - 0.25 ? 'overconfident' : acc > (c - 1) / 4 + 0.35 ? 'underconfident' : 'calibrated';
  const reasonEps = eps.filter(e => e.reasoningTotal);
  const procEps = eps.filter(e => e.processChecklist).sort((a, b) => a.openedAt - b.openedAt);
  const half = Math.ceil(procEps.length / 2);
  const stepRate = (list, i) => list.length ? list.filter(e => e.processChecklist[i]).length / list.length : null;

  root.innerHTML = `<div class="page stack"><h1>Progress</h1>
    <div class="grid g4">${[['Overall mastery', `${stats.overall}%`], ['Current level', `${stats.currentLevel} · ${LEVELS[stats.currentLevel].name}`], ['Solved / attempted', `${stats.solved} / ${stats.attempted}`], ['Submissions', stats.submits],
      ['First-attempt accuracy', pct(stats.firstAttemptAcc)], ['Overall accuracy', pct(stats.accuracy)], ['Hint-free solving', pct(stats.hintFree)], ['Median time to solve', mins(stats.medianTimeMs)]]
      .map(([l, v]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
    <div class="panel"><h2>Over time</h2>${lineChart([
      { name: 'Overall mastery', color: 'var(--accent)', values: snaps.map(s => ({ x: s.date.slice(5), y: s.overallMastery })) },
      { name: 'Readiness', color: 'var(--pass)', values: snaps.map(s => ({ x: s.date.slice(5), y: s.readiness })) },
      { name: 'Accuracy %', color: 'var(--warn)', values: snaps.map(s => ({ x: s.date.slice(5), y: (s.accuracy || 0) * 100 })) }])}</div>
    <div class="panel" id="readiness"><h2>SQL interview readiness: ${readiness.score} / 100</h2>
      <p class="small muted">A weighted model of your own record. It does not guarantee interview outcomes. Rates are scaled down until there is enough evidence behind them.${readiness.lowEvidence ? ' <b>Low evidence so far.</b>' : ''}</p>
      <table class="tbl"><thead><tr><th>Component</th><th class="num">Weight</th><th>Your level</th><th class="num">Points</th><th>How it's measured</th></tr></thead><tbody>
      ${readiness.components.map(c => `<tr><td>${esc(c.name)}</td><td class="num">${c.weight}</td><td><div class="row" style="gap:8px">${bar(c.value * 100)}<span class="small">${Math.round(c.value * 100)}%</span></div></td><td class="num">${c.points}</td><td class="small" style="white-space:normal">${esc(c.why)}</td></tr>`).join('')}</tbody></table>
      <p class="small" style="margin-top:10px">Rough benchmarks: ${readiness.benchmarks.map(b => `<span class="chip" style="${b.met ? 'background:var(--pass-soft);color:var(--pass)' : ''}">${esc(b.name)} ≥ ${b.score}</span>`).join('')}</p></div>
    <div class="panel"><h2>All topics</h2><div class="tbl-wrap" style="max-height:none"><table class="tbl"><thead><tr><th>Topic</th><th>Lvl</th><th>Mastery</th><th class="num">Accuracy</th><th class="num">1st try</th><th class="num">Hint-free</th><th class="num">Solved</th><th class="num">Avg time</th><th>Stage</th><th>Status</th><th>Trend</th><th>Review</th></tr></thead><tbody>
      ${TOPICS.map(t => { const m = mastery[t.id]; return `<tr><td><a href="#/topic/${t.id}">${esc(t.name)}</a></td><td>${t.level}</td><td><div class="row" style="gap:6px">${bar(m.masteryScore, m.masteryScore >= 75 ? 'pass' : '')}<span class="small">${m.masteryScore}%</span></div></td>
        <td class="num">${pct(m.accuracy)}</td><td class="num">${pct(m.firstAttemptAcc)}</td><td class="num">${pct(m.hintFreeAcc)}</td><td class="num">${m.problemsSolved}/${m.problemsAvailable}</td><td class="num">${mins(m.avgTimeMs)}</td>
        <td class="small">${esc(m.stage)}</td><td>${statusBadge(m.status)}</td><td class="small">${esc(m.trend)}</td><td class="small">${m.nextReviewAt ? rel(m.nextReviewAt) : ''}</td></tr>`; }).join('')}</tbody></table></div>
      <p class="small muted">Stages: Exposure (seen) → Practice (solved once) → Competence (repeatedly, on different days) → Mastery (≥75% plus an unseen problem solved first try without hints) → Fluency (mastery plus three recent solves within target time).</p></div>
    <div class="grid g2">
      <div class="panel"><h2>Time</h2><table class="tbl"><thead><tr><th>Difficulty</th><th class="num">Solved</th><th class="num">Average</th><th class="num">Median</th><th class="num">Within target</th></tr></thead><tbody>
        ${byDiff.map(([d, n, a, m, w]) => `<tr><td>${diffBadge(d)} <span class="faint small">&lt;${A.TIME_TARGET_MIN[d]}m</span></td><td class="num">${n}</td><td class="num">${mins(a)}</td><td class="num">${mins(m)}</td><td class="num">${pct(w)}</td></tr>`).join('')}</tbody></table>
        <p class="small" style="margin-top:8px">Accuracy under time pressure (interview, challenge, assessment): <b>${pct(pressured.length ? pressured.filter(a => a.correct).length / pressured.length : null)}</b> vs relaxed practice <b>${pct(relaxed.length ? relaxed.filter(a => a.correct).length / relaxed.length : null)}</b>.</p></div>
      <div class="panel"><h2>Hint dependency</h2><table class="tbl"><tbody>${['No hint', 'Hint 1', 'Hint 2', 'Strong hint'].map((l, i) => `<tr><td>${l}</td><td class="num">${hintDist[i]} solved</td></tr>`).join('')}<tr><td>Solution revealed</td><td class="num">${revealed}</td></tr></tbody></table>
        <p class="small">Hint-free solving rate: <b>${pct(stats.hintFree)}</b></p></div>
      <div class="panel"><h2>Confidence vs reality</h2><table class="tbl"><thead><tr><th>Confidence</th><th class="num">Times</th><th class="num">Right first time</th><th>Read</th></tr></thead><tbody>
        ${conf.map(([c, n, a]) => `<tr><td>${c}/5</td><td class="num">${n}</td><td class="num">${pct(a)}</td><td class="small">${n >= 3 ? calib(c, a) : ''}</td></tr>`).join('')}</tbody></table>
        <p class="small muted">Asked on some submissions before you see the result.</p></div>
      <div class="panel"><h2>Business reasoning (separate from SQL)</h2>
        <p>Metric-definition questions: <b>${pct(reasonEps.length ? reasonEps.reduce((s, e) => s + e.reasoningCorrect, 0) / reasonEps.reduce((s, e) => s + e.reasoningTotal, 0) : null)}</b> correct over ${reasonEps.reduce((s, e) => s + e.reasoningTotal, 0)} questions.</p>
        <p class="small muted">Covers numerator/denominator, unit of analysis, grain, time windows, exclusions and ambiguous rules. Perfect SQL on the wrong metric is still wrong.</p></div>
    </div>
    <div class="panel"><h2>Problem-solving process</h2>${procEps.length ? `<p class="small muted">Self-reported on ${procEps.length} hard problems. Earlier half vs recent half.</p><table class="tbl"><tbody>${PROCESS_STEPS.map((s, i) => `<tr><td>${esc(s)}</td><td class="num">${pct(stepRate(procEps.slice(0, half), i))}</td><td class="num">${pct(stepRate(procEps.slice(half), i))}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">After solving a Hard problem, tick which steps you actually did. Trends show here.</p>'}</div>
    <div class="panel"><h2>Patterns</h2><table class="tbl"><tbody>${patterns.map(p => `<tr><td><a href="#/patterns/${p.id}">${esc(PATTERN_BY_ID[p.id].name)}</a></td><td style="width:30%">${bar(p.mastery, p.mastery >= 75 ? 'pass' : '')}</td><td class="num small">${p.mastery}%</td><td class="small">${p.lastPracticed ? rel(p.lastPracticed) : 'not practised'}</td></tr>`).join('')}</tbody></table></div>
    <div class="panel"><h2>Weekly reviews</h2>${S.state.weekly.length ? S.state.weekly.slice().reverse().map(w => `<a class="chip" href="#/weekly/${w.id}">${date(w.at)} · after ${w.sessionIndex} sessions</a>`).join('') : '<p class="small muted">Generated every 7 completed sessions.</p>'}</div></div>`;
}

export function renderMistakes(root) {
  const filter = new URLSearchParams(location.hash.split('?')[1] || '').get('status') || 'open';
  const all = S.state.mistakes.slice().sort((a, b) => b.lastAt - a.lastAt);
  const list = all.filter(m => filter === 'all' || (filter === 'open' ? m.status !== 'resolved' : m.status === 'resolved'));
  const weeks = 8, now = Date.now(), wk = 7 * A.DAY;
  const grid = ERROR_CATEGORIES.map(c => [c, Array.from({ length: weeks }, (_, i) => all.filter(m => m.category === c).reduce((s, m) => s + m.occ.filter(o => o.at > now - (weeks - i) * wk && o.at <= now - (weeks - i - 1) * wk).length, 0))]);
  const max = Math.max(1, ...grid.flatMap(([, v]) => v));
  const heat = (v) => v ? `background: color-mix(in srgb, var(--fail) ${Math.round(20 + 70 * v / max)}%, var(--surface))` : '';
  const blindTopics = Object.entries(all.filter(m => m.status !== 'resolved').reduce((o, m) => (o[m.topic] = (o[m.topic] || 0) + m.occurrences, o), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recurring = all.filter(m => m.occurrences >= 2 && m.status !== 'resolved');
  root.innerHTML = `<div class="page stack"><h1>Mistake log</h1>
    <p class="muted">Every wrong submission is diagnosed and recorded. A mistake resolves after two clean solves in its topic without repeating it; resolved mistakes stay in history.</p>
    ${recurring.map(m => `<div class="callout warn row between"><span>You have made this mistake <b>${m.occurrences} times</b>: ${esc(m.specific)}.</span>${practiceLink(m)}</div>`).join('')}
    <div class="grid g2"><div class="panel"><h2>Mistake heatmap</h2><p class="small muted">Occurrences per category, last 8 weeks (oldest → this week).</p>
      <table class="heat"><tbody>${grid.map(([c, v]) => `<tr><th>${esc(c)}</th>${v.map(x => `<td style="${heat(x)}">${x || ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="panel"><h2>My SQL blind spots</h2>${blindTopics.length ? blindTopics.map(([t, n]) => `<div class="row between" style="padding:4px 0"><a href="#/topic/${t}">${esc(topicName(t))}</a><span class="small">${n} open occurrence(s)</span></div>`).join('') : '<p class="small muted">Blind spots appear once mistakes repeat.</p>'}
        ${recurring.length ? `<h3 style="margin-top:12px">Recurring</h3>${recurring.map(m => `<p class="small">${esc(m.specific)} <span class="faint">(${esc(m.category)})</span></p>`).join('')}` : ''}</div></div>
    <div class="row small">Show: ${['open', 'resolved', 'all'].map(s => `<a class="btn sm ${s === filter ? 'primary' : ''}" href="#/mistakes?status=${s}">${s}</a>`).join('')}</div>
    <div class="panel tight">${list.length ? list.map(m => `<details style="border-top:1px solid var(--line);padding:6px 0"><summary><span class="row between" style="display:inline-flex;width:calc(100% - 20px)"><span><b>${esc(m.specific)}</b> <span class="faint small">${esc(m.id)}</span></span>
        <span class="small">${esc(m.userRootCause || m.category)} · ${m.occurrences}× · ${esc(m.status)} · last ${rel(m.lastAt)}</span></span></summary>
      <div style="padding:8px 4px"><p class="small"><b>Topic:</b> ${esc(topicName(m.topic))} · <b>Severity:</b> ${m.severity} · <b>First seen:</b> ${date(m.firstAt)} · <b>Successful corrections:</b> ${m.successfulCorrections} · <b>Next review:</b> ${m.nextReviewAt ? rel(m.nextReviewAt) : '—'}</p>
        <p class="small"><b>Root cause:</b> ${esc(m.rootCause)}</p><p class="small"><b>Correct concept:</b> ${esc(m.concept)}</p>
        <label class="small"><input type="checkbox" data-und="${esc(m.id)}" ${m.understood ? 'checked' : ''}> I understand the correction</label>
        ${m.occ.slice().reverse().map(o => `<div style="margin-top:8px"><p class="small muted">${dateTime(o.at)} · ${esc(PROBLEM_BY_ID[o.problemId]?.title || o.problemId)} ${diffBadge(o.difficulty || PROBLEM_BY_ID[o.problemId]?.difficulty || '')}${o.intent ? ` · trying to: ${esc(o.intent)}` : ''}</p>${o.sql ? `<pre>${esc(o.sql)}</pre>` : ''}</div>`).join('')}
        ${m.correctedBy.length ? `<p class="small muted">Corrected query:</p><pre>${esc(m.correctedBy[m.correctedBy.length - 1].sql)}</pre>` : ''}
        <div class="row">${practiceLink(m)}<a class="btn sm ghost" href="#/problem/${m.occ[m.occ.length - 1].problemId}?mode=review">Re-test original problem</a></div></div></details>`).join('') : '<div class="empty">No mistakes in this view.</div>'}</div></div>`;
  $$('[data-und]', root).forEach(cb => cb.onchange = async () => { const m = S.state.mistakes.find(x => x.id === cb.dataset.und); m.understood = cb.checked; await S.saveMistake(m); toast('Saved'); });
}
function practiceLink(m) {
  const p = A.chooseProblem(S.state, m.topic, { target: 'Medium', exclude: new Set(m.occ.map(o => o.problemId)) }) || A.chooseProblem(S.state, m.topic, {});
  return p ? `<a class="btn sm" href="#/problem/${p.id}?mode=review">Targeted practice</a>` : '';
}

export function renderHistory(root) {
  const sessions = S.state.sessions.filter(s => s.endedAt && !s.discarded).sort((a, b) => b.startedAt - a.startedAt);
  const atts = S.state.attempts.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 150);
  root.innerHTML = `<div class="page stack"><h1>History</h1>
    <div class="panel"><h2>Sessions</h2>${sessions.length ? `<table class="tbl"><thead><tr><th>Date</th><th>Type</th><th class="num">Attempted</th><th class="num">Solved</th><th class="num">Accuracy</th><th class="num">Duration</th><th></th></tr></thead><tbody>
      ${sessions.map(s => `<tr><td>${dateTime(s.startedAt)}</td><td>${esc(s.kind)}</td><td class="num">${s.attempted}</td><td class="num">${s.solved}</td><td class="num">${pct(s.accuracy)}</td><td class="num">${mins(s.durationMs)}</td>
        <td>${s.kind === 'interview' ? `<a href="#/interview/${s.interviewId}">Debrief</a>` : `<a href="#/summary/${s.id}">Summary</a>`}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No completed sessions yet.</p>'}</div>
    <div class="panel"><h2>Interviews</h2>${S.state.interviews.length ? S.state.interviews.slice().reverse().map(i => `<a class="chip" href="#/interview/${i.id}">${date(i.startedAt)} · ${i.score != null ? i.score + '/100' : 'not scored'}</a>`).join('') : '<p class="small muted">None yet.</p>'}</div>
    <div class="panel"><h2>Attempts</h2><p class="small muted">Every submission is kept — newer attempts never overwrite older ones.</p><div class="tbl-wrap" style="max-height:520px"><table class="tbl"><thead><tr><th>When</th><th>Problem</th><th>Mode</th><th>Result</th><th class="num">Score</th><th class="num">Hints</th><th class="num">Time</th></tr></thead><tbody>
      ${atts.map(a => `<tr><td class="small">${dateTime(a.timestamp)}</td><td><a href="#/problem/${a.problemId}?mode=practice">${esc(PROBLEM_BY_ID[a.problemId]?.title || a.problemId)}</a></td><td class="small">${esc(a.mode)}</td>
        <td>${a.executionStatus === 'revealed' ? '<span class="faint">solution shown</span>' : a.executionStatus === 'skipped' ? '<span class="faint">skipped</span>' : a.correct ? '<span style="color:var(--pass)">correct</span>' : `<span style="color:var(--fail)">${esc(a.executionStatus === 'ok' ? 'wrong' : a.executionStatus)}</span>`}</td>
        <td class="num">${a.score ?? ''}</td><td class="num">${a.hintLevel || 0}</td><td class="num">${mins(a.timeSpentMs)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
}

export async function renderWeekly(root, id) {
  const w = S.state.weekly.find(x => x.id === id);
  if (!w) { root.innerHTML = '<div class="page"><div class="empty">Weekly review not found.</div></div>'; return; }
  if (!w.viewed) { w.viewed = true; const db = await import('../db.js'); await db.put('weekly_reviews', w); }
  const d = w.data; const arrow = (a, b, f = (x) => x) => `${a == null ? '—' : f(a)} → <b>${b == null ? '—' : f(b)}</b>`;
  root.innerHTML = `<div class="page stack"><h1>Weekly review</h1><p class="muted">${date(w.at)} · after ${w.sessionIndex} sessions</p>
    <div class="grid g4">${[['Mastery', arrow(d.masteryFrom, d.masteryTo, x => x + '%')], ['Accuracy', arrow(d.accuracyFrom, d.accuracyTo, x => pct(x))], ['Avg solve time', arrow(d.avgTimeFrom, d.avgTimeTo, mins)], ['Hint-free', arrow(d.hintFreeFrom, d.hintFreeTo, x => pct(x))]]
      .map(([l, v]) => `<div class="stat"><div class="v" style="font-size:17px">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
    <div class="grid g2"><div class="panel"><h2>Difficulty mix this week</h2><p>${Object.entries(d.difficultyMix).map(([k, v]) => `${diffBadge(k)} ${v}`).join(' ') || '—'}</p>
      <h2>Readiness now</h2><p>${d.readinessTo}/100</p></div>
      <div class="panel"><h2>Top strengths</h2>${d.strengths.map(t => `<span class="chip">${esc(topicName(t))}</span>`).join('')}<h2 style="margin-top:12px">Top weaknesses</h2>${d.weaknesses.map(t => `<span class="chip">${esc(topicName(t))}</span>`).join('')}</div>
      <div class="panel"><h2>Most common mistakes</h2>${d.commonMistakes.map(x => `<p class="small">${x.n}× ${esc(S.state.mistakes.find(m => m.id === x.id)?.specific || x.id)}</p>`).join('') || '<p class="small muted">None — clean week.</p>'}</div>
      <div class="panel"><h2>At risk of being forgotten</h2>${d.atRisk.map(t => `<span class="chip">${esc(topicName(t))}</span>`).join('') || '<p class="small muted">Nothing due soon.</p>'}
        <h2 style="margin-top:12px">Recommended next week</h2><p class="small">Run the mixed assessment over older topics, then daily sessions focused on the weaknesses above.</p><a class="btn primary" href="#/assessments">Mixed assessment</a></div></div></div>`;
}
