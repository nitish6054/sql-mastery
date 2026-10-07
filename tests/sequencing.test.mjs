// Sequencing rule: a problem is only planned when every concept it uses has been learned (lesson read) or is taught earlier in the
// same session; new lessons come first; no step-up in difficulty on a topic that is still new.
import * as A from '../js/adaptive.js';
import { TOPICS } from '../js/content/curriculum.js';
import { PROBLEM_BY_ID } from '../js/content/problems.js';

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('✗', m); } };
const mk = (viewedCount) => {
  const lessonsViewed = {}; TOPICS.slice(0, viewedCount).forEach(t => { lessonsViewed[t.id] = 1; });
  return { episodes: [], attempts: [], mistakes: [], reviews: {}, sessions: [], activeSession: null, weekly: [],
    profile: { resets: { all: 0, topics: {} } }, curriculum: { lessonsViewed, placedTopics: [], unlocked: {} } };
};
let checked = 0;
for (let k = 1; k <= TOPICS.length; k++) {
  const state = mk(k), mastery = {}; for (const t of TOPICS) mastery[t.id] = A.computeTopicMastery(state, t.id);
  const plan = A.buildDailyPlan(state, mastery);
  const learned = A.learnedSet(mastery, state.curriculum), taught = new Set();
  let seenPractice = false;
  for (const it of plan) {
    const p = PROBLEM_BY_ID[it.problemId];
    if (it.section === 'New concept') { ok(!seenPractice, `k=${k}: lessons must come before practice`); taught.add(it.topicId); ok(!!it.lesson, `k=${k}: New concept item carries its lesson`); }
    else seenPractice = true;
    for (const t of p.topics) ok(learned.has(t) || taught.has(t), `k=${k}: ${it.problemId} (${it.section}) needs "${t}" which is neither learned nor taught first`);
    if (it.section === 'New concept') ok(p.difficulty === 'Easy', `k=${k}: first problem for a new concept is Easy (${it.problemId} is ${p.difficulty})`);
    checked++;
  }
}
console.log(fails ? `${fails} sequencing violation(s)` : `sequencing: ${checked} planned items across ${TOPICS.length} learner stages, all valid`);
process.exit(fails ? 1 : 0);
