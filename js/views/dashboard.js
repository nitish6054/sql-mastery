import { esc, $, pct, mins, topicName, diffBadge, statusBadge, bar, rel } from '../ui.js';
import { PROBLEM_BY_ID, PROBLEMS } from '../content/problems.js';
import { TOPICS, LEVELS } from '../content/curriculum.js';
import * as S from '../store.js';
import * as A from '../adaptive.js';
import { startDaily, startDiagnostic, startChallenge, startReview, startInterview, reviewPlan } from './flows.js';

export function renderWelcome(root) {
  root.innerHTML = `<div class="page stack">
    <h1>Learn SQL from zero to interview-ready</h1>
    <p class="muted">No prior SQL needed. Each topic starts with a short lesson, then you solve real problems on real PostgreSQL in this browser. New topics unlock as you show you can use the earlier ones. About 80% of your time is spent solving, and your history stays on this device.</p>
    <div class="panel"><h2>Your path</h2><table class="tbl"><thead><tr><th>Level</th><th>Goal</th><th>Topics</th></tr></thead><tbody>
      ${LEVELS.map(l => `<tr><td><b>${l.id} · ${esc(l.name)}</b></td><td class="small" style="white-space:normal">${esc(l.goal)}</td>
        <td class="small" style="white-space:normal">${TOPICS.filter(t => t.level === l.id).map(t => esc(t.name)).join(' · ')}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="panel"><h2>Start here</h2>
      <p>Your first lesson explains what SQL and databases are. Then your first session gives you three easy problems.</p>
      <label class="small" style="display:block;margin-bottom:12px">Your name (optional) <input type="text" id="name" value="${esc(S.state.profile.name || '')}"></label>
      <button class="btn primary" id="zero">Start lesson 1</button>
      <details style="margin-top:14px"><summary>Already comfortable with SQL? Take a placement diagnostic instead</summary>
        <p class="small">12 questions from beginner to advanced; skip anything you don't know.</p><button class="btn sm" id="diag">Start the diagnostic</button></details>
    </div></div>`;
  const saveName = async () => { S.state.profile.name = $('#name', root).value.trim(); await S.saveProfile(); };
  $('#diag', root).onclick = async () => { await saveName(); await startDiagnostic(); };
  $('#zero', root).onclick = async () => { await saveName(); S.state.profile.onboarded = true; S.state.profile.startedFromZero = true; await S.saveProfile(); location.hash = '#/topic/f_intro'; };
}

export function renderDashboard(root) {
  const { mastery, stats, readiness } = S.state.derived;
  const p = S.state.profile;
  const s = S.state.activeSession;
  const due = A.dueReviews(S.state);
  const reviewCount = reviewPlan().length;
  const plan = s ? s.plan : A.buildDailyPlan(S.state, mastery);
  const backupDays = p.lastBackupAt ? Math.floor((Date.now() - p.lastBackupAt) / A.DAY) : null;
  const needBackup = (p.submitCount || 0) >= 10 && (backupDays == null || backupDays >= 7);
  const lastWeekly = S.state.weekly.slice().sort((a, b) => b.at - a.at)[0];
  const recurring = S.state.mistakes.filter(m => m.occurrences >= 2 && m.status !== 'resolved').sort((a, b) => b.occurrences - a.occurrences).slice(0, 4);
  const topicRows = TOPICS.filter(t => mastery[t.id].problemsAttempted > 0 || mastery[t.id].lessonViewed)
    .sort((a, b) => mastery[a.id].masteryScore - mastery[b.id].masteryScore).slice(0, 8);
  const sessionLabel = s ? ({ daily: "Today's session", review: 'Review session', challenge: 'Challenge', diagnostic: 'Diagnostic', interview: 'Interview', assessment: 'Assessment', mixed: 'Mixed assessment' }[s.kind] || 'Session') : "Today's session";

  root.innerHTML = `<div class="page stack">
    <div class="row between"><h1>${p.name ? `Hi ${esc(p.name)}` : 'Dashboard'}</h1>
      <span class="muted small">Level ${stats.currentLevel} · ${esc(LEVELS[stats.currentLevel].name)} · ${stats.currentStreak}-day streak (best ${Math.max(p.longestStreak || 0, stats.longestStreak)})</span></div>
    ${needBackup ? `<div class="callout warn row between"><span>${backupDays == null ? "You haven't exported a backup yet." : `Last backup ${backupDays} days ago.`} Your history lives only in this browser.</span><a class="btn sm" href="#/settings">Export backup</a></div>` : ''}
    ${lastWeekly && !lastWeekly.viewed ? `<div class="callout row between"><span>Your weekly review is ready (after ${lastWeekly.sessionIndex} sessions).</span><a class="btn sm" href="#/weekly/${lastWeekly.id}">Open weekly review</a></div>` : ''}
    <div class="grid split-a">
      <div class="panel">
        <div class="row between"><h2>${sessionLabel}</h2><span class="small muted">${s ? `${plan.filter(x => x.status !== 'pending').length} of ${plan.length} done` : `${plan.length} problems · ~${Math.round(plan.reduce((t, x) => t + (PROBLEM_BY_ID[x.problemId].timeTarget || 8), 0) / 5) * 5} min`}</span></div>
        ${plan.length ? `<ol class="plan">${plan.map((x, i) => { const pr = PROBLEM_BY_ID[x.problemId];
          return `<li class="${x.status !== 'pending' ? 'done' : ''} ${s && i === s.cursor ? 'current' : ''}"><div><div class="sec">${esc(x.section)}${x.topicId ? ` · ${esc(topicName(x.topicId))}` : ''}${x.lesson ? ' · includes a short lesson' : ''}</div>
            <div>${s ? esc(pr.title) : '<span class="muted">Problem hidden until you start</span>'}</div></div><div>${diffBadge(pr.difficulty)}</div></li>`; }).join('')}</ol>`
          : (() => { const nextLesson = TOPICS.find(t => !S.state.curriculum.lessonsViewed?.[t.id] && A.isUnlocked(t.id, mastery, S.state.curriculum));
              return `<div class="empty">${nextLesson ? `Read the next lesson to unlock practice: <a href="#/topic/${nextLesson.id}">${esc(nextLesson.name)}</a>` : 'Nothing to plan yet — open the problem bank.'}</div>`; })()}
        <div class="row" style="margin-top:12px">${s ? `<a class="btn primary" href="#/session/${s.cursor}">Continue</a><button class="btn ghost" id="end">End session now</button>` : plan.length ? `<button class="btn primary" id="start">Start today's session</button>` : ''}</div>
      </div>
      <div class="panel"><h2>Interview readiness</h2>
        <div class="row" style="align-items:baseline"><span style="font-size:34px;font-weight:600">${readiness.score}</span><span class="muted">/ 100</span></div>
        <div class="scale"><div class="track"></div><div class="fill" style="width:${readiness.score}%"></div>
          ${readiness.benchmarks.map((b, i) => `<div class="tick ${b.met ? 'met' : ''} ${i % 2 ? 'r2' : ''}" style="left:${b.score}%" title="${esc(b.name)} ≥ ${b.score}"><span>${esc(b.name.split(' ')[0])} ${b.score}</span></div>`).join('')}</div>
        ${readiness.lowEvidence ? '<p class="small muted">Low evidence: solve 15+ problems before reading much into this.</p>' : ''}
        <a class="small" href="#/progress#readiness">Why this score</a>
      </div>
    </div>
    <div class="grid g4">${[
      ['Overall mastery', `${stats.overall}%`], ['Problems solved', `${stats.solved} / ${stats.attempted} tried`], ['First-attempt accuracy', pct(stats.firstAttemptAcc)], ['Overall accuracy', pct(stats.accuracy)],
      ['Hint-free solving', pct(stats.hintFree)], ['Average time to solve', mins(stats.avgTimeMs)], ['Topics mastered', `${stats.mastered.length} / ${stats.practiceTopics}`], ['Due for review', due.filter(r => r.kind !== 'pattern').length],
    ].map(([l, v]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>
    <div class="grid g3">
      <div class="panel"><h2>Modes</h2><div class="stack">
        <div class="row between"><span>Review <span class="faint small">${reviewCount} due</span></span><button class="btn sm" id="rev" ${reviewCount ? '' : 'disabled'}>Start</button></div>
        <div class="row between"><span>Challenge <span class="faint small">one hard problem</span></span><button class="btn sm" id="chal">Start</button></div>
        <div class="row between"><span>Interview <span class="faint small">2 problems · 45 min</span></span><button class="btn sm" id="iv">Start</button></div>
        <div class="row between"><span>Learn <span class="faint small">roadmap & lessons</span></span><a class="btn sm" href="#/roadmap">Open</a></div>
        <div class="row between"><span>Problem bank <span class="faint small">${PROBLEMS.length} problems</span></span><a class="btn sm" href="#/bank">Open</a></div>
        <div class="row between"><span>Assessments</span><a class="btn sm" href="#/assessments">Open</a></div></div></div>
      <div class="panel"><h2>Weak topics</h2>${stats.weak.length ? stats.weak.slice(0, 6).map(t => `<div class="row between" style="padding:4px 0"><a href="#/topic/${t}">${esc(topicName(t))}</a><span class="small">${mastery[t].masteryScore}%</span></div>`).join('') : '<p class="small muted">None flagged yet.</p>'}
        <h2 style="margin-top:14px">Blind spots</h2>${recurring.length ? recurring.map(m => `<p class="small"><b>${m.occurrences}×</b> ${esc(m.specific)}</p>`).join('') : '<p class="small muted">No recurring mistakes yet.</p>'}
        <a class="small" href="#/mistakes">Mistake log</a></div>
      <div class="panel"><h2>Review queue</h2>${due.filter(r => r.kind !== 'pattern').slice(0, 7).map(r => `<div class="row between small" style="padding:3px 0"><span>${r.kind === 'topic' ? esc(topicName(r.refId)) : 'Mistake: ' + esc(S.state.mistakes.find(m => m.id === r.refId)?.specific || '')}</span><span class="faint">${rel(r.nextReviewAt)}</span></div>`).join('') || '<p class="small muted">Nothing due. Reviews appear 1, 3, 7, 14, 30 days after you solve a topic.</p>'}</div>
    </div>
    <div class="panel"><div class="row between"><h2>Topics in progress</h2><a class="small" href="#/progress">All topics</a></div>
      ${topicRows.length ? `<table class="tbl"><thead><tr><th>Topic</th><th>Mastery</th><th class="num">Accuracy</th><th class="num">Problems</th><th class="num">Avg time</th><th>Stage</th><th>Status</th></tr></thead><tbody>
        ${topicRows.map(t => { const m = mastery[t.id]; return `<tr><td><a href="#/topic/${t.id}">${esc(t.name)}</a></td><td><div class="row" style="gap:8px">${bar(m.masteryScore, m.masteryScore >= 75 ? 'pass' : m.masteryScore < 40 ? 'warn' : '')}<span class="small">${m.masteryScore}%</span></div></td>
          <td class="num">${pct(m.accuracy)}</td><td class="num">${m.problemsSolved}/${m.problemsAttempted}</td><td class="num">${mins(m.avgTimeMs)}</td><td class="small">${esc(m.stage)}</td><td>${statusBadge(m.status)}</td></tr>`; }).join('')}</tbody></table>` : '<p class="muted small">Topics appear here once you start practising.</p>'}</div>
  </div>`;
  $('#start', root)?.addEventListener('click', startDaily);
  $('#end', root)?.addEventListener('click', async () => { const done = await S.endSession(); location.hash = `#/summary/${done.id}`; });
  $('#rev', root)?.addEventListener('click', startReview);
  $('#chal', root)?.addEventListener('click', startChallenge);
  $('#iv', root)?.addEventListener('click', startInterview);
}
