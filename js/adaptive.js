// Adaptive engine — pure functions over app state. No network, no AI: everything is computed locally.
import { TOPICS, TOPIC_BY_ID, LEVELS } from './content/curriculum.js';
import { PROBLEMS, PROBLEM_BY_ID } from './content/problems.js';
import { PATTERNS } from './content/patterns.js';

export const DAY = 86400000;
export const INTERVALS = [1, 3, 7, 14, 30, 60];
export const DIFF_ORDER = ['Easy', 'Medium', 'Hard', 'Very Hard'];
const DIFF_W = { Easy: 0.7, Medium: 1, Hard: 1.3, 'Very Hard': 1.5 };
export const TIME_TARGET_MIN = { Easy: 5, Medium: 10, Hard: 20, 'Very Hard': 30 };

export const today = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

// ---------- Episodes ----------
// An episode = one sitting with one problem (open → submits → solved/abandoned/revealed).
export function episodeOutcome(ep) {
  const solved = !!ep.solved && !(ep.solutionRevealed && ep.revealedAt && ep.revealedAt < ep.solvedAt);
  let credit = 0;
  if (solved) {
    credit = ep.firstSubmitCorrect ? 1 : ep.submits <= 2 ? 0.8 : 0.65;
    credit -= [0, 0.15, 0.3, 0.5][ep.hintLevel || 0];
    credit = Math.max(0.1, credit);
  }
  return { solved, credit, attempted: ep.submits > 0 || ep.solutionRevealed };
}

function resetCutoff(profile, topicId) {
  const r = profile?.resets || {};
  return Math.max(r.all || 0, r.topics?.[topicId] || 0);
}

export function topicEpisodes(state, topicId) {
  const cut = resetCutoff(state.profile, topicId);
  return state.episodes
    .filter(e => e.openedAt > cut && (e.submits > 0 || e.solutionRevealed || e.skipped))
    .filter(e => PROBLEM_BY_ID[e.problemId]?.topics.includes(topicId))
    .sort((a, b) => a.openedAt - b.openedAt);
}

export function problemsForTopic(topicId) { return PROBLEMS.filter(p => p.topics.includes(topicId)); }

// ---------- Mastery ----------
export function computeTopicMastery(state, topicId) {
  const eps = topicEpisodes(state, topicId);
  const topic = TOPIC_BY_ID[topicId];
  const available = problemsForTopic(topicId);
  const maxAvail = Math.max(-1, ...available.map(p => DIFF_ORDER.indexOf(p.difficulty)));
  const attempts = state.attempts.filter(a => a.topics?.includes(topicId) && a.executionStatus !== 'revealed' && a.timestamp > resetCutoff(state.profile, topicId));
  const rec = {
    topicId, attempts: attempts.length, correctAttempts: attempts.filter(a => a.correct).length,
    problemsAttempted: new Set(eps.map(e => e.problemId)).size, problemsSolved: 0, problemsAvailable: available.length,
    accuracy: null, firstAttemptAcc: null, hintFreeAcc: null, avgTimeMs: null, bestTimeMs: null, difficultyReached: null,
    masteryScore: 0, stage: 'Not started', status: 'Not Started', trend: '—', confidenceAvg: null,
    lastPracticedAt: eps.length ? eps[eps.length - 1].openedAt : null, nextReviewAt: state.reviews[`topic:${topicId}`]?.nextReviewAt || null,
    repeatedMistakes: state.mistakes.filter(m => m.topic === topicId && m.occurrences >= 2 && m.status !== 'resolved').length,
    lessonViewed: !!state.curriculum?.lessonsViewed?.[topicId], updatedAt: Date.now(),
  };
  if (attempts.length) rec.accuracy = rec.correctAttempts / attempts.length;
  if (!available.length) { // concept-only lesson: no problems, never "mastered", only read
    rec.conceptOnly = true; rec.stage = rec.lessonViewed ? 'Exposure' : 'Not started'; rec.status = rec.lessonViewed ? 'Lesson read' : 'Not Started';
    return rec;
  }
  if (!eps.length) {
    rec.stage = rec.lessonViewed ? 'Exposure' : 'Not started';
    rec.status = rec.lessonViewed ? 'Learning' : 'Not Started';
    return rec;
  }
  const outcomes = eps.map(e => ({ e, ...episodeOutcome(e), p: PROBLEM_BY_ID[e.problemId] }));
  const solvedOut = outcomes.filter(o => o.solved);
  rec.problemsSolved = new Set(solvedOut.map(o => o.e.problemId)).size;
  const firstEps = outcomes.filter(o => o.e.firstEver);
  rec.firstAttemptAcc = firstEps.length ? firstEps.filter(o => o.e.firstSubmitCorrect && o.solved).length / firstEps.length : null;
  rec.hintFreeAcc = solvedOut.length ? solvedOut.filter(o => !o.e.hintLevel).length / solvedOut.length : null;
  const times = solvedOut.map(o => o.e.activeMs).filter(Boolean);
  if (times.length) { rec.avgTimeMs = times.reduce((a, b) => a + b, 0) / times.length; rec.bestTimeMs = Math.min(...times); }
  const maxSolved = Math.max(-1, ...solvedOut.map(o => DIFF_ORDER.indexOf(o.p.difficulty)));
  rec.difficultyReached = maxSolved >= 0 ? DIFF_ORDER[maxSolved] : null;
  const confs = eps.map(e => e.confidence).filter(c => c != null);
  if (confs.length) rec.confidenceAvg = confs.reduce((a, b) => a + b, 0) / confs.length;

  // Recency-weighted quality of outcomes.
  let num = 0, den = 0;
  outcomes.slice().reverse().forEach((o, k) => {
    const w = DIFF_W[o.p.difficulty] * Math.pow(0.85, k) * (o.p.topics[0] === topicId ? 1 : 0.6);
    num += w * o.credit; den += w;
  });
  const Q = den ? num / den : 0;
  // Evidence: successful episodes on distinct days (re-solves after a gap count; same-day repeats don't).
  const successDays = new Set(solvedOut.map(o => `${o.e.problemId}@${today(o.e.openedAt)}`)).size;
  const E = Math.min(1, successDays / 4);
  let score = 100 * Q * E;
  // Caps: can't be "mastered" from easy problems only, or from a single problem when more exist.
  const relCap = maxSolved >= maxAvail ? 100 : maxSolved === maxAvail - 1 ? 85 : 65;
  const distinctCap = rec.problemsSolved >= Math.min(3, available.length) ? 100 : 85;
  // Retention evidence: solves on distinct calendar days, and a successful solve ≥ 1 day after the first.
  const solveDays = [...new Set(solvedOut.map(o => today(o.e.openedAt)))].sort();
  const dayCount = solveDays.length;
  const retained = dayCount >= 2 && (Date.parse(solveDays[solveDays.length - 1]) - Date.parse(solveDays[0])) >= DAY;
  const dayCap = dayCount >= 2 ? 100 : 70; // a single sitting can't prove retention
  score = Math.min(score, relCap, distinctCap, dayCap);
  rec.daysPractised = dayCount;
  rec.masteryScore = Math.round(score);

  // Stage: exposure → practice → competence → mastery → fluency
  const unseenHintFreeHard = outcomes.some(o => o.e.firstEver && o.e.firstSubmitCorrect && o.solved && !o.e.hintLevel
    && DIFF_ORDER.indexOf(o.p.difficulty) >= Math.min(1, maxAvail));
  const acc = outcomes.filter(o => o.solved).length / outcomes.length;
  let stage = 'Exposure';
  if (solvedOut.length >= 1) stage = 'Practice';
  if (successDays >= 3 && dayCount >= 2 && rec.problemsSolved >= Math.min(2, available.length) && acc >= 0.6) stage = 'Competence';
  if (stage === 'Competence' && rec.masteryScore >= 75 && unseenHintFreeHard && retained) stage = 'Mastery';
  const last3 = outcomes.slice(-3);
  if (stage === 'Mastery' && last3.length === 3 && last3.every(o => o.solved && o.e.activeMs && o.e.activeMs <= TIME_TARGET_MIN[o.p.difficulty] * 60000)) stage = 'Fluency';
  rec.stage = stage;

  const now = Date.now();
  const overdue = rec.nextReviewAt && now > rec.nextReviewAt + DAY;
  const recentFails = last3.filter(o => !o.solved).length;
  if ((overdue && stage !== 'Exposure') || (recentFails >= 2 && rec.masteryScore >= 60)) rec.status = 'Needs Review';
  else if (stage === 'Mastery' || stage === 'Fluency') rec.status = 'Mastered';
  else if (rec.masteryScore >= 60) rec.status = 'Strong';
  else if (stage === 'Competence') rec.status = 'Developing';
  else if (stage === 'Practice') rec.status = 'Practicing';
  else rec.status = 'Learning';

  // Trend: last 4 episodes vs previous 4.
  const c = outcomes.map(o => o.credit);
  if (c.length >= 4) {
    const a = avg(c.slice(-4)), b = c.length >= 8 ? avg(c.slice(-8, -4)) : null;
    rec.trend = b == null ? (a >= 0.7 ? 'Solid' : a >= 0.4 ? 'Developing' : 'Weak') : a > b + 0.1 ? 'Improving' : a < b - 0.1 ? 'Slipping' : a >= 0.6 ? 'Steady' : 'Needs practice';
  } else rec.trend = acc >= 0.7 ? 'Early' : 'Needs practice';
  return rec;
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function computeAllMastery(state) {
  const m = {};
  for (const t of TOPICS) m[t.id] = computeTopicMastery(state, t.id);
  return m;
}

export function patternMastery(state, mastery) {
  return PATTERNS.map(pt => {
    const probs = PROBLEMS.filter(p => (p.patterns || []).includes(pt.id)).map(p => p.id);
    const eps = state.episodes.filter(e => probs.includes(e.problemId) && (e.submits > 0 || e.solutionRevealed || e.skipped));
    const solved = eps.filter(e => episodeOutcome(e).solved);
    const credit = eps.length ? avg(eps.map(e => episodeOutcome(e).credit)) : 0;
    const ev = Math.min(1, new Set(solved.map(e => e.problemId + today(e.openedAt))).size / 3);
    return { id: pt.id, problemIds: probs, problemsEncountered: new Set(eps.map(e => e.problemId)).size,
      mastery: Math.round(100 * credit * ev), lastPracticed: eps.length ? Math.max(...eps.map(e => e.openedAt)) : null,
      nextReview: state.reviews[`pattern:${pt.id}`]?.nextReviewAt || null, updatedAt: Date.now() };
  });
}

// ---------- Unlocking & prerequisites ----------
export function isUnlocked(topicId, mastery, curriculum) {
  const t = TOPIC_BY_ID[topicId];
  if (!t) return false;
  if (curriculum?.unlocked?.[topicId]) return true;
  return t.prereqs.every(p => (mastery[p]?.masteryScore || 0) >= 40 || curriculum?.placedTopics?.includes(p)
    || (mastery[p]?.conceptOnly && curriculum?.lessonsViewed?.[p]));
}

// If a topic keeps failing, find the weakest prerequisite (up to 2 levels up).
export function rootCausePrereq(state, topicId, mastery) {
  const eps = topicEpisodes(state, topicId).slice(-5);
  const fails = eps.filter(e => !episodeOutcome(e).solved).length;
  if (fails < 3) return null;
  const cands = [];
  const walk = (id, depth) => {
    for (const p of TOPIC_BY_ID[id]?.prereqs || []) {
      cands.push({ id: p, score: mastery[p]?.masteryScore || 0, depth });
      if (depth < 2) walk(p, depth + 1);
    }
  };
  walk(topicId, 1);
  const weak = cands.filter(c => c.score < 60).sort((a, b) => a.score - b.score || a.depth - b.depth);
  return weak[0] ? { topicId: weak[0].id, reason: `${fails} of your last ${eps.length} attempts in ${TOPIC_BY_ID[topicId].name} failed, and ${TOPIC_BY_ID[weak[0].id].name} (a prerequisite) is at ${weak[0].score}%.` } : null;
}

// ---------- Spaced repetition ----------
export function scheduleReview(rec, success, now = Date.now(), kind = 'topic', refId = '') {
  const r = rec ? { ...rec } : { key: `${kind}:${refId}`, kind, refId, intervalIdx: -1, successes: 0, failures: 0, createdAt: now };
  const due = r.nextReviewAt == null || now >= r.nextReviewAt - DAY / 4;
  if (success) {
    if (r.intervalIdx < 0) r.intervalIdx = 0;
    else if (due) r.intervalIdx = Math.min(INTERVALS.length - 1, r.intervalIdx + 1);
    if (due || r.intervalIdx === 0) { r.successes++; r.nextReviewAt = now + INTERVALS[r.intervalIdx] * DAY; }
    r.lastPerformance = 'pass';
  } else {
    r.intervalIdx = Math.max(0, r.intervalIdx - 2);
    r.failures++; r.nextReviewAt = now + DAY; r.lastPerformance = 'fail';
  }
  r.interval = INTERVALS[r.intervalIdx];
  r.lastReviewedAt = now; r.updatedAt = now;
  return r;
}

export function dueReviews(state, now = Date.now()) {
  return Object.values(state.reviews).filter(r => r.nextReviewAt && r.nextReviewAt <= now).sort((a, b) => a.nextReviewAt - b.nextReviewAt);
}

// ---------- Problem choice ----------
export function targetDifficulty(score) { return score < 35 ? 'Easy' : score < 60 ? 'Medium' : score < 80 ? 'Hard' : 'Very Hard'; }

export function chooseProblem(state, topicId, { target, exclude = new Set(), allowResolve = true, minDiff, unlocked } = {}) {
  let cands = problemsForTopic(topicId).filter(p => !exclude.has(p.id));
  // Never serve a problem that also needs a topic the learner hasn't unlocked yet (if an alternative exists).
  if (unlocked) { const ok = cands.filter(p => p.topics.every(t => unlocked.has(t))); if (ok.length) cands = ok; else if (cands.some(p => p.topics.some(t => !unlocked.has(t)))) cands = []; }
  if (!cands.length) return null;
  const tIdx = DIFF_ORDER.indexOf(target || 'Easy');
  const info = (p) => {
    const eps = state.episodes.filter(e => e.problemId === p.id);
    const solved = eps.filter(e => episodeOutcome(e).solved);
    const last = eps.length ? Math.max(...eps.map(e => e.openedAt)) : 0;
    return { seen: eps.length > 0, solved: solved.length > 0, last };
  };
  const scored = cands.map(p => {
    const i = info(p); const d = DIFF_ORDER.indexOf(p.difficulty);
    if (minDiff && d < DIFF_ORDER.indexOf(minDiff)) return null;
    let s = 0;
    if (!i.seen) s += 100; else if (!i.solved) s += 60; else if (allowResolve && today(i.last) !== today(Date.now())) s += 30; else s -= 100;
    s -= Math.abs(d - tIdx) * 12;
    if (p.topics[0] === topicId) s += 8;
    return { p, s };
  }).filter(Boolean).sort((a, b) => b.s - a.s);
  return scored[0] && scored[0].s > -50 ? scored[0].p : null;
}

// ---------- Daily session plan ----------
const chooseProblemBase = (...args) => chooseProblem(...args);
export function buildDailyPlan(state, mastery) {
  const used = new Set(); const plan = [];
  const add = (section, p, extra = {}) => {
    if (!p || used.has(p.id)) return false;
    const ls = lastSolvedAt(state, p.id);
    if (ls && today(ls) === today()) return false;                                        // never re-serve what you solved today
    if (ls && section !== 'Warm-up' && plan.filter(x => x.repeat && x.section !== 'Warm-up').length >= 2) return false; // few re-solves per session
    used.add(p.id); plan.push({ section, problemId: p.id, status: 'pending', ...(ls ? { repeat: true, lastSolvedAt: ls } : {}), ...extra }); return true;
  };
  const unlocked = TOPICS.filter(t => isUnlocked(t.id, mastery, state.curriculum) && problemsForTopic(t.id).length);
  const U = new Set(TOPICS.filter(t => isUnlocked(t.id, mastery, state.curriculum)).map(t => t.id));
  const chooseProblem = (st, tid, o = {}) => chooseProblemBase(st, tid, { ...o, unlocked: U });
  const practiced = unlocked.filter(t => mastery[t.id].problemsAttempted > 0);

  // Warm-up: due topic reviews, else strong-but-stale topics.
  const due = dueReviews(state).filter(r => r.kind === 'topic').map(r => r.refId);
  const stale = practiced.filter(t => mastery[t.id].masteryScore >= 50).sort((a, b) => (mastery[a.id].lastPracticedAt || 0) - (mastery[b.id].lastPracticedAt || 0)).map(t => t.id);
  for (const tid of [...due, ...stale]) { if (plan.filter(x => x.section === 'Warm-up').length >= 2) break; add('Warm-up', chooseProblem(state, tid, { target: targetDifficulty(mastery[tid].masteryScore - 15), exclude: used }), { topicId: tid }); }

  // Weak areas, with prerequisite routing.
  const weak = practiced.filter(t => mastery[t.id].masteryScore < 60).sort((a, b) => (mastery[a.id].masteryScore - mastery[b.id].masteryScore) || (mastery[b.id].repeatedMistakes - mastery[a.id].repeatedMistakes));
  for (const t of weak) {
    if (plan.filter(x => x.section === 'Weak area').length >= 3) break;
    const root = rootCausePrereq(state, t.id, mastery);
    const tid = root ? root.topicId : t.id;
    add('Weak area', chooseProblem(state, tid, { target: targetDifficulty(mastery[tid].masteryScore), exclude: used }), { topicId: tid, note: root?.reason });
  }

  // New concept: next unlocked, not-started topic in curriculum order.
  const fresh = unlocked.find(t => mastery[t.id].problemsAttempted === 0);
  if (fresh) add('New concept', chooseProblem(state, fresh.id, { target: 'Easy', exclude: used }), { topicId: fresh.id, lesson: true });

  // Main practice: in-progress topics, lowest level first, difficulty rising.
  const focus = unlocked.filter(t => mastery[t.id].problemsAttempted > 0 && !['Mastery', 'Fluency'].includes(mastery[t.id].stage))
    .sort((a, b) => a.level - b.level || mastery[a.id].masteryScore - mastery[b.id].masteryScore);
  if (fresh) focus.push(fresh);
  let step = 0;
  for (let round = 0; round < 3 && plan.filter(x => x.section === 'Main practice').length < 4; round++) {
    for (const t of focus) {
      if (plan.filter(x => x.section === 'Main practice').length >= 4) break;
      const base = DIFF_ORDER.indexOf(targetDifficulty(mastery[t.id].masteryScore));
      const target = DIFF_ORDER[Math.min(3, base + (step > 1 ? 1 : 0))];
      if (add('Main practice', chooseProblem(state, t.id, { target, exclude: used }), { topicId: t.id })) step++;
    }
  }
  // Fill main practice from the next unlocked topics if still short (e.g. first session).
  for (const t of unlocked) { if (plan.filter(x => x.section === 'Main practice').length >= 3) break; add('Main practice', chooseProblem(state, t.id, { target: targetDifficulty(mastery[t.id].masteryScore), exclude: used }), { topicId: t.id }); }

  // Challenge: hardest unsolved problem whose topics are all unlocked.
  const unlockedSet = new Set(unlocked.map(t => t.id));
  const challenge = PROBLEMS.filter(p => !used.has(p.id) && ['Hard', 'Very Hard'].includes(p.difficulty) && p.topics.every(t => unlockedSet.has(t)) && !(lastSolvedAt(state, p.id) && today(lastSolvedAt(state, p.id)) === today()))
    .map(p => ({ p, solved: state.episodes.some(e => e.problemId === p.id && episodeOutcome(e).solved) }))
    .sort((a, b) => Number(a.solved) - Number(b.solved) || DIFF_ORDER.indexOf(a.p.difficulty) - DIFF_ORDER.indexOf(b.p.difficulty));
  const easierChallenge = PROBLEMS.filter(p => !used.has(p.id) && p.difficulty === 'Medium' && p.topics.every(t => unlockedSet.has(t)) && !state.episodes.some(e => e.problemId === p.id));
  add('Challenge', challenge[0]?.p || easierChallenge[0], { topicId: (challenge[0]?.p || easierChallenge[0])?.topics[0] });
  return plan;
}

// ---------- What to do next ----------
export const lastSolvedAt = (state, id) => state.episodes.filter(e => e.problemId === id && episodeOutcome(e).solved).reduce((m, e) => Math.max(m, e.openedAt), 0);

// The first locked topic the learner can actually work towards: every unmet prerequisite is itself unlocked.
export function unlockFrontier(state, mastery) {
  const cur = state.curriculum;
  for (const t of TOPICS) {
    if (isUnlocked(t.id, mastery, cur)) continue;
    const unmet = t.prereqs.filter(p => !((mastery[p]?.masteryScore || 0) >= 40 || cur?.placedTopics?.includes(p) || (mastery[p]?.conceptOnly && cur?.lessonsViewed?.[p])));
    if (unmet.every(p => isUnlocked(p, mastery, cur)))
      return { topic: t, unmet: unmet.map(p => ({ id: p, name: TOPIC_BY_ID[p].name, score: mastery[p]?.masteryScore || 0, conceptOnly: !!mastery[p]?.conceptOnly })) };
  }
  return null;
}

// One clear recommendation for the dashboard: continue, start, or "you're blocked, here is exactly why and how to unlock more".
export function nextStep(state, mastery, plan) {
  const s = state.activeSession;
  const frontier = unlockFrontier(state, mastery);
  if (s) return { kind: 'continue', headline: 'Continue your session', detail: `${s.plan.filter(x => x.status !== 'pending').length} of ${s.plan.length} done. Up next: ${s.plan[s.cursor]?.section || 'the next item'}.`, href: `#/session/${s.cursor}`, frontier };
  const fresh = plan.filter(x => !x.repeat), again = plan.length - fresh.length;
  const lesson = plan.find(x => x.lesson);
  let why = '';
  if (frontier) {
    const need = frontier.unmet.map(u => u.conceptOnly ? `read the lesson “${u.name}”` : `raise ${u.name} to 40% (now ${u.score}%)`).join(' and ');
    why = `Next topic: ${frontier.topic.name}. To unlock it, ${need}. Mastery needs solved problems on different days, so re-solving a problem from an earlier day counts as fresh evidence.`;
  }
  if (fresh.length) {
    return { kind: 'start', headline: "Start today's session",
      detail: `${fresh.length} new problem${fresh.length === 1 ? '' : 's'}${again ? ` and ${again} to practise again` : ''}${lesson ? `, beginning with a short lesson on ${TOPIC_BY_ID[lesson.topicId]?.name}` : ''}.${fresh.length < 3 && why ? ' ' + why : ''}`, frontier };
  }
  const unread = TOPICS.find(t => !state.curriculum?.lessonsViewed?.[t.id] && isUnlocked(t.id, mastery, state.curriculum));
  return { kind: plan.length ? 'again' : 'blocked', headline: 'You have done every available problem in your unlocked topics',
    detail: `${why}${unread ? ` You also haven’t read the lesson “${unread.name}”.` : ''}${plan.length ? ` Today's session re-practises ${plan.length} earlier problem${plan.length === 1 ? '' : 's'} (marked “practise again”).` : ''}`, frontier, lessonId: unread?.id };
}

// ---------- Aggregate stats ----------
export function overallStats(state, mastery) {
  const cut = state.profile?.resets?.all || 0;
  const attempts = state.attempts.filter(a => a.executionStatus !== 'revealed' && a.timestamp > cut);
  const eps = state.episodes.filter(e => (e.submits > 0 || e.solutionRevealed || e.skipped) && e.openedAt > cut);
  const outs = eps.map(e => ({ e, ...episodeOutcome(e) }));
  const solvedEps = outs.filter(o => o.solved);
  const attemptedProblems = new Set(eps.map(e => e.problemId));
  const solvedProblems = new Set(solvedEps.map(o => o.e.problemId));
  const firsts = outs.filter(o => o.e.firstEver);
  const times = solvedEps.map(o => o.e.activeMs).filter(Boolean).sort((a, b) => a - b);
  const PT = TOPICS.filter(t => !mastery[t.id].conceptOnly);
  const levelScores = LEVELS.map(l => { const ts = PT.filter(t => t.level === l.id); return avg(ts.map(t => mastery[t.id].masteryScore)); });
  const overall = Math.round(avg(PT.map(t => mastery[t.id].masteryScore)));
  let currentLevel = 0;
  for (let i = 0; i < LEVELS.length; i++) { if (levelScores[i] >= 60) currentLevel = Math.min(i + 1, LEVELS.length - 1); else break; }
  const streak = computeStreak(state);
  return {
    attempted: attemptedProblems.size, solved: solvedProblems.size, submits: attempts.length,
    accuracy: attempts.length ? attempts.filter(a => a.correct).length / attempts.length : null,
    firstAttemptAcc: firsts.length ? firsts.filter(o => o.solved && o.e.firstSubmitCorrect).length / firsts.length : null,
    hintFree: solvedEps.length ? solvedEps.filter(o => !o.e.hintLevel).length / solvedEps.length : null,
    avgTimeMs: times.length ? avg(times) : null, medianTimeMs: times.length ? times[Math.floor(times.length / 2)] : null,
    overall, currentLevel, levelScores, ...streak,
    practiceTopics: PT.length,
    mastered: TOPICS.filter(t => mastery[t.id].status === 'Mastered').map(t => t.id),
    inProgress: TOPICS.filter(t => ['Learning', 'Practicing', 'Developing', 'Strong'].includes(mastery[t.id].status)).map(t => t.id),
    weak: TOPICS.filter(t => mastery[t.id].problemsAttempted > 0 && (mastery[t.id].masteryScore < 40 || mastery[t.id].status === 'Needs Review')).map(t => t.id),
  };
}

export function computeStreak(state) {
  const days = [...new Set(state.attempts.map(a => today(a.timestamp)))].sort();
  if (!days.length) return { currentStreak: 0, longestStreak: 0 };
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    const diff = (Date.parse(days[i]) - Date.parse(days[i - 1])) / DAY;
    run = diff === 1 ? run + 1 : 1; longest = Math.max(longest, run);
  }
  const last = days[days.length - 1];
  const gap = (Date.parse(today()) - Date.parse(last)) / DAY;
  return { currentStreak: gap <= 1 ? run : 0, longestStreak: longest };
}

// ---------- Interview readiness ----------
export const READINESS_BENCHMARKS = [
  { name: 'General analyst SQL', score: 55 }, { name: 'Product analyst SQL', score: 65 },
  { name: 'Senior analyst SQL', score: 75 }, { name: 'Top-tier tech SQL', score: 85 },
];

export function computeReadiness(state, mastery, stats) {
  const lv = (ids) => avg(ids.map(id => mastery[id]?.masteryScore || 0)) / 100;
  const byLevel = (n) => TOPICS.filter(t => t.level === n && !mastery[t.id].conceptOnly).map(t => t.id);
  const eps = state.episodes.filter(e => e.submits > 0 || e.solutionRevealed);
  const outs = eps.map(e => ({ e, ...episodeOutcome(e), p: PROBLEM_BY_ID[e.problemId] }));
  const medPlusFirst = outs.filter(o => o.e.firstEver && DIFF_ORDER.indexOf(o.p.difficulty) >= 1);
  const solvedMedPlus = outs.filter(o => o.solved && DIFF_ORDER.indexOf(o.p.difficulty) >= 1);
  const withinTarget = solvedMedPlus.filter(o => o.e.activeMs && o.e.activeMs <= TIME_TARGET_MIN[o.p.difficulty] * 60000);
  const edge = state.attempts.filter(a => a.samplePassed && a.hiddenTotal > 0 && a.retryIndex === 1);
  const quality = state.attempts.filter(a => a.correct && a.quality);
  const reasoning = eps.filter(e => e.reasoningTotal > 0);
  const practiceDays14 = new Set(state.attempts.filter(a => a.timestamp > Date.now() - 14 * DAY).map(a => today(a.timestamp))).size;
  const ev = (n, need) => Math.min(1, n / need);
  const rate = (num, den) => den ? num / den : 0;
  const C = [
    ['Fundamentals', 8, lv(byLevel(0)), 'Average mastery of Level 0 topics.'],
    ['Aggregation', 8, lv(byLevel(1)), 'Average mastery of Level 1 topics.'],
    ['Joins', 10, lv(byLevel(2)), 'Average mastery of join topics — the most common interview failure point.'],
    ['Subqueries & CTEs', 8, lv([...byLevel(3), ...byLevel(4)]), 'Levels 3–4.'],
    ['Window functions', 12, lv(byLevel(5)), 'Level 5 — heavily weighted because analytics interviews lean on it.'],
    ['Advanced SQL', 8, lv(byLevel(6)), 'Dates, dedup, percentiles, JSON, LATERAL, pivots.'],
    ['Analytics', 10, lv(byLevel(7)), 'Funnels, cohorts, churn, sessions, segmentation.'],
    ['Unseen problem solving', 8, rate(medPlusFirst.filter(o => o.solved && o.e.firstSubmitCorrect && !o.e.hintLevel).length, medPlusFirst.length) * ev(medPlusFirst.length, 10), 'First-try, hint-free solves on unseen Medium+ problems (needs ≥10 for full credit).'],
    ['Speed', 6, rate(withinTarget.length, solvedMedPlus.length) * ev(solvedMedPlus.length, 10), 'Medium+ solves within target time.'],
    ['Edge cases', 6, rate(edge.filter(a => a.hiddenPassed === a.hiddenTotal).length, edge.length) * ev(edge.length, 10), 'When your first submission passes the sample data, how often it also passes every hidden edge case.'],
    ['Query quality', 5, (quality.length ? avg(quality.map(a => a.quality.total)) / 100 : 0) * ev(quality.length, 10), 'Average quality score of correct submissions.'],
    ['Business reasoning', 4, rate(reasoning.reduce((s, e) => s + e.reasoningCorrect, 0), reasoning.reduce((s, e) => s + e.reasoningTotal, 0)) * ev(reasoning.length, 5), 'Metric-definition questions answered correctly before writing SQL.'],
    ['Hint independence', 4, (stats.hintFree ?? 0) * ev(stats.solved, 10), 'Share of solves without hints.'],
    ['Consistency', 3, Math.min(1, practiceDays14 / 10), 'Practice days in the last 14 (10+ = full).'],
  ];
  const components = C.map(([name, weight, value, why]) => ({ name, weight, value: Math.max(0, Math.min(1, value || 0)), points: Math.round(weight * Math.max(0, Math.min(1, value || 0)) * 10) / 10, why }));
  const score = Math.round(components.reduce((s, c) => s + c.points, 0));
  const lowEvidence = stats.solved < 15;
  return { score, components, lowEvidence, benchmarks: READINESS_BENCHMARKS.map(b => ({ ...b, met: score >= b.score })) };
}

// ---------- Milestones ----------
export const MILESTONES = [
  { id: 'beginner', name: 'Beginner', levels: [0, 1, 2], maxDiff: 'Medium', count: 5, desc: 'SELECT, filtering, aggregation, GROUP BY, basic joins.' },
  { id: 'intermediate', name: 'Intermediate', levels: [2, 3, 4], maxDiff: 'Hard', count: 5, desc: 'Complex joins, subqueries, CTEs, CASE, set operations.' },
  { id: 'advanced', name: 'Advanced', levels: [5, 6, 7], maxDiff: 'Very Hard', count: 5, desc: 'Window functions, dates, cohorts, funnels, complex CTEs.' },
];

export function pickAssessment(state, milestone) {
  const pool = PROBLEMS.filter(p => milestone.levels.includes(TOPIC_BY_ID[p.topics[0]].level) && DIFF_ORDER.indexOf(p.difficulty) <= DIFF_ORDER.indexOf(milestone.maxDiff));
  const seen = new Set(state.episodes.map(e => e.problemId));
  const ordered = pool.sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)) || Math.random() - 0.5);
  const byTopic = new Map();
  for (const p of ordered) if (!byTopic.has(p.topics[0])) byTopic.set(p.topics[0], p);
  const picks = [...byTopic.values()].slice(0, milestone.count);
  for (const p of ordered) { if (picks.length >= milestone.count) break; if (!picks.includes(p)) picks.push(p); }
  return picks.sort((a, b) => DIFF_ORDER.indexOf(a.difficulty) - DIFF_ORDER.indexOf(b.difficulty)).map(p => p.id);
}

export function interviewReadyChecklist(state, stats, readiness) {
  const passed = (id) => (state.curriculum?.assessments || []).some(a => a.milestone === id && a.passed);
  const unseen = readiness.components.find(c => c.name === 'Unseen problem solving');
  const edge = readiness.components.find(c => c.name === 'Edge cases');
  const speed = readiness.components.find(c => c.name === 'Speed');
  const iv = state.interviews.filter(i => i.endedAt);
  return [
    { label: 'Advanced milestone passed', ok: passed('advanced') },
    { label: 'Readiness score ≥ 75', ok: readiness.score >= 75 },
    { label: 'Hint-free solving ≥ 80%', ok: (stats.hintFree || 0) >= 0.8 && stats.solved >= 15 },
    { label: 'Unseen Medium+ first-try ≥ 70%', ok: unseen.value >= 0.7 },
    { label: 'Edge cases passed first time ≥ 75%', ok: edge.value >= 0.75 },
    { label: 'Within time target ≥ 70%', ok: speed.value >= 0.7 },
    { label: '2+ interview sessions scoring ≥ 70', ok: iv.filter(i => (i.score || 0) >= 70).length >= 2 },
  ];
}
