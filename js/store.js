// App state and actions. The full learner history is loaded into memory at boot (it stays small —
// thousands of attempts are a few MB) and every change is written to IndexedDB in one transaction.
import * as db from './db.js';
import { TOPICS, TOPIC_BY_ID } from './content/curriculum.js';
import { PROBLEMS, PROBLEM_BY_ID } from './content/problems.js';
import { PATTERNS } from './content/patterns.js';
import * as A from './adaptive.js';

export const state = {
  profile: null, curriculum: null, episodes: [], attempts: [], mistakes: [], reviews: {}, sessions: [],
  snapshots: [], interviews: [], notes: [], explains: [], weekly: [], masteryRows: {}, patternRows: {},
  activeSession: null, derived: null,
};

export const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export async function loadState() {
  await db.openDB();
  // Seed/refresh content stores (stable IDs; version field lets history stay valid across edits).
  const contentVersion = 'c1-' + PROBLEMS.length + '-' + TOPICS.length;
  const meta = await db.get('meta', 'content');
  if (meta?.version !== contentVersion) {
    await db.writeAtomic({
      problems: PROBLEMS.map(p => ({ ...p })),
      topics: TOPICS.map(t => ({ ...t, masteryThreshold: 75 })),
      meta: [{ key: 'content', version: contentVersion, at: Date.now() }],
    });
  }
  const [profiles, cur, episodes, attempts, mistakes, reviews, sessions, snaps, interviews, notes, explains, weekly, mastery, patterns] = await Promise.all(
    ['user_profile', 'curriculum_progress', 'episodes', 'problem_attempts', 'mistakes', 'reviews', 'sessions', 'progress_snapshots', 'interview_sessions', 'notes', 'explain_backs', 'weekly_reviews', 'mastery', 'patterns'].map(s => db.getAll(s)));
  state.profile = profiles.find(p => p.id === 'me') || null;
  state.curriculum = cur.find(c => c.id === 'main') || null;
  Object.assign(state, { episodes, attempts, mistakes, sessions, snapshots: snaps, interviews, notes, explains, weekly });
  state.reviews = Object.fromEntries(reviews.map(r => [r.key, r]));
  state.masteryRows = Object.fromEntries(mastery.map(m => [m.topicId, m]));
  state.patternRows = Object.fromEntries(patterns.map(p => [p.id, p]));
  if (!state.profile) {
    const now = Date.now();
    state.profile = { id: 'me', name: '', createdAt: now, lastActiveAt: now, currentLevel: 0, overallMastery: 0, readiness: 0,
      currentStreak: 0, longestStreak: 0, schemaVersion: db.DB_VERSION, onboarded: false, diagnosticDone: false,
      resets: { all: 0, topics: {} }, lastBackupAt: null, submitCount: 0, updatedAt: now };
    state.curriculum = { id: 'main', currentModule: 0, completedModules: [], currentTopic: 'f_model', completedTopics: [], skippedTopics: [],
      reviewTopics: [], assessments: [], milestones: [], lessonsViewed: {}, placedTopics: [], unlocked: {}, diagnostic: null, updatedAt: now };
    await db.writeAtomic({ user_profile: [state.profile], curriculum_progress: [state.curriculum] });
  }
  // Close stale sessions (left open > 6h).
  const open = state.sessions.filter(s => !s.endedAt);
  const stale = open.filter(s => Date.now() - (s.lastActivityAt || s.startedAt) > 6 * 3600000);
  for (const s of stale) finalizeSessionRecord(s, s.lastActivityAt || s.startedAt);
  if (stale.length) await db.writeAtomic({ sessions: stale });
  state.activeSession = open.filter(s => !s.endedAt).sort((a, b) => b.startedAt - a.startedAt)[0] || null;
  recompute();
  return state;
}

export function recompute() {
  const mastery = A.computeAllMastery(state);
  const stats = A.overallStats(state, mastery);
  const readiness = A.computeReadiness(state, mastery, stats);
  const patterns = A.patternMastery(state, mastery);
  state.derived = { mastery, stats, readiness, patterns, at: Date.now() };
  return state.derived;
}

// ---------- Episodes ----------
export async function openEpisode(problemId, mode, extra = {}) {
  const p = PROBLEM_BY_ID[problemId];
  const now = Date.now();
  const ep = { id: uid('E'), problemId, problemVersion: p.v, sessionId: state.activeSession?.id || null, mode, openedAt: now, lastTickAt: now,
    activeMs: 0, hintLevel: 0, solutionRevealed: false, revealedAt: null, submits: 0, runs: 0, runsSinceSubmit: 0, solved: false, solvedAt: null,
    firstSubmitCorrect: false, firstEver: !state.episodes.some(e => e.problemId === problemId && (e.submits > 0 || e.solutionRevealed || e.skipped)),
    reasoningAnswers: {}, reasoningCorrect: 0, reasoningTotal: 0, processChecklist: null, confidence: null, clarificationsAsked: [],
    failRecorded: false, closedAt: null, ...extra };
  state.episodes.push(ep);
  await db.put('episodes', ep);
  return ep;
}

export function tick(ep, visible = true) {
  const now = Date.now();
  if (visible) ep.activeMs += Math.min(now - ep.lastTickAt, 60000); // cap idle gaps at 1 min
  ep.lastTickAt = now;
}

export async function saveEpisode(ep) { tick(ep); await db.put('episodes', ep); }

export async function closeEpisode(ep) {
  if (!ep || ep.closedAt) return;
  tick(ep); ep.closedAt = Date.now();
  const puts = { episodes: [ep] };
  if ((ep.submits > 0 || ep.skipped) && !ep.solved && !ep.failRecorded) {
    ep.failRecorded = true;
    Object.assign(puts, reviewUpdates(PROBLEM_BY_ID[ep.problemId], false));
  }
  await db.writeAtomic(puts);
  recompute();
}

function reviewUpdates(problem, success) {
  const now = Date.now();
  const reviews = [];
  for (const t of problem.topics) { const r = A.scheduleReview(state.reviews[`topic:${t}`], success, now, 'topic', t); state.reviews[r.key] = r; reviews.push(r); }
  for (const pt of problem.patterns || []) { const r = A.scheduleReview(state.reviews[`pattern:${pt}`], success, now, 'pattern', pt); state.reviews[r.key] = r; reviews.push(r); }
  return { reviews };
}

// ---------- Submissions ----------
export async function recordSubmission(ep, { sql, grade, quality, diagnosis, confidence, intent, costRatio }) {
  tick(ep);
  const problem = PROBLEM_BY_ID[ep.problemId];
  const now = Date.now();
  ep.submits += 1;
  const correct = grade.allPassed;
  if (ep.submits === 1) ep.firstSubmitCorrect = correct && !ep.solutionRevealed;
  if (confidence != null && ep.confidence == null) ep.confidence = confidence;
  const attempt = {
    id: uid('A'), episodeId: ep.id, problemId: problem.id, problemVersion: problem.v, timestamp: now, sessionId: ep.sessionId, mode: ep.mode,
    sql, executionStatus: grade.error?.timeout ? 'timeout' : (grade.error && !grade.cases[0]?.cmp ? 'error' : 'ok'), correct,
    score: quality?.total ?? 0, quality, costRatio: costRatio ?? null, timeSpentMs: ep.activeMs, difficulty: problem.difficulty,
    hintsUsed: ep.hintLevel > 0, hintLevel: ep.hintLevel, solutionRevealed: ep.solutionRevealed, errorMessage: grade.error?.message || null,
    resultSummary: { cases: grade.cases.map(c => ({ name: c.name, passed: c.passed })), message: grade.cases.find(c => !c.passed)?.cmp?.message || null },
    samplePassed: grade.samplePassed, hiddenPassed: grade.hiddenPassed, hiddenTotal: grade.hiddenTotal,
    topics: problem.topics, mistakeIds: [], confidence: confidence ?? null, retryIndex: ep.submits, runsBeforeSubmit: ep.runsSinceSubmit,
    firstEver: ep.firstEver, intent: intent || null,
  };
  state.attempts.push(attempt);
  ep.runsSinceSubmit = 0;
  state.profile.submitCount = (state.profile.submitCount || 0) + 1;

  const puts = { problem_attempts: [attempt], episodes: [ep], mistakes: [] };
  // Mistakes
  if (!correct) {
    for (const d of (diagnosis || []).slice(0, 3)) {
      const m = upsertMistake(d, attempt, problem, now);
      attempt.mistakeIds.push(m.id); puts.mistakes.push(m);
    }
  } else {
    // A clean solve counts as a correction for open mistakes in these topics / on this problem.
    for (const m of state.mistakes) {
      if (m.status === 'resolved' || m.lastAt >= now) continue;
      const related = problem.topics.includes(m.topic) || m.occ.some(o => o.problemId === problem.id);
      if (!related) continue;
      m.successfulCorrections += 1;
      if (m.occ.some(o => o.problemId === problem.id)) m.correctedBy.push({ attemptId: attempt.id, problemId: problem.id, at: now, sql });
      m.status = m.successfulCorrections >= 2 ? 'resolved' : 'improving';
      const r = A.scheduleReview(state.reviews[`mistake:${m.id}`], true, now, 'mistake', m.id);
      state.reviews[r.key] = r; m.nextReviewAt = m.status === 'resolved' ? null : r.nextReviewAt; m.updatedAt = now;
      puts.mistakes.push(m); (puts.reviews ||= []).push(r);
    }
  }
  // Episode outcome & reviews
  if (correct && !ep.solved) {
    ep.solved = true; ep.solvedAt = now;
    const ru = reviewUpdates(problem, !ep.solutionRevealed);
    puts.reviews = [...(puts.reviews || []), ...ru.reviews];
  }
  // Session
  const s = touchSession(now, attempt, correct);
  if (s) puts.sessions = [s];
  // Profile, mastery, patterns, snapshot
  Object.assign(puts, derivedWrites(now));
  await db.writeAtomic(puts);
  return attempt;
}

function upsertMistake(d, attempt, problem, now) {
  const id = 'M-' + d.signature.toLowerCase().replace(/[^a-z0-9|]+/g, '_').replace('|', '--');
  let m = state.mistakes.find(x => x.id === id);
  const occ = { attemptId: attempt.id, problemId: problem.id, at: now, sql: attempt.sql, intent: attempt.intent, difficulty: problem.difficulty };
  if (!m) {
    m = { id, signature: d.signature, category: d.category, specific: d.specific, rootCause: d.rootCause, concept: d.concept, topic: d.topic,
      severity: d.severity, firstAt: now, lastAt: now, occurrences: 1, occ: [occ], correctedBy: [], successfulCorrections: 0,
      understood: false, status: 'unresolved', nextReviewAt: now + A.DAY, userRootCause: null, createdAt: now, updatedAt: now };
    state.mistakes.push(m);
  } else {
    m.occurrences += 1; m.lastAt = now; m.occ.push(occ);
    if (m.status === 'resolved') m.recurredAfterResolve = (m.recurredAfterResolve || 0) + 1;
    m.status = 'unresolved'; m.successfulCorrections = 0; m.nextReviewAt = now + A.DAY; m.updatedAt = now;
  }
  const r = A.scheduleReview(state.reviews[`mistake:${m.id}`], false, now, 'mistake', m.id);
  state.reviews[r.key] = r;
  return m;
}

function derivedWrites(now) {
  const { mastery, stats, readiness, patterns } = recompute();
  const p = state.profile;
  Object.assign(p, { lastActiveAt: now, currentLevel: stats.currentLevel, overallMastery: stats.overall, readiness: readiness.score,
    currentStreak: stats.currentStreak, longestStreak: Math.max(p.longestStreak || 0, stats.longestStreak), updatedAt: now });
  const masteryRows = Object.values(mastery);
  masteryRows.forEach(m => state.masteryRows[m.topicId] = m);
  patterns.forEach(pt => state.patternRows[pt.id] = pt);
  const snap = { id: A.today(now), date: A.today(now), at: now, overallMastery: stats.overall, accuracy: stats.accuracy, solved: stats.solved,
    attempted: stats.attempted, avgTimeMs: stats.avgTimeMs, hintFreeRate: stats.hintFree, readiness: readiness.score,
    recurringMistakes: state.mistakes.filter(m => m.occurrences >= 2 && m.status !== 'resolved').length, masteredTopics: stats.mastered.length };
  const i = state.snapshots.findIndex(s => s.id === snap.id);
  if (i >= 0) state.snapshots[i] = snap; else state.snapshots.push(snap);
  return { user_profile: [p], mastery: masteryRows, patterns: patterns, progress_snapshots: [snap] };
}

export async function useHint(ep, level) {
  ep.hintLevel = Math.max(ep.hintLevel, level);
  await saveEpisode(ep);
}

export async function revealSolution(ep) {
  tick(ep);
  const now = Date.now();
  const problem = PROBLEM_BY_ID[ep.problemId];
  ep.solutionRevealed = true; ep.revealedAt = now; ep.hintLevel = 3;
  const attempt = { id: uid('A'), episodeId: ep.id, problemId: problem.id, problemVersion: problem.v, timestamp: now, sessionId: ep.sessionId, mode: ep.mode,
    sql: null, executionStatus: 'revealed', correct: false, score: 0, timeSpentMs: ep.activeMs, difficulty: problem.difficulty, hintsUsed: true, hintLevel: 3,
    solutionRevealed: true, topics: problem.topics, mistakeIds: [], retryIndex: ep.submits, firstEver: ep.firstEver };
  state.attempts.push(attempt);
  const puts = { problem_attempts: [attempt], episodes: [ep] };
  if (!ep.solved && !ep.failRecorded) { ep.failRecorded = true; Object.assign(puts, reviewUpdates(problem, false)); }
  const s = touchSession(now, null, false); if (s) puts.sessions = [s];
  Object.assign(puts, derivedWrites(now));
  await db.writeAtomic(puts);
}

export async function skipProblem(ep) {
  ep.skipped = true; tick(ep);
  const problem = PROBLEM_BY_ID[ep.problemId];
  const now = Date.now();
  const attempt = { id: uid('A'), episodeId: ep.id, problemId: problem.id, problemVersion: problem.v, timestamp: now, sessionId: ep.sessionId, mode: ep.mode,
    sql: null, executionStatus: 'skipped', correct: false, score: 0, timeSpentMs: ep.activeMs, difficulty: problem.difficulty, hintsUsed: false, hintLevel: 0,
    solutionRevealed: false, topics: problem.topics, mistakeIds: [], retryIndex: 0, firstEver: ep.firstEver };
  state.attempts.push(attempt);
  ep.closedAt = now;
  await db.writeAtomic({ problem_attempts: [attempt], episodes: [ep] });
}

// ---------- Sessions ----------
export async function startSession(kind, plan = [], extra = {}) {
  if (state.activeSession && !state.activeSession.endedAt) await endSession();
  const now = Date.now();
  const s = { id: uid('S'), kind, startedAt: now, lastActivityAt: now, endedAt: null, plan, cursor: 0, attempted: 0, solved: 0,
    submits: 0, correctSubmits: 0, problemIds: [], topics: [], mistakeIds: [], ...extra };
  state.sessions.push(s); state.activeSession = s;
  await db.put('sessions', s);
  return s;
}

function touchSession(now, attempt, correct) {
  const s = state.activeSession; if (!s) return null;
  s.lastActivityAt = now;
  if (attempt) {
    s.submits++; if (correct) s.correctSubmits++;
    if (!s.problemIds.includes(attempt.problemId)) s.problemIds.push(attempt.problemId);
    attempt.topics.forEach(t => { if (!s.topics.includes(t)) s.topics.push(t); });
    attempt.mistakeIds.forEach(m => { if (!s.mistakeIds.includes(m)) s.mistakeIds.push(m); });
  }
  return s;
}

export async function saveSession(s = state.activeSession) { if (s) await db.put('sessions', s); }

function finalizeSessionRecord(s, endAt = Date.now()) {
  const atts = state.attempts.filter(a => a.sessionId === s.id && a.executionStatus !== 'revealed' && a.executionStatus !== 'skipped');
  const eps = state.episodes.filter(e => e.sessionId === s.id && (e.submits > 0 || e.solutionRevealed || e.skipped));
  const solvedEps = eps.filter(e => A.episodeOutcome(e).solved);
  const prevMistakeIds = new Set(state.mistakes.filter(m => m.firstAt < s.startedAt).map(m => m.id));
  const newMistakes = (s.mistakeIds || []).filter(id => !prevMistakeIds.has(id));
  const repeated = (s.mistakeIds || []).filter(id => prevMistakeIds.has(id));
  const topicAcc = {};
  for (const e of eps) for (const t of PROBLEM_BY_ID[e.problemId].topics) { topicAcc[t] ||= [0, 0]; topicAcc[t][1]++; if (A.episodeOutcome(e).solved) topicAcc[t][0]++; }
  const ranked = Object.entries(topicAcc).map(([t, [a, b]]) => [t, a / b]).sort((x, y) => y[1] - x[1]);
  Object.assign(s, {
    endedAt: endAt, durationMs: endAt - s.startedAt, attempted: eps.length, solved: solvedEps.length,
    accuracy: atts.length ? atts.filter(a => a.correct).length / atts.length : null,
    avgTimeMs: solvedEps.length ? solvedEps.reduce((x, e) => x + e.activeMs, 0) / solvedEps.length : null,
    hintFreeRate: solvedEps.length ? solvedEps.filter(e => !e.hintLevel).length / solvedEps.length : null,
    strongest: ranked.filter(r => r[1] >= 0.75).slice(0, 3).map(r => r[0]), weakAreas: ranked.filter(r => r[1] < 0.5).slice(-3).map(r => r[0]),
    newMistakes, repeatedMistakes: repeated,
  });
  return s;
}

export async function endSession() {
  const s = state.activeSession; if (!s) return null;
  finalizeSessionRecord(s);
  const { mastery } = recompute();
  const reviewDue = A.dueReviews(state, Date.now() + A.DAY).filter(r => r.kind === 'topic').map(r => r.refId);
  s.conceptsToReview = [...new Set([...s.weakAreas, ...reviewDue])].slice(0, 5);
  const next = A.buildDailyPlan(state, mastery);
  s.recommendedNext = [...new Set(next.map(x => x.topicId).filter(Boolean))].slice(0, 4);
  state.activeSession = null;
  const puts = { sessions: [s] };
  const ended = state.sessions.filter(x => x.endedAt && ['daily', 'review', 'challenge', 'free'].includes(x.kind) && x.attempted > 0);
  if (ended.length && ended.length % 7 === 0 && !state.weekly.some(w => w.sessionIndex === ended.length)) {
    const w = buildWeeklyReview(ended.length);
    state.weekly.push(w); puts.weekly_reviews = [w];
  }
  await db.writeAtomic(puts);
  return s;
}

function buildWeeklyReview(sessionIndex) {
  const now = Date.now();
  const snaps = state.snapshots.slice().sort((a, b) => a.at - b.at);
  const ended = state.sessions.filter(x => x.endedAt && x.attempted > 0).sort((a, b) => a.startedAt - b.startedAt);
  const windowStart = ended[Math.max(0, ended.length - 7)]?.startedAt || 0;
  const before = [...snaps].reverse().find(s => s.at < windowStart) || snaps[0] || {};
  const after = snaps[snaps.length - 1] || {};
  const { mastery, readiness } = state.derived;
  const recentEps = state.episodes.filter(e => e.openedAt >= windowStart && (e.submits > 0 || e.solutionRevealed));
  const diffCounts = {}; recentEps.forEach(e => { const d = PROBLEM_BY_ID[e.problemId].difficulty; diffCounts[d] = (diffCounts[d] || 0) + 1; });
  const mcounts = {}; state.attempts.filter(a => a.timestamp >= windowStart).forEach(a => a.mistakeIds?.forEach(id => mcounts[id] = (mcounts[id] || 0) + 1));
  const atRisk = Object.values(state.reviews).filter(r => r.kind === 'topic' && r.nextReviewAt && r.nextReviewAt < now + 3 * A.DAY).map(r => r.refId);
  const tops = TOPICS.filter(t => mastery[t.id].problemsAttempted > 0).sort((a, b) => mastery[b.id].masteryScore - mastery[a.id].masteryScore);
  return { id: uid('W'), at: now, sessionIndex, data: {
    masteryFrom: before.overallMastery ?? 0, masteryTo: after.overallMastery ?? 0,
    accuracyFrom: before.accuracy ?? null, accuracyTo: after.accuracy ?? null,
    avgTimeFrom: before.avgTimeMs ?? null, avgTimeTo: after.avgTimeMs ?? null,
    hintFreeFrom: before.hintFreeRate ?? null, hintFreeTo: after.hintFreeRate ?? null,
    readinessTo: readiness.score, difficultyMix: diffCounts,
    strengths: tops.slice(0, 3).map(t => t.id), weaknesses: tops.slice(-3).reverse().map(t => t.id),
    commonMistakes: Object.entries(mcounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ id, n })),
    atRisk: [...new Set(atRisk)].slice(0, 5),
  } };
}

// ---------- Curriculum, notes, explain-backs, interviews ----------
export async function markLessonViewed(topicId) {
  state.curriculum.lessonsViewed ||= {};
  if (state.curriculum.lessonsViewed[topicId]) return;
  state.curriculum.lessonsViewed[topicId] = Date.now();
  state.curriculum.currentTopic = topicId; state.curriculum.updatedAt = Date.now();
  if (!state.curriculum.completedTopics.includes(topicId)) state.curriculum.completedTopics.push(topicId);
  await db.put('curriculum_progress', state.curriculum);
  recompute();
}

export async function saveCurriculum() { state.curriculum.updatedAt = Date.now(); await db.put('curriculum_progress', state.curriculum); }
export async function saveProfile() { state.profile.updatedAt = Date.now(); await db.put('user_profile', state.profile); }

export async function saveNote(targetType, targetId, text) {
  let n = state.notes.find(x => x.targetType === targetType && x.targetId === targetId);
  const now = Date.now();
  if (!n) { n = { id: uid('N'), targetType, targetId, text, createdAt: now, updatedAt: now }; state.notes.push(n); }
  else { n.text = text; n.updatedAt = now; }
  await db.put('notes', n);
  return n;
}

export async function saveExplain(rec) { state.explains.push(rec); await db.put('explain_backs', rec); }
export async function saveInterview(rec) {
  const i = state.interviews.findIndex(x => x.id === rec.id);
  if (i >= 0) state.interviews[i] = rec; else state.interviews.push(rec);
  await db.put('interview_sessions', rec);
}
export async function saveMistake(m) { m.updatedAt = Date.now(); await db.put('mistakes', m); }

// ---------- Resets (history is never deleted except by "Delete all data") ----------
export async function resetTopic(topicId) {
  state.profile.resets ||= { all: 0, topics: {} };
  state.profile.resets.topics[topicId] = Date.now();
  const keys = [`topic:${topicId}`]; keys.forEach(k => delete state.reviews[k]);
  await db.writeAtomic({ user_profile: [state.profile] }, { reviews: keys });
  const now = Date.now(); await db.writeAtomic(derivedWrites(now));
}
export async function resetAllProgress() {
  state.profile.resets = { all: Date.now(), topics: {} };
  const keys = Object.keys(state.reviews); state.reviews = {};
  state.curriculum.placedTopics = []; state.curriculum.unlocked = {};
  await db.writeAtomic({ user_profile: [state.profile], curriculum_progress: [state.curriculum] }, { reviews: keys });
  await db.writeAtomic(derivedWrites(Date.now()));
}
export async function discardActiveSession() {
  const s = state.activeSession; if (!s) return;
  s.discarded = true; finalizeSessionRecord(s); state.activeSession = null;
  await db.put('sessions', s);
}
export async function deleteEverything() { await db.deleteDatabase(); }

export async function markBackedUp() { state.profile.lastBackupAt = Date.now(); await saveProfile(); }
